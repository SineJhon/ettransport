<?php

declare(strict_types=1);

/**
 * ET Transport — development seed for transportation data.
 * Seeds company profiles, buses, routes and scheduled trips for real
 * search + company discovery. Safe to run repeatedly (idempotent).
 * PDO prepared statements only; never deletes existing rows.
 */

require_once __DIR__ . '/../config/database.php';

$companySpecs = [
    ['selam-bus', 'Selam Bus', 'A trusted name on the Addis Ababa – Mekelle corridor.', 'Selam Bus operates modern long-haul coaches on Ethiopia’s northern corridor, linking Addis Ababa with Mekelle, Bahir Dar and Gondar.', 'Addis Ababa, Autobus Tera', '+251 11 667 8022', 'info@selambus.example.com', 'https://selambus.example.com', 4.7, 1240, 2005, [['Scania Touring', 'luxury', 51], ['MAN Lion’s Coach', 'vip', 45], ['Yutong ZK6122H9', 'standard', 49]]],
    ['sky-bus', 'Sky Bus', 'Everyday departures to the lake cities of the south.', 'Sky Bus runs frequent services from Addis Ababa towards the Rift Valley lakes, serving Hawassa and Arba Minch.', 'Addis Ababa, Addis Ketema', '+251 11 228 4455', 'info@skybus.example.com', 'https://skybus.example.com', 4.5, 862, 2008,
        [['Higer A90', 'luxury', 47], ['Yutong ZK6107H', 'standard', 43]]],
    ['yegna-bus', 'Yegna Bus', 'Comfortable daily services on the Bahir Dar – Gondar corridor.', 'Yegna Bus focuses on dependable daytime departures along the Bahir Dar and Gondar corridor.', 'Addis Ababa, Kazanchis', '+251 11 550 1290', 'info@yegnabus.example.com', 'https://yegnabus.example.com', 4.4, 655, 2012,
        [['MAN Lion’s Coach', 'standard', 49], ['Golden Dragon XML6125', 'luxury', 47]]],
    ['golden-bus', 'Golden Bus', 'Daily commuter and long-haul links to eastern and central towns.', 'Golden Bus connects Addis Ababa with Adama and Dessie with frequent departures.', 'Addis Ababa, Bole', '+251 11 663 7020', 'info@goldenbus.example.com', 'https://goldenbus.example.com', 4.3, 540, 2010,
        [['Yutong ZK6107H', 'standard', 43], ['King Long XMQ6898', 'standard', 33]]],
    ['zemen-bus', 'Zemen Bus', 'Premier service on the eastern corridor to Dire Dawa, Harar and Jijiga.', 'Zemen Bus runs premium coaches on the eastern corridor from Addis Ababa to Dire Dawa.', 'Addis Ababa, Bole', '+251 11 778 1140', 'info@zemenbus.example.com', 'https://zemenbus.example.com', 4.6, 910, 2009,
        [['Neoplan Skyliner', 'luxury', 45], ['Mercedes-Benz Tourismo', 'vip', 41]]],
    ['odaa-bus', 'ODAA Bus', 'Reliable routes to Jimma, Hawassa and the western belt.', 'ODAA Bus covers fast-growing southern and western routes, delivering value and predictable departures.', 'Addis Ababa, Kolfe', '+251 11 442 9090', 'info@odaa.example.com', 'https://odaa.example.com', 4.4, 610, 2015,
        [['Yutong ZK6122H9', 'luxury', 49], ['Foton AUV BJ6129', 'standard', 33]]],
    ['abay-bus', 'Abay Bus', 'Budget-friendly connections to the north-west.', 'Abay Bus is known for dependable buses on the Addis Ababa – Bahir Dar corridor.', 'Addis Ababa, Megenagna', '+251 11 554 7733', 'info@abaybus.example.com', 'https://abaybus.example.com', 4.2, 420, 2011,
        [['Yutong ZK6107H', 'standard', 43]]],
    ['ethio-bus', 'Ethio Bus', 'Fast route coverage to the south and lake regions.', 'Ethio Bus serves key southern destinations with focused departures on fast-moving routes to Hawassa.', 'Addis Ababa, Meskel Square', '+251 11 445 8922', 'info@ethiobus.example.com', 'https://ethiobus.example.com', 4.1, 318, 2016,
        [['King Long XMQ6898', 'standard', 33]]],
    ['liyu-bus', 'Liyu Bus', 'Executive comfort on the north corridor to Mekelle.', 'Liyu Bus offers premium comfort and regular departures for the Addis Ababa – Mekelle corridor.', 'Addis Ababa, Piassa', '+251 11 990 2133', 'info@liyubus.example.com', 'https://liyubus.example.com', 4.6, 730, 2014,
        [['Neoplan Skyliner', 'vip', 48]]],
];

$routes = [
    ['Addis Ababa', 'Arba Minch', 510],
    ['Addis Ababa', 'Bahir Dar', 540],
    ['Addis Ababa', 'Mekelle', 750],
    ['Addis Ababa', 'Hawassa', 315],
    ['Addis Ababa', 'Gondar', 750],
    ['Addis Ababa', 'Dessie', 420],
    ['Addis Ababa', 'Adama', 100],
    ['Addis Ababa', 'Dire Dawa', 510],
    ['Addis Ababa', 'Jimma', 480],
    ['Bahir Dar', 'Gondar', 240],
    ['Arba Minch', 'Addis Ababa', 510],
    ['Mekelle', 'Addis Ababa', 750],
];

$tripPatterns = [
    'selam-bus' => [
        ['Addis Ababa', 'Bahir Dar', '06:30', 'luxury', [900, 950, 880]],
        ['Addis Ababa', 'Mekelle', '05:30', 'vip', [1200, 1250, 1180]],
    ],
    'sky-bus' => [
        ['Addis Ababa', 'Hawassa', '07:00', 'standard', [500, 520, 480]],
        ['Addis Ababa', 'Arba Minch', '08:00', 'luxury', [700, 720, 680]],
    ],
    'yegna-bus' => [
        ['Addis Ababa', 'Bahir Dar', '10:30', 'standard', [850, 820, 880]],
        ['Addis Ababa', 'Gondar', '06:00', 'luxury', [1050, 1000, 1100]],
    ],
    'golden-bus' => [
        ['Addis Ababa', 'Dessie', '08:30', 'standard', [600, 620, 580]],
        ['Addis Ababa', 'Adama', '09:00', 'standard', [220, 240, 210]],
    ],
    'zemen-bus' => [
        ['Addis Ababa', 'Dire Dawa', '06:45', 'luxury', [820, 850, 800]],
    ],
    'odaa-bus' => [
        ['Addis Ababa', 'Jimma', '07:30', 'luxury', [700, 720, 680]],
        ['Addis Ababa', 'Hawassa', '09:30', 'standard', [480, 500, 460]],
    ],
    'abay-bus' => [
        ['Addis Ababa', 'Bahir Dar', '07:00', 'standard', [880, 860, 900]],
    ],
    'ethio-bus' => [
        ['Addis Ababa', 'Hawassa', '06:15', 'standard', [480, 500, 470]],
    ],
    'liyu-bus' => [
        ['Addis Ababa', 'Mekelle', '20:00', 'vip', [1350, 1400, 1300]],
    ],
];

try {
    $pdo = db();
    $pdo->beginTransaction();

    $selUser  = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $insUser  = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, status) VALUES (:name, :email, :password_hash, :role, :status)');
    $selComp  = $pdo->prepare('SELECT id FROM companies WHERE slug = :slug LIMIT 1');
    $insComp  = $pdo->prepare('INSERT INTO companies (user_id, name, slug, description, logo, cover_image, phone, email, address, status) VALUES (:user_id, :name, :slug, :description, :logo, :cover_image, :phone, :email, :address, :status)');
    $insBus   = $pdo->prepare('INSERT INTO buses (company_id, name, model, bus_type, seat_count, registration_number, status) VALUES (:company_id, :name, :model, :bus_type, :seat_count, :registration_number, :status)');
    $selBusReg = $pdo->prepare('SELECT id FROM buses WHERE company_id = :company_id AND registration_number = :registration_number LIMIT 1');
    $selRoute = $pdo->prepare('SELECT id FROM routes WHERE company_id = :company_id AND LOWER(from_city) = LOWER(:from_city) AND LOWER(to_city) = LOWER(:to_city) LIMIT 1');
    $insRoute = $pdo->prepare('INSERT INTO routes (company_id, from_city, to_city, duration, status) VALUES (:company_id, :from_city, :to_city, :duration, :status)');
    $selBus   = $pdo->prepare('SELECT id FROM buses WHERE company_id = :company_id AND bus_type = :bus_type ORDER BY id LIMIT 1');
    $selTrip  = $pdo->prepare('SELECT id FROM trips WHERE company_id = :company_id AND route_id = :route_id AND departure_date = :departure_date AND departure_time = :departure_time LIMIT 1');
    $insTrip  = $pdo->prepare('INSERT INTO trips (company_id, bus_id, route_id, departure_date, departure_time, arrival_time, price, status) VALUES (:company_id, :bus_id, :route_id, :departure_date, :departure_time, :arrival_time, :price, :status)');

    $stats = ['companies' => 0, 'buses' => 0, 'routes' => 0, 'trips' => 0];
    $today = new DateTimeImmutable('today');

    /* ---------- 1. companies + owner company user accounts ---------- */
    foreach ($companySpecs as $spec) {
        $slug = $spec[0];
        $selComp->execute([':slug' => $slug]);
        if ($selComp->fetch()) {
            fwrite(STDOUT, "  company exists : {$slug}\n");
            continue;
        }

        $userEmail = 'owner.' . str_replace('-', '', $slug) . '@ettransport.local';
        $selUser->execute([':email' => $userEmail]);
        $userId = $selUser->fetch()['id'] ?? null;
        if ($userId === null) {
            $insUser->execute([
                ':name' => $spec[1] . ' Owner',
                ':email' => $userEmail,
                ':password_hash' => password_hash('SeedPass123!', PASSWORD_DEFAULT),
                ':role' => 'company',
                ':status' => 'active',
            ]);
            $userId = (int) $pdo->lastInsertId();
        }

        $tagDesc = $spec[2] . "\n\n" . $spec[3];
        $insComp->execute([
            ':user_id' => $userId,
            ':name' => $spec[1],
            ':slug' => $slug,
            ':description' => $tagDesc,
            ':logo' => 'assets/images/companies/' . $slug . '-logo.svg',
            ':cover_image' => 'assets/images/companies/cover-' . $slug . '.svg',
            ':phone' => $spec[5],
            ':email' => $spec[6],
            ':address' => $spec[4],
            ':status' => 'approved',
        ]);
        $stats['companies']++;
        fwrite(STDOUT, "  company created : {$spec[1]} ({$slug})\n");
    }

    /* ---------- 2. routes ----------
       Routes are company-scoped. Each company gets its OWN route book from the
       trip patterns it operates. The shared $routes list is only used as the
       duration lookup table (from|to -> minutes). */
    $durationByKey = [];
    foreach ($routes as $routeSpec) {
        $durationByKey[strtolower($routeSpec[0]) . '|' . strtolower($routeSpec[1])] = (int) $routeSpec[2];
    }

    foreach ($tripPatterns as $companySlug => $slots) {
        $selComp->execute([':slug' => $companySlug]);
        $company = $selComp->fetch();
        if (!$company || !is_array($slots)) {
            continue;
        }
        $companyId = (int) $company['id'];

        foreach ($slots as $slot) {
            $fromCity = $slot[0];
            $toCity = $slot[1];
            $durationMinutes = $durationByKey[strtolower($fromCity) . '|' . strtolower($toCity)] ?? 0;

            $selRoute->execute([
                ':company_id' => $companyId,
                ':from_city' => $fromCity,
                ':to_city' => $toCity,
            ]);
            if ($selRoute->fetch()) {
                continue;
            }
            $insRoute->execute([
                ':company_id' => $companyId,
                ':from_city' => $fromCity,
                ':to_city' => $toCity,
                ':duration' => $durationMinutes,
                ':status' => 'active',
            ]);
            $stats['routes']++;
        }
    }

    /* ---------- 3. buses ---------- */
    $fleetCounter = [];
    foreach ($companySpecs as $spec) {
        $slug = $spec[0];
        $selComp->execute([':slug' => $slug]);
        $company = $selComp->fetch();
        if (!$company) {
            continue;
        }
        $companyId = (int) $company['id'];
        foreach ($spec[11] as $bus) {
            $fleetCounter[$slug] = ($fleetCounter[$slug] ?? 0) + 1;
            $n = $fleetCounter[$slug];
            $reg = 'ET-' . strtoupper(substr($slug, 0, 4)) . str_pad((string) $n, 2, '0', STR_PAD_LEFT);

            /* Idempotency: never insert the same bus twice (registration number). */
            $selBusReg->execute([':company_id' => $companyId, ':registration_number' => $reg]);
            if ($selBusReg->fetch()) {
                continue;
            }

            $insBus->execute([
                ':company_id' => $companyId,
                ':name' => $spec[1] . ' Coach ' . $n,
                ':model' => $bus[0],
                ':bus_type' => $bus[1],
                ':seat_count' => $bus[2],
                ':registration_number' => $reg,
                ':status' => 'active',
            ]);
            $stats['buses']++;
        }
    }

    /* ---------- 4. trips ----------
       Schedule every configured trip pattern daily for the NEXT 14 days
       (inclusive, starting today). Patterns are:
         [from, to, HH:MM, bus_type, [prices]]
       Prices rotate deterministically across the configured values so a
       repeated run produces the exact same schedule. The uniqueness guard
       below (company + route + departure date + departure time) makes the
       whole section idempotent. */

    $tripDays = 14;
    $tripsSkipped = 0;

    foreach ($tripPatterns as $companySlug => $slots) {
        $selComp->execute([':slug' => $companySlug]);
        $company = $selComp->fetch();
        if (!$company || !is_array($slots)) {
            continue;
        }
        $companyId = (int) $company['id'];

        foreach ($slots as $slot) {
            $fromCity = $slot[0];
            $toCity = $slot[1];
            $departureTime = $slot[2];
            $busType = $slot[3];
            $priceList = $slot[4];

            $selRoute->execute([
                ':company_id' => $companyId,
                ':from_city' => $fromCity,
                ':to_city' => $toCity,
            ]);
            $route = $selRoute->fetch();
            if (!$route) {
                fwrite(STDOUT, "  trip route missing : {$fromCity} -> {$toCity}\n");
                continue;
            }
            $routeId = (int) $route['id'];

            $selBus->execute([':company_id' => $companyId, ':bus_type' => $busType]);
            $bus = $selBus->fetch();
            if (!$bus) {
                fwrite(STDOUT, "  trip bus missing   : {$companySlug} / {$busType}\n");
                continue;
            }
            $busId = (int) $bus['id'];

            $durationMinutes = $durationByKey[strtolower($fromCity) . '|' . strtolower($toCity)] ?? 540;

            for ($day = 0; $day < $tripDays; $day++) {
                $departureDate = $today->modify('+' . $day . ' days')->format('Y-m-d');
                $price = $priceList[$day % count($priceList)];

                $depart = DateTimeImmutable::createFromFormat('Y-m-d H:i', $departureDate . ' ' . $departureTime);
                $arrivalTime = $depart !== false
                    ? $depart->modify('+' . $durationMinutes . ' minutes')->format('H:i')
                    : null;

                $selTrip->execute([
                    ':company_id' => $companyId,
                    ':route_id' => $routeId,
                    ':departure_date' => $departureDate,
                    ':departure_time' => $departureTime,
                ]);
                if ($selTrip->fetch()) {
                    $tripsSkipped++;
                    continue;
                }

                $insTrip->execute([
                    ':company_id' => $companyId,
                    ':bus_id' => $busId,
                    ':route_id' => $routeId,
                    ':departure_date' => $departureDate,
                    ':departure_time' => $departureTime,
                    ':arrival_time' => $arrivalTime,
                    ':price' => $price,
                    ':status' => 'scheduled',
                ]);
                $stats['trips']++;
            }
        }
    }

    $pdo->commit();

    /* ---------- Summary ---------- */
    fwrite(STDOUT, "\nTransport seed completed successfully.\n");
    fwrite(STDOUT, '  companies created  : ' . $stats['companies'] . "\n");
    fwrite(STDOUT, '  routes created     : ' . $stats['routes'] . "\n");
    fwrite(STDOUT, '  buses created      : ' . $stats['buses'] . "\n");
    fwrite(STDOUT, '  trips created      : ' . $stats['trips'] . "\n");
    fwrite(STDOUT, '  trips already there: ' . $tripsSkipped . "\n");
    fwrite(STDOUT, '  DB totals -> companies=' . ((int) $pdo->query('SELECT COUNT(*) FROM companies')->fetchColumn())
        . ' buses=' . ((int) $pdo->query('SELECT COUNT(*) FROM buses')->fetchColumn())
        . ' routes=' . ((int) $pdo->query('SELECT COUNT(*) FROM routes')->fetchColumn())
        . ' trips=' . ((int) $pdo->query('SELECT COUNT(*) FROM trips')->fetchColumn()) . "\n");
} catch (Throwable $e) {
    if ((isset($pdo) && $pdo instanceof PDO) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    fwrite(STDERR, 'Transport seed failed: ' . $e->getMessage() . "\n");
    exit(1);
}
