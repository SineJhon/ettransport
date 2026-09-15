# ET Transport — Database Setup Guide

This folder contains the **MySQL / MariaDB foundation** for the ET Transport
platform. It is built for XAMPP and works on ordinary PHP/MySQL hosting.

| File | Purpose |
| --- | --- |
| `schema.sql` | **Single source of truth** — creates the `ethio_transport` database and every table (incl. routes stations, reviews likes/reply, `review_likes`) |
| `README.md` | This guide |

> The previous `seed_*.php` scripts were removed. Demo data (admin + company
> accounts, buses, routes, trips, one verified review) is now **auto-created
> automatically the first time the app connects to a fresh database** — see
> `config/demo-seed.php`.

---

## 1. Start XAMPP

Open the XAMPP Control Panel and make sure these are running:

- **Apache** (needed later for `http://localhost/ethio-transport/`)
- **MySQL** (needed for the database)

---

## 2. Create the database

### Option A — phpMyAdmin (recommended)

1. Open <http://localhost/phpmyadmin>.
2. Go to the **Import** tab.
3. Click **Choose File** and select `database/schema.sql` from this project.
4. Click **Go**.

`schema.sql` contains `CREATE DATABASE IF NOT EXISTS ethio_transport` and
`USE ethio_transport`, so importing it restores the whole database in one
step — every table **and every row of the current live state** (the
`DATA SNAPSHOT` section at the bottom: users, companies, branches, phones,
amenities, buses, routes, trips, bookings, payments, reviews, parcels,
notifications …). Uploaded photo files referenced by the snapshot travel
with the repository under `assets/uploads/`.
No separate migration scripts are needed — keep `schema.sql` up to date and it
is the single source of truth for the whole database.

### Option B — Command line

```powershell
cd C:\xampp\htdocs\ethio-transport
C:\xampp\mysql\bin\mysql.exe -u root < database\schema.sql
```

### Verify

In phpMyAdmin you should now see a database named `ethio_transport` with the
following tables:

```
users, companies, company_reason_history, company_branches, buses, routes,
trips, bookings, booking_passengers, payments, reviews, review_likes,
notifications
```

---

## 3. Demo data (fallback only)

`schema.sql` already carries the current rows, so after a normal import you
are done — the demo portfolio is included in the snapshot. `config/demo-seed.php`
is now only a **fallback**: if you create a database with just the schema part
(a truly empty `companies` table), the first app connection auto-creates the
development demo data via `config/demo-seed.php`:

- the platform `admin` account
- demo company accounts (each `owner.<slug>@ettransport.com` with a company profile, buses, routes and a **rolling 14-day trip schedule**)
- one real verified review (passenger **Hanna Alem**) with a company reply

The fallback runs automatically only when `companies` is empty, and never
deletes or overlays anything. `ET_DEMO_SEED` env var modes: `0` disables it;
`force` re-runs it even against an existing database (idempotent, per-row
checks — useful for pushing updated demo/real account credentials).

> The test credentials below are used for local testing. They are shared in
> this README on purpose so every device that imports `database/schema.sql`
> gets the same working logins:
>
> | Role | Email | Password |
> | --- | --- | --- |
> | Admin | `admin@ettransport.com` | `Admin@121634` |
> | Company | `owner.selambus@ettransport.com` (and every other `owner.<slug>@ettransport.com`) | `Company@121634` |
> | Passenger | `hanna.alem@ettransport.com` | `Passenger@121634` |
>
> Walk-in/office booking accounts (`walkin-*@ettransport.local`) are
> auto-generated with random passwords and are not usable for manual login.
> Change these for anything other than local testing.

> **Production note**: the dev defaults above must always be replaced in a real
> deployment. Never keep these demo credentials on a production server. The
> entire `database/` folder is already blocked from HTTP access by `.htaccess`
> (`RewriteRule ^(database)(/|$) - [F,L]`). For a real deployment, also set
> `ET_DEMO_SEED=0` so a fresh database never automatically creates demo
> accounts. See `PRODUCTION_DEPLOYMENT.md`.

---

## 4. Where database credentials are configured

All credentials live in **one place**: `config/database.php`.

Defaults (match a standard XAMPP install):

| Setting | Default | Environment variable |
| --- | --- | --- |
| Host | `127.0.0.1` | `ET_DB_HOST` |
| Port | `3306` | `ET_DB_PORT` |
| Database | `ethio_transport` | `ET_DB_NAME` |
| User | `root` | `ET_DB_USER` |
| Password | *(empty)* | `ET_DB_PASS` |

For XAMPP you usually do not need to change anything. On a real hosting
provider, set the `ET_DB_*` variables (or edit the defaults in
`config/database.php`) to match your account.

The connection uses **PDO** with:

- exceptions enabled (`ERRMODE_EXCEPTION`)
- prepared statements (`EMULATE_PREPARES = false`)
- UTF-8 (`utf8mb4`)

---

## 5. The three roles

All accounts live in one `users` table. The `role` column is restricted to:

| Role | Description |
| --- | --- |
| `passenger` | Searches trips, books seats, pays, views tickets/favorites/notifications/profile. |
| `company` | Owns a `companies` profile; manages only its own buses, trips, bookings. |
| `admin` | Platform administrator; manages the whole platform. |

There is **no** `super_admin` role.

Users also have a `status` (`active`, `pending`, `suspended`, `rejected`) and
companies have their own `status` (`pending`, `approved`, `suspended`,
`rejected`) used by the future admin approval workflow.

---

## 6. How the tables relate

```
users (passenger / company / admin)
 │
 ├──< companies                 one company profile per company account
 │      ├──< buses               fleet vehicles owned by the company
 │      └──< trips               a scheduled departure
 │
 routes ──< trips                a trip runs on one route (city pair)
 │
 trips ──< bookings              a passenger books seats on a trip
 │        ├──< booking_passengers   one row per traveler + seat_number
 │        └──< payments             payment records per booking
 │
 users ──< reviews               passenger reviews a company (optional booking)
 users ──< notifications         per-user in-app notifications
```

Key points:

- **No seat counter on trips.** Available seats are derived by counting
  `booking_passengers` rows for the trip against the bus `seat_count`, so the
  database has one source of truth.
- **Every bus is a Standard 51-seat coach.** There is no luxury / VIP class on
  ET Transport — `buses.bus_type` is a single-value `ENUM('standard')` and
  `buses.seat_count` is locked to `51`. Every coach includes A/C, seat chargers
  and the standard onboard amenities (see the bus add/edit form).
- **Booking references are unique** (`bookings.booking_reference`).
- **Foreign keys** enforce the relationships; delete behavior is set per
  relationship (e.g. deleting a user removes their companies/notifications,
  while bookings are protected with `RESTRICT`).
- Passwords are stored as **hashes only** (`users.password_hash`).

---

## 7. API foundation

The `api/*.php` endpoints all share one JSON response convention
(via the `auth_response()` helper in `config/auth.php`):

```json
{ "success": true,  "data": ... }
{ "success": false, "message": "Something went wrong." }
```

Each endpoint is action-based and called with `?action=...`:

- `api/auth.php` — register / login / logout / session.
- `api/search.php` — trip search by route and date.
- `api/booking.php` — seat selection, passenger details and booking creation.
- `api/payment.php` — payment creation and confirmation.
- `api/company.php` — company profile, fleet, trips, bookings/manifests, revenue.
- `api/review.php` — passenger reviews of companies.
- `api/notification.php` — user notifications.
- `api/admin.php` — admin company management and platform oversight.

All endpoints enforce session-based authentication and role authorization on the
server, and the database is the single source of truth for availability and
booking state.
