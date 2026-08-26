/* ============================================================
   ET Transport — company.js
   Transport company profiles (frontend-only, mock data).

   Renders a single reusable company-profile template from the
   ?company=<slug> URL parameter, plus a small company directory
   grid used on the homepage (index.html#companies).

   IMPORTANT: All company details below are ILLUSTRATIVE sample
   data created for the prototype. Ratings, reviews, schedules,
   fleet and contact numbers are NOT verified real-world facts
   about the named Ethiopian bus operators. Do not rely on them
   for real travel decisions.
   ============================================================ */

(function () {
    'use strict';

 /* ---------- Small helpers (kept in line with other phases) ---------- */
    function pad(n) {
        return ('0' + n).slice(-2);
    }

    function getParam(name, fallback) {
        var value = new URLSearchParams(window.location.search).get(name);
        return (value === null || value === '') ? fallback : value;
    }

    function isoToday() {
        return new Date().toISOString().slice(0, 10);
    }

    /* Return an ISO date `days` in the future from today. */
    function isoDateIn(days) {
        var d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function formatDuration(minutes) {
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        return h + 'h ' + pad(m) + 'm';
    }

    function formatPrice(n) {
        return 'ETB ' + n.toLocaleString();
    }

    function formatDate(iso) {
        if (!iso) { return ''; }
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) { return iso; }
        return d.toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    function buildStars(rating) {
        var filled = Math.round(rating);
        var s = '';
        for (var i = 0; i < 5; i++) {
            s += (i < filled) ? '\u2605' : '\u2606';
        }
        return s;
    }

    /* ---------- Canonical company trips ----------
       These trip IDs (1001+) are ALSO appended to the mock trip
       datasets in booking.js / passenger.js / payment.js /
       confirmation.js so that selecting a trip here deep-links
       into the existing search → booking → passenger → payment →
       confirmation flow with consistent company / route / price. */
    var ET_TRIPS = (window.ETTransportData && Array.isArray(window.ETTransportData.companyTrips))
        ? window.ETTransportData.companyTrips.slice()
        : [
        { id: 1001, company: 'Selam Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '06:30', arrive: '15:30', minutes: 540, price: 900, rating: 4.8, type: 'Luxury', seats: 18, busType: 'Scania Touring', offsetDays: 2 },
        { id: 1002, company: 'Selam Bus', from: 'Addis Ababa', to: 'Mekelle', depart: '05:30', arrive: '18:00', minutes: 750, price: 1200, rating: 4.9, type: 'VIP', seats: 9, busType: 'MAN Lion\u2019s Coach', offsetDays: 4 },
        { id: 1011, company: 'Sky Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '07:00', arrive: '12:15', minutes: 315, price: 500, rating: 4.5, type: 'Standard', seats: 22, busType: 'Yutong ZK6107H', offsetDays: 1 },
        { id: 1012, company: 'Sky Bus', from: 'Addis Ababa', to: 'Arba Minch', depart: '08:00', arrive: '16:30', minutes: 510, price: 700, rating: 4.6, type: 'Luxury', seats: 12, busType: 'Higer A90', offsetDays: 5 },
        { id: 1021, company: 'Yegna Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '10:30', arrive: '19:30', minutes: 540, price: 850, rating: 4.4, type: 'Standard', seats: 25, busType: 'MAN Lion\u2019s Coach', offsetDays: 3 },
        { id: 1022, company: 'Yegna Bus', from: 'Addis Ababa', to: 'Gondar', depart: '06:00', arrive: '18:30', minutes: 750, price: 1050, rating: 4.5, type: 'Luxury', seats: 8, busType: 'Golden Dragon XML6125', offsetDays: 6 },
        { id: 1031, company: 'Golden Bus', from: 'Addis Ababa', to: 'Dessie', depart: '08:30', arrive: '15:00', minutes: 390, price: 600, rating: 4.3, type: 'Standard', seats: 20, busType: 'Yutong ZK6107H', offsetDays: 2 },
        { id: 1032, company: 'Golden Bus', from: 'Addis Ababa', to: 'Adama', depart: '09:00', arrive: '10:40', minutes: 100, price: 220, rating: 4.2, type: 'Standard', seats: 30, busType: 'King Long XMQ6898', offsetDays: 1 },
        { id: 1041, company: 'Zemen Bus', from: 'Addis Ababa', to: 'Dire Dawa', depart: '06:45', arrive: '15:15', minutes: 510, price: 820, rating: 4.6, type: 'Luxury', seats: 14, busType: 'Neoplan Skyliner', offsetDays: 3 },
        { id: 1042, company: 'Zemen Bus', from: 'Addis Ababa', to: 'Jijiga', depart: '05:45', arrive: '18:00', minutes: 735, price: 1100, rating: 4.7, type: 'VIP', seats: 6, busType: 'Mercedes-Benz Tourismo', offsetDays: 5 },
        { id: 1051, company: 'ODAA Bus', from: 'Addis Ababa', to: 'Jimma', depart: '07:30', arrive: '15:30', minutes: 480, price: 700, rating: 4.4, type: 'Luxury', seats: 11, busType: 'Yutong ZK6122H9', offsetDays: 2 },
        { id: 1052, company: 'ODAA Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '13:00', arrive: '18:10', minutes: 310, price: 480, rating: 4.3, type: 'Standard', seats: 27, busType: 'Foton AUV BJ6129', offsetDays: 4 },
        { id: 1061, company: 'Abay Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '07:00', arrive: '16:00', minutes: 540, price: 880, rating: 4.2, type: 'Standard', seats: 19, busType: 'Yutong ZK6107H', offsetDays: 3 },
        { id: 1071, company: 'Ethio Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '06:15', arrive: '11:20', minutes: 305, price: 480, rating: 4.1, type: 'Standard', seats: 31, busType: 'King Long XMQ6898', offsetDays: 2 },
        { id: 1081, company: 'Liyu Bus', from: 'Addis Ababa', to: 'Mekelle', depart: '20:00', arrive: '06:30', minutes: 630, price: 1350, rating: 4.6, type: 'VIP', seats: 7, busType: 'Neoplan Skyliner', offsetDays: 3 }
    ];

    /* ---------- Mock company profiles (illustrative sample data) ---------- */
    var companies = (window.ETTransportData && Array.isArray(window.ETTransportData.companies))
        ? window.ETTransportData.companies.slice()
        : [
        {
            id: 'selam-bus',
            name: 'Selam Bus',
            slug: 'selam-bus',
            logo: 'assets/images/companies/selam-bus-logo.svg',
            coverImage: 'assets/images/companies/cover-selam-bus.svg',
            verified: true,
            tagline: 'A trusted name on the Addis Ababa \u2013 Mekelle corridor.',
            description: 'Selam Bus operates modern long-haul coaches on Ethiopia\u2019s northern corridor, linking Addis Ababa with Mekelle, Bahir Dar and Gondar. The fleet is built for comfortable multi-hour journeys with reclining seats, on-board charging and regular service.',
            rating: 4.7,
            reviewCount: 1240,
            founded: 2005,
            headOffice: 'Addis Ababa, Autobus Tera',
            phone: '+251 11 667 8022',
            email: 'info@selambus.example.com',
            website: 'https://selambus.example.com',
            destinations: ['Mekelle', 'Bahir Dar', 'Gondar', 'Dessie', 'Axum', 'Adama'],
            amenities: ['Air Conditioning', 'Reclining Seats', 'Charging', 'Wi-Fi', 'Luggage', 'Entertainment'],
            busCount: 28,
            fleet: [
                { model: 'Scania Touring', type: 'Luxury', seats: 51, image: 'assets/images/buses/bus-luxury.svg', amenities: ['A/C', 'Charging', 'Reclining Seats'], description: 'Flagship coach with wide recliners and onboard media screens.' },
                { model: 'MAN Lion\u2019s Coach', type: 'VIP', seats: 45, image: 'assets/images/buses/bus-vip.svg', amenities: ['A/C', 'Wi-Fi', 'Charging', 'Meals'], description: 'Priority service with fewer seats, extra legroom and a host on board.' },
                { model: 'Yutong ZK6122H9', type: 'Standard', seats: 49, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Reliable workhorse used for secondary departures during peak days.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Mekelle', price: 1200, minutes: 750 },
                { from: 'Addis Ababa', to: 'Bahir Dar', price: 900, minutes: 540 },
                { from: 'Addis Ababa', to: 'Gondar', price: 1050, minutes: 750 },
                { from: 'Addis Ababa', to: 'Dessie', price: 600, minutes: 390 }
            ],
            offices: [
                { city: 'Addis Ababa', address: 'Autobus Tera Terminal, near Meskel Square', phone: '+251 11 667 8022', email: 'info@selambus.example.com' },
                { city: 'Mekelle', address: 'Mekelle Main Bus Station, Hawelti', phone: '+251 34 441 5566', email: 'mekelle@selambus.example.com' }
            ],
            reviews: [
                { name: 'Amanuel T.', rating: 5, when: '2 weeks ago', verified: true, text: 'Very comfortable journey and the bus left on time. The reclining seats made the long drive to Mekelle easy.' },
                { name: 'Hanna G.', rating: 5, when: '1 month ago', verified: true, text: 'Clean coach, helpful crew and our luggage arrived exactly where it should. My go-to for the north.' },
                { name: 'Bereket S.', rating: 4, when: '2 months ago', verified: true, text: 'Smooth ride overall. Wi-Fi was a little slow but the seat space made up for it.' }
            ]
        },
        {
            id: 'sky-bus',
            name: 'Sky Bus',
            slug: 'sky-bus',
            logo: 'assets/images/companies/sky-bus-logo.svg',
            coverImage: 'assets/images/companies/cover-sky-bus.svg',
            verified: true,
            tagline: 'Everyday departures to the lake cities of the south.',
            description: 'Sky Bus runs frequent services from Addis Ababa towards the Rift Valley lakes, serving Hawassa, Arba Minch and Shashamane. A large everyday schedule makes it an easy choice for quick southern getaways.',
            rating: 4.5,
            reviewCount: 862,
            founded: 2008,
            headOffice: 'Addis Ababa, Addis Ketema',
            phone: '+251 11 228 4455',
            email: 'info@skybus.example.com',
            website: 'https://skybus.example.com',
            destinations: ['Hawassa', 'Arba Minch', 'Shashamane', 'Dilla', 'Jinka', 'Adama'],
            amenities: ['Air Conditioning', 'Reclining Seats', 'Charging', 'Luggage', 'Meals'],
            busCount: 21,
            fleet: [
                { model: 'Higer A90', type: 'Luxury', seats: 47, image: 'assets/images/buses/bus-luxury.svg', amenities: ['A/C', 'Reclining Seats', 'Luggage'], description: 'Soft recliners and generous legroom for the longer southern hops.' },
                { model: 'Yutong ZK6107H', type: 'Standard', seats: 43, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage', 'Charging'], description: 'The everyday workhorse of the Hawassa corridor.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Hawassa', price: 500, minutes: 315 },
                { from: 'Addis Ababa', to: 'Arba Minch', price: 700, minutes: 510 },
                { from: 'Addis Ababa', to: 'Shashamane', price: 320, minutes: 200 },
                { from: 'Addis Ababa', to: 'Jinka', price: 900, minutes: 690 }
            ],
            offices: [
                { city: 'Addis Ababa', address: 'Addis Ketema Main Terminal', phone: '+251 11 228 4455', email: 'info@skybus.example.com' },
                { city: 'Hawassa', address: 'Hawassa Intercity Terminal, Piassa', phone: '+251 46 221 7788', email: 'hawassa@skybus.example.com' }
            ],
            reviews: [
                { name: 'Mahlet D.', rating: 5, when: '1 week ago', verified: true, text: 'Quick and easy booking, and the bus to Hawassa arrived right on schedule.' },
                { name: 'Yonas K.', rating: 4, when: '3 weeks ago', verified: true, text: 'Good value trip to Arba Minch. Seats are comfortable, boarding was smooth.' },
                { name: 'Sara M.', rating: 4, when: '1 month ago', verified: true, text: 'Clean bus and friendly driver. We stopped for a quick break which was appreciated.' }
            ]
        },
        {
            id: 'yegna-bus',
            name: 'Yegna Bus',
            slug: 'yegna-bus',
            logo: 'assets/images/companies/yegna-bus-logo.svg',
            coverImage: 'assets/images/companies/cover-yegna-bus.svg',
            verified: true,
            tagline: 'Comfortable daily services on the Bahir Dar \u2013 Gondar corridor.',
            description: 'Yegna Bus focuses on dependable daytime departures along the Bahir Dar and Gondar corridor. Clean coaches, clear schedules and helpful crews keep regular travellers coming back.',
            rating: 4.4,
            reviewCount: 655,
            founded: 2012,
            headOffice: 'Addis Ababa, Kazanchis',
            phone: '+251 11 550 1290',
            email: 'info@yegnabus.example.com',
            website: 'https://yegnabus.example.com',
            destinations: ['Bahir Dar', 'Gondar', 'Dessie', 'Debre Markos'],
            amenities: ['Air Conditioning', 'Charging', 'Luggage', 'Entertainment'],
            busCount: 16,
            fleet: [
                { model: 'MAN Lion\u2019s Coach', type: 'Standard', seats: 49, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Everyday coach with a comfortable seat pitch and plenty of luggage space.' },
                { model: 'Yutong ZK6122H9', type: 'Standard', seats: 49, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Dependable coach used on the busy Bahir Dar departures.' },
                { model: 'Golden Dragon XML6125', type: 'Luxury', seats: 46, image: 'assets/images/buses/bus-luxury.svg', amenities: ['A/C', 'Reclining Seats', 'Entertainment'], description: 'Premium option for longer runs towards Gondar.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Bahir Dar', price: 850, minutes: 540 },
                { from: 'Addis Ababa', to: 'Gondar', price: 1050, minutes: 750 },
                { from: 'Addis Ababa', to: 'Dessie', price: 600, minutes: 420 },
                { from: 'Addis Ababa', to: 'Debre Markos', price: 450, minutes: 330 }
            ],
            offices: [
                { city: 'Addis Ababa', address: 'Kazanchis Terminal', phone: '+251 11 550 1290', email: 'info@yegnabus.example.com' },
                { city: 'Bahir Dar', address: 'Bahir Dar Central Bus Station', phone: '+251 58 220 6633', email: 'bahirdar@yegnabus.example.com' }
            ],
            reviews: [
                { name: 'Selamawit A.', rating: 5, when: '2 weeks ago', verified: true, text: 'Departed on time and the crew handled our luggage quickly. Very happy customer.' },
                { name: 'Tewodros F.', rating: 4, when: '1 month ago', verified: true, text: 'Pleasant ride to Gondar. Bus was clean and reasonably priced.' }
            ]
        },
        {
            id: 'golden-bus',
            name: 'Golden Bus',
            slug: 'golden-bus',
            logo: 'assets/images/companies/golden-bus-logo.svg',
            coverImage: 'assets/images/companies/cover-golden-bus.svg',
            verified: true,
            tagline: 'Daily commuter and long-haul links to eastern and central towns.',
            description: 'Golden Bus connects Addis Ababa with Adama, Dessie, Woldia and Kombolcha with frequent departures. It is a popular choice for both short commutes and longer eastern journeys.',
            rating: 4.3,
            reviewCount: 540,
            founded: 2010,
            headOffice: 'Addis Ababa, Bole',
            phone: '+251 11 663 7020',
            email: 'info@goldenbus.example.com',
            website: 'https://goldenbus.example.com',
            destinations: ['Adama', 'Dessie', 'Woldia', 'Kombolcha'],
            amenities: ['Air Conditioning', 'Luggage', 'Charging', 'Reclining Seats'],
            busCount: 14,
            fleet: [
                { model: 'Yutong ZK6107H', type: 'Standard', seats: 43, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Compact coach well suited to the Adama commute.' },
                { model: 'King Long XMQ6898', type: 'Standard', seats: 33, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Medium coach used on lighter eastern departures.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Adama', price: 220, minutes: 100 },
                { from: 'Addis Ababa', to: 'Dessie', price: 650, minutes: 420 },
                { from: 'Addis Ababa', to: 'Woldia', price: 850, minutes: 540 },
                { from: 'Addis Ababa', to: 'Kombolcha', price: 700, minutes: 450 }
            ],
            offices: [
                { city: 'Addis Ababa', address: 'Bole, around Bole Medhanealem', phone: '+251 11 663 7020', email: 'info@goldenbus.example.com' },
                { city: 'Adama', address: 'Adama Main Terminal', phone: '+251 22 111 4020', email: 'adama@goldenbus.example.com' }
            ],
            reviews: [
                { name: 'Abebe W.', rating: 4, when: '3 weeks ago', verified: true, text: 'Good service on the Addis \u2013 Dessie line. Seats were fine and the bus was on time.' },
                { name: 'Tigist H.', rating: 4, when: '2 months ago', verified: true, text: 'Easy booking through ET Transport and the ride to Adama was quick and smooth.' }
            ]
        },
        {
            id: 'zemen-bus',
            name: 'Zemen Bus',
            slug: 'zemen-bus',
            logo: 'assets/images/companies/zemen-bus-logo.svg',
            coverImage: 'assets/images/companies/cover-zemen-bus.svg',
            verified: true,
            tagline: 'Premier service on the eastern corridor to Dire Dawa, Harar and Jijiga.',
            description: 'Zemen Bus is known for its premium coaches on the eastern corridor, running from Addis Ababa to Dire Dawa, Harar and Jijiga with a focus on service and on-time performance.',
            rating: 4.6,
            reviewCount: 910,
            founded: 2001,
            headOffice: 'Addis Ababa, Megenagna',
            phone: '+251 11 618 3340',
            email: 'info@zemenbus.example.com',
            website: 'https://zemenbus.example.com',
            destinations: ['Dire Dawa', 'Jijiga', 'Harar', 'Adama', 'Dessie'],
            amenities: ['Air Conditioning', 'Reclining Seats', 'Wi-Fi', 'Charging', 'Luggage', 'Meals'],
            busCount: 19,
            fleet: [
                { model: 'Mercedes-Benz Tourismo', type: 'VIP', seats: 44, image: 'assets/images/buses/bus-vip.svg', amenities: ['A/C', 'Wi-Fi', 'Charging', 'Meals'], description: 'Top-tier coach with aboard catering on the Dire Dawa route.' },
                { model: 'Neoplan Skyliner', type: 'Luxury', seats: 52, image: 'assets/images/buses/bus-luxury.svg', amenities: ['A/C', 'Reclining Seats', 'Luggage'], description: 'Double-deck style comfort for the long run to Jijiga.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Dire Dawa', price: 820, minutes: 510 },
                { from: 'Addis Ababa', to: 'Jijiga', price: 1100, minutes: 735 },
                { from: 'Addis Ababa', to: 'Harar', price: 900, minutes: 540 },
                { from: 'Addis Ababa', to: 'Adama', price: 220, minutes: 95 }
            ],
            offices: [
                { city: 'Addis Ababa', address: 'Megenagna Terminal', phone: '+251 11 618 3340', email: 'info@zemenbus.example.com' },
                { city: 'Dire Dawa', address: 'Dire Dawa Main Terminal', phone: '+251 25 111 2290', email: 'diredawa@zemenbus.example.com' }
            ],
            reviews: [
                { name: 'Kidist B.', rating: 5, when: '1 week ago', verified: true, text: 'The VIP coach to Dire Dawa was spotless. Very comfortable seats and excellent crew.' },
                { name: 'Meron T.', rating: 5, when: '1 month ago', verified: true, text: 'Booked easily for my family trip to Harar. Everything was on time and stress-free.' }
            ]
        },
        {
            id: 'odaa-bus',
            name: 'ODAA Bus',
            slug: 'odaa-bus',
            logo: 'assets/images/companies/odaa-bus-logo.svg',
            coverImage: 'assets/images/companies/cover-odaa-bus.svg',
            verified: true,
            tagline: 'South-west services towards Jimma and the coffee country.',
            description: 'ODAA Bus serves the south-western routes from Addis Ababa towards Jimma, Wolkite and Mizan Teferi. The crew is known for friendly service and well-maintained coaches.',
            rating: 4.4,
            reviewCount: 470,
            founded: 2015,
            headOffice: 'Addis Ababa, Merkato',
            phone: '+251 11 275 8810',
            email: 'info@odaabus.example.com',
            website: 'https://odaabus.example.com',
            destinations: ['Jimma', 'Hawassa', 'Wolkite', 'Mizan Teferi', 'Bonga'],
            amenities: ['Air Conditioning', 'Reclining Seats', 'Charging', 'Luggage'],
            busCount: 12,
            fleet: [
                { model: 'Yutong ZK6122H9', type: 'Luxury', seats: 51, image: 'assets/images/buses/bus-luxury.svg', amenities: ['A/C', 'Reclining Seats', 'Charging'], description: 'Flagship coach for the longer Jimma and Mizan departures.' },
                { model: 'Foton AUV BJ6129', type: 'Standard', seats: 47, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Solid everyday coach on the Wolkite and Hawassa lines.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Jimma', price: 700, minutes: 480 },
                { from: 'Addis Ababa', to: 'Hawassa', price: 500, minutes: 315 },
                { from: 'Addis Ababa', to: 'Wolkite', price: 280, minutes: 150 },
                { from: 'Addis Ababa', to: 'Mizan Teferi', price: 950, minutes: 630 }
            ],
            offices: [
                { city: 'Addis Ababa', address: 'Merkato Terminal', phone: '+251 11 275 8810', email: 'info@odaabus.example.com' },
                { city: 'Jimma', address: 'Jimma Main Station', phone: '+251 47 111 3350', email: 'jimma@odaabus.example.com' }
            ],
            reviews: [
                { name: 'Dawit N.', rating: 5, when: '2 weeks ago', verified: true, text: 'Friendly staff and a smooth ride through Wolkite to Jimma. Will use again.' },
                { name: 'Lensa K.', rating: 4, when: '1 month ago', verified: true, text: 'Good experience overall, seats were comfortable and the price was fair.' }
            ]
        },
        {
            id: 'abay-bus',
            name: 'Abay Bus',
            slug: 'abay-bus',
            logo: 'assets/images/companies/abay-bus-logo.svg',
            coverImage: 'assets/images/companies/cover-abay-bus.svg',
            verified: true,
            tagline: 'Lakeside and western departures from Addis Ababa.',
            description: 'Abay Bus provides comfortable links towards Bahir Dar, Debre Markos and Gondar, with a reputation for tidy, well-run coaches and straightforward booking.',
            rating: 4.2,
            reviewCount: 380,
            founded: 2013,
            headOffice: 'Addis Ababa, Piassa',
            phone: '+251 11 111 2040',
            email: 'info@abaybus.example.com',
            website: 'https://abaybus.example.com',
            destinations: ['Bahir Dar', 'Debre Markos', 'Finote Selam', 'Gondar'],
            amenities: ['Air Conditioning', 'Luggage', 'Charging'],
            busCount: 9,
            fleet: [
                { model: 'Yutong ZK6107H', type: 'Standard', seats: 43, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Dependable coach on the Bahir Dar and western departures.' },
                { model: 'Golden Dragon XML6125', type: 'Standard', seats: 46, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Spacious coach used on the longer Gondar runs.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Bahir Dar', price: 880, minutes: 540 },
                { from: 'Addis Ababa', to: 'Debre Markos', price: 450, minutes: 330 },
                { from: 'Addis Ababa', to: 'Gondar', price: 1050, minutes: 750 },
                { from: 'Addis Ababa', to: 'Finote Selam', price: 650, minutes: 450 }
            ],
            offices: [
                { city: 'Addis Ababa', address: 'Piassa Terminal', phone: '+251 11 111 2040', email: 'info@abaybus.example.com' },
                { city: 'Bahir Dar', address: 'Bahir Dar Central Bus Station', phone: '+251 58 221 1177', email: 'bahirdar@abaybus.example.com' }
            ],
            reviews: [
                { name: 'Sosina G.', rating: 4, when: '2 weeks ago', verified: true, text: 'Decent, no-frills trip to Bahir Dar. Bus was clean and left on time.' }
            ]
        },
        {
            id: 'ethio-bus',
            name: 'Ethio Bus',
            slug: 'ethio-bus',
            logo: 'assets/images/companies/ethio-bus-logo.svg',
            coverImage: 'assets/images/companies/cover-ethio-bus.svg',
            verified: false,
            tagline: 'Budget-friendly departures to Adama and the lakes.',
            description: 'Ethio Bus offers low-cost everyday departures towards Adama, Hawassa and Shashamane. A straightforward option for shorter, budget-conscious trips.',
            rating: 4.1,
            reviewCount: 295,
            founded: 2009,
            headOffice: 'Addis Ababa, Sarbet Travellers',
            phone: '+251 11 646 5520',
            email: 'info@ethiobus.example.com',
            website: 'https://ethiobus.example.com',
            destinations: ['Adama', 'Hawassa', 'Debre Zeit', 'Shashamane'],
            amenities: ['Air Conditioning', 'Luggage'],
            busCount: 7,
            fleet: [
                { model: 'King Long XMQ6898', type: 'Standard', seats: 33, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Compact coach for the Adama and Debre Zeit commute.' },
                { model: 'Yutong ZK6609', type: 'Minibus', seats: 19, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C'], description: 'Lighter van used on more frequent short departures.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Adama', price: 200, minutes: 95 },
                { from: 'Addis Ababa', to: 'Hawassa', price: 480, minutes: 310 },
                { from: 'Addis Ababa', to: 'Shashamane', price: 300, minutes: 200 },
                { from: 'Addis Ababa', to: 'Debre Zeit', price: 120, minutes: 45 }
            ],
            offices: [
                { city: 'Addis Ababa', address: 'Sarbet Travellers Lounge', phone: '+251 11 646 5520', email: 'info@ethiobus.example.com' },
                { city: 'Adama', address: 'Adama Main Terminal', phone: '+251 22 111 8700', email: 'adama@ethiobus.example.com' }
            ],
            reviews: [
                { name: 'Biniyam M.', rating: 4, when: '3 weeks ago', verified: true, text: 'Good value for the short trip to Adama. Simple and on schedule.' }
            ]
        },
        {
            id: 'liyu-bus',
            name: 'Liyu Bus',
            slug: 'liyu-bus',
            logo: 'assets/images/companies/liyu-bus-logo.svg',
            coverImage: 'assets/images/companies/cover-liyu-bus.svg',
            verified: true,
            tagline: 'Premium overnight and express VIP travel.',
            description: 'Liyu Bus focuses on premium and overnight express services, with modern VIP coaches and fewer seats so that every passenger travels with extra comfort and space.',
            rating: 4.5,
            reviewCount: 522,
            founded: 2017,
            headOffice: 'Addis Ababa, Bole Medhanealem',
            phone: '+251 11 662 1170',
            email: 'info@liyubus.example.com',
            website: 'https://liyubus.example.com',
            destinations: ['Mekelle', 'Gondar', 'Bahir Dar', 'Hawassa'],
            amenities: ['Air Conditioning', 'Reclining Seats', 'Wi-Fi', 'Charging', 'Meals', 'Entertainment'],
            busCount: 11,
            fleet: [
                { model: 'Neoplan Skyliner', type: 'VIP', seats: 44, image: 'assets/images/buses/bus-vip.svg', amenities: ['A/C', 'Wi-Fi', 'Charging', 'Meals'], description: 'Signature VIP coach for overnight routes.' },
                { model: 'Mercedes-Benz Tourismo', type: 'VIP', seats: 44, image: 'assets/images/buses/bus-vip.svg', amenities: ['A/C', 'Reclining Seats', 'Entertainment'], description: 'Quiet, premium coach with full relaxation seating.' },
                { model: 'Higer A90', type: 'Luxury', seats: 49, image: 'assets/images/buses/bus-luxury.svg', amenities: ['A/C', 'Charging', 'Luggage'], description: 'Comfortable luxury option on daytime express runs.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Mekelle', price: 1350, minutes: 630 },
                { from: 'Addis Ababa', to: 'Gondar', price: 1150, minutes: 720 },
                { from: 'Addis Ababa', to: 'Bahir Dar', price: 950, minutes: 510 },
                { from: 'Addis Ababa', to: 'Hawassa', price: 550, minutes: 300 }
            ],
            offices: [
                { city: 'Addis Ababa', address: 'Bole Medhanealem, behind the church', phone: '+251 11 662 1170', email: 'info@liyubus.example.com' },
                { city: 'Mekelle', address: 'Mekelle Main Bus Station, Hawelti', phone: '+251 34 440 2233', email: 'mekelle@liyubus.example.com' }
            ],
            reviews: [
                { name: 'Rediet A.', rating: 5, when: '1 week ago', verified: true, text: 'Easily the most comfortable overnight bus I have travelled on in Ethiopia.' },
                { name: 'Natnael D.', rating: 5, when: '2 weeks ago', verified: true, text: 'Smooth booking and a genuinely premium coach. Worth every birr.' }
            ]
        }
    ];

    /* ---------- Link builders into the existing ET Transport flow ---------- */
    function searchLink(from, to, companySlug, travelDate, passengerCount) {
        var url = 'search.html?from=' + encodeURIComponent(from) +
            '&to=' + encodeURIComponent(to) +
            '&date=' + encodeURIComponent(travelDate || isoToday()) +
            '&passengers=' + encodeURIComponent(passengerCount || '1');
        if (companySlug) { url += '&company=' + encodeURIComponent(companySlug); }
        return url;
    }

    function tripLink(trip) {
        var travelDate = trip.date || isoDateIn(trip.offsetDays || 1);
        return 'booking.html?trip=' + trip.id +
            '&passengers=1' +
            '&date=' + encodeURIComponent(travelDate);
    }

    /* Deterministic, plausible rating distribution for the demo. */
    function buildDistribution(rating) {
        var five = Math.round((rating - 3) * 25 + 38);
        var four = Math.round((rating - 3) * 10 + 14);
        var three = Math.round((5 - rating) * 8 + 5);
        var two = Math.max(1, Math.round((5 - rating) * 5));
        var one = Math.max(1, Math.round((5 - rating) * 3));
        four = Math.max(1, Math.min(four, five - 4));
        three = Math.max(1, Math.min(three, four - 4));
        two = Math.max(1, Math.min(two, three - 4));
        one = Math.max(1, Math.min(one, two - 4));
        five += (100 - (five + four + three + two + one));
        return [
            { stars: 5, pct: five },
            { stars: 4, pct: four },
            { stars: 3, pct: three },
            { stars: 2, pct: two },
            { stars: 1, pct: one }
        ];
    }

    function findCompany(slug) {
        for (var i = 0; i < companies.length; i++) {
            if (companies[i].slug === slug || companies[i].id === slug) {
                return companies[i];
            }
        }
        return null;
    }

    function companyTrips(c) {
 /* real companies ship their own upcoming trips straight
           from the database (api/company.php?action=get). Demo profiles
           keep using the shared mock trips so nothing else changes. */
        if (c.trips && c.trips.length) { return c.trips; }
        var out = [];
        for (var i = 0; i < ET_TRIPS.length; i++) {
            if (ET_TRIPS[i].company === c.name) { out.push(ET_TRIPS[i]); }
        }
        return out;
    }

    function setTitleAndMeta(c) {
        document.title = c.name + ' | ET Transport';
        var meta = document.querySelector('meta[name="description"]');
        if (meta) { meta.setAttribute('content', c.tagline + ' View routes, fleet, services and upcoming trips from ' + c.name + ' on ET Transport.'); }
    }

    /* ---------- Hero ---------- */
    function renderHero(c) {
        var cover = document.getElementById('hero-cover');
        var logo = document.getElementById('hero-logo');
        var verified = document.getElementById('hero-verified');
        var name = document.getElementById('hero-name');
        var tagline = document.getElementById('hero-tagline');
        var rating = document.getElementById('hero-rating');

        if (cover) { cover.src = c.coverImage; cover.alt = ''; }
        if (logo) { logo.src = c.logo; logo.alt = c.name + ' logo'; }
        if (name) { name.textContent = c.name; }
        if (tagline) { tagline.textContent = c.tagline; }
        if (verified) {
            verified.innerHTML = c.verified
                ? '<span class="verified-chip"><span class="verified-check" aria-hidden="true">&#10003;</span> Verified</span>'
                : '<span class="verified-chip pending">Verification pending</span>';
        }
        if (rating) {
            rating.innerHTML = '<span class="hero-stars" aria-hidden="true">' + buildStars(c.rating) + '</span>' +
                ' <strong>' + c.rating.toFixed(1) + '</strong>' +
                ' <span class="hero-review-count">' + c.reviewCount.toLocaleString() + ' reviews</span>';
            rating.setAttribute('role', 'img');
            rating.setAttribute('aria-label', 'Rated ' + c.rating.toFixed(1) + ' out of 5, based on ' + c.reviewCount.toLocaleString() + ' reviews');
        }

 /* favorite toggle in the hero (localStorage only). */
        var favBtn = document.getElementById('hero-fav');
        if (favBtn) {
            var isFav = window.ETTransportFavorites && window.ETTransportFavorites.isFavorite(c.slug);
            favBtn.hidden = false;
            favBtn.setAttribute('data-slug', c.slug);
            favBtn.className = 'fav-btn fav-btn-hero' + (isFav ? ' is-fav' : '');
            favBtn.textContent = (isFav ? '\u2665' : '\u2661') + ' Favorite';
            favBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
            favBtn.setAttribute('aria-label', (isFav ? 'Remove ' : 'Add ') + c.name + ' to favorites');
        }
    }

 /* ---------- Breadcrumb (preserve search context) ---------- */
    function renderBreadcrumb(c) {
        var crumb = document.getElementById('company-crumb');
        if (!crumb) { return; }
        var backFrom = getParam('from', '');
        var backTo = getParam('to', '');
        var backDate = getParam('date', isoToday());
        var backPassengers = getParam('passengers', '1');
        var home = '<a href="index.html#companies">&larr; All Bus Companies</a>';
        if (backFrom || backTo) {
            var routeFrom = backFrom || 'Addis Ababa';
            var routeTo = backTo || 'Hawassa';
            crumb.innerHTML =
                '<a href="' + searchLink(routeFrom, routeTo, c.slug, backDate, backPassengers) +
                '">&larr; Back to Trips</a>' +
                '<span class="crumb-sep" aria-hidden="true">|</span>' +
                home;
        } else {
            crumb.innerHTML = home;
        }
    }

    /* ---------- Quick stats ---------- */
    function renderStats(c) {
        var el = document.getElementById('company-stats');
        if (!el) { return; }
        var years = c.founded ? new Date().getFullYear() - c.founded : 0;
        var stats = [
            { value: c.destinations.length, label: 'Destinations' },
            { value: c.busCount, label: 'Buses in Fleet' },
            { value: c.rating.toFixed(1), label: 'Average Rating' },
            { value: c.founded ? years + '+' : '\\u2014', label: 'Years Experience' }
        ];
        var html = '';
        for (var i = 0; i < stats.length; i++) {
            html += '<div class="stat-card"><span class="stat-value">' + stats[i].value + '</span>' +
                '<span class="stat-label">' + stats[i].label + '</span></div>';
        }
        el.innerHTML = html;
    }

    /* ---------- About ---------- */
    function renderAbout(c) {
        var title = document.getElementById('about-title');
        var text = document.getElementById('about-text');
        if (title) { title.textContent = 'About ' + c.name; }
        if (text) { text.textContent = c.description; }
    }

    /* ---------- Services / amenities ---------- */
    function renderAmenities(c) {
        var el = document.getElementById('amenity-grid');
        if (!el) { return; }
        if (!(c.amenities && c.amenities.length)) {
            /* Live company records have no amenities stored in the schema,
               so show an honest note instead of an empty list. */
            el.innerHTML = '<li class="amenity-chip"><span class="amenity-icon" aria-hidden="true">&#10003;</span>' +
                'Onboard amenities depend on the departure class</li>';
            return;
        }
        var html = '';
        for (var i = 0; i < c.amenities.length; i++) {
            html += '<li class="amenity-chip"><span class="amenity-icon" aria-hidden="true">&#10003;</span>' +
                c.amenities[i] + '</li>';
        }
        el.innerHTML = html;
    }

    /* ---------- Popular routes ---------- */
    function renderRoutes(c) {
        var el = document.getElementById('route-grid');
        if (!el) { return; }
        var html = '';
        for (var i = 0; i < c.popularRoutes.length; i++) {
            var r = c.popularRoutes[i];
            html += '<article class="route-card">' +
                '<div class="route-nodes">' +
                    '<span class="route-city route-from">' + r.from + '</span>' +
                    '<span class="route-line" aria-hidden="true"><span class="route-arrow">\u2193</span></span>' +
                    '<span class="route-city route-to">' + r.to + '</span>' +
                '</div>' +
                '<div class="route-meta">' +
                    '<span class="route-price">From ' + formatPrice(r.price) + '</span>' +
                    '<span class="route-duration">' + formatDuration(r.minutes) + '</span>' +
                '</div>' +
                '<a class="btn btn-route" href="' + searchLink(r.from, r.to, c.slug) + '">View Trips</a>' +
            '</article>';
        }
        el.innerHTML = html;
    }

    /* ---------- Fleet ---------- */
    function renderFleet(c) {
        var el = document.getElementById('fleet-grid');
        if (!el) { return; }
        var html = '';
        for (var i = 0; i < c.fleet.length; i++) {
            var b = c.fleet[i];
            var chips = '';
            for (var j = 0; j < b.amenities.length; j++) {
                chips += '<span class="fleet-chip">' + b.amenities[j] + '</span>';
            }
            html += '<article class="fleet-card">' +
                '<img class="fleet-img" src="' + b.image + '" alt="' + b.model + ' bus image placeholder" loading="lazy">' +
                '<div class="fleet-body">' +
                    '<div class="fleet-head">' +
                        '<h3>' + b.model + '</h3>' +
                        '<span class="fleet-type">' + b.type + '</span>' +
                    '</div>' +
                    '<p class="fleet-seats">' + b.seats + ' Seats</p>' +
                    '<div class="fleet-chips">' + chips + '</div>' +
                    '<button type="button" class="btn btn-fleet-details" aria-expanded="false" aria-controls="fleet-desc-' + i + '">View Details</button>' +
                    '<p id="fleet-desc-' + i + '" class="fleet-more" hidden>' + b.description + '</p>' +
                '</div>' +
            '</article>';
        }
        el.innerHTML = html;
    }

    /* Expand/collapse the "View Details" area on each fleet card. */
    function bindFleetDetails() {
        var grid = document.getElementById('fleet-grid');
        if (!grid) { return; }
        grid.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('.btn-fleet-details') : null;
            if (!btn) { return; }
            var more = document.getElementById(btn.getAttribute('aria-controls'));
            if (!more) { return; }
            var open = more.hasAttribute('hidden');
            more.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.textContent = open ? 'Hide Details' : 'View Details';
        });
    }

    /* ---------- Upcoming trips (deep-links into the existing booking flow) ---------- */
    function renderTrips(c) {
        var el = document.getElementById('trip-grid');
        if (!el) { return; }
        var trips = companyTrips(c);
        if (!trips.length) {
            el.innerHTML = '<p class="trip-empty">No upcoming trips are listed right now. ' +
                '<a href="' + searchLink('Addis Ababa', 'Hawassa') + '">Search all departures</a> instead.</p>';
            return;
        }
        var html = '';
        for (var i = 0; i < trips.length; i++) {
            var t = trips[i];
            var date = t.date || isoDateIn(t.offsetDays || 1);
            html += '<article class="trip-card">' +
                '<div class="trip-date">' + formatDate(date) + '</div>' +
                '<div class="trip-row">' +
                    '<div class="trip-end trip-depart">' +
                        '<span class="trip-time">' + t.depart + '</span>' +
                        '<span class="trip-place">' + t.from + '</span>' +
                    '</div>' +
                    '<div class="trip-journey" aria-hidden="true">' +
                        '<span class="trip-duration">' + formatDuration(t.minutes) + '</span>' +
                        '<span class="trip-line"></span>' +
                    '</div>' +
                    '<div class="trip-end trip-arrive">' +
                        '<span class="trip-time">' + t.arrive + '</span>' +
                        '<span class="trip-place">' + t.to + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="trip-meta">' +
                    '<span class="trip-bustype">' + t.busType + ' \u00b7 ' + t.type + '</span>' +
                    '<span class="trip-seats">' + t.seats + ' seats left</span>' +
                '</div>' +
                '<div class="trip-buy">' +
                    '<span class="trip-price">' + formatPrice(t.price) + '</span>' +
                    '<a class="btn btn-select-trip" href="' + tripLink(t) + '" data-trip-id="' + t.id + '">Select Trip</a>' +
                '</div>' +
            '</article>';
        }
        el.innerHTML = html;

        /* Share the real trip snapshot with the booking flow so booking.html
           (and the downstream pages) render the correct departure even when
           the demo dataset has no row for this database trip id. */
        var grid = el;
        grid.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('.btn-select-trip') : null;
            if (!btn) { return; }
            var id = parseInt(btn.getAttribute('data-trip-id'), 10);
            var sel = null;
            for (var z = 0; z < trips.length; z++) {
                if (Number(trips[z].id) === id) { sel = trips[z]; break; }
            }
            if (!sel) { return; }
            try {
                window.sessionStorage.setItem('etTransportSelectedTrip', JSON.stringify({ v: 1, trip: {
                    id: sel.id,
                    company: sel.company || c.name,
                    companySlug: sel.companySlug || c.slug,
                    from: sel.from,
                    to: sel.to,
                    depart: sel.depart,
                    arrive: sel.arrive || '',
                    minutes: sel.minutes,
                    price: sel.price,
                    rating: sel.rating,
                    type: sel.type,
                    seats: sel.seats,
                    busType: sel.busType || '',
                    date: sel.date || ''
                }}));
            } catch (e) { /* storage unavailable */ }
        });
    }

    function escapeReviewText(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ---------- Sample passenger reviews ---------- */
    function renderReviews(c) {
        var summary = document.getElementById('review-summary');
        var grid = document.getElementById('review-grid');
        if (summary) {
            if (!(c.reviewCount || 0)) {
                /* Real database records have no reviews yet — avoid the
                   deterministic distribution (unreadable negative bars). */
                summary.innerHTML =
                    '<div class="review-score">' +
                        '<span class="review-big">' + c.rating.toFixed(1) + '</span>' +
                        '<span class="review-stars" role="img" aria-label="Rated ' + c.rating.toFixed(1) + ' out of 5">' +
                            buildStars(c.rating) + '</span>' +
                        '<span class="review-count">No reviews yet</span>' +
                    '</div>';
            } else {
            var dist = buildDistribution(c.rating);
            var bars = '';
            for (var i = 0; i < dist.length; i++) {
                bars += '<li class="bar-row">' +
                    '<span class="bar-label">' + dist[i].stars + ' \u2605</span>' +
                    '<span class="bar-track"><span class="bar-fill" style="width:' + dist[i].pct + '%"></span></span>' +
                    '<span class="bar-pct">' + dist[i].pct + '%</span>' +
                '</li>';
            }
            summary.innerHTML =
                '<div class="review-score">' +
                    '<span class="review-big">' + c.rating.toFixed(1) + '</span>' +
                    '<span class="review-stars" role="img" aria-label="Rated ' + c.rating.toFixed(1) + ' out of 5">' +
                        buildStars(c.rating) + '</span>' +
                    '<span class="review-count">' + c.reviewCount.toLocaleString() + ' reviews</span>' +
                '</div>' +
                '<ul class="rating-bars">' + bars + '</ul>';
            }
        }
        if (grid) {
            var html = '';
            if (!(c.reviews && c.reviews.length)) {
                html = '<p class="review-none" style="padding:1rem 0;">No written reviews yet.</p>';
            } else {
                for (var r = 0; r < c.reviews.length; r++) {
                    if (r >= c.reviews.length) { break; }
                    var rev = c.reviews[r];
                    html += '<article class="review-card">' +
                        '<p class="review-stars-row" role="img" aria-label="Rated ' + rev.rating + ' out of 5 stars">' +
                            buildStars(rev.rating) + '</p>' +
                        '<p class="review-text">' + escapeReviewText(rev.text) + '</p>' +
                        '<footer class="reviewer">' +
                            '<strong>' + escapeReviewText(rev.name) + '</strong>' +
                            (rev.verified ? '<span class="review-badge">Verified Passenger</span>' : '') +
                            '<span class="review-when">' + escapeReviewText(rev.when) + '</span>' +
                        '</footer>' +
                    '</article>';
                }
            }
            grid.innerHTML = html;
        }
    }

    /* ---------- Company information ---------- */
    function renderInfo(c) {
        var el = document.getElementById('info-grid');
        if (!el) { return; }
        var tags = '';
        for (var i = 0; i < c.destinations.length; i++) {
            tags += '<span class="dest-tag">' + c.destinations[i] + '</span>';
        }
        el.innerHTML =
            '<li class="info-item"><span class="info-icon" aria-hidden="true">&#128197;</span>' +
                '<div class="info-body"><span class="info-label">Founded</span><span class="info-value">' + (c.founded || '\\u2014') + '</span></div></li>' +
            '<li class="info-item"><span class="info-icon" aria-hidden="true">&#127960;</span>' +
                '<div class="info-body"><span class="info-label">Head Office</span><span class="info-value">' + c.headOffice + '</span></div></li>' +
            '<li class="info-item"><span class="info-icon" aria-hidden="true">&#128222;</span>' +
                '<div class="info-body"><span class="info-label">Phone</span><span class="info-value">' + c.phone + '</span></div></li>' +
            '<li class="info-item"><span class="info-icon" aria-hidden="true">&#9993;</span>' +
                '<div class="info-body"><span class="info-label">Email</span><span class="info-value">' + c.email + '</span></div></li>' +
            (c.website ? '<li class="info-item"><span class="info-icon" aria-hidden="true">&#127760;</span>' +
                '<div class="info-body"><span class="info-label">Website</span>' +
                '<span class="info-value"><a href="' + c.website + '" target="_blank" rel="noopener noreferrer">' +
                c.website.replace('https://', '') + '</a></span></div></li>' : '') +
            '<li class="info-item info-item-wide"><span class="info-icon" aria-hidden="true">&#128652;</span>' +
                '<div class="info-body"><span class="info-label">Main Destinations</span><span class="info-value info-tags">' + tags + '</span></div></li>';
    }

    /* ---------- Contact / offices ---------- */
    function renderContact(c) {
        var title = document.getElementById('contact-title');
        var grid = document.getElementById('contact-grid');
        if (title) { title.textContent = 'Contact ' + c.name; }
        if (!grid) { return; }
        var html = '';
        for (var i = 0; i < c.offices.length; i++) {
            var o = c.offices[i];
            html += '<div class="contact-card">' +
                '<span class="contact-icon" aria-hidden="true">&#128205;</span>' +
                '<h3>' + o.city + '</h3>' +
                '<p class="contact-address">' + o.address + '</p>' +
                '<p class="contact-line"><span aria-hidden="true">&#128222;</span> ' + o.phone + '</p>' +
                '<p class="contact-line"><span aria-hidden="true">&#9993;</span> ' + o.email + '</p>' +
                '<div class="contact-actions">' +
                    '<a class="btn btn-call" href="tel:' + o.phone.replace(/\s+/g, '') + '">Call</a>' +
                    '<a class="btn btn-email" href="mailto:' + o.email + '">Email</a>' +
                '</div>' +
            '</div>';
        }
        grid.innerHTML = html;
    }

    /* ---------- Final CTA ---------- */
    function renderFinalCta(c) {
        var el = document.getElementById('final-cta-company');
        if (el) { el.textContent = c.name; }
    }

    /* ---------- Home page: Bus Companies directory ---------- */
    /* One card template shared by the home directory + favorite grid. */
    function companyCardHtml(c) {
        var isFav = window.ETTransportFavorites && window.ETTransportFavorites.isFavorite(c.slug);
        return '<article class="company-card">' +
            '<button type="button" class="fav-btn' + (isFav ? ' is-fav' : '') +
            '" data-slug="' + c.slug + '" aria-pressed="' + isFav +
            '" aria-label="' + (isFav ? 'Remove ' : 'Add ') + c.name + ' from favorites">' +
            (isFav ? '\u2665' : '\u2661') + '</button>' +
            '<a class="company-card-link" href="company.html?company=' + c.slug + '">' +
                '<div class="company-card-head">' +
                    '<img class="company-card-logo" src="' + c.logo + '" alt="' + c.name + ' logo" loading="lazy">' +
                    (c.verified ? '<span class="verified-chip"><span aria-hidden="true">&#10003;</span> Verified</span>' : '') +
                '</div>' +
                '<h3 class="company-card-name">' + c.name + '</h3>' +
                '<p class="company-card-rating"><span class="stars" aria-hidden="true">' + buildStars(c.rating) + '</span> ' +
                    c.rating.toFixed(1) +
                    ' <span class="company-card-reviews">(' + c.reviewCount.toLocaleString() + ' reviews)</span></p>' +
                '<p class="company-card-dest">' + c.destinations.length + ' Destinations</p>' +
                '<span class="company-card-cta">View Company \u2192</span>' +
            '</a>' +
        '</article>';
    }

    function renderDirectory(gridEl) {
        var html = '';
        for (var i = 0; i < companies.length; i++) {
            html += companyCardHtml(companies[i]);
        }
        gridEl.innerHTML = html;
    }

 /* "Your Favorite Companies" section (homepage only, hidden when empty). */
    function renderFavoriteCompanies() {
        var section = document.getElementById('favorite-companies');
        var grid = document.getElementById('favorite-companies-grid');
        if (!section || !grid) { return; }
        var favs = (window.ETTransportFavorites && window.ETTransportFavorites.get()) || [];
        var html = '';
        for (var i = 0; i < companies.length; i++) {
            if (favs.indexOf(companies[i].slug) !== -1) {
                html += companyCardHtml(companies[i]);
            }
        }
        grid.innerHTML = html;
        section.hidden = (html === '');
    }

    /* Reflect the current favorites state on every rendered ♡ button. */
    function updateFavoriteButtons() {
        if (!window.ETTransportFavorites) { return; }
        var btns = document.querySelectorAll('.fav-btn');
        for (var i = 0; i < btns.length; i++) {
            var btn = btns[i];
            var slug = btn.getAttribute('data-slug');
            if (!slug) { continue; }
            var isFav = window.ETTransportFavorites.isFavorite(slug);
            btn.classList.toggle('is-fav', isFav);
            btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
            if (btn.classList.contains('fav-btn-hero')) {
                btn.textContent = (isFav ? '\u2665' : '\u2661') + ' Favorite';
            } else {
                btn.textContent = isFav ? '\u2665' : '\u2661';
            }
        }
    }

    /* Delegate clicks on directory favorite buttons. */
    function bindDirectoryFavorites(gridEl) {
        if (!gridEl) { return; }
        gridEl.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('.fav-btn') : null;
            if (!btn) { return; }
            var slug = btn.getAttribute('data-slug');
            if (!slug || !window.ETTransportFavorites) { return; }
            event.preventDefault();
            window.ETTransportFavorites.toggle(slug);
            updateFavoriteButtons();
            renderFavoriteCompanies();
        });
    }

    function renderCompany(c) {
        setTitleAndMeta(c);
        renderHero(c);
        renderBreadcrumb(c);
        renderStats(c);
        renderAbout(c);
        renderAmenities(c);
        renderRoutes(c);
        renderFleet(c);
        bindFleetDetails();
        renderTrips(c);
        renderReviews(c);
        renderInfo(c);
        renderContact(c);
        renderFinalCta(c);

 /* hero favorite toggle click handler. */
        var heroFav = document.getElementById('hero-fav');
        if (heroFav) {
            heroFav.addEventListener('click', function () {
                if (!window.ETTransportFavorites) { return; }
                window.ETTransportFavorites.toggle(c.slug);
                updateFavoriteButtons();
                renderFavoriteCompanies();
            });
        }
    }

    /* ---------- Init ---------- */
    var directoryEl = document.getElementById('company-directory-grid');
    var appEl = document.getElementById('company-app');
    var errorEl = document.getElementById('company-error');
    var errorMsg = document.getElementById('company-error-msg');

    if (directoryEl) {
        renderDirectory(directoryEl);
        bindDirectoryFavorites(directoryEl);
    }
    renderFavoriteCompanies();

 /* refresh the home directory + favorites grid from the real
       api/company.php?action=list data when available. Demo data remains as
       the immediate, graceful fallback while the request is in flight. */
    function loadHomeDirectoryFromApi() {
        if (typeof window.fetch !== 'function') { return; }
        window.fetch('api/company.php?action=list', { credentials: 'same-origin' })
            .then(function (res) { return res.json(); })
            .then(function (json) {
                if (!json || json.success !== true || !Array.isArray(json.companies) || !json.companies.length) {
                    return;
                }
                var mapped = json.companies.map(normalizeCompanyFromApi);
                if (!mapped.length) { return; }
                companies = mapped;
                var grid = document.getElementById('company-directory-grid');
                if (grid) { renderDirectory(grid); }
                renderFavoriteCompanies();
                updateFavoriteButtons();
            })
            .catch(function () { /* keep demo/fallback data for the rest of this page */ });
    }
    loadHomeDirectoryFromApi();

/* ---------- real company profile from api/company.php ---------- */

    function ucfirst(str) {
        return String(str || '').charAt(0).toUpperCase() + String(str || '').slice(1);
    }

    function normalizeCompanyFromApi(raw) {
        var bag = raw || {};
        var about = bag.description || '';
        var tagline = (about.split(/[.\n]/)[0] || '').trim() || bag.name || '';
        var createdYear = /^\d{4}/.test(String(bag.created_at || ''))
            ? parseInt(String(bag.created_at).slice(0, 4), 10) : null;

        var fleet = [];
        var fleetRaw = bag.fleet || [];
        for (var fi = 0; fi < fleetRaw.length; fi++) {
            var b = fleetRaw[fi];
            var btype = String(b.bus_type || 'standard').toLowerCase();
            fleet.push({
                name: b.model || 'Coach',
                model: b.model || 'Coach',
                type: ucfirst(btype),
                seats: b.seat_count || 0,
                image: 'assets/images/buses/bus-' + (btype === 'vip' ? 'vip' : btype === 'luxury' ? 'luxury' : 'standard') + '.svg',
                amenities: [],
                description: (b.model || 'Coach') + ' \\u2014 ' + (b.registration_number || 'Active bus')
            });
        }

        var popularRoutes = [];
        var routesRaw = bag.popular_routes || [];
        for (var pi = 0; pi < routesRaw.length; pi++) {
            var pr = routesRaw[pi];
            popularRoutes.push({
                from: pr.from_city,
                to: pr.to_city,
                price: Number(pr.price) || 0,
                minutes: Number(pr.duration) || 0
            });
        }

        var trips = [];
        var tripsRaw = bag.trips || [];
        for (var ti2 = 0; ti2 < tripsRaw.length; ti2++) {
            var t = tripsRaw[ti2];
            var tbtype = String(t.bus_type || 'standard').toLowerCase();
            trips.push({
                id: parseInt(t.id, 10) || 0,
                company: bag.name || '',
                companySlug: bag.slug || '',
                from: t.from || '',
                to: t.to || '',
                date: t.departure_date || '',
                depart: String(t.departure_time || '').slice(0, 5),
                arrive: t.arrival_time ? String(t.arrival_time).slice(0, 5) : '',
                minutes: parseInt(t.duration_minutes, 10) || 0,
                price: Number(t.price) || 0,
                rating: Number(bag.rating) || 0,
                type: ucfirst(tbtype),
                seats: Number(t.available_seats) || 0,
                busType: t.bus_model || '',
                amenities: []
            });
        }

        var reviewed = [];
        var reviewsRaw = bag.reviews || [];
        for (var ri = 0; ri < reviewsRaw.length; ri++) {
            var rv = reviewsRaw[ri];
            reviewed.push({
                name: rv.name || 'Verified passenger',
                rating: Number(rv.rating) || 5,
                when: rv.created_at ? String(rv.created_at).slice(0, 10) : '',
                verified: true,
                text: rv.comment || ''
            });
        }

        return {
            id: bag.id !== undefined ? bag.id : null,
            slug: bag.slug || '',
            name: bag.name || '',
            logo: bag.logo || '',
            coverImage: bag.cover_image || '',
            verified: !!bag.verified,
            tagline: tagline,
            description: about,
            rating: Number(bag.rating) || 0,
            reviewCount: Number(bag.review_count) || 0,
            founded: createdYear,
            headOffice: bag.address || '',
            phone: bag.phone || '',
            email: bag.email || '',
            website: bag.website || '',
            destinations: bag.destinations || [],
            amenities: [],
            busCount: Number(bag.bus_count) || fleet.length,
            fleet: fleet,
            popularRoutes: popularRoutes,
            offices: [{
                city: bag.address ? 'Head office' : '',
                address: bag.address || '',
                phone: bag.phone || '',
                email: bag.email || ''
            }],
            reviews: reviewed,
            trips: trips
        };
    }
 /* ---------- real reviews from api/review.php -------- */
    function mapCompanyReviewFromApi(rv) {
        var when = rv && rv.created_at ? String(rv.created_at).slice(0, 10) : '';
        if (when) { when = formatDate(when); }
        return {
            name: (rv && rv.name) || 'Verified passenger',
            rating: Number(rv && rv.rating) || 5,
            when: when,
            verified: !!(rv && rv.verified),
            text: (rv && rv.comment) || ''
        };
    }

    /* Loads { reviews, rating, count } from the real review API for a company.
       Resolves null (caller keeps API/company fallback data) on any failure or
       when there is no numeric company id. Public endpoint (no auth needed). */
    function loadRealCompanyReviews(company) {
        if (!company || !company.id || typeof window.fetch !== 'function') {
            return Promise.resolve(null);
        }
        return window.fetch('api/review.php?action=list&company_id=' + encodeURIComponent(company.id), {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) { return res.json(); })
            .then(function (json) {
                if (!json || json.success !== true || !Array.isArray(json.reviews)) { return null; }
                return {
                    reviews: json.reviews.map(mapCompanyReviewFromApi),
                    rating: Number(json.rating) || 0,
                    count: Number(json.reviewCount) || 0
                };
            })
            .catch(function () { return null; });
    }

function showCompanyError(mode, slug, apiMessage) {
        appEl.hidden = true;
        document.title = 'Company not found | ET Transport';
        if (errorEl) {
            if (mode === 'local') {
                errorMsg.textContent = slug
                    ? 'We could not find a bus company matching "' + slug + '".'
                    : 'No company was selected. Browse the Bus Companies section on the home page to open a company profile.';
            } else {
                errorMsg.textContent = slug
                    ? 'We could not load the profile for "' + slug + '" from the live database.'
                        + (apiMessage ? ' ' + apiMessage : '')
                    : 'No company was selected. Browse the Bus Companies section on the home page.';
            }
            errorEl.hidden = false;
        }
    }

    function renderLocalCompany(slug) {
        var company = findCompany(slug);
        if (!company) {
            showCompanyError('local', slug);
            return;
        }
        renderCompany(company);
    }

    function loadCompanyFromApi(slug) {
        if (typeof window.fetch !== 'function') {
            showCompanyError('api', slug, 'The database is not reachable in this environment.');
            return;
        }
        window.fetch('api/company.php?action=get&slug=' + encodeURIComponent(slug), { credentials: 'same-origin' })
            .then(function (res) {
                return res.json().catch(function () {
                    throw new Error('Invalid server response.');
                }).then(function (json) {
                    if (!res.ok || !json || json.success !== true || !json.company) {
                        var err = new Error((json && json.message) || ('HTTP ' + res.status));
                        err.status = res.status;
                        throw err;
                    }
                    return json.company;
                });
            })
            .then(function (rawCompany) {
                var company = normalizeCompanyFromApi(rawCompany);
 /* reviews, rating and review count come from
                   the real review API (api/review.php), not the mock dataset.
                   The company id comes from the live company payload above. */
                return loadRealCompanyReviews(company).then(function (rvData) {
                    if (rvData) {
                        company.reviews = rvData.reviews;
                        company.rating = rvData.rating;
                        company.reviewCount = rvData.count;
                    }
                    renderCompany(company);
                });
            })
            .catch(function (err) {
                if (window.console && window.console.error) {
                    window.console.error('ET Transport company API failed:', err);
                }
                if (err && err.status === 404) {
                    showCompanyError('local', slug);
                } else {
                    showCompanyError('api', slug, err && err.message ? String(err.message).replace(/.*HTTP ?/, '') : '');
                }
            });
    }
    if (appEl) {
        var slug = getParam('company', '');
        if (getParam('mock', '') === '1') {
            renderLocalCompany(slug);
        } else {
            loadCompanyFromApi(slug);
        }
    }

    /* ------------------------------------------------------------
 shared mock-data exposure (ES5, no modules).
       The company directory page (companies.html) and the enhanced
       search page (search.html) reuse this same in-memory data by
       loading js/company.js BEFORE their own script. This avoids a
       full refactor while keeping one canonical source for the 15
       company trips (IDs 1001–1081) and the 9 company profiles.
       ------------------------------------------------------------ */
    window.ETTransportCompanies = companies;
    window.ETTransportTrips = ET_TRIPS;
})();