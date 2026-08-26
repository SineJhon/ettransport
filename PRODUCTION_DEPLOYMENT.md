# ET Transport — Production Deployment & Configuration Guide

This document is the **safe hand-off** reference for taking the verified
development build to a real production server.

Everything in this document is **configuration that still lives outside the
repository** or requires **manual server-side work**. The repository deliberately
contains no production secrets, no fake payment gateway code and no fake refund
implementation.

---

## 1. TL;DR — what is still required before “go live”

| Item | Status | What to do |
| --- | --- | --- |
| Real payment gateway | **Pending** | Obtain official Telebirr / CBE Birr / M-Pesa API docs + merchant credentials, then implement the integration (see §4) |
| Production DB credentials | **Pending** | Set `ET_DB_*` environment variables (never commit them) |
| Development credentials | **Pending** | Replace the seeded dev admin + dev company passwords |
| HTTPS + domain | **Pending** | Provision TLS and a domain, then set `ET_APP_ENV=production` |
| Seed script access | **Done** | Already blocked via `.htaccess` (`config|database|scripts|scheduler` → 403) |
| Security headers | **Done** | `.htaccess` sets CSP / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy |
| Error display | **Done** | `.htaccess` disables `display_errors` |
| Payment fail-closed | **Done** | `config/payment_providers.php` never allows simulation in production |

---

## 2. Application environment

The app reads three groups of environment variables. **The repository contains
no `.env` file and no hardcoded secret.**

### 2.1 Application / payment provider

| Variable | Values | Default | Notes |
| --- | --- | --- | --- |
| `ET_APP_ENV` | `development` \| `production` | `development` | `production` enables the fail-closed payment rules |
| `ET_PAYMENT_PROVIDER` | `simulation` \| `telebirr` \| `cbe_birr` \| `mpesa` | *(unset)* | In `development` an unset value defaults to `simulation`; in `production` an unset/unknown value disables payment |
| `ET_TELEBIRR_*` | *(pending)* | — | Reserved prefix for the future Telebirr integration |
| `ET_CBE_BIRR_*` | *(pending)* | — | Reserved prefix for the future CBE Birr integration |
| `ET_MPESA_*` | *(pending)* | — | Reserved prefix for the future M-Pesa integration |

**Fail-closed rule (implemented in `config/payment_providers.php`):**
- `ET_APP_ENV=production` + `ET_PAYMENT_PROVIDER` unset/unknown → payment
  processing disabled (HTTP 503, no money taken).
- `ET_APP_ENV=production` + `ET_PAYMENT_PROVIDER=simulation` → payment
  processing disabled (a simulation provider is **never** permitted in
  production).
- `ET_PAYMENT_PROVIDER=telebirr|cbe_birr|mpesa` → always disabled until the
  official gateway integration is added to this codebase. Setting the variable
  alone does **not** enable anything.

---

## 3. Development credentials (development only)

The dev environment contains:

- `admin@ettransport.local` / `Admin@EtTransport123` (created by
  `database/seed_admin.php` only when run without arguments)
- Seeded company accounts using `SeedPass123!` (created by
  `database/seed_transport.php`)

These are **development-only** and are intentionally kept so the application
can be demonstrated and tested locally. For any real deployment:

1. **Delete or re-password every seeded account** — use the API/DB, or run the
   seed scripts with explicit `--email/--password` values and remove the old
   rows.
2. **Never expose the seed scripts over HTTP** — they are already blocked by
   `.htaccess`:
   ```apache
   RewriteRule ^(config|database|scripts|scheduler)(/|$) - [F,L]
   ```
3. Never place credentials in frontend code. All phone / password inputs live
   server-side only.

---

## 4. Payment gateway integration boundary

`config/payment_providers.php` is the **only** place that decides whether a
payment can be processed in the current deployment. The development/
simulation provider persists real `payments` rows but moves no money. It is
correctly isolated behind the provider abstraction.

### 4.1 What a real integration will require (not yet available)

- Official **Telebirr** merchant API documentation + merchant credentials
- Official **CBE Birr** merchant API documentation + credentials
- Official **M-Pesa** (Ethiopia) merchant API documentation + credentials

None of these are present or known in this repository, so **no real gateway is
claimed to be integrated**. Do not enable `ET_PAYMENT_PROVIDER` with one of
these names — the app will fail closed (payment stays disabled), which is the
intended safe behaviour until the integration is written and tested against the
real sandbox.

### 4.2 How to add a gateway when the contract is known (for the next engineer)

1. Add a new provider module that implements the gateway’s official HTTP
   contract (endpoint URL, signature, request/response mapping) using the
   official documentation only.
2. Register the environment configuration in `config/payment_providers.php`
   (the `ET_<GATEWAY>_*` variables).
3. Flip `configured` only when the environment variables are present AND
   connectivity to the real sandbox has been proven. The selection logic must
   never fall back to the simulation provider.
4. Gate `handle_pay` behind the new provider’s authorize + capture / callback
   verification, exactly as `et_payment_gateway_configured()` gates today.
5. If refunds become possible through the gateway, add a refund transition
   that can **only** be triggered by the verified gateway response, never by
   the frontend.

---

---

## 6. Web server hardening already applied

In `.htaccess` (Apache):

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=()`
- Content-Security-Policy (`default-src 'self'; script-src 'self'; style-src
  'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src
  'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`)
- `display_errors` / `display_startup_errors` disabled for the app
- Directory listing disabled (`Options -Indexes`)
- `config/`, `database/`, `scripts/`, `scheduler/` return HTTP 403 over HTTP

### 6.1 Server-level items that cannot be committed

These belong on the server, not in the repo:

- **HTTPS / TLS certificate** (`ET_APP_ENV=production` should only be set once
  HTTPS is live, because the session cookie is `Secure` only when served over
  HTTPS).
- **Production DB credentials** as real environment variables.
- **A restricted DB user** for the app (recommended: a MySQL user limited to
  `SELECT/INSERT/UPDATE/DELETE` on `ethio_transport`, never `root`).
- **Filesystem permissions**: the `scheduler/` folder and its `trip_workers.log`
  should be read/write only by the account that runs the scheduled task, and the
  web server user should have no write access to any PHP file or directory.
- **Windows Task Scheduler** registration for `scheduler/run_trip_workers.bat`
  (documented in `scheduler/README.md`).

---

## 7. Verify the deployment

After deploying to a new environment, verify the application manually against
the live instance:

1. **Environment** — confirm `ET_APP_ENV`, `ET_PAYMENT_PROVIDER` and the
   `ET_DB_*` variables resolve as expected for the environment.
2. **Database** — confirm the seeded baseline is present:
   `companies = 9`, `buses = 16`, `routes = 12`, `trips = 210`, `users = 10`,
   and zero rows in `bookings`, `booking_passengers`, `payments`, `reviews`,
   `notifications`.
3. **Pages** — load the homepage, search, passenger booking/payment flow, the
   company dashboard and the admin dashboard, and confirm each renders without
   console errors.
4. **Security** — confirm the `.htaccess` response headers are present
   (CSP, `nosniff`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy),
   `display_errors` is off, directory listing is disabled, and
   `config/`, `database/`, `scripts/`, `scheduler/` return HTTP 403.
5. **Seed access** — confirm the seed scripts cannot be triggered from a browser.
6. **Dev credentials** — replace every seeded account password before go-live
   (see §3) and confirm the fail-closed payment rules (§2.1) behave as documented.

### Final go-live checklist

- [ ] Real payment gateway contract + credentials obtained (§4)
- [ ] Production database credentials set via environment variables
- [ ] Development/admin credentials replaced or removed
- [ ] HTTPS + domain live, `ET_APP_ENV=production` set
- [ ] `.htaccess` security headers confirmed active
- [ ] Seed scripts confirmed inaccessible over HTTP
- [ ] Error display confirmed disabled
- [ ] Refund workflow verified against the deployed gateway (§5)
## 5. Refund / cancellation behaviour

- A company cancels a scheduled trip through
  `POST api/company.php?action=trip_status` (ownership is session-scoped).
- The cancellation marks the trip *cancelled* **and** every `pending`/
  `confirmed` booking on it *cancelled* in one transaction. Booking, passenger
  and payment rows are preserved — nothing is deleted.
- Affected passengers receive an in-app "Trip Cancelled" notification
  (deduplicated by booking reference). No email / SMS / Telegram is sent.
- Because the schema has **no refund state** that can be written safely today
  (no refund ledger, no gateway response to prove a refund, and no
  `refund_pending` enum), the system **does not fabricate refunds**. Instead it
  reports a derived **refund-required** count on the admin trip view and the
  company dashboard whenever a cancelled booking had `payment_status='paid'`.
  Actual refund processing remains a back-office step until a real gateway
  integration provides a verified refund response.
### 2.2 Database

| Variable | Default |
| --- | --- |
| `ET_DB_HOST` | `127.0.0.1` |
| `ET_DB_PORT` | `3306` |
| `ET_DB_NAME` | `ethio_transport` |
| `ET_DB_USER` | `root` |
| `ET_DB_PASS` | *(empty)* |

These are consumed by `config/database.php`. **Never commit real credentials.**

### 2.3 Admin seeding

`ET_ADMIN_NAME` / `ET_ADMIN_EMAIL` / `ET_ADMIN_PHONE` / `ET_ADMIN_PASSWORD`
(let `database/seed_admin.php` use explicit values instead of the dev defaults).