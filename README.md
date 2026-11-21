# Team Leave & Availability Manager (PWA)

A zero-cost, security-first Progressive Web App for a contact-centre team to track same-day availability (`Working from Office`, `Working from Home`, `On Leave`, or `Not Updated`) with automatic midnight **IST (`Asia/Kolkata`)** reset, confidential supervisor-only leave reasons, and full employee account management.

## Stack & ₹0 Architecture
- **Frontend & PWA**: Vanilla HTML/JS + compiled Tailwind CSS (Vite), Web App Manifest, Service Worker (static shell caching only; never caches private/supervisor APIs).
- **Backend**: Netlify Functions (Node.js 22).
- **Database**: Netlify Database (PostgreSQL) with SQL migrations (`db/migrations/001_init.sql`).
- **Authentication**: Salted `scrypt` PIN hashing, mandatory initial PIN change, rate-limiting & 15-minute lockout after 5 failed attempts, `HttpOnly`/`Secure`/`SameSite=Lax` server-managed sessions, and optional WebAuthn device passkeys.

## Local Development & Testing
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and set `DATABASE_URL` plus initial supervisor PINs.
3. Apply database schema and seed initial accounts:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
4. Run unit & integration tests:
   ```bash
   npm test
   ```
5. Build for production:
   ```bash
   npm run build
   ```

## Netlify Deployment (Phase 6)
1. **Connect Repository**: In Netlify, create a new site from your `Happy-Leave` GitHub repository. Netlify will auto-detect `netlify.toml` (`npm run build`, publish `dist`, functions `netlify/functions`).
2. **Enable Netlify Database**: In your Netlify site dashboard, provision **Netlify Database** (PostgreSQL on the Free plan). Netlify automatically injects `NETLIFY_DATABASE_URL`.
3. **Run Migrations & Initial Supervisor Seed** (from your local machine or CI using the Netlify DB URL):
   ```bash
   NETLIFY_DATABASE_URL="<your-netlify-db-url>" npm run db:migrate
   NETLIFY_DATABASE_URL="<your-netlify-db-url>" \
     INITIAL_SUP1_ID="SUP-01" INITIAL_SUP1_NAME="Supervisor One" INITIAL_SUP1_PIN="<strong-temp-pin-1>" \
     INITIAL_SUP2_ID="SUP-02" INITIAL_SUP2_NAME="Supervisor Two" INITIAL_SUP2_PIN="<strong-temp-pin-2>" \
     npm run db:seed
   ```
   Both supervisors will be prompted to change their temporary PIN on first sign-in.
4. **Test Before Rollout**: Optionally set `SEED_DUMMY_EMPLOYEES=true` in a staging/preview branch to test all workflows with 12 dummy employees before adding real team members via **Supervisor View → Employee Management**.

## Netlify Free Plan Usage & Cost Control
- Netlify's Free plan provides **300 credits/month with a hard cap** (sites pause if credits are exhausted—no overage charges).
- To conserve credits:
  - Assets are pre-compiled and minimal (~25 KB CSS).
  - Open dashboards poll every **60 seconds** and automatically pause when the browser tab is hidden.
  - Monitor usage weekly under **Netlify Dashboard → Usage & Billing**.
- Note: Free-tier terms are set by Netlify and cannot be guaranteed forever; the app uses standard PostgreSQL (`DATABASE_URL`) so it can be migrated to any other host if needed.
