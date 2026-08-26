# ET Transport - Automatic Trip Lifecycle Scheduler

A minimal Windows/XAMPP-compatible way to run the three CLI trip workers
automatically. It does **not** expose them over HTTP, does not require a browser
session, and accepts no user/passenger input.

## What is scheduled

`run_trip_workers.bat` (in this folder) executes these three CLI-only workers in
dependency order via the PHP CLI:

| Order | Script | Lifecycle transition |
| --- | --- | --- |
| 1 | `scripts/trip_status_worker.php` | trips: `scheduled` → `departed` once departure datetime has passed |
| 2 | `scripts/trip_completion_worker.php` | trips: `scheduled`/`departed` → `completed` once departure datetime + `route.duration` has passed |
| 3 | `scripts/trip_lifecycle.php` | bookings: `pending`/`confirmed` → `completed` once the trip departure datetime has passed |

Each worker is independent and idempotent, so running them on a later schedule is
always safe. The order above is chosen so `scheduled → departed → completed`
and `booking pending/confirmed → completed` all happen in the natural cascade,
but every worker keeps its own independent behaviour (it never depends on
another worker having run first).

The launcher:
- PHP CLI: `C:\xampp\php\php.exe`
- Project root: `C:\xampp\htdocs\ethio-transport`
- appends a timestamped run to `scheduler\trip_workers.log`
- exits non-zero if any worker fails (so Windows Task Scheduler can alert)

## How often it should run

Recommend: **every 5 minutes** (Task Scheduler "Repeat interval: 5 minutes").
Because the workers are idempotent and cheap, running more often is harmless;
hourly would lag behind departure times unnecessarily. A sensible default is
every 5 minutes, all day, every day.

## How to install / enable the Windows Task Scheduler task

> OS-level Task Scheduler registration is a **manual, one-time** step on the
> machine hosting XAMPP. It cannot be created from the web app, which is
> exactly what we want - nothing about the scheduler is exposed over HTTP.

### Via the Task Scheduler GUI

1. Open **Windows Task Scheduler** (Win + R → `taskschd.msc`).
2. Menu **Action → Create Task**.
3. On the **General** tab:
   - Name: `ET Trip Workers`
   - User: your Windows account (`NT AUTHORITY\SYSTEM` or an account with access)
   - **Do not** tick "Run as administrator" unless your PHP/MySQL permissions
     require it.
4. On the **Triggers** tab → **New**:
   - Begin: e.g. `01:00:00 AM` (or `On schedule`)
   - Interval: **every 5 minutes** (type `05` in the minutes box)
5. On the **Actions** tab → **New**:
   - Action: **Start a program**
   - Program/script: `C:\xampp\htdocs\ethio-transport\scheduler\run_trip_workers.bat`
   - Leave Arguments and Working directory empty (the launcher sets its own paths).
6. On the **Conditions** / **Settings** tabs the defaults are fine. Recommended:
   - Settings → "Start the task only if the computer is on AC power" - uncheck if
     the machine is a laptop left on battery.
7. Click **OK** to save. Windows will now run the batch file every 5 minutes.

### Verify the task is registered

In Task Scheduler, select the task and click **Run** (action button) to force one
immediate run, then open `scheduler\trip_workers.log` to confirm the three exit
lines were appended.

## How to manually test it

From the project root (PowerShell):

```powershell
C:\xampp\htdocs\ethio-transport\scheduler\run_trip_workers.bat
```

Then confirm `scheduler\trip_workers.log` contains lines for all three workers and
an `scheduler end` line. The exit code is `0` on success and non-zero if any
worker failed.

Individual workers can be run directly to see their single-run output:

```powershell
C:\xampp\php\php.exe C:\xampp\htdocs\ethio-transport\scripts\trip_status_worker.php
C:\xampp\php\php.exe C:\xampp\htdocs\ethio-transport\scripts\trip_completion_worker.php
C:\xampp\php\php.exe C:\xampp\htdocs\ethio-transport\scripts\trip_lifecycle.php
```

## How to disable / remove it

- **Disable (keep task):** in Task Scheduler, right-click the task → **Disable**.
- **Remove entirely:** right-click the task → **Delete**.

You can also just leave the batch file in place but disable the trigger.

## Security notes

- Workers are invoked only through the **PHP CLI**. Each worker refuses to run
  outside the CLI SAPI (`php_sapi_name() === 'cli'`) and exits non-zero over
  HTTP, so no web endpoint or public trigger is created (and none is added).
- The launcher accepts **no input** and never prints a password/database
  credential. Credentials are never hardcoded; they come from
  `config/database.php` (or `ET_DB_*` env vars) as usual.
- The batch file does **not** open a browser.