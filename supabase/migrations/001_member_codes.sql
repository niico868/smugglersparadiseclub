-- Smuggler's Paradise: member access codes.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
--
-- How it works
--   * Every customer gets one unique code (for example SP-7KQ4-M9XD).
--   * The first time a code is entered, the membership starts and runs for 12 months.
--   * The same code signs the member back in until it expires or is revoked.
--   * The website never reads this table. It can only call redeem_member_code(),
--     which answers yes or no for a single code, so codes cannot be listed or scraped.

create table if not exists public.member_codes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code = upper(code)),
  customer_name text,
  customer_email text,
  order_ref     text,
  note          text,
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  expires_at    timestamptz,
  revoked       boolean not null default false,
  last_used_at  timestamptz,
  use_count     integer not null default 0
);

comment on table public.member_codes is
  'One row per member code. Add rows here (or with generate_member_codes) when a product is sold.';

-- Lock the table: Row Level Security on, and no policies, so the public keys cannot read or write it.
alter table public.member_codes enable row level security;
revoke all on table public.member_codes from anon, authenticated;

-- Check one code. Called by the Cloudflare Function at /api/enter.
create or replace function public.redeem_member_code(p_code text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.member_codes;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if length(v_code) < 6 or length(v_code) > 64 then
    return json_build_object('ok', false);
  end if;

  select * into r from public.member_codes where code = v_code for update;

  if not found or r.revoked then
    return json_build_object('ok', false);
  end if;

  if r.activated_at is null then
    update public.member_codes
       set activated_at = now(),
           expires_at   = now() + interval '12 months',
           last_used_at = now(),
           use_count    = use_count + 1
     where id = r.id
     returning * into r;
  elsif r.expires_at is not null and r.expires_at < now() then
    return json_build_object('ok', false, 'reason', 'expired');
  else
    update public.member_codes
       set last_used_at = now(),
           use_count    = use_count + 1
     where id = r.id
     returning * into r;
  end if;

  return json_build_object('ok', true, 'member', r.id, 'expires_at', r.expires_at);
end;
$$;

revoke all on function public.redeem_member_code(text) from public;
grant execute on function public.redeem_member_code(text) to anon, authenticated;

-- Make new codes in bulk (owner only, run from the SQL editor):
--   select * from public.generate_member_codes(50, 'Drop 001');
-- Codes look like SP-XXXX-XXXX and skip look-alike characters (0/O, 1/I/L).
create or replace function public.generate_member_codes(p_count integer, p_note text default null)
returns setof public.member_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i integer;
  j integer;
  v_code text;
  bytes bytea;
begin
  for i in 1..greatest(p_count, 0) loop
    loop
      bytes := extensions.gen_random_bytes(8);
      v_code := 'SP-';
      for j in 0..7 loop
        if j = 4 then v_code := v_code || '-'; end if;
        v_code := v_code || substr(alphabet, (get_byte(bytes, j) % length(alphabet)) + 1, 1);
      end loop;
      begin
        return query insert into public.member_codes (code, note) values (v_code, p_note) returning *;
        exit;
      exception when unique_violation then
        -- extremely rare clash: try another code
      end;
    end loop;
  end loop;
end;
$$;

revoke all on function public.generate_member_codes(integer, text) from public, anon, authenticated;
