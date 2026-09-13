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
            var hay = (c.name + ' ' + (c.tagline || '') + ' ' + c.destinations.join(', ')).toLowerCase();
            if (hay.indexOf(q) === -1) { return false; }
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
    function fareHtml(c) {
        var fare = minFareFor(c);
        if (!fare) { return ''; }
        return '<p class="company-card-fare">From <b>ETB ' + fare.toLocaleString() + '</b></p>';
    }

    function cardHtml(c) {
        var isFav = fav ? fav.isFavorite(c.slug) : false;
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
            + '</div>'
            + '<h3 class="company-card-name">' + escapeHtml(c.name) + '</h3>'
            + '<p class="company-card-rating"><span class="stars" aria-hidden="true">' + stars + '</span> '
            + c.rating.toFixed(1) + ' <span class="company-card-reviews">(' + c.reviewCount.toLocaleString() + ' reviews)</span></p>'
            + '<p class="company-card-dest">' + c.destinations.length + ' Destinations</p>'
            + fareHtml(c)
            + '<span class="company-card-cta">View Company &#8594;</span>'
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
            var isF = fav.isFavorite(s);
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
            if (!slug) { return; }
            if (fav) { fav.toggle(slug); }
            refreshFavButtons();
        });
    }

    /* ---------- init (honour ?q= from URL) ---------- */
    var initQuery = getParam('q', '');
    if (initQuery && searchBox) {
        searchBox.value = initQuery;
        state.query = initQuery;
    }

    loadCompaniesFromApi();
})();
