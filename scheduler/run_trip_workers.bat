@echo off
REM ============================================================================
REM  ET Transport - Trip lifecycle AUTOMATIC SCHEDULER LAUNCHER
REM  (Phase 14.3, Task 1D-D-C)
REM
REM  Runs the three CLI trip workers in the documented dependency order:
REM     1) trip_status_worker.php       scheduled -> departed
REM     2) trip_completion_worker.php   scheduled/departed -> completed
REM     3) trip_lifecycle.php           booking pending/confirmed -> completed
REM
REM  Designed to be executed by Windows Task Scheduler. It:
REM    - uses the PHP CLI (never an HTTP endpoint / browser)
REM    - accepts no passenger/user input
REM    - never exposes or prints database credentials
REM    - writes a timestamped log to scheduler\trip_workers.log
REM    - exits non-zero if any worker fails, so Task Scheduler
REM      can register a failure
REM    - never opens a browser window
REM  php_sapi_name() guards inside each worker keep them CLI-only, so this
REM  launcher cannot turn them into a web trigger.
REM ============================================================================

REM --- Overridable configuration (edit only if your install differs) ----------
SET "PHP_BIN=C:\xampp\php\php.exe"
SET "PROJECT_ROOT=C:\xampp\htdocs\ethio-transport"

REM --- Derived paths ---------------------------------------------------------
SET "LOG_DIR=%PROJECT_ROOT%\scheduler"
SET "LOG_FILE=%LOG_DIR%\trip_workers.log"

REM --- Move to the project root so any cwd-relative path stays correct -------
IF /I NOT "%CD%"=="%PROJECT_ROOT%" CD /D "%PROJECT_ROOT%"

IF NOT EXIST "%LOG_DIR%" MKDIR "%LOG_DIR%"

IF NOT EXIST "%PHP_BIN%" (
    ECHO [%DATE% %TIME%] ERROR: PHP CLI not found at "%PHP_BIN%" >> "%LOG_FILE%"
    ECHO [%DATE% %TIME%] ERROR: PHP CLI not found at "%PHP_BIN%"
    EXIT /B 2
)

ECHO [%DATE% %TIME%] ============ trip scheduler start ============ >> "%LOG_FILE%"

REM 1) scheduled -> departed
"%PHP_BIN%" "%PROJECT_ROOT%\scripts\trip_status_worker.php"
SET "RC1=%ERRORLEVEL%"
ECHO [%DATE% %TIME%] trip_status_worker exit=%RC1% >> "%LOG_FILE%"

REM 2) scheduled/departed -> completed
"%PHP_BIN%" "%PROJECT_ROOT%\scripts\trip_completion_worker.php"
SET "RC2=%ERRORLEVEL%"
ECHO [%DATE% %TIME%] trip_completion_worker exit=%RC2% >> "%LOG_FILE%"

REM 3) booking pending/confirmed -> completed
"%PHP_BIN%" "%PROJECT_ROOT%\scripts\trip_lifecycle.php"
SET "RC3=%ERRORLEVEL%"
ECHO [%DATE% %TIME%] trip_lifecycle exit=%RC3% >> "%LOG_FILE%"

REM --- Aggregate exit code: propagate a non-zero code if any worker failed ---
SET "RC=0"
IF NOT "%RC1%"=="0" SET "RC=%RC1%"
IF NOT "%RC2%"=="0" SET "RC=%RC2%"
IF NOT "%RC3%"=="0" SET "RC=%RC3%"
ECHO [%DATE% %TIME%] ============ scheduler end (rc=%RC%) ============ >> "%LOG_FILE%"

EXIT /B %RC%