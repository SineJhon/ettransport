/* ============================================================
   ET Transport - companies.js
   Passenger-facing Bus Companies directory.

   Reads the shared mock data exposed by js/company.js:
     window.ETTransportCompanies  (company profiles)
     window.ETTransportTrips      (company trips)
   and reuses window.ETTransportFavorites (js/main.js) so the
   directory favorite buttons stay in sync with the home page
   and hero buttons. Pure ES5, no frameworks, no modules. Safe
   when the data module has not loaded yet (empty list).
   ============================================================ */
(function () {
    'use strict';

    var companies = (window.ETTransportCompanies || []).slice();
    var fav = window.ETTransportFavorites || null;
    var favAllowed = false; /* saved-heart state is passenger-only */
    var state = { query: '', sort: 'rating' };

 /* ---------- real directory from api/company.php ---------- */
    function normalizeApiCompany(raw) {
        if (!raw || !raw.slug) { return null; }
        var about = raw.description || '';
        var tagline = (about.split(/[.\n]/)[0] || '').trim() || raw.name || '';
        return {
            id: raw.id,
            slug: raw.slug,
            name: raw.name || '',
            logo: raw.logo || '',
            coverImage: raw.cover_image || '',
            verified: !!raw.verified,
            tagline: tagline,
            description: about,
            rating: Number(raw.rating) || 0,
            reviewCount: Number(raw.review_count) || 0,
            busCount: Number(raw.bus_count) || 0,
            destinations: Array.isArray(raw.destinations) ? raw.destinations.slice() : [],
            popularRoutes: Array.isArray(raw.popularRoutes) ? raw.popularRoutes.slice() : [],
            amenities: Array.isArray(raw.amenities) ? raw.amenities.slice() : [],
            minFare: Number(raw.min_fare) || null
        };
    }

    function loadCompaniesFromApi() {
        /* ?mock=1 keeps the demo directory (development fallback only). */
        if (getParam('mock', '') === '1' || typeof window.fetch !== 'function') {
            render();
            return;
        }
        if (statsEl) { statsEl.textContent = 'Loading companies...'; }
        window.fetch('api/company.php?action=list', { credentials: 'same-origin' })
            .then(function (res) { return res.json(); })
            .then(function (json) {
                if (json && json.success === true && Array.isArray(json.companies)) {
                    var mapped = json.companies.map(normalizeApiCompany).filter(Boolean);
                    if (mapped.length) { companies = mapped; }
                }
                render();
            })
            .catch(function () { render(); });
    }

    /* ---------- helpers ---------- */
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function buildStars(r) {
        var n = Math.round(Number(r) || 0);
        var str = '';
        for (var i = 0; i < 5; i++) { str += (i < n) ? '\u2605' : '\u2606'; }
        return str;
    }
    function getParam(name, fallback) {
        var v = new URLSearchParams(window.location.search).get(name);
        return (v === null || v === '') ? fallback : v;
    }

    /* ---------- per-company minimum fare ----------
       Powers the "Max fare" filter, the "Lowest fare" sort and the
       "From ETB X" line on each card. Sources, in order: an explicit
       min_fare from the API, the popularRoutes prices in the demo
       data, then any matching trip in window.ETTransportTrips. */
    var fareCache = {};
    function minFareFor(c) {
        if (!c) { return null; }
        var key = c.slug ? c.slug : String(c.id);
        if (fareCache[key] !== undefined) { return fareCache[key]; }
        var prices = [];
        if (typeof c.minFare === 'number' && c.minFare > 0) { prices.push(c.minFare); }
        var routes = c.popularRoutes || [];
        for (var i = 0; i < routes.length; i++) {
            if (routes[i] && typeof routes[i].price === 'number' && routes[i].price > 0) {
                prices.push(routes[i].price);
            }
        }
        var trips = window.ETTransportTrips || [];
        var name = String(c.name || '').toLowerCase();
        for (var j = 0; j < trips.length; j++) {
            if (trips[j] && String(trips[j].company || '').toLowerCase() === name
                && typeof trips[j].price === 'number' && trips[j].price > 0) {
                prices.push(trips[j].price);
            }
        }
        var min = null;
        for (var k = 0; k < prices.length; k++) {
            if (min === null || prices[k] < min) { min = prices[k]; }
        }
        fareCache[key] = min;
        return min;
    }

    /* ---------- DOM refs ---------- */
    var searchBox = document.getElementById('company-search');
    var statsEl = document.getElementById('company-stats-bar');
    var searchBtn = document.getElementById('company-search-btn');
    var gridEl = document.getElementById('company-list');
    var emptyEl = document.getElementById('company-directory-empty');
    if (!gridEl) { return; }

    /* ---------- filter / sort ---------- */
    function matches(c) {
        var q = (state.query || '').toLowerCase();
        if (q) {
            if (String(c.name || '').toLowerCase().indexOf(q) === -1) { return false; }
        }
        return true;
    }
    function applyFilter() {
        var out = [];
        for (var i = 0; i < companies.length; i++) {
            if (matches(companies[i])) { out.push(companies[i]); }
        }
        return out;
    }
    function applySort(list) {
        var copy = list.slice();
        var key = state.sort;
        if (key === 'name') {
            copy.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
        } else if (key === 'reviews') {
            copy.sort(function (a, b) { return (b.reviewCount || 0) - (a.reviewCount || 0); });
        } else if (key === 'destinations') {
            copy.sort(function (a, b) { return b.destinations.length - a.destinations.length; });
        } else if (key === 'buses') {
            copy.sort(function (a, b) { return (b.busCount || 0) - (a.busCount || 0); });
        } else if (key === 'fare') {
            copy.sort(function (a, b) {
                return (minFareFor(a) || Infinity) - (minFareFor(b) || Infinity);
            });
        } else {
            copy.sort(function (a, b) {
                if (b.rating !== a.rating) { return b.rating - a.rating; }
                return (b.reviewCount || 0) - (a.reviewCount || 0);
            });
        }
        return copy;

    
    }
    /* ---------- rendering ---------- */
    /* ---------- card icon set (stroke icons, same family as the homepage) ---------- */
    var CARD_ICONS = {
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
        bus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
        fare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M7 9h10v5h-10"/></svg>',
        arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>'
    };

    function taglineHtml(c) {
        var t = String(c.tagline || '').trim();
        return t ? '<p class="company-card-tagline">' + escapeHtml(t) + '</p>' : '';
    }
    function statCellHtml(icon, count, label) {
        return '<span class="company-card-stat">' + icon + '<b>' + count + '</b><em>' + label + '</em></span>';
    }
    function fareCellHtml(c) {
        var fare = minFareFor(c);
        return fare
            ? '<span class="company-card-stat">' + CARD_ICONS.fare + '<b>ETB ' + fare.toLocaleString() + '</b><em>from</em></span>'
            : '';
    }
    function amenitiesHtml(c) {
        var list = c.amenities || [];
        if (!list.length) { return ''; }
        var html = '';
        var shown = 0;
        for (var i = 0; i < list.length && i < 3; i++, shown++) {
            html += '<span class="company-amenity"><span aria-hidden="true">&#10003;</span> ' + escapeHtml(list[i]) + '</span>';
        }
        if (list.length > shown) {
            html += '<span class="company-amenity company-amenity-more">+' + (list.length - shown) + ' more</span>';
        }
        return '<div class="company-card-amenities">' + html + '</div>';
    }

    function cardHtml(c) {
        var isFav = favAllowed && fav ? fav.isFavorite(c.slug) : false;
        var stars = buildStars(c.rating);
        return ''
            + '<article class="company-card">'
            + '<button type="button" class="fav-btn' + (isFav ? ' is-fav' : '') + '"'
            + ' data-slug="' + escapeHtml(c.slug) + '"'
            + ' aria-pressed="' + isFav + '"'
            + ' aria-label="' + (isFav ? 'Remove ' : 'Add ') + escapeHtml(c.name) + ' from favorites">'
            + (isFav ? '\u2665' : '\u2661') + '</button>'
            + '<a class="company-card-link" href="company.html?company=' + encodeURIComponent(c.slug) + '">'
            + '<div class="company-card-head">'
            + '<img class="company-card-logo" src="' + c.logo + '" alt="' + escapeHtml(c.name) + ' logo" loading="lazy">'
            + '<span class="company-card-titlecopy">'
            + '<h3 class="company-card-name">' + escapeHtml(c.name) + '</h3>'
            + taglineHtml(c)
            + '</span>'
            + '</div>'
            + '<p class="company-card-rating"><span class="stars" aria-hidden="true">' + stars + '</span> '
            + c.rating.toFixed(1) + ' <span class="company-card-reviews">(' + c.reviewCount.toLocaleString() + ' reviews)</span></p>'
            + '<div class="company-card-stats">'
            + statCellHtml(CARD_ICONS.pin, c.destinations.length, 'Destinations')
            + statCellHtml(CARD_ICONS.bus, c.busCount, 'Buses')
            + fareCellHtml(c)
            + '</div>'
            + amenitiesHtml(c)
            + '<span class="company-card-cta">View Company<span class="company-card-cta-arrow" aria-hidden="true">' + CARD_ICONS.arrow + '</span></span>'
            + '</a>'
            + '</article>';
    }
    function render() {
        var list = applySort(applyFilter());
        if (statsEl) { statsEl.innerHTML = '<b>' + list.length + '</b> companies found'; }
        if (emptyEl) { emptyEl.hidden = list.length !== 0; }
        var html = '';
        for (var i = 0; i < list.length; i++) { html += cardHtml(list[i]); }
        gridEl.innerHTML = html;
        refreshFavButtons();
    }
    function refreshFavButtons() {
        if (!fav || !gridEl) { return; }
        var btns = gridEl.querySelectorAll('.fav-btn');
        for (var i = 0; i < btns.length; i++) {
            var b = btns[i];
            var s = b.getAttribute('data-slug');
            var isF = favAllowed && fav.isFavorite(s);
            b.classList.toggle('is-fav', isF);
            b.setAttribute('aria-pressed', isF ? 'true' : 'false');
            b.textContent = isF ? '\u2665' : '\u2661';
        }
    }

    /* ---------- bind UI ---------- */
    function onSearchInput() {
        state.query = searchBox ? (searchBox.value || '') : '';
        render();
    }

    if (searchBox) { searchBox.addEventListener('input', onSearchInput); }
    if (searchBox) {
        searchBox.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                onSearchInput();
                if (searchBtn) { searchBtn.focus(); }
            }
        });
    }
    if (searchBtn) {
        searchBtn.addEventListener('click', function () {
            onSearchInput();
            if (searchBox) { searchBox.blur(); }
        });
    }
    if (gridEl) {
        gridEl.addEventListener('click', function (event) {
            var btn = event.target.closest ? event.target.closest('.fav-btn') : null;
            if (!btn) { return; }
            var slug = btn.getAttribute('data-slug');
            if (!slug || !fav) { return; }
            /* Guests/non-passengers are asked to log in or register
               before they can save a company. */
            fav.requirePassenger(function () {
                favAllowed = true;
                fav.toggle(slug);
                refreshFavButtons();
            });
        });
    }

    /* ---------- init (honour ?q= from URL) ---------- */
    var initQuery = getParam('q', '');
    if (initQuery && searchBox) {
        searchBox.value = initQuery;
        state.query = initQuery;
    }

    loadCompaniesFromApi();

    /* Saved-heart state is passenger-only: once the session resolves,
       reflect the real favorites for passengers and keep guests/company
       accounts on the plain "Add" state. */
    if (fav && fav.passengerOnly) {
        fav.passengerOnly().then(function (allowed) {
            favAllowed = !!allowed;
            refreshFavButtons();
        }).catch(function () {
            favAllowed = false;
            refreshFavButtons();
        });
    }
})();
