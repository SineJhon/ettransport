<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

$options = getopt('', ['name:', 'email:', 'phone::', 'password:']);

$name = trim((string) ($options['name'] ?? (getenv('ET_ADMIN_NAME') ?: '')));
$email = strtolower(trim((string) ($options['email'] ?? (getenv('ET_ADMIN_EMAIL') ?: ''))));
$phone = trim((string) ($options['phone'] ?? (getenv('ET_ADMIN_PHONE') ?: '')));
$password = (string) ($options['password'] ?? (getenv('ET_ADMIN_PASSWORD') ?: ''));

/* ------------------------------------------------------------------
   DEVELOPMENT-ONLY DEFAULTS
   Used ONLY when no credentials are supplied at all, as a convenience
   for local XAMPP testing (php database/seed_admin.php).
   These values are for LOCAL DEVELOPMENT ONLY. For anything else,
   always pass --name / --email / --password (or set the ET_ADMIN_*
   environment variables). Never use these defaults in production.
   ------------------------------------------------------------------ */
$usingDevDefaults = false;
if ($name === '' || $email === '' || $password === '') {
    $name = 'Platform Admin';
    $email = 'admin@ettransport.local';
    $phone = '+251900000001';
    $password = 'Admin@EtTransport123';
    $usingDevDefaults = true;
}

if ($usingDevDefaults) {
    fwrite(STDOUT, "WARNING: Using DEVELOPMENT-ONLY admin credentials.\n");
    fwrite(STDOUT, "         email:    {$email}\n");
    fwrite(STDOUT, "         password: {$password}\n");
    fwrite(STDOUT, "         These are for local XAMPP testing only.\n");
    fwrite(STDOUT, "         For real deployments pass --name/--email/--password\n");
    fwrite(STDOUT, "         or set the ET_ADMIN_NAME/EMAIL/PASSWORD env vars.\n\n");
}

if (strlen($name) < 2) {
    fwrite(STDERR, "Missing or invalid --name\n");
    exit(1);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Missing or invalid --email\n");
    exit(1);
}

if (strlen($password) < 8) {
    fwrite(STDERR, "Missing or invalid --password (min 8 chars)\n");
    exit(1);
}

try {
    $pdo = db();

    $check = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $check->execute([':email' => $email]);
    if ($check->fetch()) {
        fwrite(STDOUT, "Admin already exists for this email.\n");
        exit(0);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO users (name, email, phone, password_hash, role, status)
         VALUES (:name, :email, :phone, :password_hash, :role, :status)'
    );

    $stmt->execute([
        ':name' => $name,
        ':email' => $email,
        ':phone' => $phone !== '' ? $phone : null,
        ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ':role' => 'admin',
        ':status' => 'active',
    ]);

    fwrite(STDOUT, "Admin user created successfully.\n");
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, "Failed to seed admin: " . $e->getMessage() . "\n");
    exit(1);
}
