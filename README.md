# Smuggler's Paradise Club

Members-only site. Visitors enter their personal code on the password page; a good code signs them in and opens `/members/`.

## How it fits together

| Part | Where | What it does |
| --- | --- | --- |
| Password page | `index.html`, `terms.html`, `assets/` | Static pages served by Cloudflare Pages |
| Code check | `functions/api/enter.js` | Sends the code to Supabase, sets a signed sign-in cookie |
| Members guard | `functions/members/_middleware.js` | Sends anyone without a valid cookie back to `/` |
| Sign out | `functions/api/leave.js` | Clears the cookie |
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

### 2. Cloudflare Pages
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick this repo.
2. Build settings: framework **None**, build command empty, output directory `/`.
3. **Settings → Variables and Secrets** (Production), add:
   - `SUPABASE_URL` — from Supabase **Project Settings → API**, e.g. `https://xxxx.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` — the `sb_publishable_...` key
   - `SESSION_SECRET` — **Encrypt** it; any random string of 32+ characters
4. **Custom domains** → add your domain.
5. Recommended: **Security → WAF → Rate limiting** on `/api/enter` (for example 10 requests per minute per IP) to stop code guessing.

## Local preview
`npx wrangler pages dev .` with the three variables in a `.dev.vars` file (never commit it).
