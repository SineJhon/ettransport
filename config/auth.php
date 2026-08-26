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
    ];
}

function fetch_user_by_id(int $userId): ?array
{
    $sql = 'SELECT u.id, u.name, u.email, u.phone, u.role, u.status, c.status AS company_status
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
