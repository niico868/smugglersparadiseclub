// POST /api/enter  { code }  ->  checks the code with Supabase and signs the member in.
// Needs these Cloudflare Pages environment variables:
//   SUPABASE_URL                  e.g. https://abcd1234.supabase.co
//   SUPABASE_PUBLISHABLE_KEY      sb_publishable_...
//   SESSION_SECRET                a long random string (secret)
import { createToken, sessionCookie } from '../_lib/session.js';

const MAX_SESSION = 60 * 60 * 24 * 30; // stay signed in for up to 30 days at a time

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

const wrong = async () => {
  await new Promise((r) => setTimeout(r, 400)); // slow down guessing
  return json({ ok: false }, 401);
};

export async function onRequestPost({ request, env }) {
  let code = '';
  try {
    const body = await request.json();
    code = String(body.code || '').trim();
  } catch {
    return wrong();
  }
  if (code.length < 6 || code.length > 64) return wrong();

  let result;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/redeem_member_code`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    });
    if (!res.ok) return json({ ok: false, error: 'check_failed' }, 502);
    result = await res.json();
  } catch {
    return json({ ok: false, error: 'check_failed' }, 502);
  }

  if (!result || !result.ok) return wrong();

  const now = Math.floor(Date.now() / 1000);
  const membershipEnd = result.expires_at ? Math.floor(new Date(result.expires_at).getTime() / 1000) : now + MAX_SESSION;
  const exp = Math.min(membershipEnd, now + MAX_SESSION);
  const token = await createToken({ m: result.member, exp }, env.SESSION_SECRET);

  return json({ ok: true, redirect: '/members/' }, 200, { 'Set-Cookie': sessionCookie(token, exp - now) });
}

export const onRequestGet = () => json({ ok: false }, 405, { Allow: 'POST' });
