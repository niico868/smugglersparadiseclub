# Smuggler's Paradise Club

Members-only site. Visitors enter their personal code on the password page; a good code signs them in and opens `/members/`.

## How it fits together

| Part | Where | What it does |
| --- | --- | --- |
| Pages | `public/` | Password page, terms, members area and brand assets, served as static files |
| Worker | `src/worker.js` | Runs first for `/api/*` and `/members/*` (see `wrangler.jsonc`) |
| Code check | `POST /api/enter` | Sends the code to Supabase, sets a signed sign-in cookie |
| Members guard | `/members/*` | Sends anyone without a valid cookie back to `/` |
| Sign out | `/api/leave` | Clears the cookie |
| Codes | `supabase/migrations/001_member_codes.sql` | `member_codes` table, locked; checked only through `redeem_member_code()` |

Code rules: each customer gets one unique code. The first use starts a 12-month membership; the same code signs them back in until it expires or is revoked.

## One-time setup

### 1. Supabase
1. Open your project's **SQL Editor**, paste the contents of `supabase/migrations/001_member_codes.sql`, and run it.
2. Make codes when products sell:
   ```sql
   select code from public.generate_member_codes(50, 'Drop 001');
   ```
   Or add a specific one: `insert into public.member_codes (code, customer_email) values ('SP-ABCD-2345', 'buyer@example.com');`
3. Revoke a code: `update public.member_codes set revoked = true where code = 'SP-ABCD-2345';`

### 2. Cloudflare Worker
The Worker `smugglersparadiseclub` deploys from this repo on every push to `main` (`npx wrangler deploy`).

In **Workers & Pages → smugglersparadiseclub → Settings → Variables and Secrets**, add:
- `SUPABASE_URL` (text): e.g. `https://xxxx.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` (text): the `sb_publishable_...` key
- `SESSION_SECRET` (secret): any random string of 32+ characters

Then **Settings → Domains & Routes** → add your custom domain.

Recommended: **Security → WAF → Rate limiting** on `/api/enter` (for example 10 requests per minute per IP) to stop code guessing.

## Local preview
Put the three variables in a `.dev.vars` file (never commit it), then run `npx wrangler dev`.
