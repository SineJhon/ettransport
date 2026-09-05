<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/auth.php';

header('Content-Type: application/json; charset=utf-8');

function read_request_body(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function request_action(): string
{
    $action = $_GET['action'] ?? $_POST['action'] ?? '';
    return strtolower(trim((string) $action));
}

function clean_text(?string $value): string
{
    return trim((string) $value);
}

function slugify_company(string $name): string
{
    $slug = strtolower(trim($name));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?: '';
    $slug = trim($slug, '-');
    return $slug !== '' ? $slug : 'company';
}

function unique_company_slug(PDO $pdo, string $baseSlug): string
{
    $slug = $baseSlug;
    $index = 2;

    $stmt = $pdo->prepare('SELECT id FROM companies WHERE slug = :slug LIMIT 1');
    while (true) {
        $stmt->execute([':slug' => $slug]);
        if (!$stmt->fetch()) {
            return $slug;
        }

        $slug = $baseSlug . '-' . $index;
        $index++;
    }
}

function user_payload(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'phone' => $user['phone'],
        'role' => $user['role'],
        'status' => $user['status'],
        'companyStatus' => $user['company_status'] ?? null,
        'companyListed' => isset($user['company_listed']) ? (int) $user['company_listed'] : null,
    ];
}

function require_post(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }
}

function handle_register(): void
{
    require_post();
    $input = read_request_body();

    $name = clean_text($input['name'] ?? '');
    $email = strtolower(clean_text($input['email'] ?? ''));
    $phone = clean_text($input['phone'] ?? '');
    $password = (string) ($input['password'] ?? '');
    $role = strtolower(clean_text($input['role'] ?? 'passenger'));

    $companyName = clean_text($input['company_name'] ?? '');
    $companyDescription = clean_text($input['company_description'] ?? '');
    $companyAddress = clean_text($input['company_address'] ?? '');

    if ($name === '' || strlen($name) < 2) {
        auth_response(422, ['success' => false, 'message' => 'Please enter a valid full name.']);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        auth_response(422, ['success' => false, 'message' => 'Please enter a valid email address.']);
    }

    if ($phone !== '' && !preg_match('/^[+0-9][0-9\-\s]{6,20}$/', $phone)) {
        auth_response(422, ['success' => false, 'message' => 'Please enter a valid phone number.']);
    }

    if (strlen($password) < 8 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
        auth_response(422, [
            'success' => false,
            'message' => 'Password must be at least 8 characters and include letters and numbers.',
        ]);
    }

    /* Optional but recommended: mirror the frontend confirmation check. */
    if (array_key_exists('password_confirmation', $input)) {
        $passwordConfirmation = (string) $input['password_confirmation'];
        if ($passwordConfirmation !== '' && $password !== $passwordConfirmation) {
            auth_response(422, ['success' => false, 'message' => 'Password confirmation does not match.']);
        }
    }

    if (!in_array($role, ['passenger', 'company'], true)) {
        auth_response(403, [
            'success' => false,
            'message' => 'Invalid registration role. Admin registration is not allowed.',
        ]);
    }

    if ($role === 'company') {
        if ($companyName === '' || strlen($companyName) < 2) {
            auth_response(422, ['success' => false, 'message' => 'Company name is required.']);
        }
        if ($companyAddress === '') {
            auth_response(422, ['success' => false, 'message' => 'Company address is required.']);
        }
    }

    $pdo = db();

    try {
        $pdo->beginTransaction();

        $check = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $check->execute([':email' => $email]);
        if ($check->fetch()) {
            $pdo->rollBack();
            auth_response(409, ['success' => false, 'message' => 'An account with this email already exists.']);
        }

        if ($phone !== '') {
            $phoneCheck = $pdo->prepare('SELECT id FROM users WHERE phone = :phone LIMIT 1');
            $phoneCheck->execute([':phone' => $phone]);
            if ($phoneCheck->fetch()) {
                $pdo->rollBack();
                auth_response(409, ['success' => false, 'message' => 'An account with this phone number already exists.']);
            }
        }

        $status = 'active';
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);

        $insertUser = $pdo->prepare(
            'INSERT INTO users (name, email, phone, password_hash, role, status)
             VALUES (:name, :email, :phone, :password_hash, :role, :status)'
        );

        $insertUser->execute([
            ':name' => $name,
            ':email' => $email,
            ':phone' => $phone !== '' ? $phone : null,
            ':password_hash' => $passwordHash,
            ':role' => $role,
            ':status' => $status,
        ]);

        $userId = (int) $pdo->lastInsertId();

        if ($role === 'company') {
            $baseSlug = slugify_company($companyName);
            $slug = unique_company_slug($pdo, $baseSlug);

            $insertCompany = $pdo->prepare(
                'INSERT INTO companies (user_id, name, slug, description, phone, email, address, status, listed)
                 VALUES (:user_id, :name, :slug, :description, :phone, :email, :address, :status, :listed)'
            );

            $insertCompany->execute([
                ':user_id' => $userId,
                ':name' => $companyName,
                ':slug' => $slug,
                ':description' => $companyDescription !== '' ? $companyDescription : null,
                ':phone' => $phone !== '' ? $phone : null,
                ':email' => $email,
                ':address' => $companyAddress,
                ':status' => 'pending',
                ':listed' => 0,
            ]);
        }

        $pdo->commit();

        if ($role === 'company') {
            auth_response(201, [
                'success' => true,
                'message' => 'Company registration submitted. Your company account is awaiting admin approval.',
                'user' => [
                    'id' => $userId,
                    'name' => $name,
                    'email' => $email,
                    'role' => 'company',
                    'status' => 'active',
                ],
            ]);
        }

        $user = loginUser($userId);
        auth_response(201, [
            'success' => true,
            'message' => 'Registration successful.',
            'user' => user_payload($user),
            'redirectTo' => roleHome($user['role']),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        auth_response(500, [
            'success' => false,
            'message' => 'Unable to complete registration at this time.',
        ]);
    }
}

function handle_login(): void
{
    require_post();
    $input = read_request_body();

    $email = strtolower(clean_text($input['email'] ?? ''));
    $password = (string) ($input['password'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
        auth_response(422, ['success' => false, 'message' => 'Email and password are required.']);
    }

    $sql = 'SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.role, u.status, c.status AS company_status, c.listed AS company_listed, c.id AS company_record_id
            FROM users u
            LEFT JOIN companies c ON c.user_id = u.id
            WHERE u.email = :email
            LIMIT 1';

    $stmt = db()->prepare($sql);
    $stmt->execute([':email' => $email]);
    $row = $stmt->fetch();

    if (!$row || !password_verify($password, $row['password_hash'])) {
        auth_response(401, ['success' => false, 'message' => 'Invalid email or password.']);
    }

    $role = $row['role'];
    $status = $row['status'];

    if ($role === 'company') {
        $companyStatus = $row['company_status'] ?? null;
        $companyRecordId = (int) ($row['company_record_id'] ?? 0);
        $pdo = db();

        /* approval_status = 'pending' (registration not reviewed yet). */
        if ($companyStatus === 'pending') {
            auth_response(403, [
                'success' => false,
                'message' => 'Your company registration is still waiting for admin approval.',
            ]);
        }

        /* approval_status = 'rejected'. */
        if ($companyStatus === 'rejected') {
            $reason = latest_company_reason($pdo, $companyRecordId, 'rejected');
            $message = 'Your company registration request was rejected.';
            if ($reason !== null && $reason !== '') {
                $message .= ' Reason: ' . $reason;
            }
            auth_response(403, ['success' => false, 'message' => $message]);
        }

        /* Suspended: account_status = 'suspended'. Legacy rows may also carry
           companies.status = 'suspended' — both are treated the same. */
        if ($companyStatus === 'suspended' || $status === 'suspended') {
            $reason = latest_company_reason($pdo, $companyRecordId, 'suspended');
            $message = 'Your company account has been suspended.';
            if ($reason !== null && $reason !== '') {
                $message .= ' Reason: ' . $reason;
            }
            auth_response(403, ['success' => false, 'message' => $message]);
        }

        if ($companyStatus !== 'approved') {
            auth_response(403, ['success' => false, 'message' => 'Company account is not approved.']);
        }

        if ($status !== 'active') {
            auth_response(403, ['success' => false, 'message' => 'Your account is not active.']);
        }
    } else {
        if ($status === 'suspended') {
            auth_response(403, ['success' => false, 'message' => 'Your account is suspended. Please contact support.']);
        }
        if ($status === 'rejected') {
            auth_response(403, ['success' => false, 'message' => 'Your account has been rejected.']);
        }
        if ($status !== 'active') {
            auth_response(403, ['success' => false, 'message' => 'Your account is not active.']);
        }
    }

    $user = loginUser((int) $row['id']);

    auth_response(200, [
        'success' => true,
        'message' => 'Login successful.',
        'user' => user_payload($user),
        'redirectTo' => roleHome($user['role']),
    ]);
}

function handle_logout(): void
{
    require_post();
    logoutUser();

    auth_response(200, [
        'success' => true,
        'message' => 'Logout successful.',
    ]);
}

function handle_session(): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        auth_response(405, [
            'success' => false,
            'message' => 'Method not allowed.',
        ]);
    }

    $user = getCurrentUser();
    if (!$user) {
        auth_response(200, [
            'success' => true,
            'authenticated' => false,
            'user' => null,
        ]);
    }

    auth_response(200, [
        'success' => true,
        'authenticated' => true,
        'user' => user_payload($user),
    ]);
}

$action = request_action();

if ($action === 'register') {
    handle_register();
}
if ($action === 'login') {
    handle_login();
}
if ($action === 'logout') {
    handle_logout();
}
if ($action === 'session') {
    handle_session();
}

auth_response(400, [
    'success' => false,
    'message' => 'Unsupported action.',
]);
