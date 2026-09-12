/* ============================================================
   ET Transport — home.js
   Homepage-only behaviours. Loaded ONLY on index.html.
   Renders the "Popular Destinations" section from the real,
   existing company data (js/data.js / js/company.js), sets the
   departure-date minimum, highlights the active nav link and
   gives the sticky header a solid background on scroll.
   ============================================================ */
(function () {
    'use strict';

    /* Only ever run on the homepage. */
    if (!document.body || document.body.className.indexOf('home') === -1) {
        return;
    }

    /* ---------- 1. Sticky header background on scroll ---------- */
    var header = document.querySelector('.site-header');
    function onScroll() {
        var scrolling = (window.pageYOffset || document.documentElement.scrollTop) > 10;
        document.body.classList.toggle('is-scrolled', scrolling);
        if (header) { header.classList.toggle('is-stuck', scrolling); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- 2. Departure date minimum = today ---------- */
    var dateInput = document.getElementById('date');
    if (dateInput) {
        var today = new Date();
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        dateInput.min = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    }

    /* ---------- 3. Active nav link (by hash, else the first link = Home) ---------- */
    var navLinks = document.querySelectorAll('#nav-links a');
    for (var i = 0; i < navLinks.length; i++) {
        navLinks[i].classList.remove('active');
    }
    var activeHref = window.location.hash ? window.location.hash : (navLinks[0] ? navLinks[0].getAttribute('href') : '#');
    for (var j = 0; j < navLinks.length; j++) {
        if (navLinks[j].getAttribute('href') === activeHref) {
            navLinks[j].classList.add('active');
            break;
        }
    }

    /* ---------- 4. Popular Destinations from real data ---------- */
    /* Inline icons used in the route cards (no extra dependencies). */
    var ICON_TAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41 12 22l-8-8V4h10l6.59 6.59a2 2 0 0 1 0 2.82Z"/><path d="M8 8h.01"/></svg>';
    var ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
    var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';

    var grid = document.getElementById('hp-routes-grid');
    var section = document.getElementById('destinations');

    if (grid && section) {
        var companies = (window.ETTransportCompanies || []);

        /* Aggregate every company's real popularRoutes by from->to. */
        var routes = {};   // key -> { from, to, count, minPrice, minMinutes }
        for (var c = 0; c < companies.length; c++) {
            var comp = companies[c];
            var list = (comp && comp.popularRoutes) ? comp.popularRoutes : [];
            for (var r = 0; r < list.length; r++) {
                var route = list[r];
                if (!route || !route.from || !route.to) { continue; }
                var key = route.from.toLowerCase() + '|' + route.to.toLowerCase();
                var entry = routes[key];
                if (!entry) {
                    entry = {
                        from: route.from,
                        to: route.to,
                        count: 0,
                        minPrice: Infinity,
                        minMinutes: Infinity
                    };
                    routes[key] = entry;
                }
                entry.count += 1;
                if (typeof route.price === 'number' && route.price < entry.minPrice) {
                    entry.minPrice = route.price;
                }
                if (typeof route.minutes === 'number' && route.minutes < entry.minMinutes) {
                    entry.minMinutes = route.minutes;
                }
            }
        }

        var all = [];
        for (var k in routes) {
            if (Object.prototype.hasOwnProperty.call(routes, k)) { all.push(routes[k]); }
        }

        /* Most-served routes first, then cheapest. */
        all.sort(function (a, b) {
            if (b.count !== a.count) { return b.count - a.count; }
            return a.minPrice - b.minPrice;
        });

        var top = all.slice(0, 6);

        if (top.length) {
            var html = '';
            for (var t = 0; t < top.length; t++) {
                var it = top[t];
                var price = (it.minPrice === Infinity) ? null : it.minPrice;
                var dur = (it.minMinutes === Infinity) ? null : formatDuration(it.minMinutes);
                var priceHtml = price !== null
                    ? '<span class="hp-route-price">' + ICON_TAG + '<b>ETB ' + price.toLocaleString() + '</b></span>'
                    : '';
                var durHtml = dur
                    ? '<span class="hp-route-dur">' + ICON_CLOCK + '<span>' + dur + '</span></span>'
                    : '';
                html +=
                    '<a class="hp-route" href="search.html?from=' + encodeURIComponent(it.from) +
                    '&to=' + encodeURIComponent(it.to) + '">' +
                        '<span class="hp-route-route">' +
                            '<span class="hp-route-city">' + esc(it.from) + '</span>' +
                            '<span class="hp-route-arrow" aria-hidden="true">' + ICON_ARROW + '</span>' +
                            '<span class="hp-route-city">' + esc(it.to) + '</span>' +
                        '</span>' +
                        '<span class="hp-route-meta">' + priceHtml + durHtml + '</span>' +
                    '</a>';
            }
            grid.innerHTML = html;
        } else {
            section.hidden = true;
        }
    }

    /* ---------- helpers ---------- */
    function formatDuration(minutes) {
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        if (h && m) { return '~' + h + 'h ' + m + 'm'; }
        if (h) { return '~' + h + 'h'; }
        return '~' + m + 'm';
    }

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();
