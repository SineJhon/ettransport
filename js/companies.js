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
    var state = { query: '', rating: '', sort: 'rating', verified: false };

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
            destinations: Array.isArray(raw.destinations) ? raw.destinations.slice() : []
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

    /* ---------- DOM refs ---------- */
    var searchBox = document.getElementById('company-search');
    var sortEl = document.getElementById('company-sort');
    var ratingEl = document.getElementById('company-filter-rating');
    var verifiedEl = document.getElementById('company-filter-verified');
    var clearBtn = document.getElementById('company-clear-filters');
    var statsEl = document.getElementById('company-stats-bar');
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
        if (state.verified && !c.verified) { return false; }
        var min = parseFloat(state.rating);
        if (!isNaN(min) && c.rating < min) { return false; }
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
        } else {
            copy.sort(function (a, b) {
                if (b.rating !== a.rating) { return b.rating - a.rating; }
                return (b.reviewCount || 0) - (a.reviewCount || 0);
            });
        }
        return copy;

    
    }
    /* ---------- rendering ---------- */
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
            + (c.verified ? '<span class="verified-chip"><span aria-hidden="true">&#10003;</span> Verified</span>' : '')
            + '</div>'
            + '<h3 class="company-card-name">' + escapeHtml(c.name) + '</h3>'
            + '<p class="company-card-rating"><span class="stars" aria-hidden="true">' + stars + '</span> '
            + c.rating.toFixed(1) + ' <span class="company-card-reviews">(' + c.reviewCount.toLocaleString() + ' reviews)</span></p>'
            + '<p class="company-card-dest">' + c.destinations.length + ' Destinations</p>'
            + '<span class="company-card-cta">View Company &#8594;</span>'
            + '</a>'
            + '</article>';
    }
    function render() {
        var list = applySort(applyFilter());
        if (statsEl) { statsEl.textContent = list.length + ' companies found'; }
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
    function onSortChange() {
        state.sort = sortEl ? sortEl.value : 'rating';
        render();
    }
    function onRatingChange() {
        state.rating = ratingEl ? ratingEl.value : '';
        render();
    }
    function onVerifiedChange() {
        state.verified = verifiedEl ? verifiedEl.checked : false;
        render();
    }
    function onClear() {
        state = { query: '', rating: '', sort: 'rating', verified: false };
        if (searchBox) { searchBox.value = ''; }
        if (ratingEl) { ratingEl.value = ''; }
        if (verifiedEl) { verifiedEl.checked = false; }
        if (sortEl) { sortEl.value = 'rating'; }
        render();
    }

    if (searchBox) { searchBox.addEventListener('input', onSearchInput); }
    if (sortEl) { sortEl.addEventListener('change', onSortChange); }
    if (ratingEl) { ratingEl.addEventListener('change', onRatingChange); }
    if (verifiedEl) { verifiedEl.addEventListener('change', onVerifiedChange); }
    if (clearBtn) { clearBtn.addEventListener('click', onClear); }
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

    /* ---------- init (honour ?sort= & ?q= from URL) ---------- */
    var initSort = getParam('sort', '');
    if (initSort) {
        state.sort = initSort;
    }
    var initQuery = getParam('q', '');
    if (initQuery && searchBox) {
        searchBox.value = initQuery;
        state.query = initQuery;
    }
    if (sortEl) { sortEl.value = state.sort; }

    loadCompaniesFromApi();
})();
