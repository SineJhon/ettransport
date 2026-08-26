/* ============================================================
   ET Transport — dashboard.js
   Passenger dashboard (frontend-only, mock data).

   Single dashboard.html page with JS section switching:
   Overview · My Trips · Tickets · Favorites · Notifications ·
   Profile · Support.

   Data lives in sessionStorage / localStorage inside this
   browser only. There is NO authentication and NO backend.
   ============================================================ */

(function () {
    'use strict';

    /* ---------- Storage keys ---------- */
    var KEY_HISTORY = 'etTransportBookings';          // booking history (array)
    var KEY_NOTIF = 'etTransportNotifications';       // notifications (array)
    var KEY_PROFILE = 'etTransportProfile';           // profile (object)
    var KEY_FAV_ROUTES = 'etTransportFavoriteRoutes'; // saved routes (array of {from,to})
    var KEY_REVIEWED = 'etTransportReviewedBookings'; // reviewed booking ids per user (object)

    /* ---------- Safe JSON storage helpers ---------- */
    function getJSON(key, fallback) {
        if (window.ETTransportStore) {
            var v = window.ETTransportStore.get(key);
            return (v === null || v === undefined) ? fallback : v;
        }
        return fallback;
    }
    function setJSON(key, value) {
        if (window.ETTransportStore) { window.ETTransportStore.set(key, value); }
    }

    /* ---------- Formatting helpers (project conventions) ---------- */
    function pad(n) { return ('0' + n).slice(-2); }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatPrice(n) {
        return 'ETB ' + Number(n || 0).toLocaleString();
    }

    function formatDate(iso, withWeekday) {
        if (!iso) { return ''; }
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) { return iso; }
        return d.toLocaleDateString('en-GB', {
            weekday: withWeekday ? 'short' : undefined,
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    /* Local (timezone-safe) date helpers — no UTC round-trip. */
    function isoToday() {
        var d = new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function isoIn(days) {
        var d = new Date();
        d.setDate(d.getDate() + (days || 0));
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function formatDuration(minutes) {
        minutes = minutes || 0;
        return Math.floor(minutes / 60) + 'h ' + pad(minutes % 60) + 'm';
    }

    function slugify(name) {
        return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    /* ---------- Company lookup (shared data from js/company.js) ---------- */
    var companies = (window.ETTransportCompanies || []).slice();

    function companyBySlug(slug) {
        for (var i = 0; i < companies.length; i++) {
            if (companies[i].slug === slug) { return companies[i]; }
        }
        return null;
    }
    function companyByTripName(name) {
        var n = String(name || '').trim().toLowerCase();
        for (var i = 0; i < companies.length; i++) {
            if (String(companies[i].name).toLowerCase() === n) { return companies[i]; }
        }
        return null;
    }
    function companySlugFor(b) {
        if (b.companyId) { return b.companyId; }
        var c = companyByTripName(b.company);
        return c ? c.slug : slugify(b.company);
    }
    function companyLogoFor(b) {
        var c = companyByTripName(b.company) || companyBySlug(b.companyId);
        return c && c.logo ? c.logo : '';
    }
    /* ============================================================
       Demo / fallback data — clearly mock, used only when the
       browser session has no real records yet.
       ============================================================ */
    function demoBookings() {
        return [
            {
                reference: 'ET-8F4K29',
                company: 'Selam Bus', companyId: 'selam-bus',
                from: 'Addis Ababa', to: 'Arba Minch',
                date: isoIn(3), depart: '08:00', arrive: '16:30', minutes: 510,
                seats: [12], seatLabel: '12', passengerCount: 1,
                passengerNames: ['Amanuel Passenger'],
                total: 1300, paymentMethod: 'Telebirr',
                busType: 'Higer A90', tripType: 'Luxury',
                status: 'confirmed', demo: true
            },
            {
                reference: 'ET-7K2B51',
                company: 'Sky Bus', companyId: 'sky-bus',
                from: 'Addis Ababa', to: 'Hawassa',
                date: isoIn(-12), depart: '07:00', arrive: '12:15', minutes: 315,
                seats: [4], seatLabel: '4', passengerCount: 1,
                passengerNames: ['Amanuel Passenger'],
                total: 500, paymentMethod: 'CBE Birr',
                busType: 'Yutong ZK6107H', tripType: 'Standard',
                status: 'confirmed', demo: true
            },
            {
                reference: 'ET-3M9DX7',
                company: 'Zemen Bus', companyId: 'zemen-bus',
                from: 'Addis Ababa', to: 'Dire Dawa',
                date: isoIn(10), depart: '06:45', arrive: '15:15', minutes: 510,
                seats: [8], seatLabel: '8', passengerCount: 1,
                passengerNames: ['Amanuel Passenger'],
                total: 820, paymentMethod: 'M-Pesa',
                busType: 'Neoplan Skyliner', tripType: 'Luxury',
                status: 'cancelled', demo: true
            }
        ];
    }

    function demoNotifications() {
        return [
            { id: 'demo-1', icon: '&#128652;', title: 'Booking Confirmed',
              message: 'Your Selam Bus trip to Arba Minch is confirmed (ref ET-8F4K29).',
              time: 'Yesterday, 18:20', read: false },
            { id: 'demo-2', icon: '&#128179;', title: 'Payment Successful',
              message: 'Payment of ETB 1,300 was successfully processed.',
              time: 'Yesterday, 18:20', read: true },
            { id: 'demo-3', icon: '&#9200;', title: 'Upcoming Trip',
              message: 'Your trip departs soon at 08:00. Please arrive 30 minutes early.',
              time: '2 days ago', read: false },
            { id: 'demo-4', icon: '&#128679;', title: 'Schedule Update',
              message: 'Your departure time has changed for one of your trips.',
              time: '5 days ago', read: true },
            { id: 'demo-5', icon: '&#11088;', title: 'Review Reminder',
              message: 'How was your trip with Sky Bus? Leave a review.',
              time: '12 days ago', read: true }
        ];
    }

    function demoProfile() {
        return {
            fullName: 'Amanuel Passenger',
            phone: '+251911234567',
            email: 'amanuel.passenger@example.com',
            gender: 'Male',
            dob: '1994-05-12'
        };
    }

    /* ============================================================
       Data loading — real session records first, demo fallback.
       ============================================================ */
    function loadBookings() {
        var list = getJSON(KEY_HISTORY, null);
        return (list && Object.prototype.toString.call(list) === '[object Array]') ? list : demoBookings();
    }
    function loadNotifications() {
        var list = getJSON(KEY_NOTIF, null);
        return (list && Object.prototype.toString.call(list) === '[object Array]') ? list : demoNotifications();
    }
    function loadProfile() {
        var p = getJSON(KEY_PROFILE, null);
        return (p && typeof p === 'object') ? p : demoProfile();
    }
    function loadFavRoutes() {
        var list = getJSON(KEY_FAV_ROUTES, null);
        return (list && Object.prototype.toString.call(list) === '[object Array]') ? list : [];
    }
    function favCompanies() {
        return window.ETTransportFavorites ? window.ETTransportFavorites.get() : [];
    }

    /* ---------- Trip status (upcoming / completed / cancelled) ---------- */
    function bookingStatus(b) {
        if (b && b.status === 'cancelled') { return 'cancelled'; }
        if (b && b.status === 'completed') { return 'completed'; }
        if (b && b.date && b.date < isoToday()) { return 'completed'; }
        return 'upcoming';
    }

 /* ---------- cancellation eligibility ----------
       Mirror of the authoritative backend rules in handle_cancel():
       the passenger must own a REAL (database-backed) booking that is
       not already cancelled / completed and has not departed yet
       (departure_date not in the past). Demo/guest bookings are never
       eligible, so they can never call the real cancel API. */
    function canCancelBooking(b) {
        if (!b || !b.real || !b.id) { return false; }
        var s = b.status || '';
        if (s === 'cancelled' || s === 'completed') { return false; }
        if (b.date && b.date < isoToday()) { return false; }
        return true;
    }
    function statusBadge(b) {
        var s = bookingStatus(b);
        return '<span class="trip-status status-' + s + '">' + s + '</span>';
    }

 /* ---------- review eligibility + state ----------
       Mirrors the authoritative backend: only a REAL, COMPLETED (travelled)
       booking owned by the passenger is reviewable. Cancelled, pending,
       confirmed-but-not-completed and demo/guest bookings are never eligible,
       so they can never call the real review API. Whether a booking was already
       reviewed is tracked per logged-in user from the last successful submit
       (frontend UX only; the API still enforces duplicates with 409). */
    function isBookingReviewed(b) {
        if (!b || b.reviewed) { return !!b && !!b.reviewed; }
        var set = reviewedBookingIds();
        return (set && b.id && set.indexOf(String(b.id)) !== -1);
    }
    function canReviewBooking(b) {
        if (!b || !b.real || !b.id) { return false; }
        var s = b.status || '';
        if (s === 'cancelled') { return false; }
        if (s !== 'completed') { return false; }
        if (isBookingReviewed(b)) { return false; }
        return true;
    }
    /* A real, completed booking that has already been reviewed shows a
       "Reviewed" badge instead of a second submit action. */
    function hasReviewedBooking(b) {
        if (!b || !b.real || !b.id) { return false; }
        if ((b.status || '') !== 'completed') { return false; }
        return isBookingReviewed(b);
    }

    /* Reviewed booking ids per user, persisted so a refresh stays consistent.
       Tracks only UX state; the server remains authoritative. */
    var currentUserId = null;
    /* Real (MySQL) notifications for an authenticated passenger. When
       realNotifs is null the page is running in demo/guest mode and falls
       back to the session/demo notifications below. notifState tracks the
       async fetch so the panel can show loading/loaded/error states. */
    var realNotifs = null;
    var notifState = 'idle'; // idle | loading | loaded | error
    function reviewedStorage() {
        var obj = getJSON(KEY_REVIEWED, null);
        return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    }
    function reviewedUserKey() {
        return currentUserId ? ('user-' + currentUserId) : 'guest';
    }
    function reviewedBookingIds() {
        var store = reviewedStorage();
        return store[reviewedUserKey()] || [];
    }
    function markBookingReviewedLocally(b) {
        if (!b || !b.id) { return; }
        b.reviewed = true;
        var store = reviewedStorage();
        var arr = Array.isArray(store[reviewedUserKey()]) ? store[reviewedUserKey()].slice() : [];
        var id = String(b.id);
        if (arr.indexOf(id) === -1) { arr.push(id); }
        store[reviewedUserKey()] = arr;
        setJSON(KEY_REVIEWED, store);
    }

    /* ---------- Shared trip card (trips, tickets, recent bookings) ---------- */
    function tripCardHtml(b, opts) {
        opts = opts || {};
        var logo = companyLogoFor(b);
        var logoHtml = logo
            ? '<img class="trip-company-logo" src="' + escapeHtml(logo) + '" alt="' + escapeHtml(b.company) + ' logo">'
            : '<span class="trip-company-badge" aria-hidden="true">' + escapeHtml(String(b.company || 'B').charAt(0)) + '</span>';
        var actions = '';
        if (opts.showView !== false) {
            actions = '<div class="trip-card-actions">' +
                '<button type="button" class="btn btn-ticket-view" data-ref="' + escapeHtml(b.reference) + '">View Ticket</button>' +
                (opts.showDetails
                    ? '<a class="btn btn-trip-details" href="company.html?company=' + escapeHtml(companySlugFor(b)) + '">Trip Details</a>'
                    : '') +
                (canCancelBooking(b)
                    ? '<button type="button" class="btn btn-danger btn-cancel-booking btn-sm" data-ref="' + escapeHtml(b.reference) + '">Cancel Booking</button>'
                    : '') +
                (canReviewBooking(b)
                    ? '<button type="button" class="btn btn-review btn-write-review btn-sm" data-ref="' + escapeHtml(b.reference) + '">Write Review</button>'
                    : (hasReviewedBooking(b)
                        ? '<span class="reviewed-chip" data-ref="' + escapeHtml(b.reference) + '">Reviewed</span>'
                        : '')) +
                '</div>';
        }
        return '<article class="card trip-card trip-card-' + bookingStatus(b) + '">' +
            '<div class="trip-card-top">' +
                logoHtml +
                '<div class="trip-card-company"><h4>' + escapeHtml(b.company) + '</h4>' + statusBadge(b) + '</div>' +
            '</div>' +
            '<p class="trip-card-route">' + escapeHtml(b.from) + ' &rarr; ' + escapeHtml(b.to) + '</p>' +
            '<p class="trip-card-meta">' + escapeHtml(formatDate(b.date)) + ' &middot; ' +
                escapeHtml(b.depart || '') + ' &rarr; ' + escapeHtml(b.arrive || '') + '</p>' +
            '<dl class="trip-card-details">' +
                '<div><dt>Seat</dt><dd>' + escapeHtml(b.seatLabel || '\u2014') + '</dd></div>' +
                '<div><dt>Booking</dt><dd class="mono">' + escapeHtml(b.reference) + '</dd></div>' +
            '</dl>' +
            actions +
        '</article>';
    }

    /* ---------- Empty / polished fallback states ---------- */
    function emptyState(title, message, linkHtml) {
        return '<div class="dash-empty">' +
            '<p class="dash-empty-icon" aria-hidden="true">&#128652;</p>' +
            '<h3>' + escapeHtml(title) + '</h3>' +
            '<p>' + escapeHtml(message) + '</p>' +
            (linkHtml || '') +
            '</div>';
    }

    function sortByDateDesc(list) {
        return list.slice().sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
    }

    /* ============================================================
       Overview — next upcoming trip
       ============================================================ */
    function renderUpcoming() {
        var el = document.getElementById('dash-upcoming');
        if (!el) { return; }
        var bookings = loadBookings();
        var next = null;
        for (var i = 0; i < bookings.length; i++) {
            if (bookingStatus(bookings[i]) === 'upcoming') {
                if (!next || (bookings[i].date && bookings[i].date < (next.date || ''))) { next = bookings[i]; }
            }
        }
        if (!next) {
            el.innerHTML = emptyState(
                'No upcoming trips',
                'When you book a journey it will appear here as your next trip.',
                '<a class="btn btn-search" href="search.html">Search Buses</a>'
            );
            return;
        }
        el.innerHTML = '<div class="card dash-upcoming-card">' +
            '<div class="dash-upcoming-head">' +
                '<div>' +
                    '<p class="dash-eyebrow">Next Trip</p>' +
                    '<h3 class="dash-upcoming-company">' + escapeHtml(next.company) + '</h3>' +
                '</div>' +
                '<span class="trip-status status-upcoming">Upcoming</span>' +
            '</div>' +
            '<p class="trip-card-route">' + escapeHtml(next.from) + ' &rarr; ' + escapeHtml(next.to) + '</p>' +
            '<dl class="dash-upcoming-details">' +
                '<div><dt>Date</dt><dd>' + escapeHtml(formatDate(next.date)) + '</dd></div>' +
                '<div><dt>Departure</dt><dd>' + escapeHtml(next.depart || '') + '</dd></div>' +
                '<div><dt>Arrival</dt><dd>' + escapeHtml(next.arrive || '') + '</dd></div>' +
                '<div><dt>Seat</dt><dd>' + escapeHtml(next.seatLabel || '\u2014') + '</dd></div>' +
                '<div><dt>Booking</dt><dd class="mono">' + escapeHtml(next.reference) + '</dd></div>' +
                '<div><dt>Bus type</dt><dd>' + escapeHtml(next.busType || next.tripType || 'Standard') + '</dd></div>' +
            '</dl>' +
            '<div class="dash-upcoming-actions">' +
                '<button type="button" class="btn btn-primary btn-ticket-view" data-ref="' + escapeHtml(next.reference) + '">View Ticket</button>' +
                '<a class="btn btn-secondary" href="company.html?company=' + escapeHtml(companySlugFor(next)) + '">Trip Details</a>' +
            '</div>' +
        '</div>';
    }

    /* ============================================================
       Overview — summary stats
       ============================================================ */
    function renderStats() {
        var el = document.getElementById('dash-stats');
        if (!el) { return; }
        var bookings = loadBookings();
        var upcoming = 0, completed = 0, tickets = 0;
        for (var i = 0; i < bookings.length; i++) {
            var s = bookingStatus(bookings[i]);
            if (s === 'upcoming') { upcoming++; }
            if (s === 'completed') { completed++; }
            if (s !== 'cancelled') { tickets++; }
        }
        var favs = favCompanies().length + loadFavRoutes().length;
        el.innerHTML =
            '<div class="card dash-stat"><span class="dash-stat-label">Upcoming</span><strong class="dash-stat-value">' + upcoming + '</strong></div>' +
            '<div class="card dash-stat"><span class="dash-stat-label">Completed</span><strong class="dash-stat-value">' + completed + '</strong></div>' +
            '<div class="card dash-stat"><span class="dash-stat-label">Favorites</span><strong class="dash-stat-value">' + favs + '</strong></div>' +
            '<div class="card dash-stat"><span class="dash-stat-label">Tickets</span><strong class="dash-stat-value">' + tickets + '</strong></div>';
    }

    /* ============================================================
       Overview — recent bookings
       ============================================================ */
    function renderRecentBookings() {
        var el = document.getElementById('dash-recent-bookings');
        if (!el) { return; }
        var recent = sortByDateDesc(loadBookings()).slice(0, 4);
        if (!recent.length) {
            el.innerHTML = emptyState('No bookings yet', 'Your booking history will appear here.');
            return;
        }
        var html = '<div class="card dash-table">' +
            '<div class="dash-table-row dash-table-head" aria-hidden="true">' +
                '<span>Booking</span><span>Route</span><span>Status</span><span>Ticket</span>' +
            '</div>';
        for (var i = 0; i < recent.length; i++) {
            var b = recent[i];
            html += '<div class="dash-table-row">' +
                '<span class="mono">' + escapeHtml(b.reference) + '</span>' +
                '<span class="dash-table-route">' + escapeHtml(b.from) + ' &rarr; ' + escapeHtml(b.to) + '</span>' +
                '<span class="trip-status status-' + bookingStatus(b) + '">' + bookingStatus(b) + '</span>' +
                '<button type="button" class="btn btn-ticket-view btn-xs" data-ref="' + escapeHtml(b.reference) + '">View Ticket</button>' +
            '</div>';
        }
        el.innerHTML = html + '</div>';
    }

    /* ============================================================
       Overview — favorite companies (compact chips)
       ============================================================ */
    function overviewFavHtml() {
        var slugs = favCompanies();
        if (!slugs.length) {
            return '<div class="card dash-mini dash-mini-empty">' +
                '<p>No favorite companies yet.</p>' +
                '<a href="companies.html" class="btn btn-secondary btn-sm">Explore Companies</a>' +
            '</div>';
        }
        var html = '<div class="dash-mini-list">';
        for (var i = 0; i < slugs.length; i++) {
            var c = companyBySlug(slugs[i]);
            var name = c ? c.name : slugs[i];
            html += '<a class="dash-mini-chip" href="company.html?company=' + escapeHtml(slugs[i]) + '">' +
                '<span aria-hidden="true">&#128652;</span> ' + escapeHtml(name) + '</a>';
        }
        return html + '</div>';
    }

    function renderOverviewFav() {
        var el = document.getElementById('dash-overview-fav');
        if (el) { el.innerHTML = overviewFavHtml(); }
    }

    /* ============================================================
       Overview — recent notifications (compact list)
       ============================================================ */
    function renderOverviewNotif() {
        var el = document.getElementById('dash-overview-notif');
        if (!el) { return; }
        if (notifState === 'loading') {
            el.innerHTML = '<div class="card dash-mini dash-mini-empty"><p>Loading&hellip;</p></div>';
            return;
        }
        if (notifState === 'error') {
            el.innerHTML = '<div class="card dash-mini dash-mini-empty"><p>Notifications are unavailable right now.</p></div>';
            return;
        }
        var list = effectiveNotifications().slice(0, 3);
        if (!list.length) {
            el.innerHTML = '<div class="card dash-mini dash-mini-empty"><p>You have no notifications.</p></div>';
            return;
        }
        var html = '<ul class="dash-notif-mini">';
        for (var i = 0; i < list.length; i++) {
            var n = list[i];
            html += '<li class="' + (n.read ? 'is-read' : 'is-unread') + '">' +
                '<span class="dash-notif-icon" aria-hidden="true">' + (n.icon || '&#128276;') + '</span>' +
                '<span class="dash-notif-text"><strong>' + escapeHtml(n.title) + '</strong>' +
                '<span class="dash-notif-time">' + escapeHtml(n.time || '') + '</span></span>' +
            '</li>';
        }
        el.innerHTML = html + '</ul>';
    }

    /* ============================================================
       My Trips — tabbed upcoming / completed / cancelled
       ============================================================ */
    var tripTab = 'upcoming';

 /* ---------- booking history search (client-side) ----------
       All authorized bookings are already loaded (api/booking.php?action=list
       enriched into KEY_HISTORY, server-scoped to this passenger), so filtering
       is a fast, DB-backed client operation — no per-keystroke API calls.
       Search is case-insensitive over reference / origin / destination /
       company, and always stays within the passenger's own records. */
    var tripsSearch = '';      // My Trips  section search term
    var ticketsSearch = '';    // Tickets  section search term
    var searchTimer = null;
 /* active backend search results per section.
       null = no backend search in effect (use the full client-side list);
       an empty array = a real search matched nothing. */
    var tripsSearchResults = null;
    var ticketsSearchResults = null;
    var tripsSort = 'newest';        // My Trips active server-side sort key (whitelist)

 /* ---------- real passenger My Trips pagination ----------
       A compact, paginated "Load more" pager for the authenticated passenger's
       own bookings. It is intentionally separate from KEY_HISTORY (which keeps
       the full dataset that feeds stats / tickets / upcoming / recent). Guests &
       demo mode never enable the pager and keep the existing client-side list;
       only a real passenger with a valid session may fetch the paginated backend
       endpoint. */
        var tripsPager = {
        active: false,     // a real passenger session is governing My Trips
        searching: false,  // currently inside a backend search (offset drives search)
        q: '',             // active query ('' = plain list)
        status: 'upcoming',// active status tab requested from the backend (whitelist)
        offset: 0,         // next page offset to request
        limit: 20,         // page size (matches the backend default)
        hasMore: false,
        total: 0,
        items: []          // loaded, de-duplicated dash-shaped trip records
    };
    var tripsPagerLoading = false;   // guards against duplicate concurrent requests
    var tripsRequestId = 0;          // discards responses from superseded page requests
    var tripsRefreshQueued = false;  // a reload was queued while a request was still in flight

    function matchesBookingSearch(b, term) {
        if (!term) { return true; }
        var hay = [b.reference, b.from, b.to, b.company].join(' ').toLowerCase();
        return hay.indexOf(term) !== -1;
    }

    /* The paginated pager is authoritative only while a real passenger's synced
       dataset is actually present in storage. If the session was cleared (e.g. a
       guest after logout) we fall back to the normal list / demo data instead of
       showing a stale snapshot of a previous logged-in page. */
    function tripsPagerIsLive() {
        return tripsPager.active && getJSON(KEY_HISTORY, null) !== null;
    }

    function renderTrips() {
        var el = document.getElementById('trips-content');
        if (!el) { return; }
        var bookings;
        if (tripsPagerIsLive()) {
            bookings = tripsPager.items;
        } else {
            /* Guest / demo, or a restored page whose real session no longer has
               a synced dataset: revert any stale pager and use the normal list. */
            if (tripsPager.active) { tripsPager.active = false; }
            bookings = (tripsSearchResults !== null) ? tripsSearchResults : loadBookings();
        }
        var term = (tripsSearch || '').trim().toLowerCase();
        var shown = [];
        for (var i = 0; i < bookings.length; i++) {
            var b = bookings[i];
            if (!b) { continue; }
            /* 'all' shows every status; other tabs keep the existing filter. */
            if (tripTab !== 'all' && bookingStatus(b) !== tripTab) { continue; }
            if (term && !matchesBookingSearch(b, term)) { continue; }
            shown.push(b);
        }
        /* When a real backend pager governs My Trips, the server already orders
           the rows (default newest-first, or the selected server-side sort).
           Do NOT re-sort here or the chosen backend sort would be invisible.
           Guest / demo mode keeps the legacy client-side date sort. */
        if (!tripsPagerIsLive()) { shown = sortByDateDesc(shown); }
        if (!shown.length) {
            var msg;
            if (term) {
                msg = ['No bookings found',
                    'No bookings match &ldquo;' + escapeHtml(tripsSearch.trim()) +
                    '&rdquo;. Try a different booking reference, route or company.'];
            } else {
                msg = {
                    upcoming: ['No upcoming trips', 'Search for a bus and your next journey will appear here.'],
                    all: ['No bookings yet', 'When you book a journey it will appear here.'],
                    completed: ['No completed trips yet', 'Trips you have taken will be listed here.'],
                    cancelled: ['No cancelled trips', 'Cancelled bookings will appear here if you cancel one.']
                }[tripTab];
            }
            el.innerHTML = emptyState(msg[0], msg[1],
                (!term && tripTab === 'upcoming') ? '<a class="btn btn-search" href="search.html">Search Buses</a>' : '');
            setTripsPagerUi();
            return;
        }
        var html = '';
        for (var j = 0; j < shown.length; j++) {
            html += tripCardHtml(shown[j], { showDetails: false });
        }
        el.innerHTML = html;
        setTripsPagerUi();
    }

    /* ============================================================
       Tickets — one card per non-cancelled booking (searchable)
       ============================================================ */
    function renderTickets() {
        var el = document.getElementById('tickets-list');
        if (!el) { return; }
        var bookings = (ticketsSearchResults !== null) ? ticketsSearchResults : loadBookings();
        var term = (ticketsSearch || '').trim().toLowerCase();
        var withTickets = [];
        for (var i = 0; i < bookings.length; i++) {
            var b = bookings[i];
            if (!b) { continue; }
            if (bookingStatus(b) === 'cancelled') { continue; }
            if (term && !matchesBookingSearch(b, term)) { continue; }
            withTickets.push(b);
        }
        withTickets = sortByDateDesc(withTickets);
        if (!withTickets.length) {
            if (term) {
                el.innerHTML = emptyState('No tickets found',
                    'No tickets match &ldquo;' + escapeHtml(ticketsSearch.trim()) +
                    '&rdquo;. Try a different booking reference, route or company.');
                return;
            }
            el.innerHTML = emptyState('No tickets yet', 'Completed bookings and upcoming trips both get a digital ticket.',
                '<a class="btn btn-search" href="search.html">Search Buses</a>');
            return;
        }
        var html = '';
        for (var j = 0; j < withTickets.length; j++) {
            html += tripCardHtml(withTickets[j], { showDetails: true });
        }
        el.innerHTML = html;
    }

    /* ============================================================
       Digital ticket modal (reuses the ticket language)
       ============================================================ */
    var ticketModal = document.getElementById('ticket-modal');
    var currentTicket = null;

    function bookingByRef(ref) {
        var list = loadBookings();
        for (var i = 0; i < list.length; i++) {
            if (list[i].reference === ref) { return list[i]; }
        }
        return null;
    }

    /* Demo QR — a deterministic pattern seeded from the booking
       reference. NOT a real scannable QR and NOT verified anywhere. */
    function drawQR(canvas, seed) {
        var ctx = canvas.getContext('2d');
        var size = 25;
        var px = canvas.width / size;
        function hash(s) {
            var h = 5381;
            for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
            return h >>> 0;
        }
        var rndState = hash(seed || 'ET');
        function rnd() {
            rndState = (rndState * 1664525 + 1013904223) >>> 0;
            return rndState / 4294967296;
        }
        function inFinder(x, y) {
            return (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
        }
        function drawFinder(ox, oy) {
            ctx.fillStyle = '#111827';
            ctx.fillRect(ox * px, oy * px, 7 * px, 7 * px);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect((ox + 1) * px, (oy + 1) * px, 5 * px, 5 * px);
            ctx.fillStyle = '#111827';
            ctx.fillRect((ox + 2) * px, (oy + 2) * px, 3 * px, 3 * px);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#111827';
        for (var y = 0; y < size; y++) {
            for (var x = 0; x < size; x++) {
                if (inFinder(x, y)) { continue; }
                if (rnd() < 0.5) { ctx.fillRect(x * px, y * px, px, px); }
            }
        }
        drawFinder(0, 0);
        drawFinder(size - 7, 0);
        drawFinder(0, size - 7);
    }

    function openTicket(reference) {
        var b = bookingByRef(reference);
        if (!b || !ticketModal) { return; }
        currentTicket = b;
        var s = bookingStatus(b);

        document.getElementById('dt-ref').textContent = b.reference;
        document.getElementById('dt-ref2').textContent = b.reference;
        document.getElementById('dt-departure-city').textContent = b.from;
        document.getElementById('dt-depart-time').textContent = b.depart || '';
        document.getElementById('dt-arrival-city').textContent = b.to;
        document.getElementById('dt-arrival-time').textContent = b.arrive || '';
        document.getElementById('dt-duration').textContent = formatDuration(b.minutes);
        document.getElementById('dt-passengers').textContent =
            (Array.isArray(b.passengerNames) && b.passengerNames.length ? b.passengerNames : ['Passenger ' + (b.passengerCount || 1)]).join(', ');
        document.getElementById('dt-company').textContent = b.company;
        document.getElementById('dt-date').textContent = formatDate(b.date);
        document.getElementById('dt-depart').textContent = b.depart || '';
        document.getElementById('dt-arrive').textContent = b.arrive || '';
        document.getElementById('dt-seats').textContent = b.seatLabel || (Array.isArray(b.seats) ? b.seats.join(', ') : '');
        document.getElementById('dt-type').textContent = b.busType || b.tripType || 'Standard';
        document.getElementById('dt-total').textContent = formatPrice(b.total);

        var statusEl = document.getElementById('dt-status');
        if (statusEl) {
            statusEl.className = 'ticket-status status-' + s;
            statusEl.textContent = 'Ticket status: ' + s;
            statusEl.hidden = false;
        }

 /* offer cancellation only for real, eligible bookings. */
        var cancelBtn = document.getElementById('dt-cancel-btn');
        if (cancelBtn) { cancelBtn.hidden = !canCancelBooking(b); }

        var qr = document.getElementById('dt-qr');
        if (qr && qr.getContext) { drawQR(qr, b.reference); }

        if (shareMsg) { shareMsg.hidden = true; }
        ticketModal.hidden = false;
        document.body.classList.add('modal-open');
        document.getElementById('ticket-modal-close').focus();
    }

function closeTicket() {
        if (!ticketModal) { return; }
        ticketModal.hidden = true;
        document.body.classList.remove('modal-open');
        currentTicket = null;
    }

    var shareMsg = document.getElementById('dt-share-msg');

    function showShare(message) {
        if (!shareMsg) { return; }
        shareMsg.textContent = message;
        shareMsg.hidden = false;
    }

    var dtPrintBtn = document.getElementById('dt-print-btn');
    if (dtPrintBtn) {
        dtPrintBtn.addEventListener('click', function () {
            if (!currentTicket) { return; }
            document.body.classList.add('printing-ticket');
            window.print();
        });
    }
    window.addEventListener('afterprint', function () {
        document.body.classList.remove('printing-ticket');
    });

    var dtShareBtn = document.getElementById('dt-share-btn');
    if (dtShareBtn) {
        dtShareBtn.addEventListener('click', function () {
            if (!currentTicket) { return; }
            var b = currentTicket;
            var text = 'ET Transport booking ' + b.reference + ': ' + b.from +
                ' \u2192 ' + b.to + ', ' + formatDate(b.date) + ' at ' + b.depart +
                '. Total ' + formatPrice(b.total) + '.';
            if (navigator.share) {
                navigator.share({ title: 'ET Transport Ticket', text: text })
                    .then(function () { showShare(''); })
                    .catch(function () { showShare(''); });
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(function () { showShare('Booking details copied to clipboard.'); })
                    .catch(function () { showShare(text); });
            } else {
                showShare(text);
            }
        });
    }

    /* ============================================================
 booking cancellation (real, database-backed)
       ============================================================ */
    var cancelModal = document.getElementById('cancel-modal');
    var cancelBookingRef = null;

    function openCancelModal(ref) {
        var b = bookingByRef(ref);
        if (!b || !canCancelBooking(b) || !cancelModal) { return; }
        cancelBookingRef = ref;
        document.getElementById('cancel-ref').textContent = b.reference;
        document.getElementById('cancel-route').textContent = b.from + ' \u2192 ' + b.to;
        document.getElementById('cancel-date').textContent = formatDate(b.date);
        document.getElementById('cancel-seats').textContent =
            b.seatLabel || (Array.isArray(b.seats) ? b.seats.join(', ') : '1');
        var keep = document.getElementById('cancel-keep-btn');
        var cf = document.getElementById('cancel-confirm-btn');
        var msg = document.getElementById('cancel-msg');
        if (keep) { keep.disabled = false; }
        if (cf) { cf.disabled = false; cf.textContent = 'Yes, cancel booking'; }
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cancel-msg'; }
        cancelModal.hidden = false;
        document.body.classList.add('modal-open');
        if (keep) { keep.focus(); }
    }

    function closeCancelModal() {
        if (!cancelModal) { return; }
        cancelModal.hidden = true;
        var tm = document.getElementById('ticket-modal');
        var ticketOpen = !!tm && !tm.hidden;
        if (!ticketOpen) { document.body.classList.remove('modal-open'); }
        cancelBookingRef = null;
    }

    /* POST { id } to api/booking.php?action=cancel using the existing
       same-origin session. Ownership is enforced server-side, never here. */
    function cancelApiPost(id) {
        var body = new FormData();
        body.append('id', id);
        return window.fetch('api/booking.php?action=cancel', {
            method: 'POST',
            credentials: 'same-origin',
            body: body,
            headers: { 'Accept': 'application/json' }
        }).then(function (res) {
            return res.json().catch(function () {
                return { success: false, message: 'Invalid server response.' };
            }).then(function (json) {
                return { ok: res.ok, status: res.status, data: json };
            });
        });
    }

    var toastTimer = null;
    function toast(message) {
        var t = document.getElementById('dash-toast');
        if (!t) {
            try { window.alert(message); } catch (e) { /* no toast target */ }
            return;
        }
        t.textContent = message;
        t.hidden = false;
        t.className = 'dash-toast show';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            t.className = 'dash-toast';
            t.hidden = true;
        }, 4000);
    }

    function markBookingCancelledLocally(ref) {
        var list = loadBookings();
        var changed = false;
        for (var i = 0; i < list.length; i++) {
            if (list[i].reference === ref) { list[i].status = 'cancelled'; changed = true; }
        }
        if (changed) { setJSON(KEY_HISTORY, list); }

 /* keep any active backend search results in sync so
           a cancelled booking never lingers as active inside a search view. */
        [tripsSearchResults, ticketsSearchResults].forEach(function (results) {
            if (!Array.isArray(results)) { return; }
            for (var j = 0; j < results.length; j++) {
                if (results[j] && results[j].reference === ref) { results[j].status = 'cancelled'; }
            }
        });
    }

    function rerenderAll() {
        renderUpcoming();
        renderStats();
        renderRecentBookings();
        renderTrips();
        renderTickets();
        updateCounts();
    }

    var dtCancelBtn = document.getElementById('dt-cancel-btn');
    if (dtCancelBtn) {
        dtCancelBtn.addEventListener('click', function () {
            if (currentTicket) { openCancelModal(currentTicket.reference); }
        });
    }
    var cancelKeepBtn = document.getElementById('cancel-keep-btn');
    if (cancelKeepBtn) { cancelKeepBtn.addEventListener('click', closeCancelModal); }
    var cancelCloseBtn = document.getElementById('cancel-modal-close');
    if (cancelCloseBtn) { cancelCloseBtn.addEventListener('click', closeCancelModal); }
    var cancelBackdrop = document.querySelector('[data-cancel-close]');
    if (cancelBackdrop) { cancelBackdrop.addEventListener('click', closeCancelModal); }
    var cancelConfirmBtn = document.getElementById('cancel-confirm-btn');
    if (cancelConfirmBtn) {
        cancelConfirmBtn.addEventListener('click', function () {
            var b = bookingByRef(cancelBookingRef);
            if (!b || !canCancelBooking(b) || !b.id) { closeCancelModal(); return; }

            var msg = document.getElementById('cancel-msg');
            var keep = document.getElementById('cancel-keep-btn');
            var cf = document.getElementById('cancel-confirm-btn');

            /* Lock the dialog (no duplicate clicks / double POST). */
            if (cf) { cf.disabled = true; cf.textContent = 'Cancelling...'; }
            if (keep) { keep.disabled = true; }
            if (msg) { msg.className = 'cancel-msg'; msg.hidden = true; msg.textContent = ''; }

            cancelApiPost(b.id).then(function (result) {
                var json = result && result.data ? result.data : null;
                if (result && result.ok && json && json.success) {
                    markBookingCancelledLocally(cancelBookingRef);
                    closeTicket();
                    closeCancelModal();
                    toast('Your booking ' + b.reference + ' was cancelled. Its seats have been released.');
                    rerenderAll();
                    syncRealBookings();
 /* make the global bell reflect the new
                       cancellation notification without a full page reload. */
                    if (window.ETNotifications && window.ETNotifications.refresh) {
                        window.ETNotifications.refresh();
                    }
                } else {
                    /* Never pretend a failed request succeeded — surface the
                       backend message and re-enable the actions. */
                    var why = (json && json.message) ? json.message
                        : 'Unable to cancel the booking. Please try again.';
                    if (msg) {
                        msg.textContent = why;
                        msg.className = 'cancel-msg error';
                        msg.hidden = false;
                    } else { toast(why); }
                    if (cf) { cf.disabled = false; cf.textContent = 'Yes, cancel booking'; }
                    if (keep) { keep.disabled = false; }
                }
            }).catch(function () {
                if (msg) {
                    msg.textContent = 'Network error — please try again.';
                    msg.className = 'cancel-msg error';
                    msg.hidden = false;
                }
                if (cf) { cf.disabled = false; cf.textContent = 'Yes, cancel booking'; }
                if (keep) { keep.disabled = false; }
            });
        });
    }

/* ============================================================
 passenger review form (real API)
       ============================================================ */
    var reviewModal = document.getElementById('review-modal');
    var reviewBookingRef = null;
    var currentRating = 0;

    function openReviewModal(ref) {
        var b = bookingByRef(ref);
        if (!b || !canReviewBooking(b) || !reviewModal) { return; }
        reviewBookingRef = ref;
        currentRating = 0;

        var title = document.getElementById('review-company');
        if (title) { title.textContent = b.company || 'your trip'; }
        var route = document.getElementById('review-route');
        if (route) { route.textContent = b.from + ' \u2192 ' + b.to; }
        var dateEl = document.getElementById('review-date');
        if (dateEl) { dateEl.textContent = formatDate(b.date); }

        buildStarRow(0);
        var comment = document.getElementById('review-comment');
        if (comment) { comment.value = ''; }
        var msg = document.getElementById('review-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'review-msg'; }
        var submit = document.getElementById('review-submit-btn');
        if (submit) { submit.disabled = false; submit.textContent = 'Submit Review'; }

        reviewModal.hidden = false;
        document.body.classList.add('modal-open');
    }

    function closeReviewModal() {
        if (!reviewModal) { return; }
        reviewModal.hidden = true;
        var tm = document.getElementById('ticket-modal');
        var ticketOpen = !!tm && !tm.hidden;
        var cm = document.getElementById('cancel-modal');
        var cancelOpen = !!cm && !cm.hidden;
        if (!ticketOpen && !cancelOpen) { document.body.classList.remove('modal-open'); }
        reviewBookingRef = null;
        currentRating = 0;
    }

    function buildStarRow(rate) {
        var box = document.getElementById('review-stars');
        if (!box) { return; }
        currentRating = rate;
        var html = '';
        for (var s = 1; s <= 5; s++) {
            html += '<button type="button" class="review-star' + (s <= rate ? ' is-on' : '') +
                '" data-value="' + s + '" aria-label="' + s + ' star" aria-pressed="' + (s <= rate) + '">\u2605</button>';
        }
        html += '<span class="review-star-label" id="review-star-label"></span>';
        box.innerHTML = html;
        var label = document.getElementById('review-star-label');
        if (label) { label.textContent = rate > 0 ? (rate + ' / 5') : 'Tap to rate'; }
    }

    /* POST { booking_id, rating, comment } to api/review.php?action=create
       using the existing same-origin session. Server is authoritative. */
    function reviewApiPost(bookingId, rating, comment) {
        var body = new FormData();
        body.append('booking_id', bookingId);
        body.append('rating', rating);
        if (comment) { body.append('comment', comment); }
        return window.fetch('api/review.php?action=create', {
            method: 'POST',
            credentials: 'same-origin',
            body: body,
            headers: { 'Accept': 'application/json' }
        }).then(function (res) {
            return res.json().catch(function () {
                return { success: false, message: 'Invalid server response.' };
            }).then(function (json) {
                return { ok: res.ok, status: res.status, data: json };
            });
        });
    }

    var reviewStarsBox = document.getElementById('review-stars');
    if (reviewStarsBox) {
        reviewStarsBox.addEventListener('click', function (event) {
            var star = event.target.closest ? event.target.closest('.review-star') : null;
            if (!star) { return; }
            buildStarRow(parseInt(star.getAttribute('data-value'), 10) || 0);
        });
    }

    var reviewComment = document.getElementById('review-comment');
    if (reviewComment) {
        reviewComment.addEventListener('input', function () {
            var msg = document.getElementById('review-msg');
            if (msg && msg.className.indexOf('error') !== -1) { msg.hidden = true; }
        });
    }

    var reviewCloseBtn = document.getElementById('review-modal-close');
    if (reviewCloseBtn) { reviewCloseBtn.addEventListener('click', closeReviewModal); }
    var reviewCancelBtn = document.getElementById('review-cancel-btn');
    if (reviewCancelBtn) { reviewCancelBtn.addEventListener('click', closeReviewModal); }
    var reviewBackdrop = document.querySelector('[data-review-close]');
    if (reviewBackdrop) { reviewBackdrop.addEventListener('click', closeReviewModal); }

    var reviewSubmitBtn = document.getElementById('review-submit-btn');
    if (reviewSubmitBtn) {
        reviewSubmitBtn.addEventListener('click', function () {
            var b = bookingByRef(reviewBookingRef);
            if (!b || !canReviewBooking(b) || !b.id) { closeReviewModal(); return; }

            var msg = document.getElementById('review-msg');
            var submit = document.getElementById('review-submit-btn');

            if (currentRating < 1 || currentRating > 5) {
                if (msg) { msg.textContent = 'Please select a rating from 1 to 5 stars.'; msg.className = 'review-msg error'; msg.hidden = false; }
                return;
            }
            var comment = (document.getElementById('review-comment') || {}).value || '';
            if (comment.length > 1000) {
                if (msg) { msg.textContent = 'Your comment is too long (max 1000 characters).'; msg.className = 'review-msg error'; msg.hidden = false; }
                return;
            }

            if (submit) { submit.disabled = true; submit.textContent = 'Submitting...'; }
            if (msg) { msg.className = 'review-msg'; msg.hidden = true; msg.textContent = ''; }

            reviewApiPost(b.id, currentRating, comment).then(function (result) {
                var json = result && result.data ? result.data : null;
                if (result && result.ok && json && json.success) {
                    markBookingReviewedLocally(b);
                    closeReviewModal();
                    toast('Your review was submitted for ' + (b.company || 'this trip') + '.');
                    rerenderAll();
 /* reflect the new review notification in
                       the global bell without a page reload. */
                    if (window.ETNotifications && window.ETNotifications.refresh) {
                        window.ETNotifications.refresh();
                    }
                } else if (result && result.status === 409) {
                    markBookingReviewedLocally(b);
                    closeReviewModal();
                    toast((json && json.message) || 'You have already reviewed this booking.');
                    rerenderAll();
                } else {
                    var why = (json && json.message) ? json.message : 'Unable to submit your review. Please try again.';
                    if (msg) { msg.textContent = why; msg.className = 'review-msg error'; msg.hidden = false; }
                    if (submit) { submit.disabled = false; submit.textContent = 'Submit Review'; }
                }
            }).catch(function () {
                if (msg) { msg.textContent = 'Network error — please try again.'; msg.className = 'review-msg error'; msg.hidden = false; }
                if (submit) { submit.disabled = false; submit.textContent = 'Submit Review'; }
            });
        });
    }

/* ============================================================
       Favorites — companies (synced with company.html) + routes
       ============================================================ */
    var CITIES = ['Addis Ababa', 'Adama', 'Arba Minch', 'Bahir Dar', 'Dessie', 'Dire Dawa',
        'Gondar', 'Hawassa', 'Jimma', 'Mekelle', 'Shashamane', 'Wolkite'];

    function renderFavoriteCompanies() {
        var el = document.getElementById('fav-companies');
        if (!el) { return; }
        var slugs = favCompanies();
        if (!slugs.length) {
            el.innerHTML = '<div class="card dash-fav-empty">' +
                '<p>No favorite companies yet. Star a company on its profile page and it will appear here.</p>' +
                '<a href="companies.html" class="btn btn-secondary btn-sm">Browse Companies</a>' +
            '</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < slugs.length; i++) {
            var c = companyBySlug(slugs[i]);
            var name = c ? c.name : slugs[i];
            var logo = c && c.logo ? c.logo : '';
            html += '<div class="card dash-fav-company">' +
                (logo ? '<img class="dash-fav-logo" src="' + escapeHtml(logo) + '" alt="' + escapeHtml(name) + ' logo">' : '') +
                '<div class="dash-fav-info">' +
                    '<h4>' + escapeHtml(name) + '</h4>' +
                    '<p class="dash-fav-rating">' + (c ? (c.rating.toFixed(1) + ' \u2605') : 'Bus company') + '</p>' +
                '</div>' +
                '<a class="btn btn-secondary btn-sm" href="company.html?company=' + escapeHtml(slugs[i]) + '">View</a>' +
                '<button type="button" class="btn btn-remove-fav btn-sm" data-fav-slug="' + escapeHtml(slugs[i]) + '" aria-label="Remove ' + escapeHtml(name) + ' from favorites">&#10005; Remove</button>' +
            '</div>';
        }
        el.innerHTML = html;
    }

    function renderFavRoutes() {
        var el = document.getElementById('fav-routes');
        if (!el) { return; }
        var routes = loadFavRoutes();
        if (!routes.length) {
            el.innerHTML = '<div class="card dash-fav-empty"><p>No favorite routes yet. Save a route below for one-click searches.</p></div>';
            return;
        }
        var html = '<ul class="dash-route-list">';
        for (var i = 0; i < routes.length; i++) {
            var r = routes[i];
            html += '<li class="card dash-route-chip">' +
                '<a href="search.html?from=' + encodeURIComponent(r.from) + '&amp;to=' + encodeURIComponent(r.to) + '">' +
                escapeHtml(r.from) + ' &rarr; ' + escapeHtml(r.to) + '</a>' +
                '<button type="button" class="btn btn-remove-fav btn-xs" data-route-fav="' + i +
                '" aria-label="Remove route from favorites">&#10005;</button>' +
            '</li>';
        }
        el.innerHTML = html + '</ul>';
    }

    function renderFavorites() {
        renderFavoriteCompanies();
        renderFavRoutes();
    }

    function toggleFavCompany(slug) {
        if (window.ETTransportFavorites) { window.ETTransportFavorites.toggle(slug); }
        renderFavorites();
        renderOverviewFav();
        renderStats();
        updateCounts();
    }

    function removeFavRoute(index) {
        var routes = loadFavRoutes();
        if (index >= 0 && index < routes.length) { routes.splice(index, 1); setJSON(KEY_FAV_ROUTES, routes); }
        renderFavorites();
        renderOverviewFav();
        renderStats();
        updateCounts();
    }

    function populateCitySelect() {
        var fromEl = document.getElementById('fav-from');
        var toEl = document.getElementById('fav-to');
        if (!fromEl || !toEl) { return; }
        var html = '';
        for (var i = 0; i < CITIES.length; i++) {
            html += '<option value="' + escapeHtml(CITIES[i]) + '">' + escapeHtml(CITIES[i]) + '</option>';
        }
        fromEl.innerHTML = html;
        toEl.innerHTML = html;
        toEl.value = CITIES[2] || CITIES[1] || '';
    }
    /* ============================================================
       Notifications — real (MySQL) for authenticated passengers,
       mock session list for guests/demo.
       ============================================================ */
    function effectiveNotifications() {
        return realNotifs !== null ? realNotifs : loadNotifications();
    }

    function unreadCount() {
        var list = effectiveNotifications();
        var n = 0;
        for (var i = 0; i < list.length; i++) { if (!list[i].read) { n++; } }
        return n;
    }

    function saveNotifications(list) { setJSON(KEY_NOTIF, list); }

    function notifIconFor(type) {
        type = String(type || '').toLowerCase();
        if (type === 'booking') { return '&#128652;'; }
        if (type === 'payment') { return '&#128176;'; }
        if (type === 'review')  { return '&#11088;'; }
        if (type === 'cancellation') { return '&#10060;'; }
        return '&#128276;';
    }

    function formatNotifTime(createdAt) {
        if (!createdAt) { return ''; }
        var d = new Date(String(createdAt).replace(' ', 'T'));
        if (isNaN(d.getTime())) { return String(createdAt); }
        var now = new Date();
        var diffMin = Math.floor((now - d) / 60000);
        if (diffMin < 1) { return 'Just now'; }
        if (diffMin < 60) { return Math.floor(diffMin) + 'm ago'; }
        var timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === now.toDateString()) { return 'Today, ' + timeStr; }
        var yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) { return 'Yesterday, ' + timeStr; }
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + timeStr;
    }

    /* Map one real notification row to the internal dashboard shape. */
    function apiNotifToDash(n) {
        return {
            id: String(n.id),
            title: n.title || '',
            message: n.message || '',
            type: n.type || 'general',
            read: !!n.read,
            time: formatNotifTime(n.created_at),
            icon: notifIconFor(n.type)
        };
    }

    function renderNotifications() {
        var el = document.getElementById('notifications-list');
        if (!el) { return; }
        if (notifState === 'loading') {
            el.innerHTML = '<div class="dash-empty">' +
                '<p class="dash-empty-icon" aria-hidden="true">&#9203;</p>' +
                '<h3>Loading notifications</h3><p>Please wait&hellip;</p></div>';
            return;
        }
        if (notifState === 'error') {
            el.innerHTML = '<div class="dash-empty">' +
                '<p class="dash-empty-icon" aria-hidden="true">&#9888;</p>' +
                '<h3>Could not load notifications</h3><p>Please try again later.</p></div>';
            return;
        }
        var list = effectiveNotifications();
        if (!list.length) {
            el.innerHTML = '<div class="dash-empty">' +
                '<p class="dash-empty-icon" aria-hidden="true">&#128276;</p>' +
                '<h3>No notifications</h3><p>Booking updates will appear here.</p></div>';
            return;
        }
        var html = '<ul class="dash-notif-list">';
        for (var i = 0; i < list.length; i++) {
            var n = list[i];
            html += '<li>' +
                '<button type="button" class="dash-notif-item ' + (n.read ? 'is-read' : 'is-unread') +
                '" data-notif-id="' + escapeHtml(n.id) + '">' +
                    '<span class="dash-notif-icon" aria-hidden="true">' + (n.icon || '&#128276;') + '</span>' +
                    '<span class="dash-notif-body">' +
                        '<strong>' + escapeHtml(n.title) + '</strong>' +
                        '<span class="dash-notif-message">' + escapeHtml(n.message) + '</span>' +
                        '<span class="dash-notif-time">' + escapeHtml(n.time || '') + '</span>' +
                    '</span>' +
                    '<span class="dash-notif-dot" aria-hidden="true"></span>' +
                '</button>' +
            '</li>';
        }
        el.innerHTML = html + '</ul>';
    }

    /* Mark one real notification read through the API (authoritative DB),
       optimistically updating the UI, then reverting from the server on error. */
    function markRealOne(id) {
        if (realNotifs) {
            for (var i = 0; i < realNotifs.length; i++) {
                if (String(realNotifs[i].id) === String(id)) { realNotifs[i].read = true; break; }
            }
        }
        renderNotifications();
        renderOverviewNotif();
        updateCounts();
        if (window.fetch) {
            var body = new URLSearchParams();
            body.append('id', String(id));
            window.fetch('api/notification.php?action=read', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            }).then(function (res) { return res.json().catch(function () { return null; }); })
            .then(function (json) {
                if (!json || !json.success) { syncRealNotifications(); }
            })
            .catch(function () { syncRealNotifications(); });
        }
    }

    /* Mark every real notification read through the API. */
    function markRealAll() {
        if (realNotifs) {
            for (var i = 0; i < realNotifs.length; i++) { realNotifs[i].read = true; }
        }
        renderNotifications();
        renderOverviewNotif();
        updateCounts();
        if (window.fetch) {
            window.fetch('api/notification.php?action=read_all', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
            }).then(function (res) { return res.json().catch(function () { return null; }); })
            .then(function (json) {
                if (!json || !json.success) { syncRealNotifications(); }
            })
            .catch(function () { syncRealNotifications(); });
        }
    }

    function toggleNotifRead(id) {
        if (realNotifs !== null) { markRealOne(id); return; }
        // Demo / guest path: keep the existing sessionStorage behaviour.
        var list = loadNotifications();
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { list[i].read = true; break; }
        }
        saveNotifications(list);
        renderNotifications();
        renderOverviewNotif();
        updateCounts();
    }

    function markAllRead() {
        if (realNotifs !== null) { markRealAll(); return; }
        var list = loadNotifications();
        for (var i = 0; i < list.length; i++) { list[i].read = true; }
        saveNotifications(list);
        renderNotifications();
        renderOverviewNotif();
        updateCounts();
    }

    /* ============================================================
       Profile — demo passenger + frontend-only editing
       ============================================================ */
    function normalizeLocalPhone(raw) {
        var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
        if (digits.length === 10 && digits.charAt(0) === '0') { digits = digits.slice(1); }
        else if (digits.indexOf('251') === 0 && digits.length === 12) { digits = digits.slice(3); }
        return digits;
    }
    function validLocalPhone(digits) { return /^9[0-9]{8}$/.test(digits); }

    function formatPhoneDisplay(p) {
        var digits = normalizeLocalPhone(p);
        if (validLocalPhone(digits)) {
            return '+251 ' + digits.slice(0, 2) + ' ' + digits.slice(2, 5) + ' ' + digits.slice(5);
        }
        return String(p == null ? '' : p);
    }

    function setFieldError(fieldId, msg) {
        var f = document.getElementById(fieldId);
        var err = document.getElementById(fieldId + '-err');
        if (f) { f.classList.add('field-invalid'); }
        if (err) { err.textContent = msg; }
    }
    function clearFieldError(fieldId) {
        var f = document.getElementById(fieldId);
        var err = document.getElementById(fieldId + '-err');
        if (f) { f.classList.remove('field-invalid'); }
        if (err) { err.textContent = ''; }
    }

    function renderProfile() {
        var p = loadProfile();
        var greeting = document.getElementById('dash-greeting');
        var firstName = String(p.fullName || 'Passenger').trim().split(/\s+/)[0];
        if (greeting) { greeting.textContent = firstName || 'Passenger'; }
        var avatar = document.getElementById('profile-avatar');
        if (avatar) { avatar.textContent = String(p.fullName || 'P').trim().charAt(0).toUpperCase() || 'P'; }
        document.getElementById('profile-name').textContent = p.fullName || 'Passenger';
        document.getElementById('profile-phone').textContent = formatPhoneDisplay(p.phone);
        document.getElementById('profile-email').textContent = p.email || '';
        document.getElementById('p-name').textContent = p.fullName || 'Passenger';
        document.getElementById('p-phone').textContent = formatPhoneDisplay(p.phone);
        document.getElementById('p-email').textContent = p.email || '';
        document.getElementById('p-gender').textContent = p.gender || '\u2014';
        document.getElementById('p-dob').textContent = p.dob ? formatDate(p.dob) : '\u2014';
    }

    var profileModal = document.getElementById('profile-modal');
    var profileFormMsg = document.getElementById('profile-form-msg');

    function openProfileModal() {
        if (!profileModal) { return; }
        var p = loadProfile();
        document.getElementById('p-full-name').value = p.fullName || '';
        document.getElementById('p-phone-input').value = normalizeLocalPhone(p.phone);
        document.getElementById('p-email-input').value = p.email || '';
        document.getElementById('p-gender-input').value = p.gender || '';
        document.getElementById('p-dob-input').value = p.dob || '';
        clearFieldError('p-full-name');
        clearFieldError('p-phone-input');
        clearFieldError('p-email-input');
        var info = document.getElementById('p-phone-info');
        if (info) { info.textContent = ''; info.classList.remove('show'); }
        if (profileFormMsg) { profileFormMsg.hidden = true; }
        profileModal.hidden = false;
        document.body.classList.add('modal-open');
        document.getElementById('p-full-name').focus();
    }

    function closeProfileModal() {
        if (!profileModal) { return; }
        profileModal.hidden = true;
        document.body.classList.remove('modal-open');
    }

    /* ============================================================
       Support — help topics + frontend-only contact form
       ============================================================ */
    var SUPPORT_TOPICS = [
        { icon: '&#127915;', title: 'Booking Help',
          text: 'Questions about an existing booking, changing seats or travel dates.' },
        { icon: '&#128179;', title: 'Payment Help',
          text: 'Trouble with Telebirr, CBE Birr or M-Pesa demo payments.' },
        { icon: '&#8617;', title: 'Cancellation & Refund',
          text: 'Demo only — cancellation is not available yet in this prototype.' },
        { icon: '&#127890;', title: 'Lost Items',
          text: 'Report items left on the bus after your journey.' },
        { icon: '&#9881;', title: 'Technical Support',
          text: 'Problems with the website or the booking flow.' }
    ];

    function renderSupport() {
        var el = document.getElementById('support-cards');
        if (!el) { return; }
        var html = '';
        for (var i = 0; i < SUPPORT_TOPICS.length; i++) {
            var t = SUPPORT_TOPICS[i];
            html += '<div class="card support-card">' +
                '<span class="support-icon" aria-hidden="true">' + t.icon + '</span>' +
                '<h3>' + escapeHtml(t.title) + '</h3>' +
                '<p>' + escapeHtml(t.text) + '</p>' +
            '</div>';
        }
        el.innerHTML = html;
    }

/* ============================================================
       Navigation — sidebar section switching + My Trips tabs
       ============================================================ */
    var SECTIONS = ['overview', 'trips', 'tickets', 'favorites', 'notifications', 'profile', 'support'];

    function showSection(name) {
        if (SECTIONS.indexOf(name) === -1) { name = 'overview'; }
        for (var i = 0; i < SECTIONS.length; i++) {
            var sec = document.getElementById('section-' + SECTIONS[i]);
            if (sec) { sec.hidden = (SECTIONS[i] !== name); }
        }
        var btns = document.querySelectorAll('.dash-nav-btn');
        for (var j = 0; j < btns.length; j++) {
            var active = btns[j].getAttribute('data-section') === name;
            btns[j].classList.toggle('active', active);
            if (active) { btns[j].setAttribute('aria-current', 'true'); }
            else { btns[j].removeAttribute('aria-current'); }
        }
        try { history.replaceState(null, '', '#' + name); } catch (e) { /* file:// friendly */ }
        /* Re-fetch real notifications from the server whenever the panel is
           opened, so newly created booking/payment/review notifications show up
           without requiring a full page reload. Guests/demo are unaffected. */
        if (name === 'notifications') { syncRealNotifications(); }
    }

    function setTripTab(tab) {
        tripTab = tab;
        var btns = document.querySelectorAll('.dash-tab');
        for (var i = 0; i < btns.length; i++) {
            var on = btns[i].getAttribute('data-tab') === tab;
            btns[i].classList.toggle('active', on);
            btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
        }
        /* A real, authenticated passenger loads the selected status tab from
           the backend so the tabs are genuinely server-side filtered. Changing
           the status resets the offset to 0, replaces the displayed cards with
           a fresh first page for the selected status, and preserves both the
           active search query and the active sort. Guests/demo mode never hit
           the protected endpoint and keep the existing client-side filter. */
        if (tripsPagerIsLive()) {
            if (tripsPager.status !== tab) {
                tripsPager.status = tab;
                tripsRequestId++;
                var term = (tripsSearch || '').trim();
                /* Keep the active search + sort; only offset/page reset. */
                resetTripsPager(term !== '', term);
                setSearchStatus('trips', 'Updating trips\u2026');
                if (tripsPagerLoading) { tripsRefreshQueued = true; return; }
                fetchTripsPage(0);
                return;
            }
        }
        renderTrips();
    }

    /* ---------- Sidebar navigation buttons ---------- */
    var sidebarEl = document.getElementById('dashboard-sidebar');
    if (sidebarEl) {
        sidebarEl.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('.dash-nav-btn') : null;
            if (btn && btn.getAttribute('data-section')) {
                showSection(btn.getAttribute('data-section'));
            }
        });
    }

    /* ---------- My Trips status tabs ---------- */
    var tabsWrap = document.querySelector('.dash-tabs');
    if (tabsWrap) {
        tabsWrap.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('.dash-tab') : null;
            if (btn && btn.getAttribute('data-tab')) { setTripTab(btn.getAttribute('data-tab')); }
        });
    }

 /* ---------- booking search inputs (debounced) ----------
       The dataset is already fully loaded and authorized, so the debounce only
       avoids re-rendering on every keystroke — no extra API requests at all. */
 /* ---------- real backend booking search helper ----------
       For an authenticated passenger the search input queries the real database
       (api/booking.php?action=search&q=...) and renders the session-scoped
       results with the same booking cards. Guests / demo mode and any backend
       failure fall back to the fast client-side filter over the authorised list. */
    function setSearchStatus(which, text) {
        var el = document.getElementById(which + '-search-status');
        if (!el) { return; }
        var t = (text === null || text === undefined) ? '' : String(text);
        el.textContent = t;
        el.hidden = (t === '');
    }

    function backendBookingSearch(term, onDone, onFallback) {
        if (!window.ETAuth || !window.ETAuth.getCurrentUser) { onFallback(); return; }
        window.ETAuth.getCurrentUser()
            .then(function (user) {
                /* Only a REAL authenticated passenger may call the protected
                   search endpoint. Guests / demo mode never hit it. */
                if (!user || user.role !== 'passenger') { onFallback(); return; }
                window.fetch('api/booking.php?action=search&q=' + encodeURIComponent(term), {
                    credentials: 'same-origin',
                    headers: { 'Accept': 'application/json' }
                })
                    .then(function (res) {
                        return res.json().catch(function () { return { success: false }; });
                    })
                    .then(function (json) {
                        if (!json || !json.success || !Array.isArray(json.bookings)) {
                            onFallback(); return;
                        }
                        onDone(json.bookings.map(apiBookingToDash));
                    })
                    .catch(onFallback);
            })
            .catch(onFallback);
    }

 /* ---------- My Trips pagination helpers ---------- */
    function setTripsPagerUi() {
        setTripsSortUi();
        var wrap = document.getElementById('trips-loadmore');
        var btn = document.getElementById('trips-loadmore-btn');
        var status = document.getElementById('trips-loadmore-status');
        if (!wrap) { return; }
        var show = tripsPager.active && tripsPager.hasMore;
        wrap.hidden = !show;
        if (btn) {
            btn.disabled = tripsPagerLoading || !tripsPager.hasMore;
            btn.textContent = 'Load more';
        }
        if (status) {
            status.hidden = !tripsPagerLoading;
            status.textContent = tripsPagerLoading ? 'Loading more trips\u2026' : '';
        }
    }

    function resetTripsPager(searching, q) {
        tripsPager.searching = !!searching;
        tripsPager.q = q || '';
        tripsPager.offset = 0;
        tripsPager.hasMore = false;
        tripsPager.total = 0;
        tripsPager.items = [];
        setTripsPagerUi();
    }

 /* ---------- My Trips server-side sort ---------- */
    function setTripsSortUi() {
        var wrap = document.getElementById('trips-sort');
        if (!wrap) { return; }
        wrap.hidden = !tripsPager.active;
        var sel = document.getElementById('trips-sort-select');
        if (sel) {
            sel.disabled = !tripsPager.active || tripsPagerLoading;
            if (sel.value !== tripsSort) { sel.value = tripsSort; }
        }
    }

    function changeTripsSort(newSort) {
        var next = String(newSort || 'newest');
        if (next === tripsSort) { return; }
        tripsSort = next;
        if (!tripsPagerIsLive()) { setTripsSortUi(); return; }
        tripsRequestId++;                         // discard any in-flight page for the old sort
        var term = (tripsSearch || '').trim();
        resetTripsPager(term !== '', term);       // clear offset + displayed cards, keep search
        setSearchStatus('trips', 'Updating order\u2026');
        if (tripsPagerLoading) { tripsRefreshQueued = true; return; }
        fetchTripsPage(0);
    }

    function clearTripsUpdatingStatus() {
        var el = document.getElementById('trips-search-status');
        if (el && typeof el.textContent === 'string' && el.textContent.indexOf('Updating') === 0) {
            /* Tab/status switches and sort changes both show a transient
               "Updating ..." loading status here; clear it once the new
               results are rendered (match-count / error text is elsewhere). */
            el.textContent = '';
            el.hidden = true;
        }
    }

    function maybeRunQueuedTripsRefresh() {
        if (tripsRefreshQueued) {
            tripsRefreshQueued = false;
            setSearchStatus('trips', '');
            fetchTripsPage(tripsPager.offset);
        }
    }

        function tripsPagerEndpoint() {
        return 'api/booking.php?action=' +
            (tripsPager.searching ? 'search&q=' + encodeURIComponent(tripsPager.q) : 'list') +
            '&status=' + encodeURIComponent(tripsPager.status) +
            '&limit=' + tripsPager.limit +
            '&sort=' + tripsSort;
    }

    function tripsMatchStatus(text) {
        var se = document.getElementById('trips-search-status');
        if (!se) { return; }
        se.textContent = text;
        se.hidden = (text === '');
    }

    function fetchTripsPage(offset) {
        if (tripsPagerLoading) { return; }
        tripsPagerLoading = true;
        var rid = ++tripsRequestId;
        setTripsPagerUi();
        var url = tripsPagerEndpoint() + '&offset=' + offset;
        window.fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
            .then(function (res) { return res.json().catch(function () { return { success: false }; }); })
            .then(function (json) {
                tripsPagerLoading = false;
                if (rid !== tripsRequestId) { setTripsPagerUi(); maybeRunQueuedTripsRefresh(); return; }
                if (!json || !json.success || !Array.isArray(json.bookings)) {
                    setTripsPagerUi();
                    tripsMatchStatus('Unable to load your trips right now. Please try again.');
                    maybeRunQueuedTripsRefresh();
                    return;
                }
                var mapped = json.bookings.map(apiBookingToDash);
                var existing = tripsPager.items;
                if (offset <= 0) { existing = []; }
                var seen = {};
                var i, kd;
                for (i = 0; i < existing.length; i++) {
                    kd = existing[i].id || existing[i].reference;
                    if (kd) { seen[kd] = 1; }
                }
                var appended = existing.slice();
                for (i = 0; i < mapped.length; i++) {
                    kd = mapped[i].id || mapped[i].reference;
                    if (kd && seen[kd]) { continue; }
                    if (kd) { seen[kd] = 1; }
                    appended.push(mapped[i]);
                }
                tripsPager.items = appended;
                tripsPager.total = (typeof json.count === 'number') ? json.count : mapped.length;
                tripsPager.offset = offset + mapped.length;
                tripsPager.hasMore = !!json.hasMore;
                setTripsPagerUi();
                if (tripsPager.searching && offset === 0) {
                    tripsMatchStatus(tripsPager.total
                        ? (tripsPager.total + ' matching booking' + (tripsPager.total === 1 ? '' : 's'))
                        : 'No bookings match this search.');
                }
                renderTrips();
                renderTickets();
                updateCounts();
                clearTripsUpdatingStatus();
                maybeRunQueuedTripsRefresh();
            })
            .catch(function () {
                tripsPagerLoading = false;
                setTripsPagerUi();
                tripsMatchStatus('Unable to load more trips. Please try again.');
                maybeRunQueuedTripsRefresh();
            });
    }

    /* Collects every booking owned by the passenger (paginated) so the
       background datasets (stats / tickets / upcoming / recent) keep the full
       record set, independent of the My Trips page window.
       Resolves to the raw booking payload array on a SUCCESSFUL sync ([] when
       the passenger genuinely has none), or to null when the endpoint failed /
       the session is gone — so the caller can preserve prior/demo data. */
    function fetchAllOwnBookings() {
        var acc = [];
        var from = 0;
        var guard = 0;
        var failed = false;
        function nextPage() {
            if (failed) { return null; }
            if (guard > 500) { return acc; }
            guard++;
            var url = 'api/booking.php?action=list&limit=50&offset=' + from;
            return window.fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
                .then(function (res) { return res.json().catch(function () { return { success: false }; }); })
                .then(function (json) {
                    if (!json || !json.success || !Array.isArray(json.bookings)) {
                        if (!json || !json.success) { failed = true; return null; }
                        return acc;
                    }
                    acc = acc.concat(json.bookings);
                    if (json.hasMore) {
                        from = from + json.bookings.length;
                        return nextPage();
                    }
                    return acc;
                })
                .catch(function () { failed = true; return null; });
        }
        return nextPage();
    }

    function runSectionSearch(section) {
        var term = String(section === 'trips' ? tripsSearch : ticketsSearch).trim();
        var render = (section === 'trips') ? renderTrips : renderTickets;

        /* A real, authenticated passenger's My Trips search is backed by the
           paginated backend endpoint (action=search / action=list) so the
           "Load more" results window stays correct across queries. */
        if (section === 'trips' && tripsPagerIsLive()) {
            if (!term) {
                /* Clearing the search restores the normal (list) first page. */
                resetTripsPager(false, '');
                setSearchStatus('trips', '');
                fetchTripsPage(0);
                return;
            }
            setSearchStatus(section, 'Searching your bookings\u2026');
            resetTripsPager(true, term);
            fetchTripsPage(0);
            return;
        }

        var setResults = function (val) {
            if (section === 'trips') { tripsSearchResults = val; }
            else { ticketsSearchResults = val; }
        };

        /* Empty query restores the passenger's normal booking list. */
        if (!term) {
            setResults(null);
            setSearchStatus(section, '');
            render();
            return;
        }

        setSearchStatus(section, 'Searching your bookings\u2026');
        backendBookingSearch(term, function (mapped) {
            setResults(mapped);
            setSearchStatus(section, mapped.length
                ? (mapped.length + ' matching booking' + (mapped.length === 1 ? '' : 's'))
                : 'No bookings match this search.');
            render();
        }, function () {
            /* Guest / demo mode, or a failed or oversized search, falls back
               to the fast client-side filter over the already-authorised list. */
            setResults(null);
            setSearchStatus(section, 'Search is unavailable here — showing your own bookings.');
            render();
        });
    }

    function bindBookingSearch() {
        var tripsInput = document.getElementById('trips-search');
        if (tripsInput) {
            tripsInput.addEventListener('input', function () {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(function () {
                    tripsSearch = (tripsInput.value || '').trim();
                    runSectionSearch('trips');
                }, 250);
            });
        }
        var ticketsInput = document.getElementById('tickets-search');
        if (ticketsInput) {
            ticketsInput.addEventListener('input', function () {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(function () {
                    ticketsSearch = (ticketsInput.value || '').trim();
                    runSectionSearch('tickets');
                }, 250);
            });
        }
    }
    bindBookingSearch();

 /* ---------- My Trips sort dropdown ---------- */
    var tripsSortEl = document.getElementById('trips-sort-select');
    if (tripsSortEl) {
        tripsSortEl.addEventListener('change', function () {
            if (tripsPagerIsLive()) { changeTripsSort(tripsSortEl.value); }
            else { tripsSortEl.value = tripsSort; }
        });
    }

 /* ---------- My Trips "Load more" button ---------- */
    var loadMoreBtn = document.getElementById('trips-loadmore-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function () {
            if (!tripsPager.active || tripsPagerLoading) { return; }
            fetchTripsPage(tripsPager.offset);
        });
    }

    /* ---------- Delegated actions (ticket view, fav remove, notifs) ---------- */
    document.addEventListener('click', function (event) {
        var el = event.target;
        if (!el || !el.closest) { return; }

        var cancelCard = el.closest('.btn-cancel-booking');
        if (cancelCard) {
            var cref = cancelCard.getAttribute('data-ref');
            if (cref) { openCancelModal(cref); return; }
        }

        var reviewCard = el.closest('.btn-write-review');
        if (reviewCard) {
            var rref = reviewCard.getAttribute('data-ref');
            if (rref) { openReviewModal(rref); return; }
        }

        var view = el.closest('.btn-ticket-view');
        if (view) {
            var ref = view.getAttribute('data-ref');
            if (ref) { openTicket(ref); return; }
        }

        var favDel = el.closest('.btn-remove-fav');
        if (favDel) {
            var slug = favDel.getAttribute('data-fav-slug');
            if (slug) { toggleFavCompany(slug); return; }
            var ri = favDel.getAttribute('data-route-fav');
            if (ri !== null) { removeFavRoute(parseInt(ri, 10)); return; }
        }

        var notif = el.closest('.dash-notif-item');
        if (notif) {
            var id = notif.getAttribute('data-notif-id');
            if (id) { toggleNotifRead(id); return; }
        }
    });

    /* ---------- Modal closing (ticket + profile) ---------- */
    var ticketCloseBtn = document.getElementById('ticket-modal-close');
    if (ticketCloseBtn) { ticketCloseBtn.addEventListener('click', closeTicket); }
    var profileCloseBtn = document.getElementById('profile-modal-close');
    if (profileCloseBtn) { profileCloseBtn.addEventListener('click', closeProfileModal); }
    var profileCancelBtn = document.getElementById('profile-cancel-btn');
    if (profileCancelBtn) { profileCancelBtn.addEventListener('click', closeProfileModal); }
    var ticketBackdrop = document.querySelector('[data-ticket-close]');
    if (ticketBackdrop) { ticketBackdrop.addEventListener('click', closeTicket); }
    var profileBackdrop = document.querySelector('[data-profile-close]');
    if (profileBackdrop) { profileBackdrop.addEventListener('click', closeProfileModal); }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeTicket();
            closeProfileModal();
            closeCancelModal();
            closeReviewModal();
        }
    });

    var editProfileBtn = document.getElementById('edit-profile-btn');
    if (editProfileBtn) { editProfileBtn.addEventListener('click', openProfileModal); }

    var markAllBtn = document.getElementById('mark-all-read');
    if (markAllBtn) { markAllBtn.addEventListener('click', markAllRead); }
/* ============================================================
       Forms — favorite route, profile, support
       ============================================================ */
    var favRouteForm = document.getElementById('fav-route-form');
    if (favRouteForm) {
        favRouteForm.addEventListener('submit', function (event) {
            event.preventDefault();
            var fromEl = document.getElementById('fav-from');
            var toEl = document.getElementById('fav-to');
            var msg = document.getElementById('fav-route-msg');
            var from = fromEl ? fromEl.value : '';
            var to = toEl ? toEl.value : '';
            if (!from || !to || from === to) {
                if (msg) { msg.textContent = 'Please pick two different cities.'; msg.hidden = false; }
                return;
            }
            var routes = loadFavRoutes();
            for (var i = 0; i < routes.length; i++) {
                if (routes[i].from === from && routes[i].to === to) {
                    if (msg) { msg.textContent = 'That route is already in your favorites.'; msg.hidden = false; }
                    return;
                }
            }
            routes.push({ from: from, to: to });
            setJSON(KEY_FAV_ROUTES, routes);
            renderFavorites();
            renderOverviewFav();
            renderStats();
            updateCounts();
            if (msg) { msg.textContent = 'Route saved to favorites.'; msg.hidden = false; }
        });
    }

    var phoneInput = document.getElementById('p-phone-input');
    if (phoneInput) {
        phoneInput.addEventListener('input', function () {
            var digits = normalizeLocalPhone(phoneInput.value);
            phoneInput.value = digits;
            var info = document.getElementById('p-phone-info');
            if (info) {
                if (validLocalPhone(digits)) {
                    info.textContent = 'Stored as +251' + digits;
                    info.classList.add('show');
                    clearFieldError('p-phone-input');
                } else {
                    info.textContent = '';
                    info.classList.remove('show');
                }
            }
        });
    }

    var profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', function (event) {
            event.preventDefault();
            var ok = true;
            var name = document.getElementById('p-full-name').value.trim();
            var email = document.getElementById('p-email-input').value.trim();
            var digits = normalizeLocalPhone(document.getElementById('p-phone-input').value);
            var gender = document.getElementById('p-gender-input').value;
            var dob = document.getElementById('p-dob-input').value;

            if (!name) { setFieldError('p-full-name', 'Full name is required.'); ok = false; }
            else { clearFieldError('p-full-name'); }

            if (!validLocalPhone(digits)) { setFieldError('p-phone-input', 'Please enter a valid Ethiopian phone number (09XXXXXXXX or +2519XXXXXXXX).'); ok = false; }
            else { clearFieldError('p-phone-input'); }

            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('p-email-input', 'Please enter a valid email address.'); ok = false; }
            else { clearFieldError('p-email-input'); }

            if (!ok) { return; }

            setJSON(KEY_PROFILE, {
                fullName: name,
                phone: '+251' + digits,
                email: email,
                gender: gender || '',
                dob: dob || ''
            });
            renderProfile();
            closeProfileModal();
        });
    }
var supportForm = document.getElementById('support-form');
    if (supportForm) {
        supportForm.addEventListener('submit', function (event) {
            event.preventDefault();
            var ok = true;
            var name = document.getElementById('support-name').value.trim();
            var email = document.getElementById('support-email').value.trim();
            var message = document.getElementById('support-message').value.trim();
            if (!name) { setFieldError('support-name', 'Your name is required.'); ok = false; }
            else { clearFieldError('support-name'); }
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('support-email', 'A valid email is required.'); ok = false; }
            else { clearFieldError('support-email'); }
            if (!message) { setFieldError('support-message', 'Please describe your issue.'); ok = false; }
            else { clearFieldError('support-message'); }
            if (!ok) { return; }
            var msg = document.getElementById('support-form-msg');
            if (msg) {
                msg.textContent = 'Your support request has been recorded for this demo. ' +
                    'No real ticket was created on a server.';
                msg.setAttribute('role', 'status');
                msg.hidden = false;
            }
            supportForm.reset();
        });
    }

    /* ---------- Sidebar counts ---------- */
    function setCount(id, n) {
        var el = document.getElementById(id);
        if (!el) { return; }
        el.textContent = n;
        el.hidden = (n <= 0);
    }
    function updateCounts() {
        var bookings = loadBookings();
        var tripCount = 0, ticketCount = 0;
        for (var i = 0; i < bookings.length; i++) {
            var s = bookingStatus(bookings[i]);
            if (s === 'cancelled') { continue; }
            tripCount++;
            ticketCount++;
        }
        var favCount = favCompanies().length + loadFavRoutes().length;
        setCount('count-trips', tripCount);
        setCount('count-tickets', ticketCount);
        setCount('count-favs', favCount);
        setCount('count-unread', unreadCount());
    }

    /* ============================================================
 real bookings from MySQL (authenticated passenger)
       ============================================================ */
    function apiBookingToDash(b) {
        var seats = Array.isArray(b.seats) ? b.seats : [];
        return {
            id: Number(b.id) || 0,
            reference: b.reference || '',
            company: b.company || '',
            companyId: b.companyId || '',
            from: b.from || '',
            to: b.to || '',
            date: b.date || '',
            depart: b.depart || '',
            arrive: b.arrive || '',
            minutes: Number(b.minutes) || 0,
            seats: seats,
            seatLabel: b.seatLabel || seats.join(', '),
            passengerCount: Number(b.passengerCount) || seats.length || 1,
            passengerNames: Array.isArray(b.passengerNames) ? b.passengerNames : [],
            total: Number(b.total) || 0,
            paymentMethod: b.paymentMethod || b.payment_method || '',
            busType: b.busType || b.tripType || 'Standard',
            tripType: b.tripType || 'Standard',
            status: b.status || 'confirmed',
            real: true
        };
    }

    function syncRealBookings() {
        if (!window.ETAuth || !window.ETTransportStore) { return; }
        window.ETAuth.getCurrentUser().then(function (user) {
            /* Track the logged-in user so the reviewed-booking state is scoped
               to the actual passenger (guests/demo always use the 'guest' key). */
            var prevUserId = currentUserId;
            currentUserId = (user && user.id) ? user.id : null;
            if (prevUserId !== currentUserId) {
                rerenderAll();
            }
            if (!user || user.role !== 'passenger') {
                /* Guests / demo mode never use the real paginated endpoint. */
                tripsPager.active = false;
                tripsPagerLoading = false;
                setTripsPagerUi();
                return;
            }

            tripsPager.active = true;

            /* Collect the passenger's full record set (paginated) so the
               background datasets (stats / tickets / upcoming / recent) remain
               complete, independent of the My Trips page window. */
            fetchAllOwnBookings().then(function (bookings) {
                if (bookings === null) {
                    /* API unavailable / session lost: do NOT clobber the existing
                       session or demo data with an empty page. Deactivate the
                       pager so My Trips keeps showing what was already there. */
                    tripsPager.active = false;
                    tripsPagerLoading = false;
                    setTripsPagerUi();
                    return;
                }
                var items = Array.isArray(bookings) ? bookings.map(apiBookingToDash) : [];
                var existing = getJSON(KEY_HISTORY, null) || [];
                var byRef = {};
                for (var m = 0; m < items.length; m++) {
                    if (items[m].reference) { byRef[items[m].reference] = items[m]; }
                }
                var seen = {};
                var merged = [];
                var i;
                for (i = 0; i < existing.length; i++) {
                    var b0 = existing[i];
                    if (!b0 || !b0.reference) { continue; }
                    var api0 = byRef[b0.reference];
                    if (api0) {
                        b0.id = api0.id;
                        if (api0.status) { b0.status = api0.status; }
                    }
                    if (!seen[b0.reference]) { seen[b0.reference] = 1; merged.push(b0); }
                }
                for (i = 0; i < items.length; i++) {
                    var item = items[i];
                    if (item.reference && !seen[item.reference]) {
                        seen[item.reference] = 1;
                        merged.push(item);
                    }
                }
                setJSON(KEY_HISTORY, merged);

                /* Seed the My Trips paginated window from the synchronized list:
                   first page visible, state advanced for the "Load more" fetch. */
                resetTripsPager(false, '');
                tripsPager.status = tripTab;
                var statusShown = (tripsPager.status && tripsPager.status !== 'all')
                    ? merged.filter(function (bb) { return bookingStatus(bb) === tripsPager.status; })
                    : merged.slice();
                tripsPager.items = statusShown.slice(0, tripsPager.limit);
                tripsPager.offset = Math.min(statusShown.length, tripsPager.limit);
                tripsPager.total = statusShown.length;
                tripsPager.hasMore = statusShown.length > tripsPager.limit;
                tripsPagerLoading = false;
                setTripsPagerUi();

                renderUpcoming();
                renderStats();
                renderRecentBookings();
                renderTrips();
                renderTickets();
                updateCounts();
            });
        });
    }

    /* ============================================================
 real notifications from MySQL.
       Authenticated passengers fetch from api/notification.php;
       guests/non-passengers stay in demo mode and never call the
       protected endpoint (the server also enforces ownership).
       ============================================================ */
    function syncRealNotifications() {
        if (!window.ETAuth || !window.ETAuth.getCurrentUser) { return; }
        window.ETAuth.getCurrentUser().then(function (user) {
            if (!user || user.role !== 'passenger') {
                realNotifs = null;
                notifState = 'idle';
                renderNotifications();
                renderOverviewNotif();
                updateCounts();
                return;
            }
            if (!window.fetch) { notifState = 'error'; renderNotifications(); return; }
            notifState = 'loading';
            renderNotifications();
            renderOverviewNotif();
            window.fetch('api/notification.php?action=list', {
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
            })
                .then(function (res) { return res.json().catch(function () { return { success: false }; }); })
                .then(function (json) {
                    if (!json || !json.success || !Array.isArray(json.notifications)) {
                        notifState = 'error';
                    } else {
                        realNotifs = json.notifications.map(apiNotifToDash);
                        notifState = 'loaded';
                    }
                    renderNotifications();
                    renderOverviewNotif();
                    updateCounts();
                })
                .catch(function () {
                    notifState = 'error';
                    renderNotifications();
                    renderOverviewNotif();
                    updateCounts();
                });
        });
    }

    /* ============================================================
       Init
       ============================================================ */
    function init() {
        renderUpcoming();
        renderStats();
        renderRecentBookings();
        renderOverviewFav();
        renderOverviewNotif();
        renderTrips();
        renderTickets();
        renderFavorites();
        populateCitySelect();
        renderNotifications();
        renderProfile();
        renderSupport();
        updateCounts();
        syncRealBookings();
        syncRealNotifications();

        var hash = window.location.hash ? window.location.hash.slice(1) : 'overview';
        showSection(hash);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
