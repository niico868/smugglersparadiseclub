// GET /api/leave -> signs the member out and returns to the password page.
import { COOKIE } from '../_lib/session.js';

export const onRequest = () =>
  new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      'Cache-Control': 'no-store',
    },
  });
