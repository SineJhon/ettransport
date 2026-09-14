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

    function esc(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    /* ---------- Company helper ---------- */
    /* Return every public phone number for a company (new multi-phone
       `phones` array when present, otherwise a single-item fallback so old
       records without the array still render). */
    function companyPhones(c) {
        var list = (c && Array.isArray(c.phones) && c.phones.length)
            ? c.phones.slice()
            : (c && c.phone ? [c.phone] : []);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var p = String(list[i] == null ? '' : list[i]).trim();
            if (p && out.indexOf(p) === -1) { out.push(p); }
        }
        return out;
    }

    /* ---------- Amenity icons ---------- */
    /* Same 7-item catalog the company-dashboard picker offers. Only the icon
       lives here; the text name is what appears on screen. Falls back to a
       plain check mark for any other / older amenity labels. */
    var AMENITY_ICONS = {
        'Reclining Seats': '\uD83D\uDECB',
        'Headrests': '\uD83E\uDE91',
        'Arm Support': '\uD83D\uDCAA',
        'AC': '\u2744\uFE0F',
        'Entertainment': '\uD83C\uDEAC',
        'Snacks': '\uD83C\uDF7F',
        'Water': '\uD83D\uDCA7',
        'Wi-Fi': '\uD83D\uDCF6',
        'Luggage Space': '\uD83E\uDDF3',
        'Multiple Pickup': '\uD83D\uDE8F'
    };
    function amenityIcon(name) {
        return AMENITY_ICONS[name] || '\u2713';
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
        { id: 1001, company: 'Selam Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '06:30', arrive: '15:30', minutes: 540, price: 900, rating: 4.8, type: 'Standard', seats: 18, busType: 'Scania Touring', offsetDays: 2 },
        { id: 1002, company: 'Selam Bus', from: 'Addis Ababa', to: 'Mekelle', depart: '05:30', arrive: '18:00', minutes: 750, price: 1200, rating: 4.9, type: 'Standard', seats: 9, busType: 'MAN Lion\u2019s Coach', offsetDays: 4 },
        { id: 1011, company: 'Sky Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '07:00', arrive: '12:15', minutes: 315, price: 500, rating: 4.5, type: 'Standard', seats: 22, busType: 'Yutong ZK6107H', offsetDays: 1 },
        { id: 1012, company: 'Sky Bus', from: 'Addis Ababa', to: 'Arba Minch', depart: '08:00', arrive: '16:30', minutes: 510, price: 700, rating: 4.6, type: 'Standard', seats: 12, busType: 'Higer A90', offsetDays: 5 },
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
        { id: 1081, company: 'Liyu Bus', from: 'Addis Ababa', to: 'Mekelle', depart: '20:00', arrive: '06:30', minutes: 630, price: 1350, rating: 4.6, type: 'Standard', seats: 7, busType: 'Neoplan Skyliner', offsetDays: 3 }
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
            amenities: ['Reclining Seats', 'Headrests', 'Arm Support', 'AC', 'Entertainment', 'Snacks', 'Wi-Fi', 'Luggage Space', 'Multiple Pickup'],
            busCount: 28,
            fleet: [
                { model: 'Scania Touring', type: 'Standard', seats: 51, image: 'assets/images/buses/SelamBusScania.webp', amenities: ['A/C', 'Charging', 'Reclining Seats'], description: 'Flagship coach with wide recliners and onboard media screens.' },
                { model: 'MAN Lion\u2019s Coach', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Wi-Fi', 'Charging', 'Meals'], description: 'Priority service with fewer seats, extra legroom and a host on board.' },
                { model: 'Yutong ZK6122H9', type: 'Standard', seats: 51, image: 'assets/images/buses/SelamBusYutong.webp', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Reliable workhorse used for secondary departures during peak days.' }
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
            amenities: ['Reclining Seats', 'Headrests', 'AC', 'Entertainment', 'Snacks', 'Wi-Fi'],
            busCount: 21,
            fleet: [
                { model: 'Higer A90', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Reclining Seats', 'Luggage'], description: 'Soft recliners and generous legroom for the longer southern hops.' },
                { model: 'Yutong ZK6107H', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage', 'Charging'], description: 'The everyday workhorse of the Hawassa corridor.' }
            ],
            popularRoutes: [
                { from: 'Addis Ababa', to: 'Hawassa', price: 500, minutes: 315 },
                { from: 'Addis Ababa', to: 'Arba Minch', price: 700, minutes: 510 },
                { from: 'Addis Ababa', to: 'Shashamane', price: 320, minutes: 200 },
                { from: 'Addis Ababa', to: 'Jinka', price: 900, minutes: 690 }
            ],
            offices: [
                { name: 'Addis Ababa Head Office', city: 'Addis Ababa', address: 'Addis Ketema Main Terminal', phone: '+251 11 228 4455', email: 'info@skybus.example.com', hours: 'Mon-Sun 6:00-22:00', isHead: true },
                { name: 'Arba Minch Branch', city: 'Arba Minch', address: 'Near Cayro Hotel, Arba Minch', phone: '+251 46 881 2233', email: 'arbaminch@skybus.example.com', hours: 'Mon-Sat 6:00-20:00', isHead: false }
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
            amenities: ['Reclining Seats', 'Headrests', 'AC', 'Entertainment', 'Wi-Fi'],
            busCount: 16,
            fleet: [
                { model: 'MAN Lion\u2019s Coach', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Everyday coach with a comfortable seat pitch and plenty of luggage space.' },
                { model: 'Yutong ZK6122H9', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Dependable coach used on the busy Bahir Dar departures.' },
                { model: 'Golden Dragon XML6125', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Reclining Seats', 'Entertainment'], description: 'Premium option for longer runs towards Gondar.' }
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
            amenities: ['Reclining Seats', 'Headrests', 'Arm Support', 'AC', 'Luggage Space'],
            busCount: 14,
            fleet: [
                { model: 'Yutong ZK6107H', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Compact coach well suited to the Adama commute.' },
                { model: 'King Long XMQ6898', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Medium coach used on lighter eastern departures.' }
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
            amenities: ['Reclining Seats', 'Headrests', 'Arm Support', 'AC', 'Entertainment', 'Snacks', 'Water', 'Multiple Pickup'],
            busCount: 19,
            fleet: [
                { model: 'Mercedes-Benz Tourismo', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Wi-Fi', 'Charging', 'Meals'], description: 'Top-tier coach with aboard catering on the Dire Dawa route.' },
                { model: 'Neoplan Skyliner', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Reclining Seats', 'Luggage'], description: 'Double-deck style comfort for the long run to Jijiga.' }
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
                { name: 'Kidist B.', rating: 5, when: '1 week ago', verified: true, text: 'The coach to Dire Dawa was spotless. Very comfortable seats and excellent crew.' },
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
            amenities: ['Reclining Seats', 'Headrests', 'AC', 'Water', 'Multiple Pickup'],
            busCount: 12,
            fleet: [
                { model: 'Yutong ZK6122H9', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Reclining Seats', 'Charging'], description: 'Flagship coach for the longer Jimma and Mizan departures.' },
                { model: 'Foton AUV BJ6129', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Solid everyday coach on the Wolkite and Hawassa lines.' }
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
            amenities: ['Reclining Seats', 'Headrests', 'AC', 'Luggage Space'],
            busCount: 9,
            fleet: [
                { model: 'Yutong ZK6107H', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage', 'Charging'], description: 'Dependable coach on the Bahir Dar and western departures.' },
                { model: 'Golden Dragon XML6125', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Spacious coach used on the longer Gondar runs.' }
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
            amenities: ['Reclining Seats', 'AC', 'Water', 'Luggage Space'],
            busCount: 7,
            fleet: [
                { model: 'King Long XMQ6898', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Luggage'], description: 'Compact coach for the Adama and Debre Zeit commute.' },
                { model: 'Yutong ZK6609', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C'], description: 'Lighter van used on more frequent short departures.' }
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
            tagline: 'Comfortable overnight and express travel.',
            description: 'Liyu Bus focuses on premium and overnight express services, with modern coaches and generous comfort so every passenger travels relaxed.',
            rating: 4.5,
            reviewCount: 522,
            founded: 2017,
            headOffice: 'Addis Ababa, Bole Medhanealem',
            phone: '+251 11 662 1170',
            email: 'info@liyubus.example.com',
            website: 'https://liyubus.example.com',
            destinations: ['Mekelle', 'Gondar', 'Bahir Dar', 'Hawassa'],
            amenities: ['Reclining Seats', 'Headrests', 'Arm Support', 'AC', 'Entertainment', 'Snacks', 'Water', 'Wi-Fi', 'Luggage Space', 'Multiple Pickup'],
            busCount: 11,
            fleet: [
                { model: 'Neoplan Skyliner', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Wi-Fi', 'Charging', 'Meals'], description: 'Signature coach for overnight routes.' },
                { model: 'Mercedes-Benz Tourismo', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Reclining Seats', 'Entertainment'], description: 'Quiet, premium coach with full relaxation seating.' },
                { model: 'Higer A90', type: 'Standard', seats: 51, image: 'assets/images/buses/bus-standard.svg', amenities: ['A/C', 'Charging', 'Luggage'], description: 'Comfortable coach on daytime express runs.' }
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
        /* Real companies ship their own upcoming trips straight from the
           database (api/company.php?action=get); those are the ONLY trips
           shown on a real profile. A real company (numeric database id)
           with no upcoming trips shows an empty section — it must never
           fall back to the shared demo trips. */
        if (c.trips && c.trips.length) { return c.trips; }
        if (typeof c.id === 'number' && c.id > 0) { return []; }
        /* Demo profiles (mock=1) keep using the shared mock trips. */
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
        var overviewLogo = document.getElementById('overview-logo');
        if (overviewLogo) { overviewLogo.src = c.logo; overviewLogo.alt = c.name + ' logo'; }
        if (name) { name.textContent = c.name; }
        var overviewName = document.getElementById('overview-name');
        if (overviewName) { overviewName.textContent = c.name; }
        if (tagline) { tagline.textContent = c.tagline; }
        var chip = c.verified
            ? '<span class="verified-chip"><span class="verified-check" aria-hidden="true">&#10003;</span> Verified</span>'
            : '<span class="verified-chip pending">Verification pending</span>';
        if (verified) { verified.innerHTML = chip; }
        var overviewVerified = document.getElementById('overview-verified');
        if (overviewVerified) { overviewVerified.innerHTML = chip; }
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
        var home = '<a href="companies.html">&larr; All Bus Companies</a>';
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
            { value: c.founded ? years + '+' : '—', label: 'Years Experience' }
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

    /* ---------- Founded ---------- */
    function renderFounded(c) {
        var el = document.getElementById('founded-block');
        if (!el) { return; }
        var year = Number(c.founded) || 0;
        if (!year) {
            el.innerHTML = '<p class="founded-none">This company has not shared its founding year yet.</p>';
            return;
        }
        var years = Math.max(0, new Date().getFullYear() - year);
        el.innerHTML =
            '<div class="founded-year" aria-hidden="true">' + year + '</div>' +
            '<div class="founded-text">' +
                '<span class="founded-years">' + years + ' year' + (years === 1 ? '' : 's') + ' of service</span>' +
                '<p>' + esc(c.name) + ' has been moving passengers since its first departure in ' + year + '. ' +
                'With a fleet built for comfort and a schedule that keeps travellers moving, the founding year ' +
                'reflects decades—or at least many seasons—of reliable intercity service.</p>' +
            '</div>';
    }

    /* ---------- Services / amenities ---------- */
    function renderAmenities(c) {
        var el = document.getElementById('amenity-grid');
        if (!el) { return; }
        var list = (c.amenities && c.amenities.length) ? c.amenities : [];
        if (!list.length) {
            el.innerHTML = '<li class="amenity-chip"><span class="amenity-icon" aria-hidden="true">&#10003;</span>' +
                'Onboard amenities depend on the departure class</li>';
            return;
        }
        var html = '';
        for (var i = 0; i < list.length; i++) {
            html += '<li class="amenity-chip"><span class="amenity-icon" aria-hidden="true">' +
                amenityIcon(list[i]) + '</span>' + esc(list[i]) + '</li>';
        }
        el.innerHTML = html;
    }

    /* ---------- Popular routes ---------- */
    function routePriceLabel(price) {
        if (price === null || price === undefined) { return 'Check availability'; }
        return 'From ' + formatPrice(Number(price) || 0);
    }

    /* Pickup / drop-off station lines on a popular-route card. */
    function stationBlockHtml(r) {
        var html = '';
        var pickup = Array.isArray(r.pickupStations) ? r.pickupStations : [];
        var dropoff = Array.isArray(r.dropoffStations) ? r.dropoffStations : [];
        if (pickup.length) {
            html += '<div class="route-stations"><span class="route-stations-label">Pickup</span><span class="route-stations-value">' + pickup.map(esc).join(', ') + '</span></div>';
        }
        if (dropoff.length) {
            html += '<div class="route-stations"><span class="route-stations-label">Drop-off</span><span class="route-stations-value">' + dropoff.map(esc).join(', ') + '</span></div>';
        }
        return html;
    }

    function renderRoutes(c) {
        var el = document.getElementById('route-grid');
        if (!el) { return; }
        var html = '';
        for (var i = 0; i < c.popularRoutes.length; i++) {
            var r = c.popularRoutes[i];
            var durationLabel = (r.minutes === null || r.minutes === undefined || r.minutes <= 0)
                ? 'Duration \u2014'
                : formatDuration(r.minutes);
            html += '<article class="route-card">' +
                '<div class="route-nodes">' +
                    '<span class="route-city route-from">' + r.from + '</span>' +
                    '<span class="route-line" aria-hidden="true"><span class="route-arrow">\u2193</span></span>' +
                    '<span class="route-city route-to">' + r.to + '</span>' +
                '</div>' +
                stationBlockHtml(r) +
                '<div class="route-meta">' +
                    '<span class="route-price">' + routePriceLabel(r.price) + '</span>' +
                    '<span class="route-duration">' + durationLabel + '</span>' +
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
            var reg = b.registration || b.registration_number || '';
            html += '<article class="fleet-card">' +
                '<img class="fleet-img" src="' + b.image + '" alt="' + b.model + ' bus image placeholder" loading="lazy">' +
                '<div class="fleet-body">' +
                    '<div class="fleet-head">' +
                        '<h3>' + b.model + '</h3>' +
                        '<span class="fleet-type">' + b.type + '</span>' +
                    '</div>' +
                    '<p class="fleet-seats">' + b.seats + ' Seats</p>' +
                    '<div class="fleet-chips">' + chips + '</div>' +
                    (reg ? '<span class="fleet-reg" title="Bus registration number">' + esc(reg) + '</span>' : '') +
                '</div>' +
            '</article>';
        }
        el.innerHTML = html;
    }

    /* Expand/collapse for the fleet details was removed — descriptions on the
   fleet cards are shown inline, so no toggle handler is needed. */

    /* ---------- Upcoming trips (deep-links into the existing booking flow) ---------- */

    /* Trip day-selector helpers (matching the front-page date picker). */
    var DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    /* Build the week-strip chips: today through the same weekday next week —
       exactly like the front-page quick-pick date picker (js/home.js). Days
       that actually have trips get a small indicator dot. */
    function tripDayChips(trips) {
        var counts = {};
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        var d, iso, i;
        for (i = 0; i < trips.length; i++) {
            iso = tripDate(trips[i]);
            counts[iso] = (counts[iso] || 0) + 1;
        }
        var chips = '';
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        for (i = 0; i <= 7; i++) {
            d = new Date(today);
            d.setDate(today.getDate() + i);
            iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            var label = (i === 0) ? 'Today' : DAY_ABBR[d.getDay()];
            var has = counts[iso] ? ' has-trips' : '';
            chips += '<button type="button" class="trip-day' + has + '" data-date="' + iso + '" aria-pressed="false"' +
                ' aria-label="' + label + ', ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '">' +
                    '<b>' + label + '</b>' +
                    '<span>' + d.getDate() + '</span>' +
                '</button>';
        }
        return chips;
    }

    /* The YYYY-MM-DD a trip departs (live trips carry a DB date; demo trips
       use an offset from today). */
    function tripDate(t) {
        var raw = t.date ? String(t.date).slice(0, 10) : '';
        return raw || isoDateIn(t.offsetDays || 1);
    }

    /* One trip card (shared by the grid renderer and the day filter). */
    function tripCardHtml(t) {
        var date = tripDate(t);
        return '<article class="trip-card">' +
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
                '<span class="trip-bustype">' + t.busType + ' · ' + t.type + '</span>' +
                '<span class="trip-seats">' + t.seats + ' seats left</span>' +
            '</div>' +
            '<div class="trip-buy">' +
                '<span class="trip-price">' + formatPrice(t.price) + '</span>' +
                '<a class="btn btn-select-trip" href="' + tripLink(t) + '" data-trip-id="' + t.id + '">Select Trip</a>' +
            '</div>' +
        '</article>';
    }

    function renderTripGrid(trips, el) {
        if (!trips.length) {
            el.innerHTML = '<p class="trip-empty">No trips are available on this day. ' +
                'Pick another day from the selector above.</p>';
            return;
        }
        var html = '';
        for (var i = 0; i < trips.length; i++) {
            html += tripCardHtml(trips[i]);
        }
        el.innerHTML = html;
    }

    function renderTrips(c) {
        var el = document.getElementById('trip-grid');
        if (!el) { return; }
        var daysEl = document.getElementById('trip-days');
        var trips = companyTrips(c);
        if (!trips.length) {
            el.innerHTML = '<p class="trip-empty">No upcoming trips are listed right now. ' +
                '<a href="' + searchLink('Addis Ababa', 'Hawassa') + '">Search all departures</a> instead.</p>';
            if (daysEl) { daysEl.hidden = true; }
            return;
        }

        /* Week-strip day selector: today .. same weekday next week. */
        if (daysEl) {
            daysEl.innerHTML = tripDayChips(trips);
            daysEl.hidden = false;

            daysEl.addEventListener('click', function (event) {
                var btn = event.target.closest ? event.target.closest('.trip-day') : null;
                if (!btn) { return; }
                var date = btn.getAttribute('data-date') || '';
                /* Re-clicking the selected day clears the picker and shows every
                   trip again (the old "All days" behaviour, without the chip). */
                var turningOn = !btn.classList.contains('is-active');
                var nodes = daysEl.querySelectorAll('.trip-day');
                for (var k = 0; k < nodes.length; k++) {
                    var isOn = turningOn && (nodes[k] === btn);
                    nodes[k].classList.toggle('is-active', isOn);
                    nodes[k].setAttribute('aria-pressed', isOn ? 'true' : 'false');
                }
                var filtered = [];
                for (var q = 0; q < trips.length; q++) {
                    if (!turningOn || tripDate(trips[q]) === date) { filtered.push(trips[q]); }
                }
                renderTripGrid(filtered, el);
            });
        }

        renderTripGrid(trips, el);

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

    /* ---------- Passenger reviews (full redesign) ----------
       Full-width rating band + clickable breakdown bars, a filter/sort
       toolbar and a two-column card grid. Kept under rv-* class names so
       the legacy section-8 .review-* styles stay untouched for other pages. */

    var REVIEW_AVATAR_COLORS = [
        '#0b7a4b', '#2a6f97', '#7c5cbf', '#c2622f', '#a33c55',
        '#3b7d30', '#1f7a8c', '#98661b', '#4b6e9e', '#5e5aa7'
    ];

    var reviewFilter = null;     /* active star-count filter, null = all */
    var reviewSort = 'recent';   /* 'recent' | 'rating' */
    var reviewedCompany = null;

    /* Initials for the reviewer avatar circle. */
    function reviewerInitials(name) {
        var parts = String(name || '?').trim().split(/\s+/);
        var a = (parts[0] || '?').charAt(0);
        var b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (a + b).toUpperCase();
    }

    /* Deterministic avatar colour derived from the reviewer name. */
    function avatarColor(name) {
        var s = String(name || '?');
        var n = 0;
        for (var i = 0; i < s.length; i++) { n += s.charCodeAt(i); }
        return REVIEW_AVATAR_COLORS[n % REVIEW_AVATAR_COLORS.length];
    }

    /* Rough "age in days" for a review's `when` so mock relative strings
       ("2 weeks ago") and real dates sort through the same key. */
    function reviewAgeDays(when) {
        var s = String(when || '').trim().toLowerCase();
        var m;
        if ((m = s.match(/([\d.]+)\s*day/))) { return Number(m[1]); }
        if ((m = s.match(/([\d.]+)\s*week/))) { return Number(m[1]) * 7; }
        if ((m = s.match(/([\d.]+)\s*month/))) { return Number(m[1]) * 30; }
        if ((m = s.match(/([\d.]+)\s*year/))) { return Number(m[1]) * 365; }
        var t = new Date(s.replace(/,/g, ' ')).getTime();
        return isNaN(t) ? 9999 : Math.max(0, Math.floor((Date.now() - t) / 86400000));
    }

    /* Written reviews, filtered by the active star rating and sorted. */
    function filteredReviews(c) {
        var list = (c.reviews && c.reviews.slice) ? c.reviews.slice() : [];
        if (reviewFilter) {
            list = list.filter(function (rv) {
                return Math.round(Number(rv.rating) || 0) === reviewFilter;
            });
        }
        list.sort(function (a, b) {
            if (reviewSort === 'rating') {
                var d = (Number(b.rating) || 0) - (Number(a.rating) || 0);
                if (d !== 0) { return d; }
            }
            return reviewAgeDays(a.when) - reviewAgeDays(b.when);
        });
        return list;
    }

    function renderReviewSummary(c) {
        var summary = document.getElementById('review-summary');
        if (!summary) { return; }
        var total = Number(c.reviewCount) || 0;
        var rating = Number(c.rating) || 0;

        if (!total) {
            /* Real database records with no reviews yet — clean empty band. */
            summary.innerHTML =
                '<div class="rv-left">' +
                    '<div class="rv-score">' +
                        '<span class="rv-score-num">' + rating.toFixed(1) + '</span>' +
                        '<span class="rv-score-stars" role="img" aria-label="No reviews yet">\u2606\u2606\u2606\u2606\u2606</span>' +
                        '<span class="rv-score-count">No reviews yet</span>' +
                    '</div>' +
                '</div>' +
                '<div class="rv-empty-band">' +
                    '<strong>Be the first to review ' + esc(c.name) + '</strong>' +
                    '<p>Share your experience to help other travellers plan their journey.</p>' +
                    '<a class="rv-cta-btn" href="login.html">Write a review</a>' +
                '</div>';
            return;
        }

        var dist = buildDistribution(rating);
        var bars = '';
        for (var i = 0; i < dist.length; i++) {
            var d = dist[i];
            var count = Math.round(total * d.pct / 100);
            var activeClass = (reviewFilter === d.stars) ? ' is-filter' : '';
            bars += '<li class="rv-bar-row' + activeClass + '" role="button" tabindex="0" ' +
                'data-filter="' + d.stars + '" aria-pressed="' + (activeClass ? 'true' : 'false') + '" ' +
                'title="' + count.toLocaleString() + ' reviews (' + d.pct + '%)">' +
                '<span class="rv-bar-label">' + d.stars + '\u2605</span>' +
                '<span class="rv-bar-track"><span class="rv-bar-fill" style="width:' + d.pct + '%"></span></span>' +
                '<span class="rv-bar-count">' + count.toLocaleString() + '</span>' +
            '</li>';
        }

        summary.innerHTML =
            '<div class="rv-left">' +
                '<div class="rv-score">' +
                    '<span class="rv-score-num">' + rating.toFixed(1) + '</span>' +
                    '<span class="rv-score-stars" role="img" aria-label="Rated ' + rating.toFixed(1) + ' out of 5">' +
                        buildStars(rating) + '</span>' +
                    '<span class="rv-score-count">Based on ' + total.toLocaleString() + ' reviews</span>' +
                '</div>' +
                '<ul class="rv-bars" aria-label="Rating breakdown">' + bars + '</ul>' +
            '</div>' +
            '<div class="rv-cta">' +
                '<strong>Travelled with ' + esc(c.name) + '?</strong>' +
                '<p>Your rating helps other passengers pick the right operator.</p>' +
                '<a class="rv-cta-btn" href="login.html">Write a review</a>' +
            '</div>';
    }

    function renderReviewToolbar(c) {
        var toolbar = document.getElementById('review-toolbar');
        if (!toolbar) { return; }
        var total = Number(c.reviewCount) || 0;
        var shown = filteredReviews(c).length;
        toolbar.hidden = !total;
        toolbar.innerHTML =
            '<button type="button" class="rv-chip' + (reviewFilter ? '' : ' is-active') + '" data-filter="all" ' +
                'aria-pressed="' + (reviewFilter ? 'false' : 'true') + '">All reviews</button>' +
            '<span class="rv-count">Showing ' + shown + ' of ' + total.toLocaleString() + '</span>' +
            '<label class="rv-sort"><span>Sort by</span>' +
                '<select id="review-sort">' +
                    '<option value="recent"' + (reviewSort === 'recent' ? ' selected' : '') + '>Most recent</option>' +
                    '<option value="rating"' + (reviewSort === 'rating' ? ' selected' : '') + '>Highest rating</option>' +
                '</select></label>';
    }

    function renderReviewCard(c, rev) {
        var meta = '';
        if (rev.verified) { meta += '<span class="rv-badge">Verified Passenger</span>'; }
        if (rev.likes) { meta += '<span class="rv-likes">\u2665 ' + Number(rev.likes).toLocaleString() + '</span>'; }
        if (rev.when) { meta += '<span class="rv-when">' + escapeReviewText(rev.when) + '</span>'; }

        var reply = '';
        if (rev.reply) {
            reply =
                '<div class="rv-reply">' +
                    '<div class="rv-reply-head">' +
                        (c.logo ? '<img class="rv-reply-logo" src="' + esc(c.logo) + '" alt="" aria-hidden="true">' : '') +
                        '<span>Response from ' + esc(c.name) + '</span>' +
                    '</div>' +
                    '<p>' + escapeReviewText(rev.reply) + '</p>' +
                    (rev.reply_at ? '<span class="rv-reply-when">Replied ' + formatDate(String(rev.reply_at).slice(0, 10)) + '</span>' : '') +
                '</div>';
        }

        return '<article class="rv-card">' +
            '<div class="rv-top">' +
                '<span class="rv-avatar" style="background:' + avatarColor(rev.name) + '" aria-hidden="true">' +
                    esc(reviewerInitials(rev.name)) + '</span>' +
                '<span class="rv-id">' +
                    '<strong>' + escapeReviewText(rev.name) + '</strong>' +
                    '<span class="rv-meta">' + meta + '</span>' +
                '</span>' +
                '<span class="rv-rating" role="img" aria-label="Rated ' + Number(rev.rating) + ' out of 5 stars">' +
                    buildStars(Number(rev.rating) || 0) + '</span>' +
            '</div>' +
            '<p class="rv-text">' + escapeReviewText(rev.text) + '</p>' +
            reply +
        '</article>';
    }

    function renderReviewGrid(c) {
        var grid = document.getElementById('review-grid');
        if (!grid) { return; }
        var list = filteredReviews(c);
        if (!list.length) {
            grid.innerHTML = '<p class="rv-empty">' +
                (reviewFilter ? 'No written reviews at this rating yet.' : 'No written reviews yet.') +
                '</p>';
            return;
        }
        var html = '';
        for (var r = 0; r < list.length; r++) { html += renderReviewCard(c, list[r]); }
        grid.innerHTML = html;
        if (typeof c.id !== 'number') {
            grid.insertAdjacentHTML('beforeend',
                '<p class="rv-demo-note">Demo sample \u2014 illustrative reviews shown for the prototype, not real customer testimonials.</p>');
        }
    }

    /* One set of delegated listeners on the static reviews pane. */
    function wireReviewInteractions() {
        var pane = document.getElementById('cp-reviews');
        if (!pane || pane.getAttribute('data-rv-wired')) { return; }
        pane.setAttribute('data-rv-wired', '1');

        pane.addEventListener('click', function (event) {
            if (!reviewedCompany) { return; }
            var bar = event.target && event.target.closest ? event.target.closest('.rv-bar-row') : null;
            if (bar) {
                var f = Number(bar.getAttribute('data-filter')) || null;
                reviewFilter = (f === reviewFilter) ? null : f;
            } else {
                var chip = event.target && event.target.closest ? event.target.closest('.rv-chip') : null;
                if (chip) { reviewFilter = null; } else { return; }
            }
            renderReviewSummary(reviewedCompany);
            renderReviewToolbar(reviewedCompany);
            renderReviewGrid(reviewedCompany);
        });

        pane.addEventListener('keydown', function (event) {
            if (!reviewedCompany) { return; }
            var bar = event.target && event.target.closest ? event.target.closest('.rv-bar-row') : null;
            if (!bar) { return; }
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); bar.click(); }
        });

        pane.addEventListener('change', function (event) {
            if (!reviewedCompany) { return; }
            if (event.target && event.target.id === 'review-sort') {
                reviewSort = (event.target.value === 'rating') ? 'rating' : 'recent';
                renderReviewToolbar(reviewedCompany);
                renderReviewGrid(reviewedCompany);
            }
        });
    }

    /* Entry point, called from renderCompany() while the pane renders. */
    function renderReviews(c) {
        var summary = document.getElementById('review-summary');
        var toolbar = document.getElementById('review-toolbar');
        var grid = document.getElementById('review-grid');
        if (!summary && !toolbar && !grid) { return; }
        reviewedCompany = c;
        reviewFilter = null;
        reviewSort = 'recent';
        renderReviewSummary(c);
        renderReviewToolbar(c);
        renderReviewGrid(c);
        wireReviewInteractions();
    }

    /* ---------- Company information ---------- */
    function renderInfo(c) {
        var el = document.getElementById('info-grid');
        if (!el) { return; }
        var tags = '';
        for (var i = 0; i < c.destinations.length; i++) {
            tags += '<span class="dest-tag">' + c.destinations[i] + '</span>';
        }
        /* Every public phone number — mobile and landline (+251 1xx…). */
        el.innerHTML =
            '<li class="info-item"><span class="info-icon" aria-hidden="true">&#128197;</span>' +
                '<div class="info-body"><span class="info-label">Founded</span><span class="info-value">' + (c.founded || '&mdash;') + '</span></div></li>' +
            '<li class="info-item"><span class="info-icon" aria-hidden="true">&#127960;</span>' +
                '<div class="info-body"><span class="info-label">Head Office</span><span class="info-value">' + esc(c.headOffice || '') + '</span></div></li>' +
            '<li class="info-item info-item-wide"><span class="info-icon" aria-hidden="true">&#128652;</span>' +
                '<div class="info-body"><span class="info-label">Main Destinations</span><span class="info-value info-tags">' + tags + '</span></div></li>';
    }

    /* ---------- Branches / contact ---------- */
    function renderContact(c) {
        var title = document.getElementById('contact-title');
        var grid = document.getElementById('contact-grid');
        if (title) { title.textContent = 'Branches & Contact'; }
        if (!grid) { return; }
        var offices = (c.offices && c.offices.length) ? c.offices : [];
        var html = '';

        /* Company-level phone / email / website (migrated from the Overview).
           Redesigned as a modern grid of clickable icon tiles. */
        var phones = companyPhones(c);
        var mainTiles = '';
        for (var tp = 0; tp < phones.length; tp++) {
            mainTiles += '<a class="cmc-tile cmc-tile-phone" href="tel:' +
                phones[tp].replace(/\s+/g, '') + '">' +
                '<span class="cmc-tile-ic" aria-hidden="true">&#128222;</span>' +
                '<span class="cmc-tile-body">' +
                    '<span class="cmc-tile-label">' + (tp === 0 ? 'Phone' : 'Line ' + (tp + 1)) + '</span>' +
                    '<span class="cmc-tile-value">' + esc(phones[tp]) + '</span>' +
                '</span>' +
            '</a>';
        }
        if (phones.length || c.email || c.website) {
            html += '<div class="contact-card contact-card-company cmc-card">' +
                '<div class="cmc-head">' +
                    '<span class="cmc-head-ic" aria-hidden="true">&#127968;</span>' +
                    '<span class="cmc-head-copy">' +
                        '<span class="cmc-eyebrow">Main Contact</span>' +
                        '<h3>' + esc(c.name || 'Company') + '</h3>' +
                    '</span>' +
                    (c.headOffice ? '<span class="cmc-address">&#128205; ' + esc(c.headOffice) + '</span>' : '') +
                '</div>' +
                '<div class="cmc-grid">' +
                    mainTiles +
                    (c.email ? '<a class="cmc-tile cmc-tile-email" href="mailto:' + esc(c.email) + '">' +
                        '<span class="cmc-tile-ic" aria-hidden="true">&#9993;</span>' +
                        '<span class="cmc-tile-body">' +
                            '<span class="cmc-tile-label">Email</span>' +
                            '<span class="cmc-tile-value">' + esc(c.email) + '</span>' +
                        '</span>' +
                    '</a>' : '') +
                    (c.website ? '<a class="cmc-tile cmc-tile-web" href="' + esc(c.website) + '" target="_blank" rel="noopener noreferrer">' +
                        '<span class="cmc-tile-ic" aria-hidden="true">&#127760;</span>' +
                        '<span class="cmc-tile-body">' +
                            '<span class="cmc-tile-label">Website</span>' +
                            '<span class="cmc-tile-value">' + esc(c.website.replace('https://', '')) + '</span>' +
                        '</span>' +
                    '</a>' : '') +
                '</div>' +
            '</div>';
        }

        for (var i = 0; i < offices.length; i++) {
            var o = offices[i];
            var name = o.name || o.city || 'Branch';
            var city = (o.city && o.city !== name) ? o.city : '';
            html += '<div class="contact-card cmc-branch">' +
                '<div class="cmc-branch-head">' +
                    '<span class="cmc-branch-ic" aria-hidden="true">&#128205;</span>' +
                    '<span class="cmc-branch-copy">' +
                        '<h3>' + esc(name) + '</h3>' +
                        (city ? '<span class="cmc-branch-loc">' + esc(city) + '</span>' : '') +
                    '</span>' +
                    (o.isHead ? '<span class="branch-head-badge">Head Office</span>' : '') +
                '</div>' +
                '<ul class="cmc-branch-list">' +
                    (o.address ? '<li><span aria-hidden="true">&#128205;</span>' + esc(o.address) + '</li>' : '') +
                    (o.hours ? '<li><span aria-hidden="true">&#128337;</span>' + esc(o.hours) + '</li>' : '') +
                    (o.phone ? '<li><span aria-hidden="true">&#128222;</span><a href="tel:' + o.phone.replace(/\s+/g, '') + '">' + esc(o.phone) + '</a></li>' : '') +
                    (o.email ? '<li><span aria-hidden="true">&#9993;</span><a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a></li>' : '') +
                '</ul>' +
                ((o.phone || o.email) ? '<div class="contact-actions">' +
                    (o.phone ? '<a class="btn btn-call" href="tel:' + o.phone.replace(/\s+/g, '') + '">Call</a>' : '') +
                    (o.email ? '<a class="btn btn-email" href="mailto:' + esc(o.email) + '">Email</a>' : '') +
                '</div>' : '') +
            '</div>';
        }
        if (!html) { html = '<p class="review-none" style="padding:1rem 0;">No branch contact information yet.</p>'; }
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
        renderFounded(c);
        renderAmenities(c);
        renderRoutes(c);
        renderFleet(c);
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

    /* Pick a fleet photo for a bus based on its model. Selam Bus provides real
       coach photos (assets/images/buses/) so their Yutong and Scania coaches
       show the matching picture instead of the generic placeholder. */
    function busImageFor(slug, model) {
        var m = String(model || '').toLowerCase();
        if (slug === 'selam-bus') {
            if (m.indexOf('yutong') !== -1) { return 'assets/images/buses/SelamBusYutong.webp'; }
            if (m.indexOf('scania') !== -1) { return 'assets/images/buses/SelamBusScania.webp'; }
        }
        return 'assets/images/buses/bus-standard.svg';
    }

    function normalizeCompanyFromApi(raw) {
        var bag = raw || {};
        var about = bag.description || '';
        var tagline = (about.split(/[.\n]/)[0] || '').trim() || bag.name || '';

        var fleet = [];
        var fleetRaw = bag.fleet || [];
        for (var fi = 0; fi < fleetRaw.length; fi++) {
            var b = fleetRaw[fi];
            /* Platform policy: every bus is a standard 51-seat coach. */
            fleet.push({
                name: b.model || 'Coach',
                model: b.model || 'Coach',
                type: 'Standard',
                seats: 51,
                image: busImageFor(bag.slug, b.model),
                amenities: ['A/C', 'Charging', 'Luggage'],
                registration: b.registration_number || '',
                description: (b.model || 'Coach') + ' — ' + (b.registration_number || 'Active bus')
            });
        }

        var popularRoutes = [];
        var routesRaw = bag.popular_routes || [];
        for (var pi = 0; pi < routesRaw.length; pi++) {
            var pr = routesRaw[pi];
            popularRoutes.push({
                from: pr.from_city,
                to: pr.to_city,
                pickupStations: Array.isArray(pr.pickup_stations) ? pr.pickup_stations.slice() : [],
                dropoffStations: Array.isArray(pr.dropoff_stations) ? pr.dropoff_stations.slice() : [],
                price: pr.price === null || pr.price === undefined ? null : Number(pr.price),
                minutes: pr.duration === null || pr.duration === undefined ? null : Number(pr.duration),
                status: pr.status || 'active'
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

        var branches = [];
        var branchesRaw = (bag.branches && Array.isArray(bag.branches)) ? bag.branches : [];
        for (var bi = 0; bi < branchesRaw.length; bi++) {
            var br = branchesRaw[bi];
            branches.push({
                name: br.name || '',
                city: br.city || '',
                address: br.address || '',
                phone: br.phone || '',
                email: br.email || '',
                hours: br.hours || '',
                isHead: !!br.is_head,
                status: br.status || 'active'
            });
        }
        var offices = branches.length
            ? branches
            : [{
                name: 'Head office',
                city: bag.address ? 'Head office' : '',
                address: bag.address || '',
                phone: bag.phone || '',
                email: bag.email || ''
            }];

        /* Multi-phone support: prefer the phones[] from the live API, fall back
           to the single legacy phone field so old payloads keep rendering. */
        var phonesList = (Array.isArray(bag.phones) && bag.phones.length)
            ? bag.phones.map(function (p) { return String(p === null || p === undefined ? '' : p); })
            : (bag.phone ? [bag.phone] : []);
        /* Live companies post their founding year via the dashboard
           (companies.founded). The public profile must reflect EXACTLY what
           was posted — never the year the account was created. */
        var foundedYear = Number(bag.founded) || 0;

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
            founded: foundedYear,
            headOffice: bag.head_office || bag.address || '',
            phone: bag.phone || (phonesList[0] || ''),
            phones: phonesList,
            email: bag.email || '',
            website: bag.website || '',
            destinations: bag.destinations || [],
            amenities: (Array.isArray(bag.amenities) && bag.amenities.length) ? bag.amenities.slice() : [],
            busCount: Number(bag.bus_count) || fleet.length,
            fleet: fleet,
            popularRoutes: popularRoutes,
            branches: branches,
            offices: offices,
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
            rating: Number(rv && rv.rating) ||  5,
            when: when,
            verified: !!(rv && rv.verified),
            text: (rv && rv.comment) || '',
            reply: (rv && rv.reply) || null,
            reply_at: (rv && rv.reply_at) || null,
            likes: Number(rv && rv.likes) ||  0        };
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