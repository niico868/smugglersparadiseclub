// Cloudflare Worker for the Smuggler's Paradise members site.
// Static pages live in /public and are served by the ASSETS binding.
// The Worker only runs first for /api/* and /members/* (see wrangler.jsonc):
//   POST /api/enter  { code }  -> checks the code with Supabase, sets a signed sign-in cookie
//   GET  /api/leave            -> signs out
//   /members/*                 -> only for signed-in members, everyone else goes back to /
//
// Variables (Worker → Settings → Variables and Secrets):
//   SUPABASE_URL              e.g. https://abcd1234.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  sb_publishable_...
//   SESSION_SECRET            a long random string, stored as a secret
import { COOKIE, createToken, getCookie, readToken, sessionCookie } from './session.js';

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

async function enter(request, env) {
  let code = '';
  try {
    const body = await request.json();
    code = String(body.code || '').trim();
  } catch {
    return wrong();
  }
  if (code.length < 6 || code.length > 64) return wrong();
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    console.error('SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is missing');
    return json({ ok: false, error: 'not_configured' }, 500);
  }

  let result;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/redeem_member_code`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    });
    if (!res.ok) {
      console.error('Supabase check failed', res.status, await res.text());
      return json({ ok: false, error: 'check_failed' }, 502);
    }
    result = await res.json();
  } catch (e) {
    console.error('Supabase unreachable', e);
    return json({ ok: false, error: 'check_failed' }, 502);
  }

  if (!result || !result.ok) return wrong();

  const now = Math.floor(Date.now() / 1000);
  const membershipEnd = result.expires_at ? Math.floor(new Date(result.expires_at).getTime() / 1000) : now + MAX_SESSION;
  const exp = Math.min(membershipEnd, now + MAX_SESSION);
  let token;
  try {
    token = await createToken({ m: result.member, exp }, env.SESSION_SECRET);
  } catch (e) {
    console.error('Sign-in cookie failed: is SESSION_SECRET set?', e);
    return json({ ok: false, error: 'not_configured' }, 500);
  }

  return json({ ok: true, redirect: '/members/' }, 200, { 'Set-Cookie': sessionCookie(token, exp - now) });
}

function leave() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      'Cache-Control': 'no-store',
    },
  });
}

async function members(request, env) {
  const session = await readToken(getCookie(request, COOKIE), env.SESSION_SECRET).catch(() => null);
  if (!session) {
    return new Response(null, { status: 302, headers: { Location: '/', 'Cache-Control': 'no-store' } });
  }
  const res = await env.ASSETS.fetch(request);
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  return out;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/enter') {
      return request.method === 'POST' ? enter(request, env) : json({ ok: false }, 405, { Allow: 'POST' });
    }
    if (pathname === '/api/leave') return leave();
    if (pathname === '/members' || pathname.startsWith('/members/')) return members(request, env);
    if (pathname.startsWith('/api/')) return json({ ok: false }, 404);

    return env.ASSETS.fetch(request);
  },
};
