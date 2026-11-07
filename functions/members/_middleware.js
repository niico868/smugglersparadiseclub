// Guards everything under /members/. No valid sign-in cookie -> back to the password page.
import { COOKIE, getCookie, readToken } from '../_lib/session.js';

export async function onRequest({ request, env, next }) {
  const session = await readToken(getCookie(request, COOKIE), env.SESSION_SECRET).catch(() => null);
  if (!session) {
    return new Response(null, { status: 302, headers: { Location: '/', 'Cache-Control': 'no-store' } });
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  return out;
}
