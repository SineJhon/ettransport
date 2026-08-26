/* ============================================================
   ET Transport â€” search.js
   Advanced search, discovery, comparison and passenger
   discovery (frontend-only, mock data).

   Renders the search results page: prominent search summary,
   data-driven filters, sorting, recommendation badges,
   removable filter chips, a max-3 comparison (sticky bar +
   modal), and company-specific search (?company=<slug>).

   Deep-links into the existing booking â†’ passenger â†’ payment â†’
   confirmation flow. No external libraries, ES5 + IIFE + var.
   ============================================================ */

(function () {
    'use strict';

    /* ---------- URL helpers ---------- */
    function getParam(name, fallback) {
        var value = new URLSearchParams(window.location.search).get(name);
        return (value === null || value === '') ? fallback : value;
    }

    function isoToday() {
        return new Date().toISOString().slice(0, 10);
    }

    /* ---------- Current search context (preserved through the flow) ---------- */
    var from = getParam('from', 'Addis Ababa');
    var to = getParam('to', 'Arba Minch');
    var date = getParam('date', isoToday());
    var passengers = parseInt(getParam('passengers', '1'), 10) || 1;
    var companySlug = getParam('company', ''); // optional company-specific search

    /* ---------- Small time/value helpers ---------- */
    function timeToMinutes(t) {
        var parts = String(t).split(':');
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    function pad(n) {
        return ('0' + n).slice(-2);
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
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function slugify(name) {
        return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

 /* ---------- Normalization helpers (safe, locale-agnostic) ---------- */
    function normalizeLocation(value) {
        if (value == null) { return ''; }
        return String(value).trim().toLowerCase();
    }

    function normalizeDate(value) {
        /* Accept null, ISO "2026-08-20", or display formats. Returns ISO date string or empty string. */
        if (value == null || value === '') { return ''; }
        value = String(value).trim();
        /* Pure ISO date strings (YYYY-MM-DD) are already machine-readable.
           Return them as-is: round-tripping through new Date(...) + toISOString()
           shifts the day backwards in timezones ahead of UTC (e.g. Ethiopia UTC+3),
           so normalizeDate('2026-08-20') would wrongly become '2026-08-19'. */
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) { return value; }
        var d = new Date(value + (value.indexOf('T') === -1 ? 'T00:00:00' : ''));
        if (isNaN(d.getTime())) { return ''; }
        return d.toISOString().slice(0, 10);
    }

    function sameCity(a, b) {
        return normalizeLocation(a) === normalizeLocation(b);
    }

    /* Normalized machine-readable search date (used only when a trip carries a date). */
    var dateNorm = normalizeDate(date);


 /* ---------- Shared mock data ----------
       js/company.js is loaded BEFORE this file and exposes the
       canonical company profiles (window.ETTransportCompanies)
       and the 15 company trips with IDs 1001â€“1081
       (window.ETTransportTrips). The 8 legacy trips (IDs 1â€“8)
       are kept here unchanged. Booking/passenger/payment/
       confirmation already resolve every one of these IDs. */
 /* the dataset comes from the boot loader at the bottom of
       this file. PRIMARY source: the real api/search.php response
       (database-backed). The shared demo dataset is used only when the
       URL carries ?mock=1 (explicit development fallback, never silent). */
    var COMPANY_META = [];
    var COMPANY_TRIPS = [];

    var LEGACY_TRIPS = [
        { id: 1, company: 'Selam Express',    from: 'Addis Ababa', to: 'Arba Minch', depart: '06:30', arrive: '14:45', minutes: 495, price: 720,  rating: 4.8, type: 'Luxury',   seats: 14, amenities: ['AC', 'Wi-Fi', 'Charging', 'Luggage'] },
        { id: 2, company: 'Dashen Motors',    from: 'Addis Ababa', to: 'Arba Minch', depart: '07:45', arrive: '15:30', minutes: 465, price: 740,  rating: 4.4, type: 'Luxury',   seats: 17, amenities: ['AC', 'Wi-Fi', 'Charging'] },
        { id: 3, company: 'Ethio Abay Lines', from: 'Addis Ababa', to: 'Arba Minch', depart: '08:00', arrive: '16:30', minutes: 510, price: 650,  rating: 4.5, type: 'Standard', seats: 24, amenities: ['AC', 'Luggage'] },
        { id: 4, company: 'SkyLink Coaches',  from: 'Addis Ababa', to: 'Arba Minch', depart: '10:15', arrive: '18:45', minutes: 510, price: 480,  rating: 4.2, type: 'Standard', seats: 8,  amenities: ['Luggage'] },
        { id: 5, company: 'Lion Express',     from: 'Addis Ababa', to: 'Arba Minch', depart: '13:00', arrive: '21:00', minutes: 480, price: 850,  rating: 4.6, type: 'VIP',      seats: 6,  amenities: ['AC', 'Wi-Fi', 'Charging', 'Luggage'] },
        { id: 6, company: 'GreenLion Travel', from: 'Addis Ababa', to: 'Arba Minch', depart: '15:30', arrive: '23:45', minutes: 495, price: 1100, rating: 4.9, type: 'VIP',      seats: 4,  amenities: ['AC', 'Wi-Fi', 'Charging'] },
        { id: 7, company: 'Abay River Bus',   from: 'Addis Ababa', to: 'Arba Minch', depart: '18:00', arrive: '02:45', minutes: 525, price: 950,  rating: 4.3, type: 'Luxury',   seats: 11, amenities: ['AC', 'Charging', 'Luggage'] },
        { id: 8, company: 'Yeha Coaches',     from: 'Addis Ababa', to: 'Arba Minch', depart: '19:30', arrive: '04:00', minutes: 510, price: 1250, rating: 4.7, type: 'VIP',      seats: 3,  amenities: ['AC', 'Wi-Fi', 'Luggage'] }
    ];


    /* Look up the canonical company profile for a trip's company name. */
    function companyMetaFor(name) {
        for (var i = 0; i < COMPANY_META.length; i++) {
            if (COMPANY_META[i].name === name) { return COMPANY_META[i]; }
        }
        return null;
    }

    /**
     * Normalize a company's amenities into a clean array of display strings.
     * Profiles already ship amenities as a normalized strings array; this
     * guarantees trip cards always receive a valid, non-empty array.
     */
    function normalizeAmenities(arr) {
        var fallback = ['Air Conditioning', 'Luggage'];
        if (!arr || arr.length === 0) { return fallback; }
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] != null) { out.push(String(arr[i]).trim()); }
        }
        return out.length ? out : fallback;
    }

    /* Build the complete searchable dataset: legacy (1â€“8) + company (1001â€“1081). */
    var allTrips = [];
    var routeTrips = [];

    /* Normalize one api/search.php trip row into the internal trip shape
       the results UI already knows how to render. */
    function titleCase(str) {
        return String(str || '').charAt(0).toUpperCase() + String(str || '').slice(1);
    }

    function normalizeApiTrip(apiTrip) {
        var busType = String(apiTrip.bus_type || '').toLowerCase();
        return {
            id: parseInt(apiTrip.id, 10) || 0,
            company: apiTrip.company_name || '',
            companySlug: apiTrip.company_slug || '',
            from: apiTrip.from || '',
            to: apiTrip.to || '',
            depart: String(apiTrip.departure_time || '').slice(0, 5),
            arrive: apiTrip.arrival_time ? String(apiTrip.arrival_time).slice(0, 5) : '',
            minutes: parseInt(apiTrip.duration_minutes, 10) || 0,
            price: Number(apiTrip.price) || 0,
            rating: Number(apiTrip.rating) || 0,
            type: titleCase(busType),
            seats: Number(apiTrip.available_seats) || 0,
            busType: apiTrip.bus_model || '',
            amenities: Array.isArray(apiTrip.amenities) ? apiTrip.amenities.slice() : [],
            date: apiTrip.departure_date || '',
            reviewCount: Number(apiTrip.review_count) || 0
        };
    }

    /* Build the full searchable dataset from the CURRENT data source.
       includeLegacy adds the 8 demo legacy trips (mock mode only);
       real API trips already match the searched route on the server. */
    function buildAllTrips(includeLegacy) {
        allTrips = includeLegacy ? LEGACY_TRIPS.slice() : [];
        for (var ti = 0; ti < COMPANY_TRIPS.length; ti++) {
            var ct = COMPANY_TRIPS[ti];
            var cm = companyMetaFor(ct.company);
            allTrips.push({
                id: ct.id,
                company: ct.company,
                from: ct.from,
                to: ct.to,
                depart: ct.depart,
                arrive: ct.arrive,
                minutes: ct.minutes,
                price: ct.price,
                rating: ct.rating,
                type: ct.type,
                seats: ct.seats,
                busType: ct.busType,
                amenities: Array.isArray(ct.amenities)
                    ? ct.amenities.slice()
                    : normalizeAmenities(cm ? cm.amenities : ['Air Conditioning', 'Luggage']),
                date: ct.date || ''
            });
        }

        /* Only trips on the searched route participate in the results. */
        routeTrips = [];
        for (var r = 0; r < allTrips.length; r++) {
            if (sameCity(allTrips[r].from, from) && sameCity(allTrips[r].to, to)) {
                routeTrips.push(allTrips[r]);
            }
        }
    }

    /* ---------- Company metadata used by the results ---------- */
    function buildCompanyList() {
        var map = {};
        for (var i = 0; i < routeTrips.length; i++) {
            var name = routeTrips[i].company;
            if (!map[name]) {
                var meta = companyMetaFor(name);
                map[name] = {
                    name: name,
                    slug: meta ? meta.slug : slugify(name),
                    verified: meta ? meta.verified : false,
                    hasProfile: !!meta
                };
            }
        }
        var list = [];
        for (var key in map) {
            if (Object.prototype.hasOwnProperty.call(map, key)) { list.push(map[key]); }
        }
        return list;
    }
    var companyList = [];
    /* companyList is rebuilt when data arrives: companyList = buildCompanyList(); */

    function companyLookup(name) {
        for (var i = 0; i < companyList.length; i++) {
            if (companyList[i].name === name) { return companyList[i]; }
        }
        return null;
    }

 /* ---------- Departure time slots ---------- */
    var DEPART_LABELS = {
        morning: 'Morning',
        afternoon: 'Afternoon',
        evening: 'Evening'
    };

    function departureSlot(t) {
        var mins = timeToMinutes(t);
        if (mins < 720) { return 'morning'; }   // 05:00 â€“ 12:00
        if (mins < 1020) { return 'afternoon'; } // 12:00 â€“ 17:00
        return 'evening';                         // 17:00 â€“ 22:00
    }

    /* ---------- Dynamic price buckets ----------
       Buckets are generated from the actual dataset so they are
       always sensible (no hardcoded ranges). Boundaries are the
       25th / 50th / 75th percentile prices rounded up to a nice
       number (nearest 50 ETB), producing 3â€“4 labelled ranges. */
    var priceBuckets = [];

    function buildPriceBuckets() {
        var prices = [];
        for (var i = 0; i < routeTrips.length; i++) { prices.push(routeTrips[i].price); }
        if (!prices.length) { return []; }
        var sorted = prices.slice().sort(function (a, b) { return a - b; });
        var n = sorted.length;
        function bound(pct) {
            var idx = Math.min(n - 1, Math.floor(n * pct));
            return Math.ceil(sorted[idx] / 50) * 50;
        }
        var b1 = bound(0.25);
        var b2 = Math.max(b1 + 1, bound(0.5));
        var b3 = Math.max(b2 + 1, bound(0.75));
        var out = [];
        out.push({ id: 'pb0', label: 'Under ETB ' + b1, min: -Infinity, max: b1 });
        out.push({ id: 'pb1', label: 'ETB ' + b1 + '\u2013' + b2, min: b1, max: b2 });
        out.push({ id: 'pb2', label: 'ETB ' + b2 + '\u2013' + b3, min: b2, max: b3 });
        out.push({ id: 'pb3', label: 'Over ETB ' + b3, min: b3, max: Infinity });
        return out;
    }
    /* priceBuckets are rebuilt when data arrives (see bootFromDataset). */

    function priceBucketId(p) {
        for (var i = 0; i < priceBuckets.length; i++) {
            if (p < priceBuckets[i].max) { return priceBuckets[i].id; }
        }
        return priceBuckets[priceBuckets.length - 1].id;
    }

    /* ---------- Deterministic recommendation score ----------
       Higher = better. Each factor is normalized to ~0..1 using
       the whole route dataset, then weighted:
         price    40%   (cheaper is better)
         duration 30%   (faster is better)
         rating   20%   (higher rated is better)
         seats    10%   (more availability is better)
       Computed once per trip so ordering stays stable across
       filters and sorting. */
    var REC = { minPrice: 0, maxPrice: 1, minMinutes: 0, maxMinutes: 1, minRating: 0, maxRating: 1, maxSeats: 1 };

    function computeREC() {
        var minPrice = Infinity, maxPrice = -Infinity;
        var minMin = Infinity, maxMin = -Infinity;
        var minRat = Infinity, maxRat = -Infinity;
        var maxSeats = 1;
        for (var i = 0; i < routeTrips.length; i++) {
            var t = routeTrips[i];
            if (t.price < minPrice) { minPrice = t.price; }
            if (t.price > maxPrice) { maxPrice = t.price; }
            if (t.minutes < minMin) { minMin = t.minutes; }
            if (t.minutes > maxMin) { maxMin = t.minutes; }
            if (t.rating < minRat) { minRat = t.rating; }
            if (t.rating > maxRat) { maxRat = t.rating; }
            if (t.seats > maxSeats) { maxSeats = t.seats; }
        }
        REC = {
            minPrice: minPrice, maxPrice: maxPrice,
            minMinutes: minMin, maxMinutes: maxMin,
            minRating: minRat, maxRating: maxRat,
            maxSeats: maxSeats
        };
    }

    function recScore(t) {
        var priceN = (REC.maxPrice - t.price) / (REC.maxPrice - REC.minPrice || 1);
        var durN = (REC.maxMinutes - t.minutes) / (REC.maxMinutes - REC.minMinutes || 1);
        var ratingN = (REC.maxRating - REC.minRating || 1) > 0
            ? (t.rating - REC.minRating) / (REC.maxRating - REC.minRating)
            : 1;
        var seatsN = t.seats / REC.maxSeats;
        return priceN * 40 + durN * 30 + ratingN * 20 + seatsN * 10;
    }

    /* ---------- Active filter state ---------- */
    var active = {
        depart: [],  // morning | afternoon | evening
        price: [],   // price bucket ids
        type: [],    // Standard | Luxury | VIP
        company: [], // company slugs
        amenity: []  // canonical amenity names
    };
    var sortBy = 'recommended';
    var compareList = []; // trip ids, max 3

    /* ---------- DOM references ---------- */
    var routeEl = document.getElementById('search-route');
    var metaEl = document.getElementById('search-meta');
    var availEl = document.getElementById('search-availability');
    var countEl = document.getElementById('results-count');
    var listEl = document.getElementById('results-list');
    var emptyEl = document.getElementById('results-empty');
    var sortEl = document.getElementById('sort-select');
    var modifyForm = document.getElementById('modify-search-form');
    var filtersEl = document.getElementById('filters');
    var filtersBody = document.getElementById('filters-body');
    var filtersToggle = document.getElementById('filters-toggle');
    var filtersClose = document.getElementById('filters-close');
    var chipsEl = document.getElementById('filter-chips');
    var chipsListEl = document.getElementById('chips-list');
    var chipsClear = document.getElementById('chips-clear');
    var emptyClear = document.getElementById('empty-clear');
    var emptyModify = document.getElementById('empty-modify');
    var companyFilterRow = document.getElementById('company-filter-row');
    var companyFilterName = document.getElementById('company-filter-name');
    var companyFilterRemove = document.getElementById('company-filter-remove');
    var compareBar = document.getElementById('compare-bar');
    var compareCountNum = document.getElementById('compare-count-num');
    var compareNames = document.getElementById('compare-names');
    var compareBtn = document.getElementById('compare-btn');
    var compareClear = document.getElementById('compare-clear');
    var compareBarMsg = document.getElementById('compare-bar-msg');
    var compareModal = document.getElementById('compare-modal');
    var compareTable = document.getElementById('compare-table');
    var compareModalClose = document.getElementById('compare-modal-close');
    var compareLimitMsg = document.getElementById('compare-limit-msg');

    /* ---------- Filter group rendering (data-driven) ---------- */
    function uniqueSorted(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (out.indexOf(list[i]) === -1) { out.push(list[i]); }
        }
        return out;
    }

    function sameCompany(tripCompany, slug) {
        var meta = companyLookup(tripCompany);
        return (meta ? meta.slug : slugify(tripCompany)) === slug;
    }

    function countFor(filterKey, value) {
        var n = 0;
        for (var i = 0; i < routeTrips.length; i++) {
            var t = routeTrips[i];
            if (companySlug && !sameCompany(t.company, companySlug)) { continue; }
            if (filterKey === 'depart' && departureSlot(t.depart) === value) { n++; }
            else if (filterKey === 'price' && priceBucketId(t.price) === value) { n++; }
            else if (filterKey === 'type' && t.type === value) { n++; }
            else if (filterKey === 'company' && sameCompany(t.company, value)) { n++; }
            else if (filterKey === 'amenity' && t.amenities.indexOf(value) !== -1) { n++; }
        }
        return n;
    }

    function checkboxRow(filterKey, value, label, disabled) {
        var count = disabled ? '' : ' <span class="filter-count">' + countFor(filterKey, value) + '</span>';
        return '<label class="filter-option">' +
            '<input type="checkbox" data-filter="' + filterKey + '" value="' + escapeHtml(value) + '"' + (disabled ? ' disabled' : '') + '> ' +
            '<span>' + escapeHtml(label) + '</span>' + count +
        '</label>';
    }

    function renderFilters() {
        if (!filtersBody) { return; }
        var html = '';

        /* Departure time */
        html += '<div class="filter-group" role="group" aria-label="Departure time">';
        html += '<h4>Departure Time</h4>';
        html += '<span class="filter-range">Morning 05:00\u201312:00 &middot; Afternoon 12:00\u201317:00 &middot; Evening 17:00\u201322:00</span>';
        html += checkboxRow('depart', 'morning', 'Morning');
        html += checkboxRow('depart', 'afternoon', 'Afternoon');
        html += checkboxRow('depart', 'evening', 'Evening');
        html += '</div>';

        /* Price (dynamic buckets) */
        html += '<div class="filter-group" role="group" aria-label="Price">';
        html += '<h4>Price</h4>';
        for (var p = 0; p < priceBuckets.length; p++) {
            html += checkboxRow('price', priceBuckets[p].id, priceBuckets[p].label);
        }
        html += '</div>';

        /* Bus type */
        var types = uniqueSorted(routeTrips.map(function (t) { return t.type; }));
        html += '<div class="filter-group" role="group" aria-label="Bus type">';
        html += '<h4>Bus Type</h4>';
        for (var ty = 0; ty < types.length; ty++) {
            html += checkboxRow('type', types[ty], types[ty]);
        }
        html += '</div>';

        /* Company (only interactive when no active ?company= param) */
        var companyDisabled = !!(companySlug && companyMetaBySlug(companySlug));
        html += '<div class="filter-group" role="group" aria-label="Company">';
        html += '<h4>Company</h4>';
        if (companyDisabled) {
            html += '<p class="filter-note">Filtering by one company.</p>';
        }
        for (var c = 0; c < companyList.length; c++) {
            var cmp = companyList[c];
            html += checkboxRow('company', cmp.slug, cmp.name, companyDisabled);
        }
        html += '</div>';

        /* Amenities present in the dataset */
        var amenitySet = [];
        for (var a = 0; a < routeTrips.length; a++) {
            for (var am = 0; am < routeTrips[a].amenities.length; am++) {
                if (amenitySet.indexOf(routeTrips[a].amenities[am]) === -1) {
                    amenitySet.push(routeTrips[a].amenities[am]);
                }
            }
        }
        if (amenitySet.length) {
            html += '<div class="filter-group" role="group" aria-label="Amenities">';
            html += '<h4>Amenities</h4>';
            for (var m = 0; m < amenitySet.length; m++) {
                html += checkboxRow('amenity', amenitySet[m], amenitySet[m]);
            }
            html += '</div>';
        }

        filtersBody.innerHTML = html;
    }

    /* ---------- Filtering ----------
       Deterministic pipeline:
       VALID ROUTE (already applied when routeTrips was built)
       → VALID DATE → ENOUGH SEATS → COMPANY PARAM → DEPARTURE
       → PRICE → BUS TYPE → COMPANY → AMENITY.
       An empty filter state / empty string is treated as "no filter". */
    function applyFilters(source) {
        var out = [];
        for (var i = 0; i < source.length; i++) {
            var t = source[i];
            /* VALID DATE — only trips that carry an explicit date are checked;
               dateless trips are treated as operating every day. */
            if (t.date && normalizeDate(t.date) !== dateNorm) { continue; }
            /* ENOUGH SEATS — passengers must fit; never require an exact count. */
            if (typeof t.seats === 'number' && t.seats < passengers) { continue; }
            /* COMPANY PARAM (pinned from the URL, e.g. ?company=selam-bus).
               Only applied when the slug references a known company; an absent
               or non-existent company parameter must NOT filter (show all). */
            if (companySlug && companyMetaBySlug(companySlug) && !sameCompany(t.company, companySlug)) { continue; }
            /* DEPARTURE FILTER */
            if (active.depart.length && active.depart.indexOf(departureSlot(t.depart)) === -1) { continue; }
            /* PRICE FILTER */
            if (active.price.length && active.price.indexOf(priceBucketId(t.price)) === -1) { continue; }
            /* BUS TYPE FILTER */
            if (active.type.length && active.type.indexOf(t.type) === -1) { continue; }
            /* COMPANY FILTER (checkboxes) */
            if (active.company.length) {
                var tSlug = companyLookup(t.company) ? companyLookup(t.company).slug : slugify(t.company);
                if (active.company.indexOf(tSlug) === -1) { continue; }
            }
            /* AMENITY FILTER */
            if (active.amenity.length) {
                var hasAmenity = false;
                for (var am = 0; am < active.amenity.length; am++) {
                    if (t.amenities.indexOf(active.amenity[am]) !== -1) { hasAmenity = true; break; }
                }
                if (!hasAmenity) { continue; }
            }
            out.push(t);
        }
        return out;
    }

    /* ---------- Sorting ---------- */
    function sortTrips(list) {
        var copy = list.slice();
        if (sortBy === 'cheapest') {
            copy.sort(function (a, b) { return a.price - b.price; });
        } else if (sortBy === 'fastest') {
            copy.sort(function (a, b) { return a.minutes - b.minutes; });
        } else if (sortBy === 'rating') {
            copy.sort(function (a, b) { return b.rating - a.rating; });
        } else if (sortBy === 'earliest') {
            copy.sort(function (a, b) { return timeToMinutes(a.depart) - timeToMinutes(b.depart); });
        } else {
            copy.sort(function (a, b) { return recScore(b) - recScore(a); });
        }
        return copy;
    }

    /* ---------- Badges (computed from the current result dataset) ----------
       Cheapest / Fastest / Best Rated / Recommended are derived from
       the visible (filtered) set so they are always meaningful. */
    var BADGE_META = {
        cheapest: { css: 'badge-cheapest', label: '\u{1F4B0} Cheapest' },
        fastest: { css: 'badge-fastest', label: '\u26A1 Fastest' },
        rated: { css: 'badge-rated', label: '\u2B50 Best Rated' },
        recommended: { css: 'badge-recommended', label: '\u{1F3C6} Recommended' }
    };

    function computeBadges(list) {
        var map = {};
        if (!list.length) { return map; }
        var minPrice = Infinity, minMin = Infinity, maxRating = -Infinity, maxScore = -Infinity;
        var i, t;
        for (i = 0; i < list.length; i++) {
            t = list[i];
            if (t.price < minPrice) { minPrice = t.price; }
            if (t.minutes < minMin) { minMin = t.minutes; }
            if (t.rating > maxRating) { maxRating = t.rating; }
            var s = recScore(t);
            if (s > maxScore) { maxScore = s; }
        }
        for (i = 0; i < list.length; i++) {
            t = list[i];
            var badges = [];
            if (t.price === minPrice) { badges.push('cheapest'); }
            if (t.minutes === minMin) { badges.push('fastest'); }
            if (t.rating === maxRating) { badges.push('rated'); }
            if (recScore(t) === maxScore) { badges.push('recommended'); }
            map[t.id] = badges;
        }
        return map;
    }

    function badgeHtml(key) {
        var b = BADGE_META[key];
        return '<span class="badge ' + b.css + '">' + b.label + '</span>';
    }

    /* ---------- Link builders (context preserved) ---------- */
    function bookingLink(t) {
        return 'booking.html?trip=' + t.id +
            '&passengers=' + passengers +
            '&date=' + encodeURIComponent(date);
    }

    function companyProfileLink(slug) {
        return 'company.html?company=' + encodeURIComponent(slug) +
            '&from=' + encodeURIComponent(from) +
            '&to=' + encodeURIComponent(to) +
            '&date=' + encodeURIComponent(date) +
            '&passengers=' + passengers;
    }

    function isCompared(tripId) {
        return compareList.indexOf(tripId) !== -1;
    }

    function reviewCountFor(t) {
        var meta = companyMetaFor(t.company);
        return meta ? meta.reviewCount : 0;
    }

    /* ---------- Trip card rendering ---------- */
    function cardHtml(t, badges) {
        var badgesHtml = '';
        for (var i = 0; i < badges.length; i++) {
            badgesHtml += badgeHtml(badges[i]);
        }
        var cmp = companyLookup(t.company);
        var companyHtml = '';
        if (cmp && cmp.hasProfile) {
            companyHtml = '<a class="company-link" href="' + companyProfileLink(cmp.slug) + '">' +
                escapeHtml(t.company) +
                (cmp.verified ? '<span class="verified-sm"><span aria-hidden="true">&#10003;</span>Verified</span>' : '') +
            '</a>';
        } else {
            companyHtml = '<span class="company-link company-link-plain">' + escapeHtml(t.company) + '</span>';
        }

        var amenityChips = '';
        for (var a = 0; a < t.amenities.length; a++) {
            amenityChips += '<span class="amenity-chip">' + escapeHtml(t.amenities[a]) + '</span>';
        }

        var reviews = reviewCountFor(t);
        var ratingMeta = reviews > 0
            ? ' <span class="rating-count">(' + reviews.toLocaleString() + ' reviews)</span>'
            : '';

        return '' +
            '<article class="bus-card" data-trip-id="' + t.id + '">' +
                '<div class="card-top">' +
                    '<div class="card-badges">' + badgesHtml + '</div>' +
                    '<div class="bus-company">' +
                        companyHtml +
                        '<span class="bus-rating">\u2605 ' + t.rating.toFixed(1) + ratingMeta + '</span>' +
                    '</div>' +
                    '<label class="compare-toggle" title="Add to comparison">' +
                        '<input type="checkbox" class="compare-check" data-trip-id="' + t.id + '"' + (isCompared(t.id) ? ' checked' : '') + '>' +
                        '<span class="compare-label">Compare</span>' +
                    '</label>' +
                '</div>' +
                '<div class="bus-route">' +
                    '<div class="time-block">' +
                        '<span class="time">' + t.depart + '</span>' +
                        '<span class="place">' + escapeHtml(t.from) + '</span>' +
                    '</div>' +
                    '<div class="journey-line">' +
                        '<span class="duration">' + formatDuration(t.minutes) + '</span>' +
                        '<span class="line"></span>' +
                    '</div>' +
                    '<div class="time-block align-right">' +
                        '<span class="time">' + t.arrive + '</span>' +
                        '<span class="place">' + escapeHtml(t.to) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="bus-meta">' +
                    '<span class="bus-type">' + escapeHtml(t.type) + '</span>' +
                    (t.busType ? '<span class="bus-bustype">' + escapeHtml(t.busType) + '</span>' : '') +
                    '<span class="seats">' + t.seats + ' seats available</span>' +
                '</div>' +
                '<div class="amenities-row">' + amenityChips + '</div>' +
                '<div class="bus-buy">' +
                    '<div class="price-block">' +
                        '<span class="price">' + formatPrice(t.price) + '</span>' +
                        '<span class="per-passenger">per passenger</span>' +
                    '</div>' +
                    '<button type="button" class="btn btn-view-seats view-seats" data-trip-id="' + t.id + '">View Seats \u2192</button>' +
                '</div>' +
            '</article>';
    }

    /* ---------- Render ---------- */
    var filtered = [];

    function render(list) {
        if (!listEl) { return; }

        var visible = sortTrips(list);
        filtered = visible;
        var badges = computeBadges(visible);

        /* Results count + empty state */
        if (countEl) {
            countEl.textContent = visible.length + ' trip' + (visible.length === 1 ? '' : 's') + ' found';
        }
        if (emptyEl) { emptyEl.hidden = visible.length !== 0; }

        /* Cards */
        listEl.innerHTML = visible.map(function (t) {
            return cardHtml(t, badges[t.id] || []);
        }).join('');

        updateCompareUI();
    }

    /* ---------- Search summary ---------- */
    function renderSummary() {
        if (routeEl) {
            routeEl.innerHTML = escapeHtml(from) + ' &rarr; ' + escapeHtml(to);
        }
        if (metaEl) {
            metaEl.textContent = formatDate(date) + ' \u00B7 ' + passengers +
                ' Passenger' + (passengers === 1 ? '' : 's');
        }
        if (availEl) {
            var total = routeTrips.length;
            var text = total + ' trip' + (total === 1 ? '' : 's') + ' available';
            if (companySlug) {
                var meta = companyMetaBySlug(companySlug);
                if (meta) { text += ' from ' + meta.name; }
            }
            availEl.textContent = text;
        }
    }

    function companyMetaBySlug(slug) {
        for (var i = 0; i < companyList.length; i++) {
            if (companyList[i].slug === slug) { return companyList[i]; }
        }
        for (var c = 0; c < COMPANY_META.length; c++) {
            if (COMPANY_META[c].slug === slug) { return COMPANY_META[c]; }
        }
        return null;
    }

    /* ---------- Company param (pinned filter) ---------- */
    function updateCompanyParamUI() {
        if (!companyFilterRow || !companyFilterName) { return; }
        var meta = companyMetaBySlug(companySlug);
        if (companySlug && meta) {
            companyFilterName.textContent = meta.name;
            companyFilterRow.hidden = false;
        } else {
            companyFilterRow.hidden = true;
        }
    }

    function removeCompanyParam() {
        companySlug = '';
        updateCompanyParamUI();
        renderFilters();
        syncCheckboxes();
        refresh();
                updateUrl();
    }

    /* Clear every filter group (depart / price / type / company / amenity) as
       well as the pinned URL company param, then rebuild checkboxes, chips,
       results and the shareable URL. Mirrors removeCompanyParam() but is a
       full reset. */
    function clearAllFilters() {
        var keys = ['depart', 'price', 'type', 'company', 'amenity'];
        for (var i = 0; i < keys.length; i++) { active[keys[i]] = []; }
        companySlug = '';
        updateCompanyParamUI();
        renderFilters();
        syncCheckboxes();
        updateFilterUI();
        refresh();
        updateUrl();
    }

    /* ---------- Filter chips ---------- */
    function chipLabel(key, value) {
        if (key === 'depart') { return DEPART_LABELS[value] || value; }
        if (key === 'price') {
            for (var i = 0; i < priceBuckets.length; i++) {
                if (priceBuckets[i].id === value) { return priceBuckets[i].label; }
            }
            return value;
        }
        if (key === 'company') {
            var meta = companyMetaBySlug(value);
            return meta ? meta.name : value;
        }
        return value;
    }

    function buildChips() {
        var chips = [];
        /* Only show the pinned company chip when the slug is a known company
           (an unknown ?company= value does not filter the results). */
        if (companySlug && companyMetaBySlug(companySlug)) {
            chips.push({ key: 'company-param', value: companySlug, label: chipLabel('company', companySlug) });
        }
        var order = ['depart', 'price', 'type', 'company', 'amenity'];
        for (var o = 0; o < order.length; o++) {
            var key = order[o];
            var list = active[key];
            for (var i = 0; i < list.length; i++) {
                chips.push({ key: key, value: list[i], label: chipLabel(key, list[i]) });
            }
        }
        return chips;
    }

    function renderChips() {
        if (!chipsEl || !chipsListEl) { return; }
        var chips = buildChips();
        if (!chips.length) {
            chipsEl.hidden = true;
            chipsListEl.innerHTML = '';
            return;
        }
        chipsEl.hidden = false;
        var html = '';
        for (var i = 0; i < chips.length; i++) {
            var c = chips[i];
            html += '<span class="filter-chip">' +
                '<span class="chip-label">' + escapeHtml(c.label) + '</span>' +
                '<button type="button" class="chip-remove" data-chip-key="' + escapeHtml(c.key) +
                '" data-chip-value="' + escapeHtml(c.value) +
                '" aria-label="Remove ' + escapeHtml(c.label) + ' filter">&times;</button>' +
            '</span>';
        }
        chipsListEl.innerHTML = html;
    }

    function removeChip(key, value) {
        if (key === 'company-param') {
            removeCompanyParam();
            return;
        }
        var list = active[key];
        if (!list) { return; }
        var idx = list.indexOf(value);
        if (idx !== -1) { list.splice(idx, 1); }
        syncCheckboxes();
        updateFilterUI();
        refresh();
    }

    /* ---------- Filter UI sync ---------- */
    function syncCheckboxes() {
        if (!filtersBody) { return; }
        var inputs = filtersBody.querySelectorAll('input[data-filter]');
        for (var i = 0; i < inputs.length; i++) {
            var input = inputs[i];
            var key = input.getAttribute('data-filter');
            var val = input.value;
            var list = active[key] || [];
            input.checked = list.indexOf(val) !== -1;
        }
    }

    function activeFilterCount() {
        var n = (companySlug && companyMetaBySlug(companySlug) ? 1 : 0);
        var keys = ['depart', 'price', 'type', 'company', 'amenity'];
        for (var i = 0; i < keys.length; i++) { n += active[keys[i]].length; }
        return n;
    }

    function updateFilterUI() {
        renderChips();
        if (filtersToggle) {
            var n = activeFilterCount();
            filtersToggle.textContent = 'Filters' + (n ? ' (' + n + ')' : '');
        }
    }

    function refresh() {
        var list = applyFilters(routeTrips);
        render(list);
    }

    /* ---------- URL sync (keeps search state shareable) ---------- */
    function updateUrl() {
        var params = [
            'from=' + encodeURIComponent(from),
            'to=' + encodeURIComponent(to),
            'date=' + encodeURIComponent(date),
            'passengers=' + passengers
        ];
        if (companySlug) { params.push('company=' + encodeURIComponent(companySlug)); }
        var url = 'search.html?' + params.join('&');
        try {
            window.history.replaceState(null, '', url);
        } catch (e) { /* history API unavailable - ignore */ }
    }

    /* ---------- Compare: sticky bar ---------- */
    function tripById(id) {
        for (var i = 0; i < allTrips.length; i++) {
            if (allTrips[i].id === id) { return allTrips[i]; }
        }
        return null;
    }

    function toggleCompare(tripId) {
        var idx = compareList.indexOf(tripId);
        if (idx !== -1) {
            compareList.splice(idx, 1);
            return true;
        }
        if (compareList.length >= 3) { return false; }
        compareList.push(tripId);
        return true;
    }

    function showCompareLimit() {
        if (compareLimitMsg) {
            compareLimitMsg.hidden = false;
        }
        if (compareBarMsg) {
            compareBarMsg.hidden = false;
            try { clearTimeout(compareBarMsg._t); } catch (e) { /* ignore */ }
            compareBarMsg._t = setTimeout(function () { compareBarMsg.hidden = true; }, 3000);
        }
    }

    function updateCompareUI() {
        if (!compareBar) { return; }
        compareBar.hidden = compareList.length === 0;
        if (compareCountNum) { compareCountNum.textContent = compareList.length; }
        if (compareNames) {
            var names = compareList.map(function (id) {
                var t = tripById(id);
                return t ? t.company : '';
            });
            compareNames.innerHTML = names.map(function (n, i) {
                return '<span class="compare-name">' + escapeHtml(n) + (i < names.length - 1 ? ',' : '') + '</span>';
            }).join(' ');
        }
        if (compareBtn) { compareBtn.disabled = compareList.length === 0; }
    }

    /* ---------- Compare: modal view ---------- */
    function compareRow(label, html) {
        return '<tr><th scope="row">' + label + '</th>' + html + '</tr>';
    }

    function renderCompareModal() {
        if (!compareTable) { return; }
        if (!compareList.length) { return; }

        var selected = compareList.map(tripById);
        var html = '<table class="compare-grid">';

        /* Header: company names */
        html += '<thead><tr><th scope="col">Trip</th>';
        for (var i = 0; i < selected.length; i++) {
            var t = selected[i];
            var cmp = companyLookup(t.company);
            html += '<th scope="col" class="compare-col-head">' +
                (cmp && cmp.hasProfile
                    ? '<a class="compare-company-link" href="' + companyProfileLink(cmp.slug) + '">' + escapeHtml(t.company) + '</a>'
                    : '<span>' + escapeHtml(t.company) + '</span>') +
                (cmp && cmp.verified ? '<span class="verified-sm"><span aria-hidden="true">&#10003;</span>Verified</span>' : '') +
                '<span class="compare-depart-time">' + t.depart + ' \u2192 ' + t.arrive + '</span>' +
            '</th>';
        }
        html += '</tr></thead><tbody>';

        function cols(fn) {
            var out = '';
            for (var c = 0; c < selected.length; c++) { out += '<td>' + fn(selected[c], c) + '</td>'; }
            return out;
        }

        html += compareRow('Rating', cols(function (t) {
            var rev = reviewCountFor(t);
            return '\u2605 ' + t.rating.toFixed(1) + (rev > 0 ? '<span class="cmp-sub"> (' + rev.toLocaleString() + ' reviews)</span>' : '');
        }));
        html += compareRow('Departure', cols(function (t) {
            return '<strong>' + t.depart + '</strong><span class="cmp-sub">' + escapeHtml(t.from) + '</span>';
        }));
        html += compareRow('Arrival', cols(function (t) {
            return '<strong>' + t.arrive + '</strong><span class="cmp-sub">' + escapeHtml(t.to) + '</span>';
        }));
        html += compareRow('Duration', cols(function (t) { return formatDuration(t.minutes); }));
        html += compareRow('Price', cols(function (t) {
            return '<strong class="cmp-price">' + formatPrice(t.price) + '</strong><span class="cmp-sub">per passenger</span>';
        }));
        html += compareRow('Bus Type', cols(function (t) {
            return t.type + (t.busType ? '<span class="cmp-sub">' + escapeHtml(t.busType) + '</span>' : '');
        }));
        html += compareRow('Available Seats', cols(function (t) {
            return '<strong>' + t.seats + '</strong><span class="cmp-sub">seats</span>';
        }));
        html += compareRow('Amenities', cols(function (t) {
            if (!t.amenities.length) { return '\u2014'; }
            var chips = '';
            for (var a = 0; a < t.amenities.length; a++) {
                chips += '<span class="cmp-amenity">\u2713 ' + escapeHtml(t.amenities[a]) + '</span>';
            }
            return chips;
        }));
        html += compareRow('Select', cols(function (t) {
            return '<button type="button" class="btn btn-compare-select" data-trip-id="' + t.id + '">Select Trip</button>';
        }));

        html += '</tbody></table>';
        compareTable.innerHTML = html;
    }

    function openCompareModal() {
        if (!compareModal || !compareList.length) { return; }
        renderCompareModal();
        compareModal.hidden = false;
        document.body.classList.add('modal-open');
        if (compareLimitMsg) { compareLimitMsg.hidden = true; }
        if (compareModalClose) { compareModalClose.focus(); }
    }

    function closeCompareModal() {
        if (!compareModal) { return; }
        compareModal.hidden = true;
        document.body.classList.remove('modal-open');
        if (compareBtn) { compareBtn.focus(); }
    }

    /* ---------- Event bindings ---------- */
    if (filtersBody) {
        filtersBody.addEventListener('change', function (event) {
            var input = event.target;
            if (!input || input.type !== 'checkbox' || !input.dataset.filter) { return; }
            var key = input.dataset.filter;
            var val = input.value;
            var list = active[key];
            if (!list) { return; }
            var idx = list.indexOf(val);
            if (input.checked && idx === -1) { list.push(val); }
            if (!input.checked && idx !== -1) { list.splice(idx, 1); }
            updateFilterUI();
            refresh();
        });
    }

    if (chipsListEl) {
        chipsListEl.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('.chip-remove') : null;
            if (!btn) { return; }
            removeChip(btn.getAttribute('data-chip-key'), btn.getAttribute('data-chip-value'));
        });
    }
    if (chipsClear) {
        chipsClear.addEventListener('click', clearAllFilters);
    }

    if (sortEl) {
        sortEl.addEventListener('change', function () {
            sortBy = sortEl.value;
            render(filtered);
        });
    }

    /* "View Seats" â†’ seat selection (existing booking flow) */
    if (listEl) {
        listEl.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('.view-seats') : null;
            if (btn) {
                var id = parseInt(btn.getAttribute('data-trip-id'), 10);
                var trip = tripById(id);
                if (trip) {
                    rememberTrip(trip);
                    window.location.href = bookingLink(trip);
                }
            }
        });

        /* Compare checkboxes (max 3) */
        listEl.addEventListener('change', function (event) {
            var input = event.target;
            if (!input || !input.classList || !input.classList.contains('compare-check')) { return; }
            var id = parseInt(input.getAttribute('data-trip-id'), 10);
            if (isNaN(id)) { return; }
            if (input.checked) {
                var ok = toggleCompare(id);
                if (!ok) {
                    input.checked = false;
                    showCompareLimit();
                    return;
                }
            } else {
                toggleCompare(id);
            }
            updateCompareUI();
        });
    }

    /* ---------- Compare bar actions ---------- */
    if (compareBtn) {
        compareBtn.addEventListener('click', openCompareModal);
    }
    if (compareClear) {
        compareClear.addEventListener('click', function () {
            compareList = [];
            syncCheckboxes();
            updateCompareUI();
            render(filtered);
        });
    }

    /* ---------- Modal close (button, backdrop, Escape) ---------- */
    if (compareModalClose) {
        compareModalClose.addEventListener('click', closeCompareModal);
    }
    if (compareModal) {
        compareModal.addEventListener('click', function (event) {
            if (event.target && event.target.hasAttribute('data-compare-close')) {
                closeCompareModal();
            }
        });
    }
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && compareModal && !compareModal.hidden) {
            closeCompareModal();
        }
    });

    /* ---------- Compare modal: "Select Trip" → booking.html ---------- */
    if (compareTable) {
        compareTable.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('.btn-compare-select') : null;
            if (!btn) { return; }
            var id = parseInt(btn.getAttribute('data-trip-id'), 10);
            var trip = tripById(id);
            if (trip) {
                rememberTrip(trip);
                window.location.href = bookingLink(trip);
            }
        });
    }

    /* ---------- Mobile filters drawer ---------- */
    function closeFiltersDrawer() {
        if (filtersEl) { filtersEl.classList.remove('open'); }
        if (filtersToggle) { filtersToggle.setAttribute('aria-expanded', 'false'); }
        document.body.classList.remove('filters-open');
    }
    if (filtersToggle) {
        filtersToggle.addEventListener('click', function () {
            filtersEl.classList.add('open');
            filtersToggle.setAttribute('aria-expanded', 'true');
            document.body.classList.add('filters-open');
        });
    }
    if (filtersClose) {
        filtersClose.addEventListener('click', closeFiltersDrawer);
    }


/* ---------- Modify Search form → rebuild URL (keeps ?company= when active) ---------- */
    if (modifyForm) {
        modifyForm.addEventListener('submit', function (event) {
            event.preventDefault();
            var fd = new FormData(modifyForm);
            var qs = new URLSearchParams(fd).toString();
            if (companySlug) {
                qs += (qs ? '&' : '') + 'company=' + encodeURIComponent(companySlug);
            }
            window.location.href = 'search.html?' + qs;
        });
    }

    /* ---------- Empty state actions ---------- */
    if (emptyClear) {
        emptyClear.addEventListener('click', clearAllFilters);
    }
    if (emptyModify) {
        emptyModify.addEventListener('click', function () {
            var details = document.querySelector('.modify-search');
            if (details) { details.open = true; }
            var first = document.getElementById('m-from');
            if (first) { first.focus(); }
        });
    }

    /* ---------- Pinned company filter removal ---------- */
    if (companyFilterRemove) {
        companyFilterRemove.addEventListener('click', removeCompanyParam);
    }

 /* ---------- Bootstrap (async; runs after the dataset is ready) ---------- */
    function runInit() {
        if (modifyForm) {
            var mf = document.getElementById('m-from');
            var mt = document.getElementById('m-to');
            var md = document.getElementById('m-date');
            var mp = document.getElementById('m-passengers');
            if (mf) { mf.value = from; }
            if (mt) { mt.value = to; }
            if (md) { md.value = date; }
            if (mp) { mp.value = String(passengers); }
        }
        renderSummary();
        renderFilters();
        updateCompanyParamUI();
        syncCheckboxes();
        updateFilterUI();
        refresh();
    }

    /* Remember the selected trip so the booking flow (booking.html,
       passenger.html, payment.html, confirmation.html) can resolve the
       REAL departure even when the shared demo dataset has no such id. */
    function rememberTrip(t) {
        if (!t) { return; }
        try {
            window.sessionStorage.setItem('etTransportSelectedTrip', JSON.stringify({ v: 1, trip: {
                id: t.id,
                company: t.company,
                companySlug: t.companySlug || '',
                from: t.from,
                to: t.to,
                depart: t.depart,
                arrive: t.arrive || '',
                minutes: t.minutes,
                price: t.price,
                rating: t.rating,
                type: t.type,
                seats: t.seats,
                busType: t.busType,
                date: t.date || ''
            }}));
        } catch (e) { /* storage unavailable — booking then falls back to demo data */ }
    }

    /* Cleaner error state — never silently falls back to mock data. */
    function showSearchError(message) {
        if (countEl) { countEl.textContent = '0 trips found'; }
        if (availEl) { availEl.textContent = 'Live search data unavailable'; }
        if (emptyEl) { emptyEl.hidden = true; }
        if (routeEl) { routeEl.innerHTML = escapeHtml(from) + ' &rarr; ' + escapeHtml(to); }
        if (listEl) {
            listEl.innerHTML = '<div class="search-error" role="alert" style="padding:1.5rem;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;color:#b91c1c;margin:1rem 0;">' +
                '<p style="font-weight:700;margin:0 0 .5rem;">Live search is unavailable right now.</p>' +
                '<p style="margin:0 0 .5rem;">' + escapeHtml(message) + '</p>' +
                '<p style="margin:0;">Please try again shortly.</p>' +
                '</div>';
        }
    }

    function bootFromDataset(tripRows, companiesMeta, includeLegacyTrips) {
        COMPANY_TRIPS = Array.isArray(tripRows) ? tripRows : [];
        COMPANY_META = Array.isArray(companiesMeta) ? companiesMeta : [];
        buildAllTrips(!!includeLegacyTrips);
        companyList = buildCompanyList();
        priceBuckets = buildPriceBuckets();
        computeREC();
        runInit();
    }

    function start() {
        /* Explicit development fallback: ?mock=1 renders the shared demo
           dataset. Normal users never hit this; API failures are shown. */
        if (getParam('mock', '') === '1') {
            var demo = window.ETTransportData || {};
            var demoCompanies = Array.isArray(demo.companies) ? demo.companies
                : (Array.isArray(window.ETTransportCompanies) ? window.ETTransportCompanies : []);
            var demoTrips = Array.isArray(demo.trips) ? demo.trips
                : (Array.isArray(window.ETTransportTrips) ? window.ETTransportTrips : []);
            bootFromDataset(demoTrips, demoCompanies, true);
            return;
        }

        /* PRIMARY source: the real, database-backed search API. */
        if (typeof window.fetch !== 'function') {
            showSearchError('The search API is not reachable in this environment.');
            return;
        }

        var params = new URLSearchParams();
        params.set('from', from);
        params.set('to', to);
        params.set('date', date);
        params.set('passengers', String(passengers));
        if (companySlug) { params.set('company', companySlug); }

        window.fetch('api/search.php?' + params.toString(), { credentials: 'same-origin' })
            .then(function (res) {
                if (!res.ok) { throw new Error('Search API returned HTTP ' + res.status); }
                return res.json();
            })
            .then(function (json) {
                if (!json || json.success !== true || !Array.isArray(json.trips)) {
                    throw new Error((json && json.message) || 'Unexpected search response.');
                }
                var companyMeta = (json.companies || []).map(function (m) {
                    return {
                        slug: m.slug,
                        name: m.name,
                        verified: !!m.verified,
                        rating: Number(m.rating) || 0,
                        reviewCount: Number(m.review_count) || 0
                    };
                });
                bootFromDataset((json.trips || []).map(normalizeApiTrip), companyMeta, false);
            })
            .catch(function (err) {
                if (window.console && window.console.error) {
                    window.console.error('ET Transport search API failed:', err);
                }
                showSearchError('We could not load trips from the live database. Please try again shortly.');
            });
    }

    start();
})();
