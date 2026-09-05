<?php

declare(strict_types=1);

require_once __DIR__ . '/database.php';

function start_secure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_start();
}

function auth_response(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function normalize_user_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'email' => $row['email'],
        'phone' => $row['phone'],
        'role' => $row['role'],
        'status' => $row['status'],
        'company_status' => $row['company_status'] ?? null,
        'company_listed' => isset($row['company_listed']) ? (int) $row['company_listed'] : null,
    ];
}

function fetch_user_by_id(int $userId): ?array
{
    $sql = 'SELECT u.id, u.name, u.email, u.phone, u.role, u.status, c.status AS company_status, c.listed AS company_listed
            FROM users u
            LEFT JOIN companies c ON c.user_id = u.id
            WHERE u.id = :id
            LIMIT 1';

    $stmt = db()->prepare($sql);
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();

    if (!$row) {
        return null;
    }

    return normalize_user_row($row);
}

function getCurrentUser(): ?array
{
    start_secure_session();

    if (empty($_SESSION['auth_user_id'])) {
        return null;
    }

    $userId = (int) $_SESSION['auth_user_id'];
    if ($userId <= 0) {
        return null;
    }

    $user = fetch_user_by_id($userId);
    if (!$user) {
        unset($_SESSION['auth_user_id']);
        return null;
    }

    return $user;
}

function isLoggedIn(): bool
{
    return getCurrentUser() !== null;
}

function hasRole(string $role): bool
{
    $user = getCurrentUser();
    return $user !== null && $user['role'] === $role;
}

function requireLogin(bool $asJson = true): array
{
    $user = getCurrentUser();
    if ($user !== null) {
        return $user;
    }

    if ($asJson) {
        auth_response(401, [
            'success' => false,
            'message' => 'Authentication required.',
        ]);
    }

    header('Location: /ethio-transport/login.html');
    exit;
}

function requireRole(string $role, bool $asJson = true): array
{
    $user = requireLogin($asJson);
    if ($user['role'] === $role) {
        return $user;
    }

    if ($asJson) {
        auth_response(403, [
            'success' => false,
            'message' => 'Access denied for this role.',
        ]);
    }

    header('Location: /ethio-transport/login.html');
    exit;
}

function loginUser(int $userId): array
{
    start_secure_session();
    session_regenerate_id(true);
    $_SESSION['auth_user_id'] = $userId;

    $user = fetch_user_by_id($userId);
    if ($user === null) {
        auth_response(500, [
            'success' => false,
            'message' => 'Unable to create session.',
        ]);
    }

    return $user;
}

function logoutUser(): void
{
    start_secure_session();

    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            (bool) $params['secure'],
            (bool) $params['httponly']
        );
    }

    session_destroy();
}

function roleHome(string $role): string
{
    if ($role === 'admin') {
        return 'admin.html';
    }

    if ($role === 'company') {
        return 'company-dashboard.html';
    }

    return 'passenger.html';
}

/**
 * Latest stored reason for a company moderation action ('rejected' or
 * 'suspended'), newest first, or null when none has been recorded yet.
 *
 * Used by the login gate to surface a safe, user-visible reason and by
 * the admin dashboard to display the company's current review state.
 * Never throws: a missing/hidden table only yields null.
 */
function latest_company_reason(PDO $pdo, int $companyId, string $actionType): ?string
{
    try {
        $stmt = $pdo->prepare(
            'SELECT reason
             FROM company_reason_history
             WHERE company_id = :company_id AND action_type = :action_type
             ORDER BY id DESC
             LIMIT 1'
        );
        $stmt->execute([
            ':company_id' => $companyId,
            ':action_type' => $actionType === 'suspended' ? 'suspended' : 'rejected',
        ]);
        $value = $stmt->fetchColumn();
        return $value === false ? null : (string) $value;
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * Verify a supplied password against the currently authenticated session
 * user's stored hash. Used to require the admin's own password before a
 * sensitive action (approve / reject / suspend / unsuspend / delete).
 *
 * The user id is always taken from the server-side session — never from the
 * browser. Returns false for any missing session, unknown user, or lookup
 * failure so a wrong call can never bypass the check.
 */
function verify_current_password(string $password): bool
{
    start_secure_session();

    if (empty($_SESSION['auth_user_id'])) {
        return false;
    }

    $userId = (int) $_SESSION['auth_user_id'];
    if ($userId <= 0) {
        return false;
    }

    try {
        $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $hash = $stmt->fetchColumn();

        if ($hash === false || $hash === null || $hash === '') {
            return false;
        }

        return password_verify($password, (string) $hash);
    } catch (Throwable $e) {
        return false;
    }
}
