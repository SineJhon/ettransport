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
    var KEY_NOTIF_VERSION = 'etTransportNotifVersion'; // demo notification feed stamp
    var NOTIF_DEMO_VERSION = 2;                        // bump when demoNotifications() changes

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

    /* Whole days between today and a YYYY-MM-DD date (local, timezone-safe). */
    function daysUntilDate(iso) {
        if (!iso) { return null; }
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) { return null; }
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.round((d - today) / 86400000);
    }

    function countdownLabel(days) {
        if (days === 0) { return 'Today'; }
        if (days === 1) { return 'Tomorrow'; }
        if (days === 2) { return 'In 2 days'; }
        return 'In ' + days + ' days';
    }

    function slugify(name) {
        return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    /* ---------- Company lookup (shared data from js/company.js) ---------- */
    var companies = (window.ETTransportCompanies || []).slice();
    var realCompanyLoaded = false;   // api/company.php?action=list resolved once
    var realCompanyLoading = false;

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

    /* ---------- Real company logos (api/company.php?action=list) ----------
       The database holds each company's actual uploaded profile picture
       (assets/uploads/companies/…) while the static demo data ships generic
       placeholder SVGs. Merge the real logos over the placeholders once the
       API responds, then re-render every area that shows company images. */
    function loadRealCompanyLogos() {
        if (realCompanyLoaded || realCompanyLoading || typeof window.fetch !== 'function') { return; }
        realCompanyLoading = true;
        window.fetch('api/company.php?action=list', {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () { return {}; });
            })
            .then(function (json) {
                realCompanyLoaded = true;
                realCompanyLoading = false;
                if (!json || json.success !== true || !Array.isArray(json.companies)) { return; }
                var patched = false;
                for (var i = 0; i < json.companies.length; i++) {
                    var real = json.companies[i];
                    if (!real || !real.slug) { continue; }
                    var c = companyBySlug(real.slug);
                    if (!c) {
                        /* A database-only company (not in the static demo data) —
                           add it so favorites / trips can resolve its logo too. */
                        companies.push({
                            id: real.slug,
                            slug: real.slug,
                            name: real.name || real.slug,
                            logo: real.logo || '',
                            coverImage: real.cover_image || '',
                            verified: !!real.verified,
                            rating: Number(real.rating) || 0,
                            reviewCount: Number(real.review_count) || 0,
                            tagline: String(real.description || '').split(/[.\n]/)[0] || real.name || ''
                        });
                        patched = true;
                        continue;
                    }
                    if (real.logo && c.logo !== real.logo) { c.logo = real.logo; patched = true; }
                    if (real.cover_image && c.coverImage !== real.cover_image) { c.coverImage = real.cover_image; }
                }
                if (patched) {
                    renderUpcoming();
                    renderRecentBookings();
                    renderOverviewFav();
                    renderFavorites();
                    renderTrips();
                }
            })
            .catch(function () { realCompanyLoaded = true; realCompanyLoading = false; });
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
                busType: 'Higer A90', tripType: 'Standard',
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
                busType: 'Neoplan Skyliner', tripType: 'Standard',
                status: 'cancelled', demo: true
            }
        ];
    }

    function demoNotifications() {
        return [
            { id: 'demo-1', type: 'booking', title: 'Booking Confirmed',
              message: 'Your Selam Bus trip Addis Ababa \u2192 Arba Minch is confirmed. Ref: ET-8F4K29 \u00b7 Seat 18.',
              time: 'Today, 09:15', read: false },
            { id: 'demo-2', type: 'payment', title: 'Payment Received',
              message: 'ETB 1,300 for booking ET-8F4K29 was paid with TeleBirr.',
              time: 'Today, 09:16', read: false },
            { id: 'demo-8', type: 'booking', title: 'Gate Change',
              message: 'Your Bahir Dar departure moved to Platform 4 at Meskel Square Terminal.',
              time: 'Today, 09:40', read: false },
            { id: 'demo-3', type: 'general', title: 'Boarding Reminder',
              message: 'Your bus departs tomorrow at 08:00 from Meskel Square Terminal. Please arrive 30 minutes early.',
              time: 'Yesterday, 18:20', read: false },
            { id: 'demo-9', type: 'review', title: 'Company Replied to Your Review',
              message: 'Selam Bus replied: \u201cThanks for the feedback \u2014 happy travels!\u201d',
              time: 'Yesterday, 11:05', read: false },
            { id: 'demo-4', type: 'booking', title: 'Seat Changed',
              message: 'Your seat on ET-9B2A17 changed from 14 to 22. Your booking is still valid.',
              time: '2 days ago', read: true },
            { id: 'demo-5', type: 'review', title: 'Review Your Trip',
              message: 'How was your trip from Addis Ababa to Hawassa? Share your feedback to help other passengers.',
              time: '4 days ago', read: true },
            { id: 'demo-12', type: 'booking', title: 'Return Trip Reminder',
              message: 'Your return coach to Addis Ababa departs soon \u2014 check in from the My Trips page.',
              time: '5 days ago', read: true },
            { id: 'demo-6', type: 'cancellation', title: 'Cancellation & Refund',
              message: 'Trip ET-3C7D12 was cancelled and ETB 700 was refunded to your TeleBirr account.',
              time: '6 days ago', read: true },
            { id: 'demo-11', type: 'general', title: 'Favorite Route Update',
              message: 'Your saved route Addis Ababa \u2192 Bahir Dar now has a new morning departure.',
              time: '9 days ago', read: true },
            { id: 'demo-7', type: 'general', title: 'Welcome to ET Transport',
              message: 'Save your passenger info and a refund account in your profile to pre-fill every booking.',
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
        if (list && Object.prototype.toString.call(list) === '[object Array]') {
            /* Sessions that cached an OLDER demo feed keep showing stale sample
               notifications. When the demo feed version changes, refresh the
               browser's copy so newly added notifications actually appear. */
            var storedVersion = getJSON(KEY_NOTIF_VERSION, null);
            if (storedVersion !== NOTIF_DEMO_VERSION) {
                var isOldDemo = list.length === 0 || String(list[0].id).indexOf('demo-') === 0;
                if (isOldDemo) {
                    setJSON(KEY_NOTIF, demoNotifications());
                    setJSON(KEY_NOTIF_VERSION, NOTIF_DEMO_VERSION);
                    return demoNotifications();
                }
            }
            return list;
        }
        return demoNotifications();
    }
    function loadProfile() {
        var p = getJSON(KEY_PROFILE, null);
        return (p && typeof p === 'object') ? p : demoProfile();
    }

    /* ---------- Passenger identity ----------
       A signed-in passenger sees their REAL account name, email and
       phone on the dashboard. A profile the passenger explicitly saved
       in this browser still takes priority; demoProfile() is only the
       last resort when no session user is available at all. */
    function effectiveProfile(user) {
        /* Browser-saved extras (pre-fill toggle + refund account) are kept
           separate from the account fields because the database has no
           columns for them — merge them onto whichever identity wins. */
        var saved = getJSON(KEY_PROFILE, null);
        var extras = (saved && typeof saved === 'object')
            ? { prefillBooking: !!saved.prefillBooking, refundAccount: saved.refundAccount || null }
            : null;
        /* A real authenticated account is the source of truth. */
        if (user && user.name) {
            return {
                fullName: user.name,
                phone: user.phone || '',
                email: user.email || '',
                gender: user.gender || '',
                dob: user.date_of_birth || '',
                prefillBooking: extras ? extras.prefillBooking : false,
                refundAccount: extras ? extras.refundAccount : null
            };
        }
        if (saved && typeof saved === 'object' && (saved.fullName || saved.phone || saved.email)) {
            return saved;
        }
        return demoProfile();
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
    var notifFilter = 'all'; // all | unread (applies to the demo + real lists)
    var notifSeeded = false;  // one-shot: seed a sample feed for empty real accounts
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
        var daysUntil = daysUntilDate(next.date);
        var countdown = (daysUntil === null) ? '' :
            '<span class="dash-countdown">' + countdownLabel(daysUntil) + '</span>';
        el.innerHTML = '<div class="card dash-upcoming-card">' +
            '<div class="dash-upcoming-head">' +
                '<div>' +
                    '<p class="dash-eyebrow">Next Trip</p>' +
                    '<h3 class="dash-upcoming-company">' + escapeHtml(next.company) + '</h3>' +
                '</div>' +
                countdown +
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
    /* Inline icon glyphs for the summary stat cards (same stroke style as the
       sidebar navigation icons). */
    var STAT_ICON_UPCOMING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M11.4 8.8L12 12M12 12L17 10.6"/><circle cx="12" cy="12" r="1.6"/></svg>';
    var STAT_ICON_COMPLETED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17.24 9 17.24L20 17.24 20 21.5L20 24 21.24L22 24 22.24 24 22.24L23 21.24 23 17.5 23 6L24 6 24 4 24 4"/></svg>';
    var STAT_ICON_FAVORITES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.5 2.55 5.17 5.7.83-4.12 4.02.97 5.67L12 16.6l-5.1 2.68.97-5.67L3.75 9.5l5.7-.83L12 3.5Z"/></svg>';
    var STAT_ICON_TICKETS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9a2 2 0 0 0 2 2 2 2 0 0 1 0 4 2 2 0 0 0-2 2v2a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v4Z"/><path d="M14.5 7.5v2M14.5 11.5v2M14.5 15.5v2"/></svg>';

    function statCard(typeClass, label, value, iconHtml) {
        return '<div class="card dash-stat ' + typeClass + '">' +
            '<div class="dash-stat-head">' +
                '<span class="dash-stat-icon" aria-hidden="true">' + iconHtml + '</span>' +
                '<span class="dash-stat-label">' + label + '</span>' +
            '</div>' +
            '<strong class="dash-stat-value">' + value + '</strong>' +
        '</div>';
    }

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
        el.innerHTML = statCard('dash-stat--upcoming', 'Upcoming', upcoming, STAT_ICON_UPCOMING) +
            statCard('dash-stat--completed', 'Completed', completed, STAT_ICON_COMPLETED) +
            statCard('dash-stat--favorites', 'Favorites', favs, STAT_ICON_FAVORITES) +
            statCard('dash-stat--tickets', 'Tickets', tickets, STAT_ICON_TICKETS);
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
            var logo = c && c.logo ? c.logo : '';
            html += '<a class="dash-mini-chip" href="company.html?company=' + escapeHtml(slugs[i]) + '">' +
                (logo
                    ? '<img class="dash-mini-chip-logo" src="' + escapeHtml(logo) + '" alt="" width="22" height="22" loading="lazy">'
                    : '<span aria-hidden="true">&#128652;</span>') +
                '<span class="dash-mini-chip-name">' + escapeHtml(name) + '</span>' +
            '</a>';
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
                '<span class="dash-notif-icon is-' + String(n.type || '').toLowerCase() + '" aria-hidden="true">' +
                    (n.icon || notifIconFor(n.type)) + '</span>' +
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
            html += tripCardHtml(withTickets[j], { showDetails: false });
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

    function starRowHtml(rate) {
        var n = Math.round(Number(rate) || 0);
        var html = '';
        for (var s = 1; s <= 5; s++) {
            html += '<span class="dash-fav-star' + (s <= n ? ' is-on' : '') + '" aria-hidden="true">\u2605</span>';
        }
        return html;
    }

    function renderFavoriteCompanies() {
        var el = document.getElementById('fav-companies');
        if (!el) { return; }
        var slugs = favCompanies();
        if (!slugs.length) {
            el.innerHTML = '<div class="dash-empty">' +
                '<p class="dash-empty-icon" aria-hidden="true">&#11088;</p>' +
                '<h3>No favorite companies yet</h3>' +
                '<p>Star a company on its profile page and it will appear here.</p>' +
                '<a href="companies.html" class="btn btn-secondary btn-sm">Browse Companies</a>' +
            '</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < slugs.length; i++) {
            var c = companyBySlug(slugs[i]);
            var name = c ? c.name : slugs[i];
            var logo = c && c.logo ? c.logo : '';
            var rating = c ? Number(c.rating) : 0;
            var meta = '';
            if (c) {
                if (c.destinations && c.destinations.length) { meta = c.destinations.slice(0, 3).join(' \u00b7 '); }
                else if (c.tagline) { meta = c.tagline; }
            }
            html += '<div class="card dash-fav-company">' +
                '<a class="dash-fav-badge" href="company.html?company=' + escapeHtml(slugs[i]) + '">' +
                    (logo
                        ? '<img class="dash-fav-logo" src="' + escapeHtml(logo) + '" alt="' + escapeHtml(name) + '" width="48" height="48" loading="lazy">'
                        : '<span aria-hidden="true">&#128652;</span>') +
                '</a>' +
                '<div class="dash-fav-info">' +
                    '<h4>' + escapeHtml(name) +
                        (c && c.verified ? '<span class="dash-fav-verified" title="Verified company" aria-label="Verified company">&#10003;</span>' : '') +
                    '</h4>' +
                    (rating > 0
                        ? '<span class="dash-fav-stars">' + starRowHtml(rating) + '<span class="dash-fav-rating-num">' + rating.toFixed(1) + '</span></span>'
                        : '<span class="dash-fav-meta">Bus company</span>') +
                    (meta ? '<p class="dash-fav-meta">' + escapeHtml(meta) + '</p>' : '') +
                '</div>' +
                '<div class="dash-fav-actions">' +
                    '<a class="btn btn-secondary btn-sm" href="company.html?company=' + escapeHtml(slugs[i]) + '">View Profile</a>' +
                    '<button type="button" class="btn btn-remove-fav btn-sm" data-fav-slug="' + escapeHtml(slugs[i]) + '" aria-label="Remove ' + escapeHtml(name) + ' from favorites">&#10005; Remove</button>' +
                '</div>' +
            '</div>';
        }
        el.innerHTML = html;
    }

    /* Price-tag / clock / arrow glyphs — same stroke style used on the
       homepage popular-route cards (js/home.js). */
    var ICON_TAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41 12 22l-8-8V4h10l6.59 6.59a2 2 0 0 1 0 2.82Z"/><path d="M8 8h.01"/></svg>';
    var ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
    var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';

    /* Cheapest fare + shortest duration across every company's popularRoutes
       for the given from → to pair (same aggregation the homepage uses). */
    function routeStatsFor(from, to) {
        var price = null, minutes = null;
        var all = window.ETTransportCompanies || [];
        for (var c = 0; c < all.length; c++) {
            var list = (all[c] && all[c].popularRoutes) ? all[c].popularRoutes : [];
            for (var r = 0; r < list.length; r++) {
                var route = list[r];
                if (!route || !route.from || !route.to) { continue; }
                if (String(route.from).toLowerCase() !== String(from).toLowerCase() ||
                    String(route.to).toLowerCase() !== String(to).toLowerCase()) { continue; }
                if (typeof route.price === 'number' && (price === null || route.price < price)) { price = route.price; }
                if (typeof route.minutes === 'number' && (minutes === null || route.minutes < minutes)) { minutes = route.minutes; }
            }
        }
        return { price: price, minutes: minutes };
    }

    function renderFavRoutes() {
        var el = document.getElementById('fav-routes');
        if (!el) { return; }
        var routes = loadFavRoutes();
        if (!routes.length) {
            el.innerHTML = '<div class="dash-empty">' +
                '<p class="dash-empty-icon" aria-hidden="true">&#128204;</p>' +
                '<h3>No favorite routes yet</h3>' +
                '<p>Save a route below for one-click searches.</p>' +
            '</div>';
            return;
        }
        var html = '<ul class="dash-route-list">';
        for (var i = 0; i < routes.length; i++) {
            var r = routes[i];
            var stats = routeStatsFor(r.from, r.to);
            var priceHtml = (stats.price !== null)
                ? '<span class="dash-route-price">' + ICON_TAG + '<b>ETB ' + Number(stats.price).toLocaleString() + '</b></span>'
                : '';
            var durHtml = (stats.minutes !== null)
                ? '<span class="dash-route-dur">' + ICON_CLOCK + '<span>' + formatDuration(stats.minutes) + '</span></span>'
                : '';
            html += '<li class="dash-route-item">' +
                '<a class="dash-route-btn" href="search.html?from=' + encodeURIComponent(r.from) +
                '&amp;to=' + encodeURIComponent(r.to) + '">' +
                    '<span class="dash-route-route">' +
                        '<span class="dash-route-city">' + escapeHtml(r.from) + '</span>' +
                        '<span class="dash-route-arrow" aria-hidden="true">' + ICON_ARROW + '</span>' +
                        '<span class="dash-route-city">' + escapeHtml(r.to) + '</span>' +
                    '</span>' +
                    '<span class="dash-route-meta">' + priceHtml + durHtml + '</span>' +
                '</a>' +
                '<button type="button" class="btn btn-remove-fav dash-route-del" data-route-fav="' + i +
                    '" aria-label="Remove route from favorites">&#10005;</button>' +
            '</li>';
        }
        el.innerHTML = html + '</ul>';
    }

    function renderFavorites() {
        renderFavoriteCompanies();
        renderFavRoutes();
        setCount('fav-count', favCompanies().length);
        setCount('route-count', loadFavRoutes().length);
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
        if (window.ETCityPicker) {
            window.ETCityPicker.sync('fav-from');
            window.ETCityPicker.sync('fav-to');
        }
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

    function saveNotifications(list) {
        setJSON(KEY_NOTIF, list);
        setJSON(KEY_NOTIF_VERSION, NOTIF_DEMO_VERSION);
    }

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
        var total = list.length;
        if (notifFilter === 'unread') {
            list = list.filter(function (n) { return !n.read; });
        }
        if (!total) {
            el.innerHTML = '<div class="dash-empty">' +
                '<p class="dash-empty-icon" aria-hidden="true">&#128276;</p>' +
                '<h3>No notifications</h3><p>Booking updates will appear here.</p></div>';
            return;
        }
        if (!list.length) {
            el.innerHTML = '<div class="dash-empty">' +
                '<p class="dash-empty-icon" aria-hidden="true">&#128203;</p>' +
                '<h3>You\'re all caught up</h3><p>No unread notifications right now.</p></div>';
            return;
        }
        var html = '<ul class="dash-notif-list">';
        for (var i = 0; i < list.length; i++) {
            var n = list[i];
            var typeCls = String(n.type || '').toLowerCase();
            html += '<li>' +
                '<button type="button" class="dash-notif-item ' + (n.read ? 'is-read' : 'is-unread') +
                '" data-notif-id="' + escapeHtml(n.id) + '">' +
                    '<span class="dash-notif-icon is-' + typeCls + '" aria-hidden="true">' +
                        (n.icon || notifIconFor(n.type)) + '</span>' +
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
    function validLocalPhone(digits) { return /^[1-9][0-9]{8}$/.test(digits); }

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

    /* ============================================================
       Profile modal helpers — gender radios, DOB picker, refunds.
       ============================================================ */
    function setGenderRadio(value) {
        var radios = document.querySelectorAll('#profile-form input[name="gender"]');
        for (var i = 0; i < radios.length; i++) {
            radios[i].checked = (radios[i].value === value);
        }
    }
    function selectedGender() {
        var radios = document.querySelectorAll('#profile-form input[name="gender"]');
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) { return radios[i].value; }
        }
        return '';
    }

    /* "Use my account" refunds derive a TeleBirr number from the +251 phone. */
    function telebirrNumber(phone) {
        var digits = normalizeLocalPhone(phone);
        return validLocalPhone(digits) ? '0' + digits : '';
    }

    function syncRefundOtherToggle() {
        var bank = document.getElementById('p-refund-bank');
        var otherWrap = document.getElementById('p-refund-other-wrap');
        if (!bank || !otherWrap) { return; }
        if (bank.value === 'Other') {
            otherWrap.hidden = false;
        } else {
            otherWrap.hidden = true;
            var other = document.getElementById('p-refund-other');
            if (other) { other.value = ''; }
        }
    }

    function refundSummaryText(p) {
        var ra = (p && p.refundAccount) ? p.refundAccount : null;
        if (!ra) { return '\u2014'; }
        if (ra.mode === 'mine') { return 'My account \u00b7 TeleBirr'; }
        var bank = (ra.bank === 'Other' && ra.otherBank) ? ra.otherBank : ra.bank;
        if (!bank && !ra.number) { return '\u2014'; }
        return ((bank || 'Account') + (ra.number ? ' \u00b7 ' + ra.number : '')).trim();
    }

    function renderProfile(user) {
        var p = effectiveProfile(user || sessionUser);
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
        document.getElementById('p-refund').textContent = refundSummaryText(p);
    }

    var profileModal = document.getElementById('profile-modal');
    var profileFormMsg = document.getElementById('profile-form-msg');

    /* Last successfully verified session user (set in start()) so the
       profile and greeting can fall back to the real account identity. */
    var sessionUser = null;

    function openProfileModal() {
        if (!profileModal) { return; }
        var p = effectiveProfile(sessionUser);
        document.getElementById('p-full-name').value = p.fullName || '';
        document.getElementById('p-phone-input').value = normalizeLocalPhone(p.phone);
        document.getElementById('p-email-input').value = p.email || '';
        setGenderRadio(p.gender || '');
        var dobEl = document.getElementById('p-dob-input');
        if (dobEl) {
            dobEl.max = isoToday();
            dobEl.value = p.dob || '';
        }
        var prefill = document.getElementById('p-prefill');
        if (prefill) { prefill.checked = !!(p.prefillBooking); }

        /* Refund account — plain saved values, edited directly. Mirrors the
           booking section's refund form. Legacy "mode: mine" data (entered in
           earlier builds) still expands to the profile's own TeleBirr account. */
        var savedRefund = (p && p.refundAccount && typeof p.refundAccount === 'object') ? p.refundAccount : null;
        var rName = document.getElementById('p-refund-name');
        var rBank = document.getElementById('p-refund-bank');
        var rNum = document.getElementById('p-refund-number');
        var rOther = document.getElementById('p-refund-other');
        if (rName) {
            rName.value = savedRefund
                ? ((savedRefund.mode === 'mine') ? (p.fullName || '') : (savedRefund.name || ''))
                : '';
        }
        if (rBank) {
            rBank.value = savedRefund
                ? ((savedRefund.mode === 'mine') ? 'TeleBirr' : (savedRefund.bank || ''))
                : '';
        }
        if (rNum) {
            rNum.value = savedRefund
                ? ((savedRefund.mode === 'mine') ? telebirrNumber(p && p.phone) : (savedRefund.number || ''))
                : '';
        }
        if (rOther) { rOther.value = (savedRefund && savedRefund.otherBank) ? savedRefund.otherBank : ''; }
        syncRefundOtherToggle();

        clearFieldError('p-full-name');
        clearFieldError('p-phone-input');
        clearFieldError('p-email-input');
        clearFieldError('p-dob');
        clearFieldError('p-refund-name');
        clearFieldError('p-refund-bank');
        clearFieldError('p-refund-number');
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
       Complaints — real complaint filing + tracking for passengers
       (api/complaint.php). Guests/demo never call the protected
       endpoint; the server enforces ownership per passenger.
       ============================================================ */
    var currentComplaints = [];
    var complaintState = 'idle'; // idle | loading | loaded | error

    function complaintBadgeHtml(status) {
        var s = String(status || 'open').replace(/[^a-z_]/g, '');
        var label = {
            open: 'Open',
            in_progress: 'In progress',
            resolved_pending: 'Awaiting confirmation',
            resolved: 'Resolved',
            closed: 'Closed',
            escalated: 'Escalated'
        }[s] || s.replace('_', ' ');
        return '<span class="dash-complaint-badge ' + s + '">' + escapeHtml(label) + '</span>';
    }

    function complaintChatTime(value) {
        if (!value) { return ''; }
        var iso = String(value).indexOf(' ') > 0 ? String(value).replace(' ', 'T') : String(value);
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return ''; }
        try {
            return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        } catch (e) { return ''; }
    }

    /* Full chat thread: status tellers as centered chips + messages aligned by
       the actor (You / Company / Support). Company replies were previously a
       plain bordered block; now they are a real timeline. */
    function complaintThreadHtml(c) {
        var entries = (Array.isArray(c.responses) && c.responses.length)
            ? c.responses
            : (c.response ? [{ id: -1, message: c.response, created_at: c.response_at, updated_at: c.response_at, kind: 'message', actor: 'company' }] : []);
        if (!entries.length) { return ''; }
        var html = '<div class="dash-complaint-thread">';
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (e.kind === 'status') {
                html += '<div class="dash-complaint-teller"><span class="dash-complaint-teller-text">' + escapeHtml(e.message) + '</span>' +
                    (e.created_at ? '<span class="dash-complaint-teller-meta">' + escapeHtml(complaintChatTime(e.created_at)) + '</span>' : '') + '</div>';
                continue;
            }
            var side = e.actor === 'passenger' ? 'you' : (e.actor === 'admin' ? 'support' : 'company');
            var who = e.actor === 'passenger' ? 'You' : (e.actor === 'admin' ? 'ET Transport Support' : 'Company');
            html += '<div class="dash-complaint-bubble is-' + side + '">' +
                '<span class="dash-complaint-bubble-who">' + escapeHtml(who) + '</span>' +
                '<p>' + escapeHtml(e.message) + '</p>' +
                (e.created_at ? '<span class="dash-complaint-bubble-meta">' + escapeHtml(complaintChatTime(e.created_at)) + '</span>' : '') +
            '</div>';
        }
        html += '</div>';
        return html;
    }

    /* Passenger action row: confirm / reopen (when awaiting confirmation),
       escalate (open/in_progress), or a read-only note for closed/resolved. */
    function complaintActionsHtml(c) {
        var id = c.id;
        if (c.status === 'resolved_pending') {
            return '<div class="dash-complaint-actions">' +
                '<span class="dash-complaint-actions-hint">The company marked this as resolved. Please confirm, or reopen it if the issue continues.</span>' +
                '<div class="dash-complaint-actions-btns">' +
                    '<button type="button" class="btn btn-primary btn-sm" data-complaint-action="confirm" data-complaint-id="' + id + '">Confirm resolved</button>' +
                    '<button type="button" class="btn btn-secondary btn-sm" data-complaint-action="reopen" data-complaint-id="' + id + '">Reopen complaint</button>' +
                '</div>' +
            '</div>';
        }
        if (c.status === 'resolved' || c.status === 'closed') {
            return '<div class="dash-complaint-actions"><span class="dash-complaint-actions-hint">' +
                (c.status === 'resolved' ? 'This complaint is resolved and confirmed.' : 'This complaint is closed.') +
                '</span></div>';
        }
        if (c.status === 'escalated') {
            return '<div class="dash-complaint-actions"><span class="dash-complaint-actions-hint is-escalated">Escalated — ET Transport support is reviewing your complaint.</span></div>';
        }
        /* open / in_progress: reply + escalate */
        return '<div class="dash-complaint-actions">' +
            '<div class="dash-complaint-reply-compose">' +
                '<textarea class="dash-complaint-reply-input" data-complaint-reply="' + id + '" maxlength="1000" placeholder="Reply to the company\u2026"></textarea>' +
                '<button type="button" class="btn btn-primary btn-sm" data-complaint-action="reply" data-complaint-id="' + id + '">Send reply</button>' +
            '</div>' +
            '<div class="dash-complaint-actions-btns">' +
                '<button type="button" class="btn btn-secondary btn-sm" data-complaint-action="escalate" data-complaint-id="' + id + '">Escalate to support</button>' +
            '</div>' +
        '</div>';
    }

    var COMPLAINT_CATEGORY_LABELS = {
        refund_issue: 'Refund Problem',
        lost_parcel: 'Lost Parcel',
        crew_behavior: 'Crew Behavior',
        comfort: 'Comfort',
        luggage: 'Luggage',
        late_departure: 'Late Departure',
        cancelled_trip: 'Canceled Trip',
        missed_bus: 'Missed Bus',
        other: 'Other'
    };

    function complaintCategoryLabel(category) {
        return COMPLAINT_CATEGORY_LABELS[category] || 'Other';
    }

    function formatComplaintDate(value) {
        if (!value) { return ''; }
        var iso = String(value).replace(' ', 'T');
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return String(value).slice(0, 10); }
        try {
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) { return String(value).slice(0, 10); }
    }

    function complaintPostAction(id, action, message) {
        var body = new URLSearchParams();
        body.append('complaint_id', id);
        if (message) { body.append('message', message); }
        return window.fetch('api/complaint.php?action=' + encodeURIComponent(action), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
            body: body.toString()
        }).then(function (res) {
            return res.json().catch(function () { return { success: false, message: 'Invalid server response.' }; });
        });
    }

    /* Passenger lifecycle actions from the complaint cards. */
    function handleComplaintAction(btn) {
        var action = btn.getAttribute('data-complaint-action');
        var id = btn.getAttribute('data-complaint-id');
        if (!action || !id) { return; }
        var original = btn.textContent;
        btn.disabled = true;

        var message = '';
        if (action === 'reply') {
            var input = document.querySelector('[data-complaint-reply="' + id + '"]');
            message = input ? input.value.trim() : '';
            if (!message) { btn.disabled = false; return; }
        }

        complaintPostAction(Number(id), action, message || null).then(function (json) {
            btn.disabled = false;
            if (!json || !json.success) {
                toast((json && json.message) || 'Unable to update the complaint.');
                return;
            }
            /* Refresh the complaint list so the thread + status are current. */
            syncRealComplaints();
        }).catch(function () {
            btn.disabled = false;
            toast('Network error while updating the complaint.');
        });
    }

    function renderComplaints() {
        var list = document.getElementById('complaint-list');
        var empty = document.getElementById('complaint-empty');
        if (!list) { return; }

        if (complaintState === 'loading') {
            list.innerHTML = '';
            if (empty) { empty.textContent = 'Loading your complaints\u2026'; empty.hidden = false; }
            return;
        }

        if (currentComplaints.length) {
            var html = '';
            for (var i = 0; i < currentComplaints.length; i++) {
                var c = currentComplaints[i];
                var ctx = '';
                if (c.route || c.departure || c.booking_reference) {
                    var parts = [];
                    if (c.route) { parts.push(c.route); }
                    if (c.departure) { parts.push('Departs ' + c.departure); }
                    if (c.booking_reference) { parts.push('Booking ' + c.booking_reference); }
                    ctx = '<p class="dash-complaint-meta">' + escapeHtml(parts.join(' \u00b7 ')) + '</p>';
                }
                html += '<article class="dash-complaint-card">' +
                    '<div class="dash-complaint-card-head">' +
                        '<span class="dash-complaint-company">' + escapeHtml((c.target === 'platform' ? 'ET Transport' : (c.company_name || 'Company'))) + '</span>' +
                        '<span class="dash-complaint-category">' + escapeHtml(complaintCategoryLabel(c.category)) + '</span>' +
                        complaintBadgeHtml(c.status) +
                        '<span class="dash-complaint-date">' + formatComplaintDate(c.created_at) + '</span>' +
                    '</div>' +
                    '<h4 class="dash-complaint-subject">' + escapeHtml(c.subject) + '</h4>' +
                    '<p class="dash-complaint-message">' + escapeHtml(c.message) + '</p>' +
                    ctx + complaintThreadHtml(c) + complaintActionsHtml(c) +
                '</article>';
            }
            list.innerHTML = html;
            if (empty) { empty.hidden = true; }
            return;
        }

        list.innerHTML = '';
        if (empty) {
            empty.hidden = false;
            empty.textContent = complaintState === 'error'
                ? 'Could not load your complaints. Please try again later.'
                : 'No complaints filed yet. Found an issue with a journey or the site itself? Use the form above to file one and track the response here.';
        }
    }

    function applyComplaintAccess() {
        var form = document.getElementById('complaint-form');
        var btn = document.getElementById('complaint-submit-btn');
        var guestNote = document.getElementById('complaint-guest-note');
        if (!window.ETAuth || !window.ETAuth.getCurrentUser) { return; }
        window.ETAuth.getCurrentUser().then(function (user) {
            var loggedIn = !!(user && user.role === 'passenger');
            if (form) { form.hidden = !loggedIn; }
            if (btn) { btn.disabled = !loggedIn; }
            if (guestNote) { guestNote.hidden = loggedIn; }
        }).catch(function () { /* keep form visible by default */ });
    }

    function syncRealComplaints() {
        if (!window.ETAuth || !window.ETAuth.getCurrentUser) { return; }
        window.ETAuth.getCurrentUser().then(function (user) {
            if (!user || user.role !== 'passenger') {
                currentComplaints = [];
                complaintState = 'idle';
                renderComplaints();
                return;
            }
            if (!window.fetch) { complaintState = 'error'; renderComplaints(); return; }
            complaintState = 'loading';
            renderComplaints();
            window.fetch('api/complaint.php?action=list', {
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
            })
                .then(function (res) { return res.json().catch(function () { return { success: false }; }); })
                .then(function (json) {
                    if (!json || !json.success || !Array.isArray(json.complaints)) {
                        complaintState = 'error';
                    } else {
                        currentComplaints = json.complaints;
                        complaintState = 'loaded';
                    }
                    renderComplaints();
                })
                .catch(function () {
                    complaintState = 'error';
                    renderComplaints();
                });
        }).catch(function () { /* stay in demo empty state */ });
    }

    function loadComplaintCompanies() {
        var select = document.getElementById('complaint-company');
        if (!select) { return; }
        function fill(companies) {
            if (!Array.isArray(companies)) { return; }
            select.innerHTML = '<option value="">Select a company\u2026</option>';
            for (var i = 0; i < companies.length; i++) {
                var c = companies[i];
                if (!c || !c.id) { continue; }
                var opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name + (c.slug ? ' (@' + c.slug + ')' : '');
                select.appendChild(opt);
            }
        }
        var demo = (window.ETTransportCompanies || []).slice();
        if (!window.fetch) { fill(demo); return; }
        window.fetch('api/company.php?action=list', {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) { return res.json().catch(function () { return null; }); })
            .then(function (json) {
                if (json && json.success && Array.isArray(json.companies)) { fill(json.companies); }
                else { fill(demo); }
            })
            .catch(function () { fill(demo); });
    }

    /* Toggle the company picker based on the chosen complaint target. */
    function syncComplaintTargetUI() {
        var target = document.getElementById('complaint-target');
        var companyField = document.getElementById('complaint-company-field');
        var company = document.getElementById('complaint-company');
        if (!target || !companyField) { return; }
        var isPlatform = target.value === 'platform';
        companyField.hidden = isPlatform;
        if (isPlatform) {
            if (company) { company.value = ''; }
            clearFieldError('complaint-company');
        }
    }

    function submitComplaint(event) {
        event.preventDefault();
        var form = document.getElementById('complaint-form');
        var target = document.getElementById('complaint-target');
        var company = document.getElementById('complaint-company');
        var subject = document.getElementById('complaint-subject');
        var message = document.getElementById('complaint-message');
        var category = document.getElementById('complaint-category');
        var booking = document.getElementById('complaint-booking');
        var msg = document.getElementById('complaint-form-msg');
        if (!form || !target || !subject || !message) { return; }

        var isPlatform = target.value === 'platform';

        if (msg) { msg.hidden = true; }
        var ok = true;
        if (!isPlatform) {
            if (!company || !company.value) { setFieldError('complaint-company', 'Choose a bus company.'); ok = false; }
            else { clearFieldError('complaint-company'); }
        }
        if (!subject.value.trim()) { setFieldError('complaint-subject', 'A subject is required.'); ok = false; }
        else { clearFieldError('complaint-subject'); }
        if (!message.value.trim()) { setFieldError('complaint-message', 'Describe what happened.'); ok = false; }
        else { clearFieldError('complaint-message'); }
        if (!ok) { return; }

        var btn = document.getElementById('complaint-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Submitting\u2026'; }

        var body = new URLSearchParams();
        body.append('target', isPlatform ? 'platform' : 'company');
        if (!isPlatform) { body.append('company_id', company.value); }
        body.append('subject', subject.value.trim());
        body.append('message', message.value.trim());
        body.append('category', category ? category.value : 'other');
        if (booking && booking.value.trim()) { body.append('booking_reference', booking.value.trim()); }

        window.fetch('api/complaint.php?action=create', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
            body: body.toString()
        })
            .then(function (res) { return res.json().catch(function () { return { success: false, message: 'Invalid server response.' }; }); })
            .then(function (json) {
                if (btn) { btn.disabled = false; btn.textContent = 'Submit Complaint'; }
                if (!json || !json.success) {
                    if (msg) {
                        msg.textContent = (json && json.message) || 'Unable to submit the complaint. Please try again.';
                        msg.hidden = false;
                    }
                    return;
                }
                form.reset();
                syncComplaintTargetUI();
                if (msg) {
                    msg.textContent = isPlatform ? 'Complaint submitted. ET Transport support will respond here soon.' : 'Complaint submitted. The company will respond here soon.';
                    msg.hidden = false;
                }
                syncRealComplaints();
            })
            .catch(function () {
                if (btn) { btn.disabled = false; btn.textContent = 'Submit Complaint'; }
                if (msg) {
                    msg.textContent = 'Network error while submitting the complaint.';
                    msg.hidden = false;
                }
            });
    }

/* ============================================================
       Navigation — sidebar section switching + My Trips tabs
       ============================================================ */
    var SECTIONS = ['overview', 'trips', 'tickets', 'favorites', 'notifications', 'profile', 'support', 'complaints'];

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
        if (name === 'complaints') { applyComplaintAccess(); syncRealComplaints(); loadComplaintCompanies(); }
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

    /* ---------- Overview "View all" shortcuts (switch sections) ---------- */
    var gotoEls = document.querySelectorAll('[data-goto-section]');
    for (var gi = 0; gi < gotoEls.length; gi++) {
        gotoEls[gi].addEventListener('click', function () {
            showSection(this.getAttribute('data-goto-section'));
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

    /* ---------- Notifications filter tabs (All / Unread) ---------- */
    var notifTabsWrap = document.querySelector('.dash-notif-tabs');
    if (notifTabsWrap) {
        notifTabsWrap.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('button[data-notif-filter]') : null;
            if (!btn) { return; }
            notifFilter = btn.getAttribute('data-notif-filter') || 'all';
            var tabs = notifTabsWrap.querySelectorAll('button[data-notif-filter]');
            for (var ti = 0; ti < tabs.length; ti++) {
                var on = (tabs[ti] === btn);
                tabs[ti].className = 'dash-tab' + (on ? ' active' : '');
                tabs[ti].setAttribute('aria-selected', on ? 'true' : 'false');
            }
            renderNotifications();
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

    /* Inline validation shown as the user leaves each field (name, email, DOB).
       Phone already validates live as digits are typed. */
    function validateNameField() {
        var el = document.getElementById('p-full-name');
        if (!el) { return; }
        if (!el.value.trim()) { setFieldError('p-full-name', 'Full name is required.'); }
        else { clearFieldError('p-full-name'); }
    }
    function validateEmailField() {
        var el = document.getElementById('p-email-input');
        if (!el) { return; }
        var val = el.value.trim();
        if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setFieldError('p-email-input', 'Please enter a valid email address.'); }
        else { clearFieldError('p-email-input'); }
    }
    function validateDobField() {
        var el = document.getElementById('p-dob-input');
        if (!el) { return; }
        var val = el.value;
        if (!val) { clearFieldError('p-dob'); return; }
        if (val > isoToday()) { setFieldError('p-dob', 'Date of birth cannot be in the future.'); }
        else { clearFieldError('p-dob'); }
    }
    var profileNameFld = document.getElementById('p-full-name');
    if (profileNameFld) { profileNameFld.addEventListener('blur', validateNameField); }
    var profileEmailFld = document.getElementById('p-email-input');
    if (profileEmailFld) { profileEmailFld.addEventListener('blur', validateEmailField); }
    var profileDobFld = document.getElementById('p-dob-input');
    if (profileDobFld) {
        profileDobFld.max = isoToday();
        profileDobFld.addEventListener('change', validateDobField);
    }

    function fetchWithTimeout(url, options, ms) {
        if (typeof window.fetch !== 'function') { return Promise.reject(new Error('fetch unavailable')); }
        if (typeof window.AbortController === 'undefined') { return window.fetch(url, options); }
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, ms || 8000);
        var opts = {};
        if (options) {
            for (var k in options) {
                if (Object.prototype.hasOwnProperty.call(options, k)) { opts[k] = options[k]; }
            }
        }
        opts.signal = controller.signal;
        return window.fetch(url, opts)
            .then(function (resp) { clearTimeout(timer); return resp; })
            .catch(function (err) { clearTimeout(timer); throw err; });
    }

    var profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', function (event) {
            event.preventDefault();
            var ok = true;
            var name = document.getElementById('p-full-name').value.trim();
            var email = document.getElementById('p-email-input').value.trim();
            var digits = normalizeLocalPhone(document.getElementById('p-phone-input').value);
            var gender = selectedGender();
            var dobIso = document.getElementById('p-dob-input').value;
            var prefillBooking = !!(document.getElementById('p-prefill') && document.getElementById('p-prefill').checked);

            if (dobIso && dobIso > isoToday()) {
                setFieldError('p-dob', 'Date of birth cannot be in the future.');
                ok = false;
            } else {
                clearFieldError('p-dob');
            }

            if (!name) { setFieldError('p-full-name', 'Full name is required.'); ok = false; }
            else { clearFieldError('p-full-name'); }

            if (!validLocalPhone(digits)) { setFieldError('p-phone-input', 'Please enter a valid Ethiopian phone number (09XXXXXXXX / +2519XXXXXXXX, or a landline such as 11XXXXXXX).'); ok = false; }
            else { clearFieldError('p-phone-input'); }

            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('p-email-input', 'Please enter a valid email address.'); ok = false; }
            else { clearFieldError('p-email-input'); }

            /* Refund account — read directly, the same way as the booking section's
               form. Fields are optional, but once the user starts an account
               keep it internally consistent (a bank is needed, and "Other"
               needs its bank name). */
            var refundBankValue = document.getElementById('p-refund-bank').value;
            var refundAccount = {
                name: document.getElementById('p-refund-name').value.trim(),
                number: document.getElementById('p-refund-number').value.trim(),
                bank: refundBankValue,
                otherBank: ''
            };
            if (refundBankValue === 'Other') {
                refundAccount.otherBank = document.getElementById('p-refund-other').value.trim();
                refundAccount.bank = refundAccount.otherBank ? 'Other' : '';
            }
            var refundStarted = !!(refundAccount.name || refundAccount.number || refundAccount.bank);
            clearFieldError('p-refund-name');
            clearFieldError('p-refund-bank');
            clearFieldError('p-refund-number');
            clearFieldError('p-refund-other');
            if (refundStarted) {
                if (!refundAccount.name) { setFieldError('p-refund-name', 'Please enter the account name.'); ok = false; }
                if (!refundAccount.bank) { setFieldError('p-refund-bank', 'Please choose a bank.'); ok = false; }
                if (refundBankValue === 'Other' && !refundAccount.otherBank) {
                    setFieldError('p-refund-other', 'Please name the bank.');
                    ok = false;
                }
                if (!refundAccount.number) { setFieldError('p-refund-number', 'Please enter the account number.'); ok = false; }
            }

            if (!ok) { return; }

            var fullPhone = '+251' + digits;
            var savedProfile = {
                fullName: name,
                phone: fullPhone,
                email: email,
                gender: gender || '',
                dob: dobIso || '',
                prefillBooking: prefillBooking,
                refundAccount: refundAccount
            };

            /* Local-first save: apply the profile to this device immediately so
               the modal never blocks on the server. Logged-in passengers get
               the same fields synced to the database in the background (with a
               timeout, so a slow server can never leave the button hanging). */
            var body = new FormData();
            body.append('name', name);
            body.append('email', email);
            body.append('phone', fullPhone);
            body.append('gender', gender || '');
            body.append('date_of_birth', dobIso || '');

            function applyProfile(updatedUser) {
                if (updatedUser) { sessionUser = updatedUser; }
                setJSON(KEY_PROFILE, savedProfile);
                renderProfile();
                closeProfileModal();
                toast('Your profile has been updated.');
            }

            if (sessionUser && typeof window.fetch === 'function') {
                fetchWithTimeout('api/auth.php?action=update_profile', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Accept': 'application/json' },
                    body: body
                }, 8000)
                    .then(function (res) { return res.json().catch(function () { return {}; }); })
                    .then(function (json) {
                        if (json && json.success === true && json.user) {
                            sessionUser = json.user;
                            setJSON(KEY_PROFILE, savedProfile);
                            renderProfile();
                        } else if (json && json.message) {
                            toast('Saved on this device \u2014 server sync: ' + json.message);
                        }
                    })
                    .catch(function () {
                        toast('Profile saved on this device \u2014 server sync unavailable.');
                    });
            }
            applyProfile(null);
        });
    }

    /* Live behaviour for the redesigned profile form: DOB input handling,
       refund bank "Other" field toggle and inline validation on blur/change. */
    var profileFormLive = document.getElementById('profile-form');
    if (profileFormLive) {
        profileFormLive.addEventListener('change', function (event) {
            var target = event.target;
            if (!target || !target.name) { return; }
            if (target.id === 'p-dob-input') { validateDobField(); }
            if (target.id === 'p-refund-bank') { syncRefundOtherToggle(); }
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
        var notifAll = effectiveNotifications();
        var pillAll = document.getElementById('notif-count-all');
        if (pillAll) { pillAll.textContent = String(notifAll.length); }
        var pillUnread = document.getElementById('notif-count-unread');
        if (pillUnread) {
            var nUnread = unreadCount();
            pillUnread.textContent = String(nUnread);
            pillUnread.classList.toggle('is-zero', nUnread === 0);
        }
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
                    } else if (json.notifications.length === 0 && !notifSeeded) {
                        /* A real account with no notifications yet: seed a sample
                           feed once so the section has something to test with. */
                        notifSeeded = true;
                        window.fetch('api/notification.php?action=seed', {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: { 'Accept': 'application/json' }
                        })
                            .then(function (res) { return res.json().catch(function () { return {}; }); })
                            .then(function () { syncRealNotifications(); })
                            .catch(function () {
                                realNotifs = [];
                                notifState = 'loaded';
                                renderNotifications();
                                renderOverviewNotif();
                                updateCounts();
                            });
                        return;
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
    function init(user) {
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
        renderProfile(user);
        renderSupport();
        renderComplaints();
        applyComplaintAccess();
        loadComplaintCompanies();
        loadRealCompanyLogos();
        updateCounts();
        syncRealBookings();
        syncRealNotifications();
        syncRealComplaints();

        var complaintForm = document.getElementById('complaint-form');
        if (complaintForm) { complaintForm.addEventListener('submit', submitComplaint); }

        var complaintTarget = document.getElementById('complaint-target');
        if (complaintTarget) {
            complaintTarget.addEventListener('change', syncComplaintTargetUI);
            syncComplaintTargetUI();
        }

        /* Complaint card lifecycle actions: confirm / reopen / reply / escalate. */
        var complaintList = document.getElementById('complaint-list');
        if (complaintList) {
            complaintList.addEventListener('click', function (ev) {
                var btn = ev.target.closest ? ev.target.closest('[data-complaint-action]') : null;
                if (btn && btn.getAttribute('data-complaint-action')) { handleComplaintAction(btn); }
            });
        }

        var hash = window.location.hash ? window.location.hash.slice(1) : 'overview';
        showSection(hash);
    }

    /* ============================================================
       Dashboard gate — the passenger dashboard is account-only.
       A guest (or a non-passenger account) gets a short login
       message with Login / Create Account links instead of the
       dashboard UI, which only runs for a signed-in passenger.
       ============================================================ */
    var dashHead = document.getElementById('dashboard-head');
    var dashUI = document.getElementById('dashboard-ui');
    var dashGate = document.getElementById('dashboard-auth-gate');
    var dashGateLogin = document.getElementById('dashboard-gate-login');
    var dashGateRegister = document.getElementById('dashboard-gate-register');
    var dashGateNote = document.getElementById('dashboard-gate-note');

    /* Same-site target: brings the user back to this exact page after login. */
    function dashGateNext() {
        try {
            return encodeURIComponent(window.location.pathname + window.location.search);
        } catch (e) { return 'dashboard.html'; }
    }

    function showDashboardGate(user) {
        if (dashHead) { dashHead.hidden = true; }
        if (dashUI) { dashUI.hidden = true; }
        if (dashGate) {
            dashGate.hidden = false;
            if (dashGateLogin) { dashGateLogin.href = 'login.html?next=' + dashGateNext(); }
            if (dashGateRegister) { dashGateRegister.href = 'register.html?next=' + dashGateNext(); }
        }
        if (dashGateNote && user && user.role !== 'passenger') {
            dashGateNote.textContent = 'Only passenger accounts have a dashboard.';
            dashGateNote.hidden = false;
        } else if (dashGateNote) {
            dashGateNote.hidden = true;
        }
    }

    function revealDashboard() {
        if (dashGate) { dashGate.hidden = true; }
        if (dashHead) { dashHead.hidden = false; }
        if (dashUI) { dashUI.hidden = false; }
    }

    function start() {
        if (!window.ETAuth || !window.ETAuth.getCurrentUser) {
            /* Auth layer unavailable — keep the page fail-closed on the gate. */
            showDashboardGate(null);
            return;
        }
        window.ETAuth.getCurrentUser().then(function (user) {
            if (user && user.role === 'passenger') {
                sessionUser = user;
                revealDashboard();
                init(user);
            } else {
                showDashboardGate(user);
            }
        }).catch(function () {
            /* Could not verify the session — show the login message. */
            showDashboardGate(null);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
