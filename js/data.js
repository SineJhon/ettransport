(function () {
    'use strict';

    var legacyTrips = [
        { id: 1, company: 'Selam Express', from: 'Addis Ababa', to: 'Arba Minch', depart: '06:30', arrive: '14:45', minutes: 495, price: 720, rating: 4.8, type: 'Standard', seats: 14, amenities: ['AC', 'Wi-Fi', 'Charging', 'Luggage'] },
        { id: 2, company: 'Dashen Motors', from: 'Addis Ababa', to: 'Arba Minch', depart: '07:45', arrive: '15:30', minutes: 465, price: 740, rating: 4.4, type: 'Standard', seats: 17, amenities: ['AC', 'Wi-Fi', 'Charging'] },
        { id: 3, company: 'Ethio Abay Lines', from: 'Addis Ababa', to: 'Arba Minch', depart: '08:00', arrive: '16:30', minutes: 510, price: 650, rating: 4.5, type: 'Standard', seats: 24, amenities: ['AC', 'Luggage'] },
        { id: 4, company: 'SkyLink Coaches', from: 'Addis Ababa', to: 'Arba Minch', depart: '10:15', arrive: '18:45', minutes: 510, price: 480, rating: 4.2, type: 'Standard', seats: 8, amenities: ['Luggage'] },
        { id: 5, company: 'Lion Express', from: 'Addis Ababa', to: 'Arba Minch', depart: '13:00', arrive: '21:00', minutes: 480, price: 850, rating: 4.6, type: 'Standard', seats: 6, amenities: ['AC', 'Wi-Fi', 'Charging', 'Luggage'] },
        { id: 6, company: 'GreenLion Travel', from: 'Addis Ababa', to: 'Arba Minch', depart: '15:30', arrive: '23:45', minutes: 495, price: 1100, rating: 4.9, type: 'Standard', seats: 4, amenities: ['AC', 'Wi-Fi', 'Charging'] },
        { id: 7, company: 'Abay River Bus', from: 'Addis Ababa', to: 'Arba Minch', depart: '18:00', arrive: '02:45', minutes: 525, price: 950, rating: 4.3, type: 'Standard', seats: 11, amenities: ['AC', 'Charging', 'Luggage'] },
        { id: 8, company: 'Yeha Coaches', from: 'Addis Ababa', to: 'Arba Minch', depart: '19:30', arrive: '04:00', minutes: 510, price: 1250, rating: 4.7, type: 'Standard', seats: 3, amenities: ['AC', 'Wi-Fi', 'Luggage'] }
    ];

    var companyTrips = [
        { id: 1001, company: 'Selam Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '06:30', arrive: '15:30', minutes: 540, price: 900, rating: 4.8, type: 'Standard', seats: 18, busType: 'Scania Touring', offsetDays: 2 },
        { id: 1002, company: 'Selam Bus', from: 'Addis Ababa', to: 'Mekelle', depart: '05:30', arrive: '18:00', minutes: 750, price: 1200, rating: 4.9, type: 'Standard', seats: 9, busType: 'MAN Lion\u2019s Coach', offsetDays: 4 },
        { id: 1021, company: 'Yegna Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '10:30', arrive: '19:30', minutes: 540, price: 850, rating: 4.4, type: 'Standard', seats: 25, busType: 'MAN Lion\u2019s Coach', offsetDays: 3 },
        { id: 1022, company: 'Yegna Bus', from: 'Addis Ababa', to: 'Gondar', depart: '06:00', arrive: '18:30', minutes: 750, price: 1050, rating: 4.5, type: 'Standard', seats: 8, busType: 'Golden Dragon XML6125', offsetDays: 6 },
        { id: 1031, company: 'Golden Bus', from: 'Addis Ababa', to: 'Dessie', depart: '08:30', arrive: '15:00', minutes: 390, price: 600, rating: 4.3, type: 'Standard', seats: 20, busType: 'Yutong ZK6107H', offsetDays: 2 },
        { id: 1032, company: 'Golden Bus', from: 'Addis Ababa', to: 'Adama', depart: '09:00', arrive: '10:40', minutes: 100, price: 220, rating: 4.2, type: 'Standard', seats: 30, busType: 'King Long XMQ6898', offsetDays: 1 },
        { id: 1041, company: 'Zemen Bus', from: 'Addis Ababa', to: 'Dire Dawa', depart: '06:45', arrive: '15:15', minutes: 510, price: 820, rating: 4.6, type: 'Standard', seats: 14, busType: 'Neoplan Skyliner', offsetDays: 3 },
        { id: 1042, company: 'Zemen Bus', from: 'Addis Ababa', to: 'Jijiga', depart: '05:45', arrive: '18:00', minutes: 735, price: 1100, rating: 4.7, type: 'Standard', seats: 6, busType: 'Mercedes-Benz Tourismo', offsetDays: 5 },
        { id: 1051, company: 'ODAA Bus', from: 'Addis Ababa', to: 'Jimma', depart: '07:30', arrive: '15:30', minutes: 480, price: 700, rating: 4.4, type: 'Standard', seats: 11, busType: 'Yutong ZK6122H9', offsetDays: 2 },
        { id: 1052, company: 'ODAA Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '13:00', arrive: '18:10', minutes: 310, price: 480, rating: 4.3, type: 'Standard', seats: 27, busType: 'Foton AUV BJ6129', offsetDays: 4 },
        { id: 1061, company: 'Abay Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '07:00', arrive: '16:00', minutes: 540, price: 880, rating: 4.2, type: 'Standard', seats: 19, busType: 'Yutong ZK6107H', offsetDays: 3 },
        { id: 1071, company: 'Ethio Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '06:15', arrive: '11:20', minutes: 305, price: 480, rating: 4.1, type: 'Standard', seats: 31, busType: 'King Long XMQ6898', offsetDays: 2 },
    ];

    var companies = [
        {
            id: 'selam-bus', name: 'Selam Bus', slug: 'selam-bus', logo: 'assets/uploads/companies/company-136-logo-fac0dbe69c1fc0d0c2580a48.webp', coverImage: 'assets/uploads/companies/company-136-cover-94980b91e3da6feb44860bf4.webp', verified: true, tagline: 'A trusted name on the Addis Ababa – Mekelle corridor.', description: 'Selam Bus operates modern long-haul coaches on Ethiopia’s northern corridor, linking Addis Ababa with Mekelle, Bahir Dar and Gondar. The fleet is built for comfortable multi-hour journeys with reclining seats, on-board charging and regular service.', rating: 4.7, reviewCount: 1240, founded: 2005, headOffice: 'Addis Ababa, Autobus Tera', phone: '+251 11 667 8022', phones: ['+251 11 667 8022', '+251 34 441 5566'], email: 'info@selambus.example.com', website: 'https://selambus.example.com', destinations: ['Mekelle', 'Bahir Dar', 'Gondar', 'Dessie', 'Axum', 'Adama'], amenities: ['Reclining Seats', 'Headrests', 'Arm Support', 'AC', 'Entertainment', 'Snacks', 'Wi-Fi', 'Luggage Space', 'Multiple Pickup'], busCount: 28, fleet: [
                { model: 'Scania Touring', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-241-758aecea98c9d1f2be16d54e.webp', amenities: ['A/C', 'Charging', 'Reclining Seats'], description: 'Flagship coach with wide recliners and onboard media screens.' },
                { model: 'MAN Lion\u2019s Coach', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-243-065e7b14ea74b25a530b6640.webp', amenities: ['A/C', 'Wi-Fi', 'Charging', 'Meals'], description: 'Priority service with fewer seats, extra legroom and a host on board.' },
                { model: 'Yutong ZK6122H9', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-242-e2a27b41f0ad1bf0e4d04464.webp', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Reliable workhorse used for secondary departures during peak days.' }
            ], popularRoutes: [
                { from: 'Addis Ababa', to: 'Mekelle', price: 1200, minutes: 750 },
                { from: 'Addis Ababa', to: 'Bahir Dar', price: 900, minutes: 540 },
                { from: 'Addis Ababa', to: 'Gondar', price: 1050, minutes: 750 },
                { from: 'Addis Ababa', to: 'Dessie', price: 600, minutes: 390 }
            ], offices: [
                { city: 'Addis Ababa', address: 'Autobus Tera Terminal, near Meskel Square', phone: '+251 11 667 8022', email: 'info@selambus.example.com' },
                { city: 'Mekelle', address: 'Mekelle Main Bus Station, Hawelti', phone: '+251 34 441 5566', email: 'mekelle@selambus.example.com' }
            ], reviews: [
                { name: 'Amanuel T.', rating: 5, when: '2 weeks ago', verified: true, text: 'Very comfortable journey and the bus left on time. The reclining seats made the long drive to Mekelle easy.' },
                { name: 'Hanna G.', rating: 5, when: '1 month ago', verified: true, text: 'Clean coach, helpful crew and our luggage arrived exactly where it should. My go-to for the north.' },
                { name: 'Bereket S.', rating: 4, when: '2 months ago', verified: true, text: 'Smooth ride overall. Wi-Fi was a little slow but the seat space made up for it.' }
            ]
        },
        {
            id: 'yegna-bus', name: 'Yegna Bus', slug: 'yegna-bus', logo: 'assets/uploads/companies/company-138-logo-5842bf95c9e3e312f673bdb2.webp', coverImage: 'assets/uploads/companies/company-138-cover-070bb62c126a5d0a805649c0.webp', verified: true, tagline: 'Comfortable daily services on the Bahir Dar – Gondar corridor.', description: 'Yegna Bus focuses on dependable daytime departures along the Bahir Dar and Gondar corridor. Clean coaches, clear schedules and helpful crews keep regular travellers coming back.', rating: 4.4, reviewCount: 655, founded: 2012, headOffice: 'Addis Ababa, Kazanchis', phone: '+251 11 550 1290', phones: ['+251 11 550 1290', '+251 58 220 6633'], email: 'info@yegnabus.example.com', website: 'https://yegnabus.example.com', destinations: ['Bahir Dar', 'Gondar', 'Dessie', 'Debre Markos'], amenities: ['Reclining Seats', 'Headrests', 'AC', 'Entertainment', 'Wi-Fi'], busCount: 16, fleet: [
                { model: 'MAN Lion\u2019s Coach', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-246-fa26d5478a5fc7bdda23d664.webp', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Everyday coach with a comfortable seat pitch and plenty of luggage space.' },
                { model: 'Yutong ZK6122H9', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-246-fa26d5478a5fc7bdda23d664.webp', amenities: ['A/C', 'Luggage'], description: 'Dependable coach used on the busy Bahir Dar departures.' },
                { model: 'Golden Dragon XML6125', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-247-cd63f1099b64d9cdfdf6f0f5.webp', amenities: ['A/C', 'Reclining Seats', 'Entertainment'], description: 'Premium option for longer runs towards Gondar.' }
            ], popularRoutes: [
                { from: 'Addis Ababa', to: 'Bahir Dar', price: 850, minutes: 540 },
                { from: 'Addis Ababa', to: 'Gondar', price: 1050, minutes: 750 },
                { from: 'Addis Ababa', to: 'Dessie', price: 600, minutes: 420 },
                { from: 'Addis Ababa', to: 'Debre Markos', price: 450, minutes: 330 }
            ], offices: [
                { city: 'Addis Ababa', address: 'Kazanchis Terminal', phone: '+251 11 550 1290', email: 'info@yegnabus.example.com' },
                { city: 'Bahir Dar', address: 'Bahir Dar Central Bus Station', phone: '+251 58 220 6633', email: 'bahirdar@yegnabus.example.com' }
            ], reviews: [
                { name: 'Selamawit A.', rating: 5, when: '2 weeks ago', verified: true, text: 'Departed on time and the crew handled our luggage quickly. Very happy customer.' },
                { name: 'Tewodros F.', rating: 4, when: '1 month ago', verified: true, text: 'Pleasant ride to Gondar. Bus was clean and reasonably priced.' }
            ]
        },
        {
            id: 'golden-bus', name: 'Golden Bus', slug: 'golden-bus', logo: 'assets/uploads/companies/company-139-logo-827e0a67c668814ed9f09bf2.webp', coverImage: 'assets/uploads/companies/company-139-cover-8998512af93091632ee0412a.webp', verified: true, tagline: 'Daily commuter and long-haul links to eastern and central towns.', description: 'Golden Bus connects Addis Ababa with Adama, Dessie, Woldia and Kombolcha with frequent departures. It is a popular choice for both short commutes and longer eastern journeys.', rating: 4.3, reviewCount: 540, founded: 2010, headOffice: 'Addis Ababa, Bole', phone: '+251 11 663 7020', phones: ['+251 11 663 7020', '+251 22 111 4020'], email: 'info@goldenbus.example.com', website: 'https://goldenbus.example.com', destinations: ['Adama', 'Dessie', 'Woldia', 'Kombolcha'], amenities: ['Reclining Seats', 'Headrests', 'Arm Support', 'AC', 'Luggage Space'], busCount: 14, fleet: [
                { model: 'Yutong ZK6107H', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-248-f2a335b1df1e00a96f68aa52.webp', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Compact coach well suited to the Adama commute.' },
                { model: 'King Long XMQ6898', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-249-318b091afd2ba26a1e313065.webp', amenities: ['A/C', 'Luggage'], description: 'Medium coach used on lighter eastern departures.' }
            ], popularRoutes: [
                { from: 'Addis Ababa', to: 'Adama', price: 220, minutes: 100 },
                { from: 'Addis Ababa', to: 'Dessie', price: 650, minutes: 420 },
                { from: 'Addis Ababa', to: 'Woldia', price: 850, minutes: 540 },
                { from: 'Addis Ababa', to: 'Kombolcha', price: 700, minutes: 450 }
            ], offices: [
                { city: 'Addis Ababa', address: 'Bole, around Bole Medhanealem', phone: '+251 11 663 7020', email: 'info@goldenbus.example.com' },
                { city: 'Adama', address: 'Adama Main Terminal', phone: '+251 22 111 4020', email: 'adama@goldenbus.example.com' }
            ], reviews: [
                { name: 'Abebe W.', rating: 4, when: '3 weeks ago', verified: true, text: 'Good service on the Addis – Dessie line. Seats were fine and the bus was on time.' },
                { name: 'Tigist H.', rating: 4, when: '2 months ago', verified: true, text: 'Easy booking through ET Transport and the ride to Adama was quick and smooth.' }
            ]
        },
        {
            id: 'zemen-bus', name: 'Zemen Bus', slug: 'zemen-bus', logo: 'assets/uploads/companies/company-140-logo-0ce3a3963555e43d3d9f8c92.webp', coverImage: 'assets/uploads/companies/company-140-cover-743da061d85d692317e7c8ef.webp', verified: true, tagline: 'Premier service on the eastern corridor to Dire Dawa, Harar and Jijiga.', description: 'Zemen Bus is known for its premium coaches on the eastern corridor, running from Addis Ababa to Dire Dawa, Harar and Jijiga with a focus on service and on-time performance.', rating: 4.6, reviewCount: 910, founded: 2009, headOffice: 'Addis Ababa, Bole', phone: '+251 11 778 1140', phones: ['+251 11 778 1140', '+251 25 112 2144'], email: 'info@zemenbus.example.com', website: 'https://zemenbus.example.com', destinations: ['Dire Dawa', 'Harar', 'Jijiga', 'Aweday'], amenities: ['Reclining Seats', 'Headrests', 'Arm Support', 'AC', 'Entertainment', 'Snacks', 'Water', 'Multiple Pickup'], busCount: 18, fleet: [
                { model: 'Neoplan Skyliner', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-250-35434595d8d736c48333135b.webp', amenities: ['A/C', 'Reclining Seats', 'Charging'], description: 'Comfort-led coach used for long eastern corridors with several midday stops.' },
                { model: 'Mercedes-Benz Tourismo', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-251-c9ef78af83279c1427207097.webp', amenities: ['A/C', 'Wi-Fi', 'Charging'], description: 'Executive coach geared toward higher comfort and less crowding.' }
            ], popularRoutes: [
                { from: 'Addis Ababa', to: 'Dire Dawa', price: 820, minutes: 510 },
                { from: 'Addis Ababa', to: 'Jijiga', price: 1100, minutes: 735 },
                { from: 'Addis Ababa', to: 'Harar', price: 900, minutes: 645 },
                { from: 'Addis Ababa', to: 'Aweday', price: 760, minutes: 510 }
            ], offices: [
                { city: 'Addis Ababa', address: 'Bole Road Terminal, Bole', phone: '+251 11 778 1140', email: 'info@zemenbus.example.com' },
                { city: 'Dire Dawa', address: 'Dire Dawa Intercity Station', phone: '+251 25 112 2144', email: 'dire@zemenbus.example.com' }
            ], reviews: [
                { name: 'Natanim M.', rating: 5, when: '3 days ago', verified: true, text: 'The bus service to Dire Dawa was punctual and very comfortable. Would definitely book again.' },
                { name: 'Rahel S.', rating: 4, when: '2 months ago', verified: true, text: 'Clean coach, helpful staff and the seats were comfortable for the long ride.' }
            ]
        },
        {
            id: 'odaa-bus', name: 'ODAA Bus', slug: 'odaa-bus', logo: 'assets/uploads/companies/company-141-logo-f1006b0b174e3549a042f583.webp', coverImage: 'assets/uploads/companies/company-141-cover-2e8362e5bc6b38c6f90e63a3.webp', verified: true, tagline: 'Reliable routes to Jimma, Hawassa and the western belt.', description: 'ODAA Bus covers fast-growing southern and western routes, delivering value and predictable departures to Jimma, Hawassa and nearby destinations.', rating: 4.4, reviewCount: 610, founded: 2015, headOffice: 'Addis Ababa, Kolfe', phone: '+251 11 442 9090', phones: ['+251 11 442 9090', '+251 47 112 1122'], email: 'info@odaa.example.com', website: 'https://odaa.example.com', destinations: ['Jimma', 'Hawassa', 'Dilla', 'Wolisso'], amenities: ['Reclining Seats', 'Headrests', 'AC', 'Water', 'Multiple Pickup'], busCount: 19, fleet: [
                { model: 'Yutong ZK6122H9', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-252-c4e778839e24b57bbd5c9d10.webp', amenities: ['A/C', 'Reclining Seats', 'Charging'], description: 'Practical coach with good legroom and frequent route coverage.' },
                { model: 'Foton AUV BJ6129', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-253-9f0ba568504d0a601206e802.webp', amenities: ['A/C', 'Charging', 'Luggage'], description: 'Smaller coach for frequent southern schedules and budget travelers.' }
            ], popularRoutes: [
                { from: 'Addis Ababa', to: 'Jimma', price: 700, minutes: 480 },
                { from: 'Addis Ababa', to: 'Hawassa', price: 480, minutes: 310 },
                { from: 'Addis Ababa', to: 'Wolisso', price: 300, minutes: 160 },
                { from: 'Addis Ababa', to: 'Dilla', price: 620, minutes: 400 }
            ], offices: [
                { city: 'Addis Ababa', address: 'Kolfe Terminal, Addis Ababa', phone: '+251 11 442 9090', email: 'info@odaa.example.com' },
                { city: 'Jimma', address: 'Jimma Main Station', phone: '+251 47 112 1122', email: 'jimma@odaa.example.com' }
            ], reviews: [
                { name: 'Kebede Y.', rating: 4, when: '2 weeks ago', verified: true, text: 'Affordable and convenient for trips to Jimma. The bus was comfortable and clean.' },
                { name: 'Hiwot B.', rating: 5, when: '1 month ago', verified: true, text: 'Really smooth ride to Hawassa. The staff were polite and the coach left on time.' }
            ]
        },
        {
            id: 'abay-bus', name: 'Abay Bus', slug: 'abay-bus', logo: 'assets/uploads/companies/company-142-logo-404aac68160d28e1406dcdb2.webp', coverImage: 'assets/uploads/companies/company-142-cover-5051e70c622f71c1b3178218.webp', verified: true, tagline: 'Budget-friendly connections to the north-west.', description: 'Abay Bus is known for dependable buses on the Addis Ababa – Bahir Dar corridor with a strong value-for-money proposition and regular schedules.', rating: 4.2, reviewCount: 420, founded: 2011, headOffice: 'Addis Ababa, Megenagna', phone: '+251 11 554 7733', phones: ['+251 11 554 7733', '+251 58 220 7711'], email: 'info@abaybus.example.com', website: 'https://abaybus.example.com', destinations: ['Bahir Dar', 'Gondar', 'Dessie'], amenities: ['Reclining Seats', 'Headrests', 'AC', 'Luggage Space'], busCount: 11, fleet: [
                { model: 'Yutong ZK6107H', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-254-e7062eba11fca9d045d4dfd6.webp', amenities: ['A/C', 'Luggage'], description: 'Reliable standard coach used on popular north-west routes.' }
            ], popularRoutes: [
                { from: 'Addis Ababa', to: 'Bahir Dar', price: 880, minutes: 540 },
                { from: 'Addis Ababa', to: 'Gondar', price: 980, minutes: 660 },
                { from: 'Addis Ababa', to: 'Dessie', price: 550, minutes: 390 }
            ], offices: [
                { city: 'Addis Ababa', address: 'Megenagna Terminal', phone: '+251 11 554 7733', email: 'info@abaybus.example.com' },
                { city: 'Bahir Dar', address: 'Bahir Dar Central Bus Station', phone: '+251 58 220 7711', email: 'bahirdar@abaybus.example.com' }
            ], reviews: [
                { name: 'Yared L.', rating: 4, when: '4 weeks ago', verified: true, text: 'Good standard service and the seat pitch was decent for the trip to Bahir Dar.' },
                { name: 'Rahel T.', rating: 4, when: '2 months ago', verified: true, text: 'Good value and easy boarding. The bus was not the newest, but it was solid.' }
            ]
        },
        {
            id: 'ethio-bus', name: 'Ethio Bus', slug: 'ethio-bus', logo: 'assets/uploads/companies/company-143-logo-81c9a40874675bddce5dbc4c.webp', coverImage: 'assets/uploads/companies/company-143-cover-2c4779044ba3af3ac3e8ca7f.webp', verified: true, tagline: 'Fast route coverage to the south and lake regions.', description: 'Ethio Bus serves key southern destinations with focused departures and dependable service on fast-moving routes to Hawassa and nearby towns.', rating: 4.1, reviewCount: 318, founded: 2016, headOffice: 'Addis Ababa, Meskel Square', phone: '+251 11 445 8922', phones: ['+251 11 445 8922', '+251 46 200 8811'], email: 'info@ethiobus.example.com', website: 'https://ethiobus.example.com', destinations: ['Hawassa', 'Shashamane', 'Dilla', 'Arba Minch'], amenities: ['Reclining Seats', 'AC', 'Water', 'Luggage Space'], busCount: 9, fleet: [
                { model: 'King Long XMQ6898', type: 'Standard', seats: 51, image: 'assets/uploads/buses/bus-255-0470e04416cd125c7414a03f.webp', amenities: ['A/C', 'Luggage'], description: 'Compact route vehicle used for a quick turn-around service to the south.' }
            ], popularRoutes: [
                { from: 'Addis Ababa', to: 'Hawassa', price: 480, minutes: 305 },
                { from: 'Addis Ababa', to: 'Arba Minch', price: 670, minutes: 440 },
                { from: 'Addis Ababa', to: 'Dilla', price: 540, minutes: 330 }
            ], offices: [
                { city: 'Addis Ababa', address: 'Meskel Square Terminal', phone: '+251 11 445 8922', email: 'info@ethiobus.example.com' },
                { city: 'Hawassa', address: 'Hawassa Intercity Station', phone: '+251 46 200 8811', email: 'hawassa@ethiobus.example.com' }
            ], reviews: [
                { name: 'Blen A.', rating: 4, when: '2 weeks ago', verified: true, text: 'Smooth enough for a quick trip to Hawassa. The route was on time and the bus was clean.' },
                { name: 'Tinsae G.', rating: 4, when: '1 month ago', verified: true, text: 'Travel time was reasonable and the fare was good value.' }
            ]
        }
    ];

    var data = {
        companies: companies,
        companyTrips: companyTrips,
        legacyTrips: legacyTrips,
        trips: legacyTrips.slice().concat(companyTrips)
    };

    window.ETTransportData = data;
    window.ETTransportCompanies = companies;
    window.ETTransportTrips = companyTrips;
})();