-- ============================================================
-- ET Transport — database schema
-- MySQL / MariaDB (XAMPP compatible) · Engine: InnoDB · utf8mb4
--
-- The database is the eventual source of truth for the platform.
-- Three user roles only: passenger · company · admin  (no super admin)
--
-- Relationship overview:
--   users ──< companies (company owner account)
--   companies ──< buses, trips, parcels
--   routes ──< trips
--   trips ──< bookings
--   bookings ──< booking_passengers, paymentsss
--   users ──< bookings, reviews, notifications
--
-- Passwords are NEVER stored in plain text. They are stored with
-- PHP password_hash() in users.password_hash.
--
-- Recommended setup order (see database/README.md):
--   1) create this database, 2) import this file.
-- Importing this file restores the CURRENT state snapshot: the table
-- definitions below are followed by a full row snapshot (see the
-- "DATA SNAPSHOT" section at the bottom) with users, companies,
-- phones, amenities, buses, routes, trips, bookings and payments.
-- config/demo-seed.php still bootstraps a brand-new EMPTY database
-- (structure-only import) and never touches one that has data.
-- ============================================================

-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: ethio_transport
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `ethio_transport`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `ethio_transport` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `ethio_transport`;

--
-- Table structure for table `booking_passengers`
--

DROP TABLE IF EXISTS `booking_passengers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `booking_passengers` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint(20) unsigned NOT NULL,
  `name` varchar(120) NOT NULL,
  `age` tinyint(3) unsigned DEFAULT NULL,
  `gender` enum('male','female','other') DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `seat_number` varchar(10) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_booking_passengers_booking` (`booking_id`),
  CONSTRAINT `fk_booking_passengers_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `booking_passengers`
--

LOCK TABLES `booking_passengers` WRITE;
/*!40000 ALTER TABLE `booking_passengers` DISABLE KEYS */;
INSERT INTO `booking_passengers` VALUES (1,1,'Hanna Alem',28,'female','+251 91 234 5566','A1','2026-09-14 21:28:48'),(2,2,'Debebe Jakson',45,'male','+251936913118','51','2026-09-15 03:50:29');
/*!40000 ALTER TABLE `booking_passengers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bookings`
--

DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bookings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `passenger_id` bigint(20) unsigned NOT NULL,
  `trip_id` bigint(20) unsigned NOT NULL,
  `booking_reference` varchar(30) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_method` varchar(30) NOT NULL DEFAULT 'cash',
  `booking_source` enum('online','office') NOT NULL DEFAULT 'online',
  `payment_status` enum('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  `booking_status` enum('pending','confirmed','cancelled','completed') NOT NULL DEFAULT 'pending',
  `cancellation_reason` varchar(500) DEFAULT NULL,
  `refund_type` enum('none','full','half') NOT NULL DEFAULT 'none',
  `refunded_amount` decimal(10,2) DEFAULT NULL,
  `refund_account_name` varchar(120) DEFAULT NULL,
  `refund_account_number` varchar(50) DEFAULT NULL,
  `refund_bank` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bookings_reference` (`booking_reference`),
  KEY `idx_bookings_passenger` (`passenger_id`),
  KEY `idx_bookings_trip` (`trip_id`),
  KEY `idx_bookings_payment_status` (`payment_status`),
  KEY `idx_bookings_booking_status` (`booking_status`),
  CONSTRAINT `fk_bookings_passenger` FOREIGN KEY (`passenger_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_bookings_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `chk_bookings_total` CHECK (`total_amount` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookings`
--

LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
INSERT INTO `bookings` VALUES (1,162,2941,'BK-SEED-HANNA01',900.00,'cash','online','paid','completed',NULL,'none',NULL,NULL,NULL,NULL,'2026-09-02 20:28:48','2026-09-02 20:28:48'),(2,163,2958,'ET-20260915-DNZDV7',1200.00,'cash','office','paid','confirmed',NULL,'none',NULL,'Debebe Jakson','10001634578','CBE','2026-09-15 03:50:29','2026-09-15 03:50:29');
/*!40000 ALTER TABLE `bookings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `buses`
--

DROP TABLE IF EXISTS `buses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `buses` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `name` varchar(120) NOT NULL,
  `model` varchar(120) DEFAULT NULL,
  `bus_type` enum('standard') NOT NULL DEFAULT 'standard',
  `seat_count` int(10) unsigned NOT NULL DEFAULT 51,
  `registration_number` varchar(50) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `status` enum('active','maintenance','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_buses_company_registration` (`company_id`,`registration_number`),
  KEY `idx_buses_company` (`company_id`),
  KEY `idx_buses_status` (`status`),
  CONSTRAINT `fk_buses_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_buses_seat_count` CHECK (`seat_count` = 51)
) ENGINE=InnoDB AUTO_INCREMENT=257 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `buses`
--

LOCK TABLES `buses` WRITE;
/*!40000 ALTER TABLE `buses` DISABLE KEYS */;
INSERT INTO `buses` VALUES (241,136,'Selam Bus Coach 1','Scania Touring','standard',51,'ET-SELA01','assets/uploads/buses/bus-241-758aecea98c9d1f2be16d54e.webp','active','2026-09-14 21:28:47','2026-09-15 06:12:59'),(242,136,'Selam Bus Coach 2','Yutong ZK6122H9','standard',51,'ET-SELA02','assets/uploads/buses/bus-242-e2a27b41f0ad1bf0e4d04464.webp','active','2026-09-14 21:28:47','2026-09-15 06:13:05'),(243,136,'Selam Bus Coach 3','Yutong ZK6122H9','standard',51,'ET-SELA03','assets/uploads/buses/bus-243-065e7b14ea74b25a530b6640.webp','active','2026-09-14 21:28:47','2026-09-15 06:13:13'),(244,137,'Sky Bus Coach 1','Higer A90','standard',51,'ET-SKY-01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(245,137,'Sky Bus Coach 2','Yutong ZK6107H','standard',51,'ET-SKY-02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(246,138,'Yegna Bus Coach 1','MAN Lion’s Coach','standard',51,'ET-YEGN01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(247,138,'Yegna Bus Coach 2','Golden Dragon XML6125','standard',51,'ET-YEGN02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(248,139,'Golden Bus Coach 1','Yutong ZK6107H','standard',51,'ET-GOLD01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(249,139,'Golden Bus Coach 2','King Long XMQ6898','standard',51,'ET-GOLD02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(250,140,'Zemen Bus Coach 1','Neoplan Skyliner','standard',51,'ET-ZEME01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(251,140,'Zemen Bus Coach 2','Mercedes-Benz Tourismo','standard',51,'ET-ZEME02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(252,141,'ODAA Bus Coach 1','Yutong ZK6122H9','standard',51,'ET-ODAA01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(253,141,'ODAA Bus Coach 2','Foton AUV BJ6129','standard',51,'ET-ODAA02',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(254,142,'Abay Bus Coach 1','Yutong ZK6107H','standard',51,'ET-ABAY01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(255,143,'Ethio Bus Coach 1','King Long XMQ6898','standard',51,'ET-ETHI01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(256,144,'Liyu Bus Coach 1','Neoplan Skyliner','standard',51,'ET-LIYU01',NULL,'active','2026-09-14 21:28:47','2026-09-14 21:28:47');
/*!40000 ALTER TABLE `buses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `companies`
--

DROP TABLE IF EXISTS `companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `companies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `name` varchar(160) NOT NULL,
  `slug` varchar(180) NOT NULL,
  `description` text DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL,
  `cover_image` varchar(255) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `head_office` varchar(255) DEFAULT NULL,
  `founded` smallint(5) unsigned DEFAULT NULL,
  `status` enum('pending','approved','suspended','rejected') NOT NULL DEFAULT 'pending',
  `listed` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_companies_user_id` (`user_id`),
  UNIQUE KEY `uq_companies_slug` (`slug`),
  KEY `idx_companies_status` (`status`),
  KEY `idx_companies_name` (`name`),
  CONSTRAINT `fk_companies_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=145 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `companies`
--

LOCK TABLES `companies` WRITE;
/*!40000 ALTER TABLE `companies` DISABLE KEYS */;
INSERT INTO `companies` VALUES (136,153,'Selam Bus','selam-bus','A trusted name on the Addis Ababa – Mekelle corridor.\r\n\r\nSelam Bus operates modern long-haul coaches on Ethiopia’s northern corridor, linking Addis Ababa with Mekelle, Bahir Dar and Gondar.','assets/uploads/companies/company-136-logo-fac0dbe69c1fc0d0c2580a48.webp','assets/uploads/companies/company-136-cover-94980b91e3da6feb44860bf4.webp','+251 91 140 3977','selam.bus@ethionet.et','Meskel Square, Finfine Building, 5th Floor','https://selambus.wordpress.com','Meskel Square, Finfine Building, 5th Floor, Kirkos Sub-City, Addis Ababa, Ethiopia',1996,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:42:27'),(137,154,'Sky Bus','sky-bus','Everyday departures to the lake cities of the south.\n\nSky Bus runs frequent services from Addis Ababa towards the Rift Valley lakes, serving Hawassa and Arba Minch.','assets/images/companies/sky-bus-logo.svg','assets/images/companies/cover-sky-bus.svg','+251 11 228 4455','info@skybus.example.com','Addis Ababa, Addis Ketema','https://skybus.example.com','Addis Ababa, Addis Ketema',2008,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(138,155,'Yegna Bus','yegna-bus','Comfortable daily services on the Bahir Dar – Gondar corridor.\n\nYegna Bus focuses on dependable daytime departures along the Bahir Dar and Gondar corridor.','assets/images/companies/yegna-bus-logo.svg','assets/images/companies/cover-yegna-bus.svg','+251 11 550 1290','info@yegnabus.example.com','Addis Ababa, Kazanchis','https://yegnabus.example.com','Addis Ababa, Kazanchis',2012,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(139,156,'Golden Bus','golden-bus','Daily commuter and long-haul links to eastern and central towns.\n\nGolden Bus connects Addis Ababa with Adama and Dessie with frequent departures.','assets/images/companies/golden-bus-logo.svg','assets/images/companies/cover-golden-bus.svg','+251 11 663 7020','info@goldenbus.example.com','Addis Ababa, Bole','https://goldenbus.example.com','Addis Ababa, Bole',2010,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(140,157,'Zemen Bus','zemen-bus','Premier service on the eastern corridor to Dire Dawa, Harar and Jijiga.\n\nZemen Bus runs premium coaches on the eastern corridor from Addis Ababa to Dire Dawa.','assets/images/companies/zemen-bus-logo.svg','assets/images/companies/cover-zemen-bus.svg','+251 11 778 1140','info@zemenbus.example.com','Addis Ababa, Bole','https://zemenbus.example.com','Addis Ababa, Bole',2009,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(141,158,'ODAA Bus','odaa-bus','Reliable routes to Jimma, Hawassa and the western belt.\n\nODAA Bus covers fast-growing southern and western routes, delivering value and predictable departures.','assets/images/companies/odaa-bus-logo.svg','assets/images/companies/cover-odaa-bus.svg','+251 11 442 9090','info@odaa.example.com','Addis Ababa, Kolfe','https://odaa.example.com','Addis Ababa, Kolfe',2015,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(142,159,'Abay Bus','abay-bus','Budget-friendly connections to the north-west.\n\nAbay Bus is known for dependable buses on the Addis Ababa – Bahir Dar corridor.','assets/images/companies/abay-bus-logo.svg','assets/images/companies/cover-abay-bus.svg','+251 11 554 7733','info@abaybus.example.com','Addis Ababa, Megenagna','https://abaybus.example.com','Addis Ababa, Megenagna',2011,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(143,160,'Ethio Bus','ethio-bus','Fast route coverage to the south and lake regions.\n\nEthio Bus serves key southern destinations with focused departures on fast-moving routes to Hawassa.','assets/images/companies/ethio-bus-logo.svg','assets/images/companies/cover-ethio-bus.svg','+251 11 445 8922','info@ethiobus.example.com','Addis Ababa, Meskel Square','https://ethiobus.example.com','Addis Ababa, Meskel Square',2016,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(144,161,'Liyu Bus','liyu-bus','Executive comfort on the north corridor to Mekelle.\n\nLiyu Bus offers premium comfort and regular departures for the Addis Ababa – Mekelle corridor.','assets/images/companies/liyu-bus-logo.svg','assets/images/companies/cover-liyu-bus.svg','+251 11 990 2133','info@liyubus.example.com','Addis Ababa, Piassa','https://liyubus.example.com','Addis Ababa, Piassa',2014,'approved',1,'2026-09-14 21:28:47','2026-09-14 21:28:47');
/*!40000 ALTER TABLE `companies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_amenities`
--

DROP TABLE IF EXISTS `company_amenities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `company_amenities` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `amenity` varchar(80) NOT NULL,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_company_amenities_company_amenity` (`company_id`,`amenity`),
  KEY `idx_company_amenities_company` (`company_id`),
  CONSTRAINT `fk_company_amenities_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_amenities`
--

LOCK TABLES `company_amenities` WRITE;
/*!40000 ALTER TABLE `company_amenities` DISABLE KEYS */;
INSERT INTO `company_amenities` VALUES (11,136,'Reclining Seats',0,'2026-09-15 04:02:04'),(12,136,'Headrests',1,'2026-09-15 04:02:04'),(13,136,'AC',2,'2026-09-15 04:02:04'),(14,136,'Water',3,'2026-09-15 04:02:04'),(15,136,'Snacks',4,'2026-09-15 04:02:04'),(16,136,'Wi-Fi',5,'2026-09-15 04:02:04'),(17,136,'Multiple Pickup',6,'2026-09-15 04:02:04'),(18,136,'Luggage Space',7,'2026-09-15 04:02:04'),(19,136,'Arm Support',8,'2026-09-15 04:02:04'),(20,136,'Entertainment',9,'2026-09-15 04:02:04');
/*!40000 ALTER TABLE `company_amenities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_branches`
--

DROP TABLE IF EXISTS `company_branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `company_branches` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `name` varchar(190) NOT NULL,
  `city` varchar(120) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `hours` varchar(255) DEFAULT NULL,
  `is_head` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_company_branches_company` (`company_id`),
  CONSTRAINT `fk_company_branches_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_branches`
--

LOCK TABLES `company_branches` WRITE;
/*!40000 ALTER TABLE `company_branches` DISABLE KEYS */;
INSERT INTO `company_branches` VALUES (1,136,'Head Office','Addis Ababa, Ethiopia','Meskel Square, Finfine Building, 5th Floor','+251115548800','selam.bus@ethionet.et','Mon - Mon ( 02:00 - 10:00 )',1,'active','2026-09-15 04:01:33','2026-09-15 04:01:33'),(2,136,'Arba Minch Branch','Arba Minch','Near Cayro Hotel, Arba Minch','+251915546783','arbaminchbranch@selambus.et','Mon - Mon ( 02:00 - 10:00 )',0,'active','2026-09-15 04:03:20','2026-09-15 04:04:08');
/*!40000 ALTER TABLE `company_branches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_phones`
--

DROP TABLE IF EXISTS `company_phones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `company_phones` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `phone` varchar(30) NOT NULL,
  `label` varchar(60) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_company_phones_company` (`company_id`),
  CONSTRAINT `fk_company_phones_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_phones`
--

LOCK TABLES `company_phones` WRITE;
/*!40000 ALTER TABLE `company_phones` DISABLE KEYS */;
INSERT INTO `company_phones` VALUES (2,137,'+251 11 228 4455',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(3,138,'+251 11 550 1290',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(4,139,'+251 11 663 7020',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(5,140,'+251 11 778 1140',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(6,141,'+251 11 442 9090',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(7,142,'+251 11 554 7733',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(8,143,'+251 11 445 8922',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(9,144,'+251 11 990 2133',NULL,1,0,'2026-09-14 21:28:50','2026-09-14 21:28:50'),(21,136,'+251 91 140 3977',NULL,1,0,'2026-09-15 04:02:04','2026-09-15 04:02:04'),(22,136,'+251 91 140 3978',NULL,0,1,'2026-09-15 04:02:04','2026-09-15 04:02:04'),(23,136,'+251 11 554 8800',NULL,0,2,'2026-09-15 04:02:04','2026-09-15 04:02:04'),(24,136,'+251 11 554 8801',NULL,0,3,'2026-09-15 04:02:04','2026-09-15 04:02:04');
/*!40000 ALTER TABLE `company_phones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_reason_history`
--

DROP TABLE IF EXISTS `company_reason_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `company_reason_history` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `action_type` enum('rejected','suspended') NOT NULL,
  `reason` varchar(500) NOT NULL,
  `admin_user_id` bigint(20) unsigned NOT NULL,
  `listed_before` tinyint(1) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_company_reason_history_company` (`company_id`),
  KEY `idx_company_reason_history_action` (`company_id`,`action_type`),
  KEY `fk_company_reason_history_admin` (`admin_user_id`),
  CONSTRAINT `fk_company_reason_history_admin` FOREIGN KEY (`admin_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_company_reason_history_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_reason_history`
--

LOCK TABLES `company_reason_history` WRITE;
/*!40000 ALTER TABLE `company_reason_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `company_reason_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `complaint_responses`
--

DROP TABLE IF EXISTS `complaint_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `complaint_responses` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `complaint_id` bigint(20) unsigned NOT NULL,
  `message` text NOT NULL,
  `kind` enum('message','status') NOT NULL DEFAULT 'message',
  `actor` enum('passenger','company','admin','system') NOT NULL DEFAULT 'company',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_complaint_responses_complaint` (`complaint_id`),
  CONSTRAINT `fk_complaint_responses_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `complaint_responses`
--

LOCK TABLES `complaint_responses` WRITE;
/*!40000 ALTER TABLE `complaint_responses` DISABLE KEYS */;
INSERT INTO `complaint_responses` VALUES (1,1,'Company is now working on this complaint.','status','company','2026-09-15 09:25:09','2026-09-15 09:25:09');
/*!40000 ALTER TABLE `complaint_responses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `complaints`
--

DROP TABLE IF EXISTS `complaints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `complaints` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `passenger_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned DEFAULT NULL,
  `booking_id` bigint(20) unsigned DEFAULT NULL,
  `category` varchar(40) NOT NULL DEFAULT 'other',
  `target` enum('company','platform') NOT NULL DEFAULT 'company',
  `subject` varchar(120) DEFAULT NULL,
  `message` text NOT NULL,
  `status` enum('open','in_progress','resolved_pending','resolved','closed','escalated') NOT NULL DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `response` text DEFAULT NULL,
  `response_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_complaints_company` (`company_id`),
  KEY `idx_complaints_company_status` (`company_id`,`status`),
  KEY `idx_complaints_company_created` (`company_id`,`created_at`),
  KEY `idx_complaints_target` (`target`),
  KEY `fk_complaints_passenger` (`passenger_id`),
  KEY `fk_complaints_booking` (`booking_id`),
  CONSTRAINT `fk_complaints_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_complaints_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_complaints_passenger` FOREIGN KEY (`passenger_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `complaints`
--

LOCK TABLES `complaints` WRITE;
/*!40000 ALTER TABLE `complaints` DISABLE KEYS */;
INSERT INTO `complaints` VALUES (1,164,136,NULL,'late_departure','company','Bus departed over an hour late to Mekelle','I took the 06:30 coach from Addis Ababa to Mekelle on 14 September. The bus did not leave until 07:45 with no announcement from the terminal staff. I reached Mekelle late at night and missed an appointment. Please explain the delay and consider a partial refund.','in_progress','2026-09-15 05:30:00','2026-09-15 09:25:09',NULL,NULL);
/*!40000 ALTER TABLE `complaints` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `title` varchar(190) NOT NULL,
  `message` text DEFAULT NULL,
  `type` varchar(30) NOT NULL DEFAULT 'general',
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user` (`user_id`),
  KEY `idx_notifications_user_read` (`user_id`,`is_read`),
  KEY `idx_notifications_is_read` (`is_read`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,163,'Ticket booked by office','Your ticket for Addis Ababa → Mekelle has been booked and confirmed. Seat 51 is reserved under booking ET-20260915-DNZDV7.','booking',0,'2026-09-15 03:50:29'),(2,164,'Complaint Update','The company updated the status of your complaint \"Bus departed over an hour late to Mekelle\".','complaint',0,'2026-09-15 09:25:09');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `parcel_delete_log`
--

DROP TABLE IF EXISTS `parcel_delete_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `parcel_delete_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `parcel_reference` varchar(30) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `deleted_by_user` bigint(20) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_parcel_delete_log_company` (`company_id`),
  KEY `idx_parcel_delete_log_parcel` (`parcel_reference`),
  KEY `fk_parcel_delete_log_user` (`deleted_by_user`),
  CONSTRAINT `fk_parcel_delete_log_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_parcel_delete_log_user` FOREIGN KEY (`deleted_by_user`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parcel_delete_log`
--

LOCK TABLES `parcel_delete_log` WRITE;
/*!40000 ALTER TABLE `parcel_delete_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `parcel_delete_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `parcel_payments`
--

DROP TABLE IF EXISTS `parcel_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `parcel_payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `parcel_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `refunded_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `method` varchar(30) NOT NULL DEFAULT 'cash',
  `transaction_reference` varchar(120) DEFAULT NULL,
  `status` enum('paid','refunded') NOT NULL DEFAULT 'paid',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_parcel_payments_parcel` (`parcel_id`),
  KEY `idx_parcel_payments_company` (`company_id`,`created_at`),
  CONSTRAINT `fk_parcel_payments_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_parcel_payments_parcel` FOREIGN KEY (`parcel_id`) REFERENCES `parcels` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=85 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parcel_payments`
--

LOCK TABLES `parcel_payments` WRITE;
/*!40000 ALTER TABLE `parcel_payments` DISABLE KEYS */;
INSERT INTO `parcel_payments` VALUES (1,1,136,450.00,0.00,'cash',NULL,'paid','2026-09-15 03:55:24','2026-09-15 03:55:24');
/*!40000 ALTER TABLE `parcel_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `parcel_status_log`
--

DROP TABLE IF EXISTS `parcel_status_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `parcel_status_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `parcel_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `changed_by` bigint(20) unsigned NOT NULL,
  `from_status` varchar(32) NOT NULL,
  `to_status` varchar(32) NOT NULL,
  `details_json` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_parcel_status_log_parcel` (`parcel_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parcel_status_log`
--

LOCK TABLES `parcel_status_log` WRITE;
/*!40000 ALTER TABLE `parcel_status_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `parcel_status_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `parcels`
--

DROP TABLE IF EXISTS `parcels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `parcels` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `reference` varchar(30) NOT NULL,
  `sender_name` varchar(120) NOT NULL,
  `sender_phone` varchar(30) NOT NULL,
  `recipient_name` varchar(120) NOT NULL,
  `recipient_phone` varchar(30) NOT NULL,
  `from_city` varchar(120) NOT NULL,
  `to_city` varchar(120) NOT NULL,
  `weight_kg` decimal(8,2) NOT NULL,
  `parcel_type` enum('document','standard','electronic','fragile','perishable') NOT NULL DEFAULT 'standard',
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `status` enum('received','sent','delivered','picked_up','returned_to_sender','lost') NOT NULL DEFAULT 'received',
  `trip_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_parcels_reference` (`reference`),
  KEY `idx_parcels_company` (`company_id`),
  KEY `idx_parcels_company_status` (`company_id`,`status`),
  KEY `idx_parcels_company_created` (`company_id`,`created_at`),
  KEY `fk_parcels_trip` (`trip_id`),
  CONSTRAINT `fk_parcels_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_parcels_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parcels`
--

LOCK TABLES `parcels` WRITE;
/*!40000 ALTER TABLE `parcels` DISABLE KEYS */;
INSERT INTO `parcels` VALUES (1,136,'PCL-20260915-FXGBWW','Alebachew Kassa','936913118','Alebachew Kassaye','936913119','Addis Ababa','Arba Minch',10.00,'perishable',450.00,NULL,'received',NULL,'2026-09-15 03:55:24','2026-09-15 03:55:24');
/*!40000 ALTER TABLE `parcels` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `booking_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `method` varchar(30) NOT NULL DEFAULT 'cash',
  `transaction_reference` varchar(120) DEFAULT NULL,
  `status` enum('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_transaction_reference` (`transaction_reference`),
  KEY `idx_payments_booking` (`booking_id`),
  CONSTRAINT `fk_payments_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_payments_amount` CHECK (`amount` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` VALUES (1,2,1200.00,'cash','OFFICE-20260915-9355b4a1','paid','2026-09-15 03:50:29','2026-09-15 03:50:29');
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `review_likes`
--

DROP TABLE IF EXISTS `review_likes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `review_likes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `review_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_review_likes_review_user` (`review_id`,`user_id`),
  KEY `idx_review_likes_review` (`review_id`),
  KEY `idx_review_likes_user` (`user_id`),
  CONSTRAINT `fk_review_likes_review` FOREIGN KEY (`review_id`) REFERENCES `reviews` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_review_likes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `review_likes`
--

LOCK TABLES `review_likes` WRITE;
/*!40000 ALTER TABLE `review_likes` DISABLE KEYS */;
INSERT INTO `review_likes` VALUES (1,1,153,'2026-09-15 03:58:04');
/*!40000 ALTER TABLE `review_likes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `reviews` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `passenger_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `booking_id` bigint(20) unsigned DEFAULT NULL,
  `rating` tinyint(3) unsigned NOT NULL,
  `comment` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `likes` int(10) unsigned NOT NULL DEFAULT 0,
  `reply` text DEFAULT NULL,
  `reply_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_reviews_passenger` (`passenger_id`),
  KEY `idx_reviews_company` (`company_id`),
  KEY `idx_reviews_booking` (`booking_id`),
  KEY `idx_reviews_status` (`status`),
  CONSTRAINT `fk_reviews_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_passenger` FOREIGN KEY (`passenger_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_reviews_rating` CHECK (`rating` between 1 and 5)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

LOCK TABLES `reviews` WRITE;
/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
INSERT INTO `reviews` VALUES (1,162,136,1,5,'Smooth online booking and an on-time departure from Addis Ababa to Bahir Dar. The coach was clean, the crew kept everyone informed and the seats were comfortable for the whole ride. Absolutely recommend Selam Bus!','approved','2026-09-04 20:28:48','2026-09-15 03:58:07',1,'Thank you, Hanna! We are glad you enjoyed the trip — and happy to have you aboard again on the northern corridor anytime.','2026-09-15 03:58:07');
/*!40000 ALTER TABLE `reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `routes`
--

DROP TABLE IF EXISTS `routes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `routes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `from_city` varchar(120) NOT NULL,
  `to_city` varchar(120) NOT NULL,
  `pickup_stations` text DEFAULT NULL,
  `dropoff_stations` text DEFAULT NULL,
  `duration` int(10) unsigned DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_routes_company_from_to` (`company_id`,`from_city`,`to_city`),
  KEY `idx_routes_status` (`status`),
  KEY `idx_routes_company` (`company_id`),
  CONSTRAINT `fk_routes_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_routes_different_cities` CHECK (`from_city` <> `to_city`)
) ENGINE=InnoDB AUTO_INCREMENT=225 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `routes`
--

LOCK TABLES `routes` WRITE;
/*!40000 ALTER TABLE `routes` DISABLE KEYS */;
INSERT INTO `routes` VALUES (211,136,'Addis Ababa','Bahir Dar','[\"Addis Ababa (Central Station)\"]','[\"Bahir Dar (Central Station)\"]',540,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(212,136,'Addis Ababa','Mekelle','[\"Addis Ababa (Central Station)\"]','[\"Mekelle (Central Station)\"]',750,'active','2026-09-14 21:28:47','2026-09-14 21:45:15'),(213,137,'Addis Ababa','Hawassa','[\"Addis Ababa (Central Station)\"]','[\"Hawassa (Central Station)\"]',315,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(214,137,'Addis Ababa','Arba Minch','[\"Addis Ababa (Central Station)\"]','[\"Arba Minch (Central Station)\"]',510,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(215,138,'Addis Ababa','Bahir Dar','[\"Addis Ababa (Central Station)\"]','[\"Bahir Dar (Central Station)\"]',540,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(216,138,'Addis Ababa','Gondar','[\"Addis Ababa (Central Station)\"]','[\"Gondar (Central Station)\"]',750,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(217,139,'Addis Ababa','Dessie','[\"Addis Ababa (Central Station)\"]','[\"Dessie (Central Station)\"]',420,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(218,139,'Addis Ababa','Adama','[\"Addis Ababa (Central Station)\"]','[\"Adama (Central Station)\"]',100,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(219,140,'Addis Ababa','Dire Dawa','[\"Addis Ababa (Central Station)\"]','[\"Dire Dawa (Central Station)\"]',510,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(220,141,'Addis Ababa','Jimma','[\"Addis Ababa (Central Station)\"]','[\"Jimma (Central Station)\"]',480,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(221,141,'Addis Ababa','Hawassa','[\"Addis Ababa (Central Station)\"]','[\"Hawassa (Central Station)\"]',315,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(222,142,'Addis Ababa','Bahir Dar','[\"Addis Ababa (Central Station)\"]','[\"Bahir Dar (Central Station)\"]',540,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(223,143,'Addis Ababa','Hawassa','[\"Addis Ababa (Central Station)\"]','[\"Hawassa (Central Station)\"]',315,'active','2026-09-14 21:28:47','2026-09-14 21:28:47'),(224,144,'Addis Ababa','Mekelle','[\"Addis Ababa (Central Station)\"]','[\"Mekelle (Central Station)\"]',750,'active','2026-09-14 21:28:47','2026-09-14 21:28:47');
/*!40000 ALTER TABLE `routes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trips`
--

DROP TABLE IF EXISTS `trips`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `trips` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `bus_id` bigint(20) unsigned NOT NULL,
  `route_id` bigint(20) unsigned NOT NULL,
  `departure_date` date NOT NULL,
  `departure_time` time NOT NULL,
  `arrival_time` time DEFAULT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('scheduled','departed','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  `cancellation_reason` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_trips_company` (`company_id`),
  KEY `idx_trips_bus` (`bus_id`),
  KEY `idx_trips_route` (`route_id`),
  KEY `idx_trips_route_date` (`route_id`,`departure_date`),
  KEY `idx_trips_departure_date` (`departure_date`),
  KEY `idx_trips_status` (`status`),
  CONSTRAINT `fk_trips_bus` FOREIGN KEY (`bus_id`) REFERENCES `buses` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_trips_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_trips_route` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `chk_trips_price` CHECK (`price` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=3137 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trips`
--

LOCK TABLES `trips` WRITE;
/*!40000 ALTER TABLE `trips` DISABLE KEYS */;
INSERT INTO `trips` VALUES (2941,136,241,211,'2026-09-14','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2942,136,241,211,'2026-09-15','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2943,136,241,211,'2026-09-16','06:30:00','15:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2944,136,241,211,'2026-09-17','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2945,136,241,211,'2026-09-18','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2946,136,241,211,'2026-09-19','06:30:00','15:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2947,136,241,211,'2026-09-20','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2948,136,241,211,'2026-09-21','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2949,136,241,211,'2026-09-22','06:30:00','15:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2950,136,241,211,'2026-09-23','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2951,136,241,211,'2026-09-24','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2952,136,241,211,'2026-09-25','06:30:00','15:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2953,136,241,211,'2026-09-26','06:30:00','15:30:00',900.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2954,136,241,211,'2026-09-27','06:30:00','15:30:00',950.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2955,136,241,212,'2026-09-14','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2956,136,241,212,'2026-09-15','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2957,136,241,212,'2026-09-16','05:30:00','18:00:00',1180.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2958,136,241,212,'2026-09-17','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2959,136,241,212,'2026-09-18','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2960,136,241,212,'2026-09-19','05:30:00','18:00:00',1180.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2961,136,241,212,'2026-09-20','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2962,136,241,212,'2026-09-21','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2963,136,241,212,'2026-09-22','05:30:00','18:00:00',1180.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2964,136,241,212,'2026-09-23','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2965,136,241,212,'2026-09-24','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2966,136,241,212,'2026-09-25','05:30:00','18:00:00',1180.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2967,136,241,212,'2026-09-26','05:30:00','18:00:00',1200.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2968,136,241,212,'2026-09-27','05:30:00','18:00:00',1250.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2969,137,244,213,'2026-09-14','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2970,137,244,213,'2026-09-15','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2971,137,244,213,'2026-09-16','07:00:00','12:15:00',480.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2972,137,244,213,'2026-09-17','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2973,137,244,213,'2026-09-18','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2974,137,244,213,'2026-09-19','07:00:00','12:15:00',480.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2975,137,244,213,'2026-09-20','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2976,137,244,213,'2026-09-21','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2977,137,244,213,'2026-09-22','07:00:00','12:15:00',480.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2978,137,244,213,'2026-09-23','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2979,137,244,213,'2026-09-24','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2980,137,244,213,'2026-09-25','07:00:00','12:15:00',480.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2981,137,244,213,'2026-09-26','07:00:00','12:15:00',500.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2982,137,244,213,'2026-09-27','07:00:00','12:15:00',520.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2983,137,244,214,'2026-09-14','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2984,137,244,214,'2026-09-15','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2985,137,244,214,'2026-09-16','08:00:00','16:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2986,137,244,214,'2026-09-17','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2987,137,244,214,'2026-09-18','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2988,137,244,214,'2026-09-19','08:00:00','16:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2989,137,244,214,'2026-09-20','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2990,137,244,214,'2026-09-21','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2991,137,244,214,'2026-09-22','08:00:00','16:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2992,137,244,214,'2026-09-23','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2993,137,244,214,'2026-09-24','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2994,137,244,214,'2026-09-25','08:00:00','16:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2995,137,244,214,'2026-09-26','08:00:00','16:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2996,137,244,214,'2026-09-27','08:00:00','16:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2997,138,246,215,'2026-09-14','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2998,138,246,215,'2026-09-15','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(2999,138,246,215,'2026-09-16','10:30:00','19:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3000,138,246,215,'2026-09-17','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3001,138,246,215,'2026-09-18','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3002,138,246,215,'2026-09-19','10:30:00','19:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3003,138,246,215,'2026-09-20','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3004,138,246,215,'2026-09-21','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3005,138,246,215,'2026-09-22','10:30:00','19:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3006,138,246,215,'2026-09-23','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3007,138,246,215,'2026-09-24','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3008,138,246,215,'2026-09-25','10:30:00','19:30:00',880.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3009,138,246,215,'2026-09-26','10:30:00','19:30:00',850.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3010,138,246,215,'2026-09-27','10:30:00','19:30:00',820.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3011,138,246,216,'2026-09-14','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3012,138,246,216,'2026-09-15','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3013,138,246,216,'2026-09-16','06:00:00','18:30:00',1100.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3014,138,246,216,'2026-09-17','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3015,138,246,216,'2026-09-18','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3016,138,246,216,'2026-09-19','06:00:00','18:30:00',1100.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3017,138,246,216,'2026-09-20','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3018,138,246,216,'2026-09-21','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3019,138,246,216,'2026-09-22','06:00:00','18:30:00',1100.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3020,138,246,216,'2026-09-23','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3021,138,246,216,'2026-09-24','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3022,138,246,216,'2026-09-25','06:00:00','18:30:00',1100.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3023,138,246,216,'2026-09-26','06:00:00','18:30:00',1050.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3024,138,246,216,'2026-09-27','06:00:00','18:30:00',1000.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3025,139,248,217,'2026-09-14','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3026,139,248,217,'2026-09-15','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3027,139,248,217,'2026-09-16','08:30:00','15:30:00',580.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3028,139,248,217,'2026-09-17','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3029,139,248,217,'2026-09-18','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3030,139,248,217,'2026-09-19','08:30:00','15:30:00',580.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3031,139,248,217,'2026-09-20','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:47','2026-09-14 21:28:47'),(3032,139,248,217,'2026-09-21','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3033,139,248,217,'2026-09-22','08:30:00','15:30:00',580.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3034,139,248,217,'2026-09-23','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3035,139,248,217,'2026-09-24','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3036,139,248,217,'2026-09-25','08:30:00','15:30:00',580.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3037,139,248,217,'2026-09-26','08:30:00','15:30:00',600.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3038,139,248,217,'2026-09-27','08:30:00','15:30:00',620.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3039,139,248,218,'2026-09-14','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3040,139,248,218,'2026-09-15','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3041,139,248,218,'2026-09-16','09:00:00','10:40:00',210.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3042,139,248,218,'2026-09-17','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3043,139,248,218,'2026-09-18','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3044,139,248,218,'2026-09-19','09:00:00','10:40:00',210.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3045,139,248,218,'2026-09-20','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3046,139,248,218,'2026-09-21','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3047,139,248,218,'2026-09-22','09:00:00','10:40:00',210.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3048,139,248,218,'2026-09-23','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3049,139,248,218,'2026-09-24','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3050,139,248,218,'2026-09-25','09:00:00','10:40:00',210.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3051,139,248,218,'2026-09-26','09:00:00','10:40:00',220.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3052,139,248,218,'2026-09-27','09:00:00','10:40:00',240.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3053,140,250,219,'2026-09-14','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3054,140,250,219,'2026-09-15','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3055,140,250,219,'2026-09-16','06:45:00','15:15:00',800.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3056,140,250,219,'2026-09-17','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3057,140,250,219,'2026-09-18','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3058,140,250,219,'2026-09-19','06:45:00','15:15:00',800.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3059,140,250,219,'2026-09-20','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3060,140,250,219,'2026-09-21','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3061,140,250,219,'2026-09-22','06:45:00','15:15:00',800.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3062,140,250,219,'2026-09-23','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3063,140,250,219,'2026-09-24','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3064,140,250,219,'2026-09-25','06:45:00','15:15:00',800.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3065,140,250,219,'2026-09-26','06:45:00','15:15:00',820.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3066,140,250,219,'2026-09-27','06:45:00','15:15:00',850.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3067,141,252,220,'2026-09-14','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3068,141,252,220,'2026-09-15','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3069,141,252,220,'2026-09-16','07:30:00','15:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3070,141,252,220,'2026-09-17','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3071,141,252,220,'2026-09-18','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3072,141,252,220,'2026-09-19','07:30:00','15:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3073,141,252,220,'2026-09-20','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3074,141,252,220,'2026-09-21','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3075,141,252,220,'2026-09-22','07:30:00','15:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3076,141,252,220,'2026-09-23','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3077,141,252,220,'2026-09-24','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3078,141,252,220,'2026-09-25','07:30:00','15:30:00',680.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3079,141,252,220,'2026-09-26','07:30:00','15:30:00',700.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3080,141,252,220,'2026-09-27','07:30:00','15:30:00',720.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3081,141,252,221,'2026-09-14','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3082,141,252,221,'2026-09-15','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3083,141,252,221,'2026-09-16','09:30:00','14:45:00',460.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3084,141,252,221,'2026-09-17','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3085,141,252,221,'2026-09-18','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3086,141,252,221,'2026-09-19','09:30:00','14:45:00',460.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3087,141,252,221,'2026-09-20','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3088,141,252,221,'2026-09-21','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3089,141,252,221,'2026-09-22','09:30:00','14:45:00',460.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3090,141,252,221,'2026-09-23','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3091,141,252,221,'2026-09-24','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3092,141,252,221,'2026-09-25','09:30:00','14:45:00',460.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3093,141,252,221,'2026-09-26','09:30:00','14:45:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3094,141,252,221,'2026-09-27','09:30:00','14:45:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3095,142,254,222,'2026-09-14','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3096,142,254,222,'2026-09-15','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3097,142,254,222,'2026-09-16','07:00:00','16:00:00',900.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3098,142,254,222,'2026-09-17','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3099,142,254,222,'2026-09-18','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3100,142,254,222,'2026-09-19','07:00:00','16:00:00',900.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3101,142,254,222,'2026-09-20','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3102,142,254,222,'2026-09-21','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3103,142,254,222,'2026-09-22','07:00:00','16:00:00',900.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3104,142,254,222,'2026-09-23','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3105,142,254,222,'2026-09-24','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3106,142,254,222,'2026-09-25','07:00:00','16:00:00',900.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3107,142,254,222,'2026-09-26','07:00:00','16:00:00',880.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3108,142,254,222,'2026-09-27','07:00:00','16:00:00',860.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3109,143,255,223,'2026-09-14','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3110,143,255,223,'2026-09-15','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3111,143,255,223,'2026-09-16','06:15:00','11:30:00',470.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3112,143,255,223,'2026-09-17','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3113,143,255,223,'2026-09-18','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3114,143,255,223,'2026-09-19','06:15:00','11:30:00',470.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3115,143,255,223,'2026-09-20','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3116,143,255,223,'2026-09-21','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3117,143,255,223,'2026-09-22','06:15:00','11:30:00',470.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3118,143,255,223,'2026-09-23','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3119,143,255,223,'2026-09-24','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3120,143,255,223,'2026-09-25','06:15:00','11:30:00',470.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3121,143,255,223,'2026-09-26','06:15:00','11:30:00',480.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3122,143,255,223,'2026-09-27','06:15:00','11:30:00',500.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3123,144,256,224,'2026-09-14','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3124,144,256,224,'2026-09-15','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3125,144,256,224,'2026-09-16','20:00:00','08:30:00',1300.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3126,144,256,224,'2026-09-17','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3127,144,256,224,'2026-09-18','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3128,144,256,224,'2026-09-19','20:00:00','08:30:00',1300.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3129,144,256,224,'2026-09-20','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3130,144,256,224,'2026-09-21','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3131,144,256,224,'2026-09-22','20:00:00','08:30:00',1300.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3132,144,256,224,'2026-09-23','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3133,144,256,224,'2026-09-24','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3134,144,256,224,'2026-09-25','20:00:00','08:30:00',1300.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3135,144,256,224,'2026-09-26','20:00:00','08:30:00',1350.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48'),(3136,144,256,224,'2026-09-27','20:00:00','08:30:00',1400.00,'scheduled',NULL,'2026-09-14 21:28:48','2026-09-14 21:28:48');
/*!40000 ALTER TABLE `trips` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `email` varchar(190) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('passenger','company','admin') NOT NULL,
  `status` enum('active','pending','suspended','rejected') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_phone` (`phone`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=165 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (152,'Platform Admin','admin@ettransport.com','+251900000001','$2y$10$MXCB3lTl8m8mz.J1fFCnienbgBXkImsiZKdvgEMeoT7LzwX4Lgswy','admin','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(153,'Selam Bus Owner','owner.selambus@ettransport.com',NULL,'$2y$10$bRogVgfE6OOzbB3xVkxMQuCQwzIvphAvAu/5oLrecCWOdnPH34Eay','company','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(154,'Sky Bus Owner','owner.skybus@ettransport.com',NULL,'$2y$10$/gwAHXZuojFNpQ13iYxX0OggPW6QU/DsZjEV40h16VB1aCcapYEUG','company','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(155,'Yegna Bus Owner','owner.yegnabus@ettransport.com',NULL,'$2y$10$YVEXly0qjH9UOBA5z/6Raeh2QuWpGgWnCkBdVqAGR860Pd3aLZhsq','company','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(156,'Golden Bus Owner','owner.goldenbus@ettransport.com',NULL,'$2y$10$nXZ0QeE3so3e/pEhNPc0geKV9gN1J3PJJSBIUaQ781gwseiDppBgm','company','active','2026-09-14 21:28:47','2026-09-15 07:51:38'),(157,'Zemen Bus Owner','owner.zemenbus@ettransport.com',NULL,'$2y$10$phfpSddpwDv2l79NjkgJZOiMPTBY4Ld9uz7l0CauU9EwxIIayIQcW','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(158,'ODAA Bus Owner','owner.odaabus@ettransport.com',NULL,'$2y$10$DEmsOGbWvJh01L.DNKTgPeBvP/Okm7PSocSD.YwU2hxk2EEhbevmi','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(159,'Abay Bus Owner','owner.abaybus@ettransport.com',NULL,'$2y$10$uj5bBL9nKWYVGeJDxft/3utJlT.aCzNCFSCzprlX/zh9k2WLC9ViO','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(160,'Ethio Bus Owner','owner.ethiobus@ettransport.com',NULL,'$2y$10$O.rS4xE2afRU2Pz2ZirHku4pbnL4cIMw0kB9iC5j3N6556f/tPPd2','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(161,'Liyu Bus Owner','owner.liyubus@ettransport.com',NULL,'$2y$10$JlwqPaTfV2BH5Gtxt2D.3evtZ9LKYW0OkrZbgFZUp6XfiGhaADdM2','company','active','2026-09-14 21:28:47','2026-09-15 07:51:39'),(162,'Hanna Alem','hanna.alem@ettransport.com','+251 91 234 5566','$2y$10$4gaETzapEQJgExfgEz9FWeP.DJMf66J.q8LVW2Qjr5p03tYHcOvD.','passenger','active','2026-09-14 21:28:48','2026-09-15 07:51:39'),(163,'Debebe Jakson','walkin-debebe-jakson-904d7997@ettransport.local','+251936913118','$2y$10$eo8ipj20XMFotoB2gBADyuNjScIYnuAIdkJCmHNXHuj.NwlfyZ/BS','passenger','active','2026-09-15 03:50:29','2026-09-15 03:50:29'),(164,'Hana Alemu','hana.alemu@ettransport.com','+251 91 776 8899','$2y$10$4gaETzapEQJgExfgEz9FWeP.DJMf66J.q8LVW2Qjr5p03tYHcOvD.','passenger','active','2026-09-15 05:30:00','2026-09-15 05:30:00');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-15 13:05:49
