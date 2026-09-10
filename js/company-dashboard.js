/* ============================================================
   ET Transport — company-dashboard.js
   Minimal company operator dashboard.

   Loads the authenticated company overview from
     GET api/company.php?action=overview
   and renders the company identity banner plus five summary stat
   cards (Active Buses, Upcoming Trips, Upcoming Bookings, Booked
   Passengers, Revenue).

   Ownership is enforced server-side: the endpoint resolves the
   company through the authenticated session user and never trusts a
   company_id parameter. This client only renders that server-shaped
   response.

   The shell is intentionally minimal so later company modules
   (fleet, trips, bookings/revenue) can add sections.
   ============================================================ */

(function () {
    'use strict';

    function byId(id) {
        return document.getElementById(id);
    }

    var toastTimer = null;
    function toast(message) {
        var t = byId('dash-toast');
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


    function setError(message) {
        var loading = byId('company-loading');
        var error = byId('company-error');
        if (loading) { loading.hidden = true; }

        var banner = byId('company-banner');
        var stats = byId('company-stats');
        if (banner) { banner.hidden = true; }
        if (stats) { stats.hidden = true; }

        if (error) {
            error.hidden = false;
            error.className = 'auth-message error';
            error.textContent = message || 'Unable to load your company overview. Please try again later.';
        }
    }

    function formatMoney(value) {
        var num = Number(value);
        if (isNaN(num)) { return '0'; }
        return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    function renderCompany(company) {
        var name = byId('company-name');
        var slug = byId('company-slug');
        var status = byId('company-status');
        var logo = byId('company-logo');

        if (name) { name.textContent = company.name || 'My Company'; }
        if (slug) { slug.textContent = company.slug ? '@' + company.slug : ''; }
        if (company.id !== undefined && company.id !== null) { currentCompanyId = Number(company.id); }

        if (status) {
            status.hidden = false;
            status.textContent = String(company.status || '').toUpperCase();
        }
        if (logo) {
            if (company.logo) {
                logo.src = company.logo;
                logo.hidden = false;
            } else {
                logo.hidden = true;
            }
        }

        var banner = byId('company-banner');
        if (banner) { banner.hidden = false; }
    }

    function renderStats(stats) {
        var map = {
            activeBuses: 'stat-activeBuses',
            upcomingTrips: 'stat-upcomingTrips',
            routeCount: 'stat-routeCount',
            bookedPassengers: 'stat-bookedPassengers',
            revenue: 'stat-revenue'
        };

        Object.keys(map).forEach(function (key) {
            var el = byId(map[key]);
            if (!el) { return; }
            var value = stats[key];
            el.textContent = key === 'revenue' ? formatMoney(value) : String(value === undefined || value === null ? 0 : value);
        });

        var statsBox = byId('company-stats');
        if (statsBox) { statsBox.hidden = false; }
    }

    function renderOverview(data) {
        if (data.company) { renderCompany(data.company); }
        if (data.stats) { renderStats(data.stats); }
    }

    var overviewRequestId = 0;   // discards responses from superseded overview requests

    function loadOverview() {
        var rid = ++overviewRequestId;
        showLoadingState();

        fetch('api/company.php?action=overview', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== overviewRequestId) { return; }
                var loading = byId('company-loading');
                if (loading) { loading.hidden = true; }

                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    setError(data.message || 'Unable to load your company overview.');
                    return;
                }
                renderOverview(data);
                loadReviews();
                loadComplaints();
            })
            .catch(function () {
                if (rid !== overviewRequestId) { return; }
                setError('Network error while loading your company overview.');
            });
    }

    function showLoadingState() {
        var error = byId('company-error');
        if (error) { error.hidden = true; }
        var loading = byId('company-loading');
        if (loading) { loading.hidden = false; }
    }

    /* ===== Focused dashboard navigation (presentation only) =====
       The existing modules keep their IDs, forms and API calls. This shell merely
       gives each workflow a dedicated view instead of one long page. */
    function initWorkspaceNavigation() {
        var main = document.querySelector('main.container');
        if (!main || byId('cd-workspace')) { return; }

        var nodes = {
            identity: byId('auth-identity'), loading: byId('company-loading'), error: byId('company-error'),
            banner: byId('company-banner'), stats: byId('company-stats'), fleet: byId('company-fleet'),
            trips: byId('company-trips'), bookings: byId('company-bookings'), revenue: byId('company-revenue'), profile: byId('company-profile'), routes: byId('company-routes'), reviews: byId('company-reviews'), parcel: byId('company-parcel'), complaints: byId('company-complaints')
        };
        var icon = {
            overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
            fleet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16h18"/><path d="M5 16V9h10l4 4v3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
            passengers: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.8-3.5 2.8-5.5 6-5.5s5.2 2 6 5.5"/><path d="M16 5.5a3 3 0 0 1 0 5"/><path d="M18 14.5c1.6.8 2.6 2.6 3 5"/></svg>',
            revenue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 2 4-6"/></svg>',
            route: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/></svg>',
            profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4 4-6 8-6s6.6 2 8 6"/></svg>',
            reviews: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2  L14.25 8.91  L21.51 8.91  L15.63 13.18  L17.88 20.09  L12 15.82  L6.12 20.09  L8.37 13.18  L2.49 8.91  L9.75 8.91  Z"/></svg>',
            parcel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
            complaint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13c0 4-4 6-8 6-1.5 0-3-.2-4-.6L4 20l1-3.2C3.6 15.4 3 13.8 3 12 3 7.5 7 4 12 4s9 3.5 9 8c0 .4 0 .7-.1 1Z"/><path d="M8 10h8M8 13h5"/></svg>'
        };
        main.className = 'container cd-page';
        main.innerHTML =
            '<div id="cd-workspace" class="cd-workspace">' +
              '<div class="cd-workspace-head"><div><h1>Operator workspace</h1></div><div class="cd-live"><i></i>Account workspace</div></div>' +
              '<div class="cd-layout"><aside class="cd-sidebar"><div class="cd-company-mini"><img id="cd-mini-logo" alt=""><div><strong id="cd-mini-name">Your company</strong><small id="cd-mini-slug">Operator account</small></div></div>' +
                '<nav class="cd-nav" role="tablist" aria-label="Company dashboard sections">' +
                  '<button type="button" role="tab" aria-selected="true" aria-controls="cd-overview" data-cd-view="overview">' + icon.overview + '<span>Overview</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-fleet" data-cd-view="fleet">' + icon.fleet + '<span>Fleet &amp; buses</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-routes" data-cd-view="routes">' + icon.route + '<span>Routes</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-trips" data-cd-view="trips">' + icon.fleet + '<span>Trips</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-passengers" data-cd-view="passengers">' + icon.passengers + '<span>Passengers</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-parcel" data-cd-view="parcel">' + icon.parcel + '<span>Parcel</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-revenue" data-cd-view="revenue">' + icon.revenue + '<span>Revenue</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-reviews" data-cd-view="reviews">' + icon.reviews + '<span>Reviews</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-complaints" data-cd-view="complaints">' + icon.complaint + '<span>Complaints</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-profile" data-cd-view="profile">' + icon.profile + '<span>Public profile</span></button>' +
                '</nav></aside><div class="cd-content">' +
                  '<section id="cd-overview" class="cd-pane" role="tabpanel"><div id="cd-overview-slot"></div><div class="cd-quick-actions"><button type="button" class="cd-quick-action" data-cd-go="fleet" data-cd-action="btn-add-bus"><b class="cd-quick-icon">+</b><span>Add a bus<small>Expand your active fleet</small></span></button><button type="button" class="cd-quick-action" data-cd-go="trips" data-cd-action="btn-add-trip"><b class="cd-quick-icon">↗</b><span>Schedule a trip<small>Open a new departure</small></span></button><button type="button" class="cd-quick-action" data-cd-go="routes" data-cd-action="btn-add-route"><b class="cd-quick-icon">⇄</b><span>Add Routes<small>Add and update city pairs</small></span></button><button type="button" class="cd-quick-action" data-cd-go="profile" data-cd-action="btn-edit-profile"><b class="cd-quick-icon">✦</b><span>Update public profile<small>Keep passenger details current</small></span></button><button type="button" class="cd-quick-action" data-cd-go="parcel" data-cd-action="btn-add-parcel"><b class="cd-quick-icon">▣</b><span>Ship a parcel<small>Register freight with a bus</small></span></button></div></section>' +
                  '<section id="cd-fleet" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Fleet register</h2><p>Add, edit and update the operating status of every vehicle.</p></div></div></section>' +
                  '<section id="cd-trips" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Trips</h2><p>Publish, update and manage each scheduled departure.</p></div></div></section>' +
                  '<section id="cd-passengers" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Passengers &amp; bookings</h2><p>Review bookings and view each passenger\'s digital ticket.</p></div></div></section>' +
                  '<section id="cd-parcel" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Parcel &amp; freight</h2><p>Register and track parcels travelling with your buses.</p></div></div></section>' +
                  '<section id="cd-revenue" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Revenue &amp; payments</h2><p>Review paid and refunded passenger payments.</p></div></div></section>' +
                  '<section id="cd-routes" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Routes</h2></div></div></section>' +
                  '<section id="cd-reviews" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Reviews</h2><p>What passengers say about travelling with your company.</p></div></div></section>' +
                  '<section id="cd-complaints" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Complaints</h2><p>Passenger complaints about your service — triage, reply and close them out.</p></div></div></section>' +
                  '<section id="cd-profile" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Your passenger-facing profile</h2><p>This is the information passengers use to decide who they travel with.</p></div><a id="cd-passenger-preview" class="cd-passenger-preview" href="company.html" target="_blank" rel="noopener">View passenger page ↗</a></div></section>' +
                '</div></div></div>';

        var overviewSlot = byId('cd-overview-slot');
        [nodes.loading, nodes.error, nodes.banner, nodes.stats].forEach(function (node) { if (node) { overviewSlot.appendChild(node); } });
        if (nodes.fleet) { byId('cd-fleet').appendChild(nodes.fleet); }
        if (nodes.trips) { byId('cd-trips').appendChild(nodes.trips); }
        if (nodes.bookings) { byId('cd-passengers').appendChild(nodes.bookings); }
        if (nodes.parcel) { byId('cd-parcel').appendChild(nodes.parcel); }
        if (nodes.revenue) { byId('cd-revenue').appendChild(nodes.revenue); }
        if (nodes.routes) { byId('cd-routes').appendChild(nodes.routes); }
        if (nodes.reviews) {
            var reviewsPane = byId('cd-reviews');
            reviewsPane.appendChild(nodes.reviews);
            var reviewsRefresh = byId('btn-refresh-reviews');
            var reviewsTitle = reviewsPane.querySelector('.cd-pane-title');
            if (reviewsRefresh && reviewsTitle) { reviewsTitle.appendChild(reviewsRefresh); }
        }
        if (nodes.profile) { byId('cd-profile').appendChild(nodes.profile); }
        if (nodes.complaints) { byId('cd-complaints').appendChild(nodes.complaints); }

        function selectView(view) {
            var panes = document.querySelectorAll('.cd-content > .cd-pane');
            var buttons = document.querySelectorAll('[data-cd-view]');
            for (var i = 0; i < panes.length; i++) { panes[i].hidden = panes[i].id !== 'cd-' + view; }
            for (var j = 0; j < buttons.length; j++) { buttons[j].setAttribute('aria-selected', String(buttons[j].getAttribute('data-cd-view') === view)); }
            try { window.history.replaceState(null, '', '#' + view); } catch (e) { /* non-critical */ }
        }
        var navButtons = document.querySelectorAll('[data-cd-view]');
        for (var b = 0; b < navButtons.length; b++) {
            navButtons[b].addEventListener('click', function () {
                var view = this.getAttribute('data-cd-view');
                selectView(view);
                /* Refresh complaints whenever the tab is opened, so items filed
                   after this page loaded show up without a full reload. */
                if (view === 'complaints') { loadComplaints(); }
            });
        }
        var quickActions = document.querySelectorAll('[data-cd-go]');
        for (var q = 0; q < quickActions.length; q++) { quickActions[q].addEventListener('click', function () { selectView(this.getAttribute('data-cd-go')); var target = byId(this.getAttribute('data-cd-action')); if (target) { target.click(); } }); }
        var requested = window.location.hash.replace('#', '');
        if (requested === 'fleet' || requested === 'trips' || requested === 'passengers' || requested === 'parcel' || requested === 'revenue' || requested === 'routes' || requested === 'reviews' || requested === 'complaints' || requested === 'profile') { selectView(requested); }

        var busForm = byId('bus-form');
        if (busForm) {
            var modal = document.createElement('div');
            modal.id = 'bus-form-modal';
            modal.className = 'cd-bus-modal cd-workspace';
            modal.hidden = true;
            modal.innerHTML = '<div class="cd-bus-modal-box" role="dialog" aria-modal="true" aria-labelledby="bus-form-title"><div class="cd-bus-modal-head"><div><strong id="bus-modal-heading">Bus details</strong><p>Keep your vehicle information accurate for trip scheduling.</p></div><button type="button" id="bus-modal-close" class="cd-bus-modal-close" aria-label="Close bus form">×</button></div></div>';
            modal.firstChild.appendChild(busForm);
            document.body.appendChild(modal);
            byId('bus-modal-close').addEventListener('click', hideBusForm);
            modal.addEventListener('click', function (ev) { if (ev.target === modal) { hideBusForm(); } });
        }

        var tripForm = byId('trip-form');
        if (tripForm) {
            var tripModal = document.createElement('div');
            tripModal.id = 'trip-form-modal';
            tripModal.className = 'cd-trip-modal cd-workspace';
            tripModal.hidden = true;
            tripModal.innerHTML = '<div class="cd-trip-modal-box" role="dialog" aria-modal="true" aria-labelledby="trip-form-title"><div class="cd-trip-modal-head"><div><strong id="trip-modal-heading">Trip details</strong><p>Set the route, vehicle, timing and fare for this departure.</p></div><button type="button" id="trip-modal-close" class="cd-trip-modal-close" aria-label="Close trip form">×</button></div></div>';
            tripModal.firstChild.appendChild(tripForm);
            document.body.appendChild(tripModal);
            byId('trip-modal-close').addEventListener('click', hideTripForm);
            tripModal.addEventListener('click', function (ev) { if (ev.target === tripModal) { hideTripForm(); } });
        }

        var routeForm = byId('route-form');
        if (routeForm) {
            var routeModal = document.createElement('div');
            routeModal.id = 'route-form-modal';
            routeModal.className = 'cd-trip-modal cd-workspace';   /* Reuse the trip modal design. */
            routeModal.hidden = true;
            routeModal.innerHTML = '<div class="cd-trip-modal-box" role="dialog" aria-modal="true" aria-labelledby="route-form-title"><div class="cd-trip-modal-head"><div><strong id="route-modal-heading">Route details</strong><p>Add or edit a city pair in the shared route catalog.</p></div><button type="button" id="route-modal-close" class="cd-trip-modal-close" aria-label="Close route form">×</button></div></div>';
            routeModal.firstChild.appendChild(routeForm);
            document.body.appendChild(routeModal);
            byId('route-modal-close').addEventListener('click', hideRouteForm);
            routeModal.addEventListener('click', function (ev) { if (ev.target === routeModal) { hideRouteForm(); } });
            var routeStatusBox = byId('route-status');
            if (routeStatusBox) { routeStatusBox.addEventListener('change', updateRouteStatusUI); }

            /* Station add/remove wiring (the lists live inside the form). */
            var stationAddButtons = routeForm.querySelectorAll('.cd-station-add');
            for (var si = 0; si < stationAddButtons.length; si++) {
                stationAddButtons[si].addEventListener('click', function () {
                    var type = this.getAttribute('data-station-type') === 'dropoff' ? 'dropoff' : 'pickup';
                    var rows = routeStationRows(type);
                    rows.push('');
                    renderStationRows(type, rows);
                    var list = byId(type === 'dropoff' ? 'route-dropoff-list' : 'route-pickup-list');
                    if (list) {
                        var inputs = list.querySelectorAll('.cd-station-row input');
                        if (inputs.length) { inputs[inputs.length - 1].focus(); }
                    }
                });
            }
            ['route-pickup-list', 'route-dropoff-list'].forEach(function (listId) {
                var list = byId(listId);
                if (!list) { return; }
                list.addEventListener('click', function (ev) {
                    var btn = ev.target.closest ? ev.target.closest('.cd-station-remove') : null;
                    if (!btn) { return; }
                    var type = list.id === 'route-dropoff-list' ? 'dropoff' : 'pickup';
                    var rows = routeStationRows(type);
                    var removeButtons = list.querySelectorAll('.cd-station-row .cd-station-remove');
                    var idx = Array.prototype.indexOf.call(removeButtons, btn);
                    if (idx >= 0) { rows.splice(idx + 1, 1); }
                    renderStationRows(type, rows);
                });
            });
        }

        var parcelForm = byId('parcel-form');
        if (parcelForm) {
            var parcelModal = document.createElement('div');
            parcelModal.id = 'parcel-form-modal';
            parcelModal.className = 'cd-parcel-modal cd-workspace';
            parcelModal.hidden = true;
            parcelModal.innerHTML = '<div class="cd-parcel-modal-box" role="dialog" aria-modal="true" aria-labelledby="parcel-modal-heading"><div class="cd-parcel-modal-head"><div><strong id="parcel-modal-heading">Parcel details</strong><p>Book a parcel to ship with your scheduled departures.</p></div><button type="button" id="parcel-modal-close" class="cd-parcel-modal-close" aria-label="Close parcel form">×</button></div></div>';
            parcelModal.firstChild.appendChild(parcelForm);
            document.body.appendChild(parcelModal);
            byId('parcel-modal-close').addEventListener('click', hideParcelForm);
            parcelModal.addEventListener('click', function (ev) { if (ev.target === parcelModal) { hideParcelForm(); } });
        }

        function syncCompanyMini() {
            var name = byId('company-name'); var slug = byId('company-slug'); var logo = byId('company-logo');
            if (name && name.textContent) { byId('cd-mini-name').textContent = name.textContent; }
            if (slug && slug.textContent) { byId('cd-mini-slug').textContent = slug.textContent; }
            if (logo && logo.src) { var miniLogo = byId('cd-mini-logo'); miniLogo.src = logo.src; miniLogo.alt = logo.alt || 'Company logo'; }
        }
        if (nodes.banner) {
            new MutationObserver(syncCompanyMini).observe(nodes.banner, { childList: true, subtree: true, characterData: true, attributes: true });
        }
        syncCompanyMini();
    }

 /* ===== Fleet / Bus management ===== */
    var currentFleet = [];

    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function hideBusForm() {
        var f = byId('bus-form');
        if (f) { f.hidden = true; }
        var modal = byId('bus-form-modal');
        if (modal) { modal.hidden = true; }
    }

    function setBusIdle() {
        var loading = byId('bus-loading');
        if (loading) { loading.hidden = true; }
    }

    function showBusError(message) {
        setBusIdle();
        var list = byId('bus-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('bus-empty'); if (empty) { empty.hidden = true; }
        var error = byId('bus-error');
        if (error) {
            error.hidden = false;
            error.className = 'cd-fleet-error auth-message error';
            error.textContent = message || 'Unable to load your fleet. Please try again later.';
        }
    }

    function renderFleet(buses) {
        setBusIdle();
        var error = byId('bus-error'); if (error) { error.hidden = true; }
        var list = byId('bus-list');
        var empty = byId('bus-empty');

        if (!buses || !buses.length) {
            if (list) { list.innerHTML = ''; list.hidden = true; }
            if (empty) { empty.hidden = false; }
            return;
        }

        var html = buses.map(function (b) {
            var badge = b.status === 'maintenance' ? 'maintenance' : (b.status === 'inactive' ? 'inactive' : '');
            var reg = b.registration_number ? escHtml(b.registration_number) : '\u2014';
            /* Platform policy: every bus is a standard 51-seat coach. */
            var busClass = (b.bus_type === 'standard' || !b.bus_type) ? 'Standard' : escHtml(b.bus_type);
            return '<div class="cd-bus-card" data-bus-id="' + b.id + '">' +
                '<span class="cd-bus-name">' + escHtml(b.name) + '</span>' +
                '<span class="cd-bus-badge ' + badge + '">' + escHtml(b.status) + '</span>' +
                '<div class="cd-record-meta"><span>Registration<b>' + reg + '</b></span><span>Class<b>' + busClass + '</b></span><span>Capacity<b>' + b.seat_count + ' seats</b></span></div>' +
                '<div class="cd-bus-actions">' +
                    '<button type="button" class="btn btn-secondary btn-sm" data-edit="' + b.id + '">Edit</button>' +
                    '<select data-status="' + b.id + '" aria-label="Change status">' +
                        '<option value="active"' + (b.status === 'active' ? ' selected' : '') + '>Active</option>' +
                        '<option value="maintenance"' + (b.status === 'maintenance' ? ' selected' : '') + '>Maintenance</option>' +
                        '<option value="inactive"' + (b.status === 'inactive' ? ' selected' : '') + '>Inactive</option>' +
                    '</select>' +
                '</div>' +
            '</div>';
        }).join('');

        list.innerHTML = html;
        list.hidden = false;
        if (empty) { empty.hidden = true; }
        wireFleetEvents();
    }

    function wireFleetEvents() {
        var list = byId('bus-list');
        if (!list) { return; }
        var buttons = list.querySelectorAll('button[data-edit]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function () {
                openEditForm(this.getAttribute('data-edit'));
            });
        }
        var selects = list.querySelectorAll('select[data-status]');
        for (var j = 0; j < selects.length; j++) {
            selects[j].addEventListener('change', function () {
                changeBusStatus(this.getAttribute('data-status'), this.value);
            });
        }
    }

    var fleetRequestId = 0;   // discards responses from superseded fleet requests

    function loadFleet() {
        var rid = ++fleetRequestId;
        var fleet = byId('company-fleet'); if (fleet) { fleet.hidden = false; }
        var error = byId('bus-error'); if (error) { error.hidden = true; }
        var list = byId('bus-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var loading = byId('bus-loading'); if (loading) { loading.hidden = false; }

        fetch('api/company.php?action=buses', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== fleetRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showBusError(data.message || 'Unable to load your fleet.');
                    return;
                }
                currentFleet = data.buses || [];
                renderFleet(currentFleet);
            })
            .catch(function () {
                if (rid !== fleetRequestId) { return; }
                showBusError('Network error while loading your fleet.');
            });
    }

    function openAddForm() {
        byId('bus-id').value = '';
        byId('bus-name').value = '';
        byId('bus-model').value = '';
        byId('bus-reg').value = '';
        byId('bus-status').value = 'active';
        byId('bus-form-title').textContent = 'Add Bus';
        byId('bus-form-submit').textContent = 'Save Bus';
        byId('bus-modal-heading').textContent = 'Add a bus';
        var err = byId('bus-form-error'); if (err) { err.textContent = ''; }
        byId('bus-form').hidden = false;
        byId('bus-form-modal').hidden = false;
        byId('bus-name').focus();
    }

    function openEditForm(id) {
        var bus = null;
        for (var i = 0; i < currentFleet.length; i++) {
            if (String(currentFleet[i].id) === String(id)) { bus = currentFleet[i]; break; }
        }
        if (!bus) { return; }
        byId('bus-id').value = bus.id;
        byId('bus-name').value = bus.name || '';
        byId('bus-model').value = bus.model || '';
        byId('bus-reg').value = bus.registration_number || '';
        byId('bus-status').value = bus.status || 'active';
        byId('bus-form-title').textContent = 'Edit Bus';
        byId('bus-form-submit').textContent = 'Update Bus';
        byId('bus-modal-heading').textContent = 'Edit bus';
        var err = byId('bus-form-error'); if (err) { err.textContent = ''; }
        byId('bus-form').hidden = false;
        byId('bus-form-modal').hidden = false;
        byId('bus-name').focus();
    }

    function submitBusForm() {
        var errEl = byId('bus-form-error');
        var id = byId('bus-id').value;
        var payload = {
            name: byId('bus-name').value.trim(),
            model: byId('bus-model').value.trim(),
            registration_number: byId('bus-reg').value.trim(),
            /* Platform policy: every bus is a standard 51-seat coach. */
            bus_type: 'standard',
            seat_count: 51,
            status: byId('bus-status').value
        };
        if (id) { payload.bus_id = id; }
        var action = id ? 'bus_update' : 'bus_create';

        fetch('api/company.php?action=' + action, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || !data.success) {
                    if (errEl) { errEl.textContent = data.message || 'Unable to save the bus.'; }
                    return;
                }
                hideBusForm();
                toast(data.message || 'Bus saved successfully.');
                loadFleet();
            })
            .catch(function () {
                if (errEl) { errEl.textContent = 'Network error while saving the bus.'; }
            });
    }

    function changeBusStatus(busId, status) {
        fetch('api/company.php?action=bus_update', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ bus_id: busId, status: status })
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (result.ok && result.status === 200) { loadFleet(); return; }
                var data = result.data || {};
                showBusError(data.message || 'Unable to change the bus status.');
            })
            .catch(function () {
                showBusError('Network error while changing the bus status.');
            });
    }

 /* ===== Route management ===== */
    var currentRoutesCatalog = [];   // route rows loaded from the shared catalog

    function routeDurationLabel(minutes) {
        if (minutes === null || minutes === undefined || minutes === '') { return 'Travel time —'; }
        var m = parseInt(minutes, 10);
        if (isNaN(m) || m <= 0) { return 'Travel time —'; }
        var h = Math.floor(m / 60);
        var r = m % 60;
        var parts = [];
        if (h) { parts.push(h + ' h'); }
        if (r) { parts.push(r + ' min'); }
        if (!parts.length) { parts.push(m + ' min'); }
        return 'Travel time ' + parts.join(' ');
    }

    /* Set the hours + minutes fields (and the hidden total-minutes field)
       from a stored duration in minutes. Blank/zero clears the fields. */
    function setRouteDuration(minutes) {
        var hEl = byId('route-duration-hours');
        var mEl = byId('route-duration-minutes');
        var totalEl = byId('route-duration');
        var val = parseInt(minutes, 10);
        if (isNaN(val) || val <= 0) {
            if (hEl) { hEl.value = ''; }
            if (mEl) { mEl.value = ''; }
            if (totalEl) { totalEl.value = ''; }
            return;
        }
        if (hEl) { hEl.value = String(Math.floor(val / 60)); }
        if (mEl) { mEl.value = String(val % 60); }
        if (totalEl) { totalEl.value = String(val); }
    }

    /* Read the hours + minutes fields and return total minutes as a string
       ('' when both are empty/zero — travel time stays optional). */
    function routeDurationMinutes() {
        var h = parseInt(byId('route-duration-hours').value, 10);
        var m = parseInt(byId('route-duration-minutes').value, 10);
        h = isNaN(h) ? 0 : h;
        m = isNaN(m) ? 0 : m;
        if (h <= 0 && m <= 0) { return ''; }
        return String(h * 60 + m);
    }

    /* Small station summary shown on each dashboard route card. */
    function routeStationsPreview(r) {
        var pickup = Array.isArray(r.pickup_stations) ? r.pickup_stations : [];
        var dropoff = Array.isArray(r.dropoff_stations) ? r.dropoff_stations : [];
        if (!pickup.length && !dropoff.length) { return ''; }
        var html = '<div class="cd-route-stations-preview">';
        if (pickup.length) {
            html += '<span><b>Pickup</b>' + escHtml(pickup.join(' \u00b7 ')) + '</span>';
        }
        if (dropoff.length) {
            html += '<span><b>Drop-off</b>' + escHtml(dropoff.join(' \u00b7 ')) + '</span>';
        }
        html += '</div>';
        return html;
    }

    /* Ordered list of non-empty station names currently typed in the form. */
    function routeStationRows(type) {
        var listId = type === 'dropoff' ? 'route-dropoff-list' : 'route-pickup-list';
        var list = byId(listId);
        if (!list) { return []; }
        var out = [];
        var inputs = list.querySelectorAll('.cd-station-row input');
        for (var i = 0; i < inputs.length; i++) {
            var val = String(inputs[i].value || '').trim();
            if (val !== '') { out.push(val); }
        }
        return out;
    }

    /* Rebuild the station input rows for one side (pickup/dropoff). */
    function renderStationRows(type, values) {
        var listId = type === 'dropoff' ? 'route-dropoff-list' : 'route-pickup-list';
        var list = byId(listId);
        if (!list) { return; }
        var vals = values && values.length ? values.slice() : [''];
        var label = type === 'dropoff' ? 'Drop-off' : 'Pickup';
        var html = '';
        for (var i = 0; i < vals.length; i++) {
            html += '<div class="cd-station-row">' +
                '<input type="text" maxlength="120" placeholder="Enter station name" value="' + escHtml(vals[i]) + '" aria-label="' + label + ' station ' + (i + 1) + '">' +
                (i > 0 ? '<button type="button" class="cd-station-remove" aria-label="Remove ' + label.toLowerCase() + ' station">&times;</button>' : '') +
            '</div>';
        }
        list.innerHTML = html;
    }

    function renderRoutes(routes) {
        var list = byId('route-list');
        var empty = byId('route-empty');
        if (list) { list.innerHTML = ''; list.hidden = true; }
        if (empty) { empty.hidden = true; }

        var loading = byId('route-loading');
        if (loading) { loading.hidden = true; }
        var error = byId('route-error');
        if (error) { error.hidden = true; }

        if (!routes || !routes.length) {
            if (empty) { empty.hidden = false; }
            return;
        }

        var html = routes.map(function (r) {
            var badge = r.status === 'inactive' ? 'inactive' : '';
            var dur = routeDurationLabel(r.duration);
            return '<article class="cd-route-card" data-route-id="' + r.id + '">' +
                '<div class="cd-route-top">' +
                    '<div class="cd-route-cities">' +
                        '<span class="cd-route-city">' + escHtml(r.from_city) + '</span>' +
                        '<svg class="cd-route-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>' +
                        '<span class="cd-route-city">' + escHtml(r.to_city) + '</span>' +
                    '</div>' +
                    '<span class="cd-route-badge ' + badge + '">' + escHtml(r.status) + '</span>' +
                '</div>' +
                '<div class="cd-route-duration">' +
                    '<svg class="cd-route-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
                    '<span>' + dur + '</span>' +
                '</div>' +
                routeStationsPreview(r) +
                '<div class="cd-route-actions">' +
                    '<button type="button" class="btn btn-secondary btn-sm" data-route-edit="' + r.id + '">Edit</button>' +
                    '<button type="button" class="btn btn-danger btn-sm" data-route-delete="' + r.id + '">Delete</button>' +
                '</div>' +
            '</article>';
        }).join('');

        list.innerHTML = html;
        list.hidden = false;
        wireRouteEvents();
    }

    function wireRouteEvents() {
        var list = byId('route-list');
        if (!list) { return; }
        var edits = list.querySelectorAll('button[data-route-edit]');
        for (var i = 0; i < edits.length; i++) {
            edits[i].addEventListener('click', function () {
                openEditRouteForm(this.getAttribute('data-route-edit'));
            });
        }
        var deletes = list.querySelectorAll('button[data-route-delete]');
        for (var k = 0; k < deletes.length; k++) {
            deletes[k].addEventListener('click', function () {
                openRouteDeleteModal(this.getAttribute('data-route-delete'));
            });
        }
    }

 function setRouteIdle() {
        var loading = byId('route-loading');
        if (loading) { loading.hidden = true; }
    }

    function showRouteError(message) {
        setRouteIdle();
        var list = byId('route-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('route-empty'); if (empty) { empty.hidden = true; }
        var error = byId('route-error');
        if (error) {
            error.hidden = false;
            error.className = 'cd-routes-error auth-message error';
            error.textContent = message || 'Unable to load the route catalog. Please try again later.';
        }
    }

    var routesRequestId = 0;   // discards responses from superseded route requests

    function loadRoutes() {
        var rid = ++routesRequestId;
        var sec = byId('company-routes'); if (sec) { sec.hidden = false; }
        var error = byId('route-error'); if (error) { error.hidden = true; }
        var list = byId('route-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('route-empty'); if (empty) { empty.hidden = true; }
        var loading = byId('route-loading'); if (loading) { loading.hidden = false; }

        fetch('api/company.php?action=routes', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== routesRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showRouteError(data.message || 'Unable to load the route catalog.');
                    return;
                }
                currentRoutesCatalog = data.routes || [];
                renderRoutes(currentRoutesCatalog);
            })
            .catch(function () {
                if (rid !== routesRequestId) { return; }
                showRouteError('Network error while loading the route catalog.');
            });
    }

    function openAddRouteForm() {
        byId('route-id').value = '';
        byId('route-from').value = '';
        byId('route-to').value = '';
        byId('route-duration').value = '';
        byId('route-duration-hours').value = '';
        byId('route-duration-minutes').value = '';
        renderStationRows('pickup', ['']);
        renderStationRows('dropoff', ['']);
        var statusBox = byId('route-status');
        if (statusBox) { statusBox.checked = true; }
        updateRouteStatusUI();
        var vvBox = byId('route-vice-versa');
        if (vvBox) { vvBox.checked = loadViceVersaPref(); }
        var vvRow = byId('route-vice-versa-row');
        if (vvRow) { vvRow.hidden = false; }
        updateViceVersaUI();
        byId('route-form-title').textContent = 'Add Route';
        byId('route-form-submit').textContent = 'Save Route';
        var err = byId('route-form-error'); if (err) { err.textContent = ''; }
        byId('route-form').hidden = false;
        byId('route-form-modal').hidden = false;
        byId('route-from').focus();
    }

    function updateRouteStatusUI() {
        var box = byId('route-status');
        if (!box) { return; }
        var text = byId('route-status-text');
        if (text) { text.textContent = box.checked ? 'On' : 'Off'; }
    }

    /* Keep the Vice versa switch and its hint in sync. The hint previews the
       return route the toggle will add (To → From) as the user types. */
    function updateViceVersaUI() {
        var box = byId('route-vice-versa');
        if (!box) { return; }
        var text = byId('route-vice-versa-text');
        if (text) { text.textContent = box.checked ? 'On' : 'Off'; }
        var hint = byId('route-vice-versa-hint');
        if (hint) {
            var from = byId('route-from') ? byId('route-from').value.trim() : '';
            var to = byId('route-to') ? byId('route-to').value.trim() : '';
            hint.textContent = (from && to)
                ? 'Also add ' + to + ' \u2192 ' + from
                : 'Also add the return route (To \u2192 From)';
        }
    }

    /* The Vice versa preference is remembered in localStorage so it stays on
       across page refreshes. Default is ON: one manual entry creates both
       directions (City 1 → City 2 and City 2 → City 1). */
    var VICE_VERSA_KEY = 'etTransportViceVersa';

    function loadViceVersaPref() {
        try {
            var raw = window.localStorage.getItem(VICE_VERSA_KEY);
            if (raw !== null) { return raw === '1' || raw === 'true'; }
        } catch (e) { /* storage unavailable */ }
        return true;
    }

    function saveViceVersaPref(on) {
        try { window.localStorage.setItem(VICE_VERSA_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    }

    function openEditRouteForm(id) {
        var route = null;
        for (var i = 0; i < currentRoutesCatalog.length; i++) {
            if (String(currentRoutesCatalog[i].id) === String(id)) { route = currentRoutesCatalog[i]; break; }
        }
        if (!route) { return; }
        byId('route-id').value = route.id;
        byId('route-from').value = route.from_city || '';
        byId('route-to').value = route.to_city || '';
        byId('route-duration').value = route.duration === null || route.duration === undefined ? '' : route.duration;
        setRouteDuration(route.duration);
        renderStationRows('pickup', Array.isArray(route.pickup_stations) ? route.pickup_stations : []);
        renderStationRows('dropoff', Array.isArray(route.dropoff_stations) ? route.dropoff_stations : []);
        var statusBox = byId('route-status');
        if (statusBox) { statusBox.checked = String(route.status) !== 'inactive'; }
        updateRouteStatusUI();
        var vvRow = byId('route-vice-versa-row');
        if (vvRow) { vvRow.hidden = true; }
        byId('route-form-title').textContent = 'Edit Route';
        byId('route-form-submit').textContent = 'Update Route';
        var err = byId('route-form-error'); if (err) { err.textContent = ''; }
        byId('route-form').hidden = false;
        byId('route-form-modal').hidden = false;
        byId('route-from').focus();
    }

    function hideRouteForm() {
        var f = byId('route-form');
        if (f) { f.hidden = true; }
        var modal = byId('route-form-modal');
        if (modal) { modal.hidden = true; }
    }

 /* POST one route write (create/update) and resolve with the JSON payload.
       Rejects only on network failure — API failures resolve with {ok:false}. */
    function postRoute(action, payload) {
        return fetch('api/company.php?action=' + action, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            });
    }

    function submitRouteForm() {
        var errEl = byId('route-form-error');
        var id = byId('route-id').value;
        var pickupStations = routeStationRows('pickup');
        var dropoffStations = routeStationRows('dropoff');
        if (!pickupStations.length) {
            if (errEl) { errEl.textContent = 'Add at least one pickup station.'; }
            return;
        }
        if (!dropoffStations.length) {
            if (errEl) { errEl.textContent = 'Add at least one drop-off station.'; }
            return;
        }
        var fromCity = byId('route-from').value.trim();
        var toCity = byId('route-to').value.trim();
        var duration = routeDurationMinutes();
        byId('route-duration').value = duration;
        var status = (byId('route-status') && byId('route-status').checked) ? 'active' : 'inactive';
        var vvBox = byId('route-vice-versa');
        var viceVersa = !id && vvBox && vvBox.checked;

        var payload = {
            from_city: fromCity,
            to_city: toCity,
            duration: duration,
            status: status,
            pickup_stations: pickupStations,
            dropoff_stations: dropoffStations
        };
        if (id) { payload.route_id = id; }
        var action = id ? 'route_update' : 'route_create';

        var submitBtn = byId('route-form-submit');
        if (submitBtn) { submitBtn.disabled = true; }

        postRoute(action, payload)
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || !data.success) {
                    var err = new Error('api');
                    err.userMessage = data.message || 'Unable to save the route.';
                    throw err;
                }
                /* Vice versa: also create the return route (To → From). Pickup
                   and drop-off stations swap sides; duration and status carry
                   over. A failed reverse (e.g. it already exists) is non-fatal —
                   the forward route is already saved. */
                if (!viceVersa) { return { reverse: 'skipped' }; }
                return postRoute('route_create', {
                    from_city: toCity,
                    to_city: fromCity,
                    duration: duration,
                    status: status,
                    pickup_stations: dropoffStations,
                    dropoff_stations: pickupStations
                }).then(function (rev) {
                    var revData = rev.data || {};
                    if (rev.ok && revData.success) { return { reverse: 'ok' }; }
                    return {
                        reverse: 'failed',
                        alreadyExists: rev.status === 409,
                        message: revData.message || 'The reverse route could not be added.'
                    };
                });
            })
            .then(function (info) {
                info = info || {};
                /* The forward route is saved. */
                if (info.reverse === 'failed') {
                    if (info.alreadyExists) {
                        /* The return route already exists — the goal (both
                           directions available) is already met. Close the form
                           and confirm. */
                        hideRouteForm();
                        toast('Route added. ' + toCity + ' \u2192 ' + fromCity + ' already exists.');
                        loadRoutes();
                        loadTrips();
                        return;
                    }
                    /* A genuine reverse failure: keep the form open so the
                       operator can see exactly what happened. */
                    if (errEl) {
                        errEl.textContent = 'Route added. ' + (info.message || 'The reverse route could not be added.');
                    }
                    loadRoutes();
                    loadTrips();
                    return;
                }
                hideRouteForm();
                if (info.reverse === 'ok') {
                    toast('2 routes added: ' + fromCity + ' \u2192 ' + toCity + ' and ' + toCity + ' \u2192 ' + fromCity + '.');
                } else {
                    toast(id ? 'Route updated successfully.' : 'Route added successfully.');
                }
                loadRoutes();
                /* New trips should immediately see the updated route catalog. */
                loadTrips();
            })
            .catch(function (err) {
                if (errEl) {
                    errEl.textContent = (err && err.userMessage) ? err.userMessage : 'Network error while saving the route.';
                }
            })
            .then(function () {
                if (submitBtn) { submitBtn.disabled = false; }
            });
    }

    function deleteRoute(id) {
        var modal = byId('route-delete-modal');
        var msg = byId('route-delete-msg');
        var confirmBtn = byId('route-delete-confirm-btn');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting\u2026'; }

        fetch('api/company.php?action=route_delete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ route_id: id })
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    if (modal && !modal.hidden && msg) {
                        msg.textContent = data.message || 'Unable to delete the route.';
                        msg.hidden = false;
                        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Route'; }
                        return;
                    }
                    showRouteError(data.message || 'Unable to delete the route.');
                    return;
                }
                if (modal && !modal.hidden) { modal.hidden = true; }
                pendingRouteDeleteId = null;
                toast(data.message || 'Route deleted successfully.');
                loadRoutes();
                /* New trips should immediately see the updated route catalog. */
                loadTrips();
            })
            .catch(function () {
                if (modal && !modal.hidden && msg) {
                    msg.textContent = 'Network error while deleting the route.';
                    msg.hidden = false;
                    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Route'; }
                    return;
                }
                showRouteError('Network error while deleting the route.');
            });
    }

    var pendingRouteDeleteId = null;

    function closeRouteDeleteModal() {
        pendingRouteDeleteId = null;
        var modal = byId('route-delete-modal');
        if (modal) { modal.hidden = true; }
        var msg = byId('route-delete-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        var confirmBtn = byId('route-delete-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Route'; }
    }

    function openRouteDeleteModal(id) {
        var modal = byId('route-delete-modal');
        var route = null;
        for (var i = 0; i < currentRoutesCatalog.length; i++) {
            if (String(currentRoutesCatalog[i].id) === String(id)) { route = currentRoutesCatalog[i]; break; }
        }
        if (!modal || !route) { return; }

        pendingRouteDeleteId = String(id);

        var nameEl = byId('route-delete-name');
        if (nameEl) { nameEl.textContent = (route.from_city || '\u2014') + ' \u2192 ' + (route.to_city || '\u2014'); }

        var msg = byId('route-delete-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        var confirmBtn = byId('route-delete-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Route'; }

        modal.hidden = false;
    }

    function confirmRouteDelete() {
        if (!pendingRouteDeleteId) { return; }
        deleteRoute(pendingRouteDeleteId);
    }

    /* ===== Trip management ===== */
    var currentTrips = [];
    var currentRoutes = [];
    var selectedTripStatus = 'all';
    var selectedTripDate = '';

    function applyTripFilter() {
        updateTripDateLabel();
        renderTrips(currentTrips.filter(function (trip) {
            var statusOk = selectedTripStatus === 'all' || trip.status === selectedTripStatus;
            var dateOk = !selectedTripDate || String(trip.departure_date) === selectedTripDate;
            return statusOk && dateOk;
        }));
    }

    function tripDateISO(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function updateTripDateLabel() {
        var label = byId('trip-date-label');
        if (!label) { return; }
        label.textContent = selectedTripDate
            ? new Date(selectedTripDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            : 'All departure dates';
    }

    function renderTripDayPicker() {
        var list = byId('trip-day-list');
        if (!list) { return; }
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var html = '';
        for (var i = 0; i < 14; i++) {
            var day = new Date(today);
            day.setDate(today.getDate() + i);
            var iso = tripDateISO(day);
            html += '<button type="button" class="cd-day-button" data-trip-date="' + iso + '" aria-pressed="' + String(iso === selectedTripDate) + '"><span>' + day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() + '</span><b>' + day.getDate() + '</b></button>';
        }
        list.innerHTML = html;
        var buttons = list.querySelectorAll('[data-trip-date]');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function () {
                var date = this.getAttribute('data-trip-date');
                selectedTripDate = selectedTripDate === date ? '' : date;
                renderTripDayPicker();
                applyTripFilter();
            });
        }
    }

    function hideTripForm() {
        var f = byId('trip-form');
        if (f) { f.hidden = true; }
        var modal = byId('trip-form-modal');
        if (modal) { modal.hidden = true; }
    }

    function showTripError(message) {
        var loading = byId('trip-loading');
        if (loading) { loading.hidden = true; }
        var list = byId('trip-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('trip-empty'); if (empty) { empty.hidden = true; }
        var error = byId('trip-error');
        if (error) {
            error.hidden = false;
            error.className = 'cd-trips-error auth-message error';
            error.textContent = message || 'Unable to load your trips. Please try again later.';
        }
    }

    function showTripNotice(message) {
        var notice = byId('trip-notice');
        if (!notice) { return; }
        notice.hidden = false;
        notice.className = 'cd-trips-msg cd-trips-notice';
        notice.textContent = message;
    }

    function tripStatusBadge(status) {
        var cls = status === 'departed' ? 'departed'
            : status === 'completed' ? 'completed'
            : status === 'cancelled' ? 'cancelled' : '';
        return '<span class="cd-trip-badge ' + cls + '">' + escHtml(status) + '</span>';
    }

    function renderTrips(trips) {
        var loading = byId('trip-loading');
        if (loading) { loading.hidden = true; }
        var error = byId('trip-error'); if (error) { error.hidden = true; }
        var list = byId('trip-list');
        var empty = byId('trip-empty');

        if (!trips || !trips.length) {
            if (list) { list.innerHTML = ''; list.hidden = true; }
            var emptyMsg = 'You have no trips yet. Create your first trip to get started.';
            if (selectedTripStatus === 'cancelled') {
                emptyMsg = 'No cancelled trips match the current filters.';
            } else if (selectedTripStatus === 'scheduled') {
                emptyMsg = 'No scheduled trips match the current filters.';
            } else if (selectedTripDate) {
                emptyMsg = 'No trips depart on the selected date.';
            }
            if (empty) { empty.textContent = emptyMsg; empty.hidden = false; }
            return;
        }

        var html = trips.map(function (t) {
            var reg = t.bus_registration ? escHtml(t.bus_registration) : '\u2014';
            var departure = new Date(String(t.departure_date) + 'T00:00:00');
            var departureMonth = isNaN(departure.getTime()) ? '' : departure.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
            var departureDay = isNaN(departure.getTime()) ? escHtml(t.departure_date) : departure.getDate();
            var actions = '';
            if (t.status === 'scheduled') {
                actions = '<div class="cd-trip-actions">' +
                    '<button type="button" class="btn btn-secondary btn-sm" data-trip-edit="' + t.id + '">Edit</button>' +
                    '<button type="button" class="btn btn-danger btn-sm" data-trip-cancel="' + t.id + '">Cancel Trip</button>' +
                '</div>';
            } else if (t.status === 'cancelled') {
                /* Cancelled trips can be permanently deleted from the record. */
                actions = '<div class="cd-trip-actions">' +
                    '<button type="button" class="btn btn-danger btn-sm" data-trip-delete="' + t.id + '">Delete</button>' +
                '</div>';
            }
            var affectedNote = '';
            var affectedCount = parseInt(t.affected_bookings, 10) || 0;
            if (t.status === 'cancelled' && affectedCount > 0) {
                var refundCount = parseInt(t.refund_required, 10) || 0;
                affectedNote = '<span class="cd-trip-row-text cd-trip-affected">' + affectedCount +
                    ' booking(s) affected by cancellation' +
                    (refundCount > 0 ? ' &middot; ' + refundCount + ' paid (refund required)' : '') + '</span>';
            }
            return '<div class="cd-trip-card" data-trip-id="' + t.id + '">' +
                '<div class="cd-trip-date"><span>' + departureMonth + '</span><b>' + departureDay + '</b></div>' +
                '<div class="cd-trip-main"><span class="cd-trip-route">' + escHtml(t.from_city) + ' &#8594; ' + escHtml(t.to_city) +
                    tripStatusBadge(t.status) + '</span>' +
                '<div class="cd-record-meta"><span>Assigned bus<b>' + escHtml(t.bus_name || reg) + '</b></span><span>Departure<b>' + escHtml(t.departure_date) + ' · ' + escHtml(t.departure_time) + '</b></span><span>Seats left<b>' + t.available_seats + ' / ' + t.seat_count + '</b></span></div>' +
                (t.arrival_time ? '<span class="cd-trip-row-text">Estimated arrival: ' + escHtml(t.arrival_time) + '</span>' : '') +
                affectedNote +
                '<span class="cd-trip-price">ETB ' + formatMoney(t.price) + '</span>' +
                actions +
            '</div></div>';
        }).join('');

        if (list) {
            list.innerHTML = html;
            list.hidden = false;
        }
        if (empty) { empty.hidden = true; }
        wireTripEvents();
    }

    function wireTripEvents() {
        var list = byId('trip-list');
        if (!list) { return; }
        var edits = list.querySelectorAll('button[data-trip-edit]');
        for (var i = 0; i < edits.length; i++) {
            edits[i].addEventListener('click', function () {
                openEditTripForm(this.getAttribute('data-trip-edit'));
            });
        }
        var cancels = list.querySelectorAll('button[data-trip-cancel]');
        for (var j = 0; j < cancels.length; j++) {
            cancels[j].addEventListener('click', function () {
                openTripCancelModal(this.getAttribute('data-trip-cancel'));
            });
        }
        var deletes = list.querySelectorAll('button[data-trip-delete]');
        for (var k = 0; k < deletes.length; k++) {
            deletes[k].addEventListener('click', function () {
                openTripDeleteModal(this.getAttribute('data-trip-delete'));
            });
        }
    }

    var tripsRequestId = 0;   // discards responses from superseded trip requests

    function loadTrips() {
        var rid = ++tripsRequestId;
        var sec = byId('company-trips'); if (sec) { sec.hidden = false; }
        var error = byId('trip-error'); if (error) { error.hidden = true; }
        var list = byId('trip-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var loading = byId('trip-loading'); if (loading) { loading.hidden = false; }

        fetch('api/company.php?action=trips', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== tripsRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showTripError(data.message || 'Unable to load your trips.');
                    return;
                }
                currentTrips = data.trips || [];
                currentRoutes = data.routes || [];
                applyTripFilter();
            })
            .catch(function () {
                if (rid !== tripsRequestId) { return; }
                showTripError('Network error while loading your trips.');
            });
    }

    function fillTripSelects(selectedBusId, selectedRouteId) {
        var routeSel = byId('trip-route');
        if (routeSel) {
            routeSel.innerHTML = '<option value="">Select a route</option>';
            (currentRoutes || []).forEach(function (r) {
                var opt = document.createElement('option');
                opt.value = r.id;
                opt.textContent = r.from_city + ' \u2192 ' + r.to_city;
                routeSel.appendChild(opt);
            });
            /* If the currently assigned route was just turned off it is no
               longer in the active list — keep it selectable while editing. */
            var stillListed = (currentRoutes || []).some(function (r) { return String(r.id) === String(selectedRouteId); });
            if (selectedRouteId && !stillListed) {
                var current = null;
                for (var ri = 0; ri < currentRoutesCatalog.length; ri++) {
                    if (String(currentRoutesCatalog[ri].id) === String(selectedRouteId)) { current = currentRoutesCatalog[ri]; break; }
                }
                var fallback = document.createElement('option');
                fallback.value = selectedRouteId;
                fallback.textContent = (current ? current.from_city + ' \u2192 ' + current.to_city : 'Current route (#' + selectedRouteId + ')') + ' \u00b7 unlisted';
                routeSel.appendChild(fallback);
            }
            if (selectedRouteId) { routeSel.value = selectedRouteId; }
        }
        var busSel = byId('trip-bus');
        if (busSel) {
            busSel.innerHTML = '';
            var buses = (currentFleet || []).filter(function (b) { return b.status === 'active'; });
            var addBus = function (b, label) {
                var opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = label;
                busSel.appendChild(opt);
            };
            buses.forEach(function (b) {
                addBus(b, (b.name || b.registration_number || 'Bus ' + b.id) + ' (' + b.seat_count + ' seats)');
            });
            if (selectedBusId && !buses.some(function (b) { return String(b.id) === String(selectedBusId); })) {
                addBus({ id: selectedBusId }, 'Current bus (#' + selectedBusId + ')');
            }
            if (selectedBusId) { busSel.value = selectedBusId; }
        }
    }

    function openAddTripForm() {
        byId('trip-id').value = '';
        byId('trip-form-title').textContent = 'Create Trip';
        byId('trip-form-submit').textContent = 'Save Trip';
        byId('trip-modal-heading').textContent = 'Create a trip';
        var err = byId('trip-form-error'); if (err) { err.textContent = ''; }
        fillTripSelects(null, null);
        byId('trip-date').value = '';
        byId('trip-time').value = '';
        byId('trip-price').value = '';
        byId('trip-form').hidden = false;
        byId('trip-form-modal').hidden = false;
        byId('trip-route').focus();
    }

    function openEditTripForm(id) {
        var trip = null;
        for (var i = 0; i < currentTrips.length; i++) {
            if (String(currentTrips[i].id) === String(id)) { trip = currentTrips[i]; break; }
        }
        if (!trip) { return; }
        byId('trip-id').value = trip.id;
        byId('trip-form-title').textContent = 'Edit Trip #' + trip.id;
        byId('trip-form-submit').textContent = 'Save Changes';
        byId('trip-modal-heading').textContent = 'Edit trip';
        var err = byId('trip-form-error'); if (err) { err.textContent = ''; }
        fillTripSelects(String(trip.bus_id), String(trip.route_id));
        byId('trip-date').value = trip.departure_date || '';
        byId('trip-time').value = trip.departure_time || '';
        byId('trip-price').value = trip.price == null ? '' : trip.price;
        byId('trip-form').hidden = false;
        byId('trip-form-modal').hidden = false;
        byId('trip-route').focus();
    }

    function submitTripForm() {
        var errEl = byId('trip-form-error');
        var id = byId('trip-id').value;
        var payload = {
            route_id: byId('trip-route').value,
            bus_id: byId('trip-bus').value,
            departure_date: byId('trip-date').value,
            departure_time: byId('trip-time').value,
            price: byId('trip-price').value
        };
        if (id) { payload.trip_id = id; }
        var action = id ? 'trip_update' : 'trip_create';

        fetch('api/company.php?action=' + action, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || !data.success) {
                    if (errEl) { errEl.textContent = data.message || 'Unable to save the trip.'; }
                    return;
                }
                hideTripForm();
                toast(data.message || 'Trip saved successfully.');
                loadTrips();
            })
            .catch(function () {
                if (errEl) { errEl.textContent = 'Network error while saving the trip.'; }
            });
    }

    /* Trip-cancel confirmation modal state. Opening it fetches the trip's
       active bookings (action=bookings&trip_id=...) and lists exactly which
       bookings would be cancelled before the operator commits. The actual
       cancellation runs through the booking-cancel popup FIRST (one refund +
       reason dialog per active booking, consecutively), and only after every
       booking is processed does cancelTrip() -> trip_status mark the trip
       cancelled. */
    var pendingTripCancelId = null;

    /* The active (pending/confirmed) bookings on the trip being cancelled,
       captured when the confirmation modal renders. */
    var tripCancelActiveBookings = [];

    /* True only after the trip-cancel modal's booking list finished loading
       successfully. Prevents the operator from confirming while the list is
       still in flight (which would otherwise skip the per-booking refund popups
       and let the server cancel the bookings without refunds). */
    var tripCancelBookingsReady = false;

    /* Booking-by-booking refund/reason queue for a trip cancellation.
       { tripId, queue, index, total }. While this is set, the booking-cancel
       modal is in "trip-cancel mode": closing it aborts the whole flow and the
       trip stays scheduled. */
    var tripCancelState = null;

    /* Reason given in the trip-cancel modal for why the trip itself is being
       cancelled (e.g. "Trip cancelled because route closing"). Sent to
       api/company.php?action=trip_status along with status=cancelled. */
    var pendingTripCancelReason = '';

    /* Operator password given in the trip-cancel modal. Verified once by the
       trip_status call (and by each booking_cancel in the cascade); captured
       here so the per-booking popups don't re-prompt for it. */
    var pendingTripCancelPassword = '';

    /* Quick-reason chips for the trip-cancel modal. Clicking one fills the
       trip reason textarea. */
    var TRIP_CANCEL_REASON_SUGGESTIONS = [
        'Trip cancelled because route closing',
        'Trip cancelled because bus had been damaged',
        'Trip cancelled because of bad weather / road conditions',
        'Trip cancelled for security / safety concern on the route'
    ];

    function renderTripCancelReasonSuggestions() {
        var container = byId('trip-cancel-reason-suggestions');
        if (!container) { return; }
        container.innerHTML = TRIP_CANCEL_REASON_SUGGESTIONS.map(function (text) {
            return '<button type="button" class="cd-cancel-suggestion" data-reason="' +
                escHtml(text).replace(/"/g, '&quot;') + '">' + escHtml(text) + '</button>';
        }).join('');
        var reasons = container.querySelectorAll('.cd-cancel-suggestion');
        for (var s = 0; s < reasons.length; s++) {
            reasons[s].addEventListener('click', function () {
                var reasonEl = byId('trip-cancel-reason');
                if (reasonEl) {
                    reasonEl.value = this.getAttribute('data-reason');
                    reasonEl.removeAttribute('aria-invalid');
                }
                var msg = byId('trip-cancel-msg');
                if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-trip-cancel-msg'; }
            });
        }
    }

    /* Trip-delete confirmation modal state. Used only for cancelled trips:
       deleting removes the trip row along with its cancelled booking records,
       so the operator confirms explicitly before the permanent call goes to
       deleteTrip() -> trip_delete. */
    var pendingTripDeleteId = null;

    function tripById(id) {
        if (!Array.isArray(currentTrips)) { return null; }
        for (var i = 0; i < currentTrips.length; i++) {
            if (String(currentTrips[i].id) === String(id)) { return currentTrips[i]; }
        }
        return null;
    }

    function closeTripCancelModal() {
        pendingTripCancelId = null;
        tripCancelState = null;
        tripCancelActiveBookings = [];
        tripCancelBookingsReady = false;
        pendingTripCancelReason = '';
        pendingTripCancelPassword = '';
        var modal = byId('trip-cancel-modal');
        if (modal) { modal.hidden = true; }
        var msg = byId('trip-cancel-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-trip-cancel-msg'; }
        var confirmBtn = byId('trip-cancel-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Cancel Trip'; }
        var reasonEl = byId('trip-cancel-reason');
        if (reasonEl) { reasonEl.value = ''; reasonEl.removeAttribute('aria-invalid'); }
        var pwInput = byId('trip-cancel-password');
        if (pwInput) { pwInput.value = ''; }
        var pwErr = byId('trip-cancel-password-error');
        if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
        var suggestions = byId('trip-cancel-reason-suggestions');
        if (suggestions) { suggestions.innerHTML = ''; }
    }

    /* The trip-cancel confirm stays disabled until BOTH the booking list has
       loaded and the operator's password has been typed — mirrors the admin
       dashboard's password-confirm UX. */
    function syncTripCancelConfirm() {
        var confirmBtn = byId('trip-cancel-confirm-btn');
        if (!confirmBtn) { return; }
        var pwInput = byId('trip-cancel-password');
        var pwOk = pwInput && String(pwInput.value || '').trim() !== '';
        confirmBtn.disabled = !tripCancelBookingsReady || !pwOk;
    }

    function renderTripCancelBookings(bookings) {
        var list = byId('trip-cancel-list');
        var empty = byId('trip-cancel-empty');
        var note = byId('trip-cancel-note');
        var confirmBtn = byId('trip-cancel-confirm-btn');
        var loading = byId('trip-cancel-loading');
        if (loading) { loading.hidden = true; }
        if (!list) { return; }

        var active = (Array.isArray(bookings) ? bookings : []).filter(function (b) {
            var st = String(b.booking_status || '').toLowerCase();
            return st === 'pending' || st === 'confirmed';
        });
        tripCancelActiveBookings = active;
        tripCancelBookingsReady = true;

        list.innerHTML = '';
        if (empty) { empty.hidden = true; }
        if (note) { note.hidden = true; }

        if (active.length === 0) {
            list.hidden = true;
            if (empty) {
                empty.textContent = 'There are no active bookings on this trip \u2014 only the trip itself will be cancelled.';
                empty.hidden = false;
            }
            if (confirmBtn) { confirmBtn.textContent = 'Cancel Trip'; }
            syncTripCancelConfirm();
            return;
        }

        var refundCount = 0;
        list.innerHTML = active.map(function (b) {
            var paid = String(b.payment_status || '').toLowerCase() === 'paid';
            if (paid) { refundCount++; }
            var flag = paid ? '<span class="cd-trip-cancel-flag">refund</span>' : '';
            return '<div class="cd-trip-cancel-row">' +
                '<div><b>' + escHtml(b.booking_reference || '') + flag + '</b>' +
                '<span class="cd-trip-cancel-sub">' + b.passenger_count + ' passenger' + (b.passenger_count === 1 ? '' : 's') +
                    ' &middot; ' + escHtml(String(b.payment_status || '').toUpperCase()) + '</span></div>' +
                '<span class="cd-trip-cancel-amount">ETB ' + formatMoney(b.total_amount) + '</span>' +
            '</div>';
        }).join('');
        list.hidden = false;

        if (note) {
            note.textContent = refundCount > 0
                ? refundCount + ' paid booking(s) can be refunded \u2014 each booking gets its own refund & reason dialog.'
                : 'No paid bookings are affected \u2014 no refund required.';
            note.hidden = false;
        }
        if (confirmBtn) {
            confirmBtn.textContent = 'Cancel Trip & ' + active.length + ' Booking' + (active.length === 1 ? '' : 's');
        }
        syncTripCancelConfirm();
    }

    function openTripCancelModal(id) {
        var modal = byId('trip-cancel-modal');
        var trip = tripById(id);
        if (!modal || !trip) { return; }

        pendingTripCancelId = String(id);
        tripCancelBookingsReady = false;
        pendingTripCancelReason = '';

        var routeEl = byId('trip-cancel-route');
        if (routeEl) { routeEl.textContent = (trip.from_city || '\u2014') + ' \u2192 ' + (trip.to_city || '\u2014'); }
        var depEl = byId('trip-cancel-departure');
        if (depEl) { depEl.textContent = (trip.departure_date || '\u2014') + (trip.departure_time ? ' \u00B7 ' + trip.departure_time : ''); }
        var busEl = byId('trip-cancel-bus');
        if (busEl) { busEl.textContent = trip.bus_name || trip.bus_registration || '\u2014'; }
        var statusEl = byId('trip-cancel-status');
        if (statusEl) { statusEl.textContent = 'Scheduled'; }

        var loading = byId('trip-cancel-loading');
        if (loading) { loading.hidden = false; }
        var list = byId('trip-cancel-list');
        if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('trip-cancel-empty');
        if (empty) { empty.hidden = true; }
        var note = byId('trip-cancel-note');
        if (note) { note.hidden = true; }
        var msg = byId('trip-cancel-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-trip-cancel-msg'; }
        var confirmBtn = byId('trip-cancel-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Checking bookings\u2026'; }
        var reasonEl = byId('trip-cancel-reason');
        if (reasonEl) { reasonEl.value = ''; reasonEl.removeAttribute('aria-invalid'); }
        pendingTripCancelReason = '';
        pendingTripCancelPassword = '';
        var pwInput = byId('trip-cancel-password');
        if (pwInput) { pwInput.value = ''; }
        var pwErr = byId('trip-cancel-password-error');
        if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
        renderTripCancelReasonSuggestions();

        modal.hidden = false;

        fetch('api/company.php?action=bookings&trip_id=' + encodeURIComponent(id), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (String(pendingTripCancelId) !== String(id)) { return; }
                if (loading) { loading.hidden = true; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    var errMsg = byId('trip-cancel-msg');
                    if (errMsg) {
                        errMsg.textContent = data.message || 'Unable to load the bookings for this trip. Close this dialog and try again.';
                        errMsg.className = 'cd-trip-cancel-msg cd-trip-cancel-msg-error';
                        errMsg.hidden = false;
                    }
                    var errConfirm = byId('trip-cancel-confirm-btn');
                    if (errConfirm) { errConfirm.disabled = true; errConfirm.textContent = 'Cancellation unavailable'; }
                    return;
                }
                renderTripCancelBookings(data.bookings || []);
            })
            .catch(function () {
                if (String(pendingTripCancelId) !== String(id)) { return; }
                if (loading) { loading.hidden = true; }
                var errMsg = byId('trip-cancel-msg');
                if (errMsg) {
                    errMsg.textContent = 'Network error while loading bookings. Close this dialog and try again.';
                    errMsg.className = 'cd-trip-cancel-msg cd-trip-cancel-msg-error';
                    errMsg.hidden = false;
                }
                var errConfirm = byId('trip-cancel-confirm-btn');
                if (errConfirm) { errConfirm.disabled = true; errConfirm.textContent = 'Cancellation unavailable'; }
            });
    }

    function confirmTripCancel() {
        if (!pendingTripCancelId) { return; }
        /* Never confirm before the booking list has loaded — otherwise the
           per-booking refund popups would be skipped and the server would cancel
           the bookings (without refunds) inside trip_status. */
        if (!tripCancelBookingsReady) { return; }
        var id = pendingTripCancelId;

        /* The trip-cancel reason is required — warn on the modal if missing. */
        var reasonEl = byId('trip-cancel-reason');
        var reason = reasonEl ? reasonEl.value.trim() : '';
        if (!reason) {
            if (reasonEl) { reasonEl.setAttribute('aria-invalid', 'true'); reasonEl.focus(); }
            var reasonMsg = byId('trip-cancel-msg');
            if (reasonMsg) {
                reasonMsg.textContent = 'Please enter or pick a reason for cancelling this trip.';
                reasonMsg.className = 'cd-trip-cancel-msg cd-trip-cancel-msg-error';
                reasonMsg.hidden = false;
            }
            return;
        }
        if (reasonEl) { reasonEl.removeAttribute('aria-invalid'); }
        pendingTripCancelReason = reason;

        /* Require the operator's password — verified server-side on every
           cancel call (trip_status and each booking_cancel in the cascade). */
        var pwInput = byId('trip-cancel-password');
        var password = pwInput ? String(pwInput.value || '') : '';
        if (!password) {
            var pwErr = byId('trip-cancel-password-error');
            if (pwErr) { pwErr.textContent = 'Enter your account password.'; pwErr.hidden = false; }
            if (pwInput && pwInput.focus) { pwInput.focus(); }
            return;
        }
        pendingTripCancelPassword = password;

        var active = (Array.isArray(tripCancelActiveBookings) ? tripCancelActiveBookings : []).slice();
        closeTripCancelModal();

        if (active.length === 0) {
            /* No active bookings — cancel the trip directly. */
            cancelTrip(id, 0, reason, password);
            return;
        }

        /* Start the per-booking refund + reason queue. Each active booking gets
           its own booking-cancel popup; only after every booking is processed
           is the trip itself cancelled. */
        tripCancelState = {
            tripId: String(id),
            reason: reason,
            queue: active,
            index: 0,
            total: active.length
        };
        startTripCancelNextBooking();
    }

    /* Open the booking-cancel popup for the next booking in the trip-cancel
       queue, or cancel the trip once every booking has been processed. */
    function startTripCancelNextBooking() {
        if (!tripCancelState) { return; }
        if (tripCancelState.index >= tripCancelState.queue.length) {
            var tripId = tripCancelState.tripId;
            var total = tripCancelState.total;
            var reason = tripCancelState.reason;
            var password = pendingTripCancelPassword;
            tripCancelState = null;
            hideCancelBookingModal();
            cancelTrip(tripId, total, reason, password);
            return;
        }
        var booking = tripCancelState.queue[tripCancelState.index];
        setCancelBookingIntro(true);
        openCancelBookingModal(String(booking.id), booking);
    }

    /* Swap the booking-cancel modal's intro copy between standalone mode and
       trip-cancel queue mode. */
    function setCancelBookingIntro(fromTripCancel) {
        var intro = byId('cancel-intro');
        if (fromTripCancel && tripCancelState) {
            if (intro) {
                intro.textContent = 'Cancelling this booking is part of the trip cancellation \u2014 choose its refund policy and reason before the trip itself is cancelled.';
            }
        } else if (intro) {
            intro.textContent = 'Cancel this booking and free its seat(s). Choose the refund policy for this cancellation.';
        }
        var progress = byId('cancel-queue-progress');
        if (progress) {
            if (fromTripCancel && tripCancelState) {
                progress.textContent = 'Trip cancel \u00B7 Booking ' + (tripCancelState.index + 1) + ' / ' + tripCancelState.total;
                progress.hidden = false;
            } else {
                progress.hidden = true;
                progress.textContent = '';
            }
        }
    }

    function cancelTrip(id, bookingCount, reason, password) {
        var modal = byId('trip-cancel-modal');
        var msg = byId('trip-cancel-msg');
        var confirmBtn = byId('trip-cancel-confirm-btn');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        if (confirmBtn) { confirmBtn.disabled = true; }

        fetch('api/company.php?action=trip_status', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ trip_id: id, status: 'cancelled', reason: reason || '', password: password || '' })
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (result.status === 401) {
                    /* Password rejected mid-flow: the trip modal is already
                       closed by the time cancelTrip runs, so surface the reason
                       as a toast and restore the trip list. */
                    toast(data.message || 'Your password was not accepted. Trip was not cancelled.');
                    loadTrips();
                    return;
                }
                if (!result.ok || result.status !== 200 || !data.success) {
                    if (modal && !modal.hidden && msg) {
                        msg.textContent = data.message || 'Unable to cancel the trip.';
                        msg.className = 'cd-trip-cancel-msg cd-trip-cancel-msg-error';
                        msg.hidden = false;
                        if (confirmBtn) { confirmBtn.disabled = false; }
                        return;
                    }
                    showTripError(data.message || 'Unable to cancel the trip.');
                    return;
                }
                if (modal && !modal.hidden) { modal.hidden = true; }
                pendingTripCancelId = null;

                /* The server also reports any bookings it had to cancel inside
                   trip_status (possible only when the per-booking queue was
                   skipped or a new booking slipped in mid-cancellation). */
                var affected = data.affected || {};
                var count = parseInt(affected.count, 10) || 0;
                var notes = [];
                var bookingN = parseInt(bookingCount, 10) || 0;
                if (bookingN > 0) {
                    notes.push(bookingN + ' booking' + (bookingN === 1 ? '' : 's') + ' cancelled with their own refund decisions');
                }
                if (count > 0) {
                    var refunds = 0;
                    if (Array.isArray(affected.bookings)) {
                        for (var n = 0; n < affected.bookings.length; n++) {
                            if (affected.bookings[n] && affected.bookings[n].refund_required) { refunds++; }
                        }
                    }
                    notes.push(count + ' booking(s) affected by the cancellation');
                    if (refunds > 0) {
                        notes.push(refunds + ' paid \u2014 refund required, not yet processed');
                    }
                }
                var doneNote = 'Trip cancelled.';
                if (notes.length) { doneNote += ' ' + notes.join(' '); }
                doneNote += '.';
                toast(doneNote);

                /* Real refunds were recorded on the way through the booking
                   popups, so every revenue surface must refresh: the overview
                   stat card, the Revenue / Payments tab and the booking list. */
                loadTrips();
                loadBookings();
                loadPayments();
                loadOverview();
            })
            .catch(function () {
                if (modal && !modal.hidden && msg) {
                    msg.textContent = 'Network error while cancelling the trip.';
                    msg.className = 'cd-trip-cancel-msg cd-trip-cancel-msg-error';
                    msg.hidden = false;
                    if (confirmBtn) { confirmBtn.disabled = false; }
                    return;
                }
                showTripError('Network error while cancelling the trip.');
            });
    }

    function closeTripDeleteModal() {
        pendingTripDeleteId = null;
        var modal = byId('trip-delete-modal');
        if (modal) { modal.hidden = true; }
        var msg = byId('trip-delete-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        var confirmBtn = byId('trip-delete-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Trip'; }
    }

    function openTripDeleteModal(id) {
        var modal = byId('trip-delete-modal');
        var trip = tripById(id);
        if (!modal || !trip) { return; }

        pendingTripDeleteId = String(id);

        var routeEl = byId('trip-delete-route');
        if (routeEl) { routeEl.textContent = (trip.from_city || '\u2014') + ' \u2192 ' + (trip.to_city || '\u2014'); }
        var depEl = byId('trip-delete-departure');
        if (depEl) { depEl.textContent = (trip.departure_date || '\u2014') + (trip.departure_time ? ' \u00B7 ' + trip.departure_time : ''); }
        var bookingEl = byId('trip-delete-bookings');
        if (bookingEl) {
            var affected = parseInt(trip.affected_bookings, 10) || 0;
            bookingEl.textContent = affected + ' cancelled booking' + (affected === 1 ? '' : 's');
        }

        var msg = byId('trip-delete-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        var confirmBtn = byId('trip-delete-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Trip'; }

        modal.hidden = false;
    }

    function confirmTripDelete() {
        if (!pendingTripDeleteId) { return; }
        deleteTrip(pendingTripDeleteId);
    }

    function deleteTrip(id) {
        var modal = byId('trip-delete-modal');
        var msg = byId('trip-delete-msg');
        var confirmBtn = byId('trip-delete-confirm-btn');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting\u2026'; }

        fetch('api/company.php?action=trip_delete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ trip_id: id })
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    if (modal && !modal.hidden && msg) {
                        msg.textContent = data.message || 'Unable to delete the trip.';
                        msg.hidden = false;
                        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Trip'; }
                        return;
                    }
                    showTripError(data.message || 'Unable to delete the trip.');
                    return;
                }
                if (modal && !modal.hidden) { modal.hidden = true; }
                pendingTripDeleteId = null;
                showTripNotice(data.message || 'Trip deleted.');
                toast(data.message || 'Trip deleted successfully.');
                loadTrips();
            })
            .catch(function () {
                if (modal && !modal.hidden && msg) {
                    msg.textContent = 'Network error while deleting the trip.';
                    msg.hidden = false;
                    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Trip'; }
                    return;
                }
                showTripError('Network error while deleting the trip.');
            });
    }

    /* ============================================================
 Bookings / Passengers (company operator view).
       Read-only; ownership is enforced server-side via trips.company_id.
       ============================================================ */

    var currentBookings = [];
    var bookingTripOptions = null;
    var selectedBookingDate = '';
    var selectedBookingStatus = 'all';

    function bookingDateISO(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function updateBookingDateLabel() {
        var label = byId('booking-date-label');
        if (!label) { return; }
        label.textContent = selectedBookingDate
            ? new Date(selectedBookingDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            : 'All upcoming departure dates';
    }

    function renderBookingDayPicker() {
        var list = byId('booking-day-list');
        if (!list) { return; }
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var html = '';
        for (var i = 0; i < 14; i++) {
            var day = new Date(today);
            day.setDate(today.getDate() + i);
            var iso = bookingDateISO(day);
            html += '<button type="button" class="cd-day-button" data-booking-date="' + iso + '" aria-pressed="' + String(iso === selectedBookingDate) + '"><span>' + day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() + '</span><b>' + day.getDate() + '</b></button>';
        }
        list.innerHTML = html;
        var buttons = list.querySelectorAll('[data-booking-date]');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function () {
                var date = this.getAttribute('data-booking-date');
                selectedBookingDate = selectedBookingDate === date ? '' : date;
                renderBookingDayPicker();
                applyBookingFilters();
            });
        }
    }

    function applyBookingFilters() {
        var from = byId('booking-from-filter');
        var to = byId('booking-to-filter');
        var fromValue = from ? from.value : '';
        var toValue = to ? to.value : '';
        var statusVal = selectedBookingStatus || 'all';
        var filtered = currentBookings.filter(function (booking) {
            var bookingStatus = String(booking.booking_status || '');
            var statusOk = statusVal === 'all'
                ? true
                : statusVal === 'active'
                    ? bookingStatus !== 'cancelled'
                    : bookingStatus === statusVal;
            return statusOk &&
                (!selectedBookingDate || String(booking.trip_departure_date) === selectedBookingDate) &&
                (!fromValue || String(booking.route_from) === fromValue) &&
                (!toValue || String(booking.route_to) === toValue);
        });
        updateBookingDateLabel();
        renderBookings(filtered);
    }

    function bookingBadge(status) {
        var val = String(status || '').toLowerCase();
        var cls = val === 'confirmed' ? 'confirmed'
            : val === 'cancelled' ? 'cancelled'
            : val === 'completed' ? 'completed'
            : val === 'pending' ? 'pending' : '';
        return '<span class="cd-booking-badge ' + cls + '">' + escHtml(val) + '</span>';
    }

    function paymentBadge(status) {
        var val = String(status || '').toLowerCase();
        var cls = val === 'paid' ? 'paid'
            : val === 'failed' ? 'failed'
            : val === 'refunded' ? 'refunded'
            : val === 'pending' ? 'pending' : '';
        return '<span class="cd-booking-badge ' + cls + '">' + escHtml(val) + '</span>';
    }

    function showBookingError(message) {
        var loading = byId('booking-loading'); if (loading) { loading.hidden = true; }
        var list = byId('booking-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('booking-empty'); if (empty) { empty.hidden = true; }
        var error = byId('booking-error');
        if (error) {
            error.hidden = false;
            error.textContent = message || 'Unable to load bookings. Please try again later.';
        }
    }

    function renderBookings(bookings) {
        var loading = byId('booking-loading'); if (loading) { loading.hidden = true; }
        var error = byId('booking-error'); if (error) { error.hidden = true; }
        var list = byId('booking-list');
        var empty = byId('booking-empty');

        if (!bookings || !bookings.length) {
            if (list) { list.innerHTML = ''; list.hidden = true; }
            var emptyMsg = 'No bookings on your trips yet. Bookings will appear here once passengers book your scheduled trips.';
            if (selectedBookingStatus === 'cancelled') {
                emptyMsg = 'No cancelled bookings match the current filters.';
            } else if (selectedBookingStatus === 'active') {
                emptyMsg = 'No active bookings match the current filters.';
            } else if (selectedBookingDate || (byId('booking-from-filter') ? byId('booking-from-filter').value : '') || (byId('booking-to-filter') ? byId('booking-to-filter').value : '')) {
                emptyMsg = 'No bookings match the current filters.';
            }
            if (empty) { empty.textContent = emptyMsg; empty.hidden = false; }
            return;
        }

        var html = bookings.map(function (b) {
            var reg = b.bus_registration ? escHtml(b.bus_registration) : '\u2014';
            var seats = b.passenger_count + ' seat' + (b.passenger_count === 1 ? '' : 's');
            return '<div class="cd-booking-card" data-booking-id="' + b.id + '">' +
                '<span class="cd-booking-ref">' + escHtml(b.booking_reference) + '</span>' +
                '<span class="cd-booking-route">' + escHtml(b.route_from) + ' &#8594; ' + escHtml(b.route_to) + '</span>' +
                '<span class="cd-booking-row-text">Departure: ' + escHtml(b.trip_departure_date) + ' ' + escHtml(b.trip_departure_time) + '</span>' +
                '<span class="cd-booking-row-text">Bus: ' + escHtml(b.bus_name || '') + ' (' + reg + ')</span>' +
                '<span class="cd-booking-seats">' + seats + '</span>' +
                '<span class="cd-booking-price">ETB ' + formatMoney(b.total_amount) + '</span>' +
                '<span class="cd-booking-row-text">Booking: ' + bookingBadge(b.booking_status) +
                    ' &middot; Payment: ' + paymentBadge(b.payment_status) + '</span>' +
                '<div class="cd-booking-actions">' +
                    (b.booking_status !== 'cancelled' ? '<button type="button" class="btn btn-secondary btn-sm" data-ticket="' + escHtml(b.booking_reference) + '">View Ticket</button>' : '') +
                    (b.booking_status !== 'cancelled' ? '<button type="button" class="btn btn-danger btn-sm" data-cancel="' + b.id + '">Cancel</button>' : '') +
                '</div>' +
            '</div>';
        }).join('');

        if (list) {
            list.innerHTML = html;
            list.hidden = false;
        }
        if (empty) { empty.hidden = true; }
        wireBookingEvents();
    }

    function wireBookingEvents() {
        var list = byId('booking-list');
        if (!list) { return; }
        var ticketBtns = list.querySelectorAll('button[data-ticket]');
        for (var i = 0; i < ticketBtns.length; i++) {
            ticketBtns[i].addEventListener('click', function () {
                loadWalkInTicket(this.getAttribute('data-ticket'));
            });
        }
        var cancelBtns = list.querySelectorAll('button[data-cancel]');
        for (var j = 0; j < cancelBtns.length; j++) {
            cancelBtns[j].addEventListener('click', function () {
                openCancelBookingModal(this.getAttribute('data-cancel'));
            });
        }
    }

    /* Cancel-booking modal state. The modal collects (1) whether/what to
       refund (none / full / half) and (2) the cancellation reason, then
       cancelBooking() posts refund_type + reason to the API. */
    var cancelBookingId = null;

    /* Quick-reason suggestion buttons inside the cancel modal. Clicking one
       fills the reason textarea, so an operator never has to type the common
       reasons from scratch. The list adapts to the chosen refund type. */
        var CANCEL_REASON_SUGGESTIONS = {
        none: [
            'Passenger requested to cancel',
            'Passenger booked by mistake',
            'Duplicate booking — confirmed a second seat by mistake',
            'Passenger did not show up at departure time',
            'Booking made with wrong date / route',
            'Trip cancelled because route closing',
            'Trip cancelled because bus had been damaged',
            'Trip cancelled due to bad weather / road conditions'
        ],
        full: [
            'Passenger requested to cancel',
            'Passenger booked by mistake',
            'Duplicate booking — confirmed a second seat by mistake',
            'Passenger did not show up at departure time',
            'Booking made with wrong date / route',
            'Trip cancelled because route closing',
            'Trip cancelled because bus had been damaged',
            'Trip cancelled due to bad weather / road conditions'
        ],
        half: [
            'Passenger requested to cancel',
            'Passenger booked by mistake',
            'Duplicate booking — confirmed a second seat by mistake',
            'Passenger did not show up at departure time',
            'Booking made with wrong date / route',
            'Trip cancelled because route closing',
            'Trip cancelled because bus had been damaged',
            'Trip cancelled due to bad weather / road conditions'
        ]
    };

    function renderCancelReasonSuggestions() {
        var container = byId('cancel-reason-suggestions');
        if (!container) { return; }
        var refundType = 'none';
        var radios = document.querySelectorAll('input[name="cancel-refund-type"]');
        for (var r = 0; r < radios.length; r++) {
            if (radios[r].checked) { refundType = radios[r].value; break; }
        }
        var list = CANCEL_REASON_SUGGESTIONS[refundType] || CANCEL_REASON_SUGGESTIONS.none;
        container.innerHTML = list.map(function (text) {
            return '<button type="button" class="cd-cancel-suggestion" data-reason="' +
                escHtml(text).replace(/"/g, '&quot;') + '">' + escHtml(text) + '</button>';
        }).join('');
        container.querySelectorAll('.cd-cancel-suggestion').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var reasonEl = byId('cancel-reason');
                if (reasonEl) {
                    reasonEl.value = this.getAttribute('data-reason');
                    reasonEl.removeAttribute('aria-invalid');
                }
                var msg = byId('cancel-modal-msg');
                if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-cancel-msg'; }
            });
        });
    }

    function openCancelBookingModal(bookingId, bookingOverride) {
        var modal = byId('cancel-booking-modal');
        if (!modal || !bookingId) { return; }

        var booking = null;
        if (bookingOverride) {
            booking = bookingOverride;
        } else {
            for (var i = 0; i < currentBookings.length; i++) {
                if (String(currentBookings[i].id) === String(bookingId)) { booking = currentBookings[i]; break; }
            }
        }
        if (!booking) { return; }

        cancelBookingId = String(bookingId);
        byId('cancel-ref').textContent = booking.booking_reference || '';
        byId('cancel-route').textContent = (booking.route_from || '') + ' \u2192 ' + (booking.route_to || '');
        byId('cancel-date').textContent = (booking.trip_departure_date || '') + ' ' + (booking.trip_departure_time || '');
        byId('cancel-passengers').textContent = booking.passenger_count + ' passenger' + (booking.passenger_count === 1 ? '' : 's');
        byId('cancel-amount').textContent = 'ETB ' + formatMoney(booking.total_amount);
        byId('cancel-payment-status').textContent = booking.payment_status || '';

        /* Refund destination account stored on the booking — shown so the
           operator's refund command targets the exact account the money goes to. */
        var refundName = booking.refund_account_name || (booking.refundAccount && booking.refundAccount.name) || '';
        var refundNumber = booking.refund_account_number || (booking.refundAccount && booking.refundAccount.number) || '';
        var refundBank = booking.refund_bank || (booking.refundAccount && booking.refundAccount.bank) || '';
        var refundAccountEl = byId('cancel-refund-account');
        if (refundAccountEl) {
            var parts = [];
            if (refundName) { parts.push(refundName); }
            if (refundBank) { parts.push(refundBank); }
            if (refundNumber) { parts.push(refundNumber); }
            refundAccountEl.textContent = parts.length ? parts.join(' \u00B7 ') : '\u2014';
        }

        var radios = document.querySelectorAll('input[name="cancel-refund-type"]');
        for (var r = 0; r < radios.length; r++) {
            radios[r].checked = radios[r].value === 'none';
        }
        renderCancelReasonSuggestions();
        var reason = byId('cancel-reason');
        if (reason) { reason.value = ''; reason.removeAttribute('aria-invalid'); }

        /* Password: reset the field, and hide the group during a trip-cancel
           cascade — the password was already given in the trip-cancel modal. */
        var cancelPwGroup = byId('cancel-password-group');
        var pwInput = byId('cancel-password');
        if (pwInput) { pwInput.value = ''; }
        var pwErr = byId('cancel-password-error');
        if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
        var inCascade = !!tripCancelState;
        if (cancelPwGroup) { cancelPwGroup.hidden = inCascade; }

        var msg = byId('cancel-modal-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-cancel-msg'; }
        var confirmBtn = byId('cancel-confirm-btn');
        if (confirmBtn) { confirmBtn.textContent = 'Confirm Cancellation'; }
        var keepBtn = byId('cancel-keep-btn');
        if (keepBtn) { keepBtn.disabled = false; }
        syncCancelBookingPassword();

        modal.hidden = false;
        if (reason) { reason.focus(); }
    }

    function hideCancelBookingModal() {
        var modal = byId('cancel-booking-modal');
        if (modal) { modal.hidden = true; }
        cancelBookingId = null;
        resetCancelBookingModal();
    }

    /* Reset the booking-cancel form to its standalone, pristine state. */
    function resetCancelBookingModal() {
        setCancelBookingIntro(false);
        var msg = byId('cancel-modal-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-cancel-msg'; }
        var confirmBtn = byId('cancel-confirm-btn');
        if (confirmBtn) { confirmBtn.textContent = 'Confirm Cancellation'; }
        var keepBtn = byId('cancel-keep-btn');
        if (keepBtn) { keepBtn.disabled = false; }
        var cancelPwGroup = byId('cancel-password-group');
        if (cancelPwGroup) { cancelPwGroup.hidden = false; }
        var pwInput = byId('cancel-password');
        if (pwInput) { pwInput.value = ''; }
        var pwErr = byId('cancel-password-error');
        if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
        syncCancelBookingPassword();
    }

    /* Mirrors the admin dashboard's syncConfirmPassword: the confirm button
       stays disabled until a password has been typed. During a trip-cancel
       cascade the password was already given in the trip-cancel modal, so the
       confirm is enabled immediately. */
    function syncCancelBookingPassword() {
        var confirmBtn = byId('cancel-confirm-btn');
        if (!confirmBtn) { return; }
        if (tripCancelState) { confirmBtn.disabled = false; return; }
        var pwInput = byId('cancel-password');
        confirmBtn.disabled = !pwInput || String(pwInput.value || '').trim() === '';
    }

    function closeCancelBookingModal() {
        /* If the operator closes this popup in the middle of a trip-cancel
           queue, abort the whole flow — the trip stays scheduled and only the
           bookings already cancelled (with their refunds) remain cancelled. */
        if (tripCancelState) {
            tripCancelState = null;
            pendingTripCancelReason = '';
        }
        hideCancelBookingModal();
    }

    function submitCancelBooking() {
        if (!cancelBookingId) { closeCancelBookingModal(); return; }
        var refundType = 'none';
        var radios = document.querySelectorAll('input[name="cancel-refund-type"]');
        for (var r = 0; r < radios.length; r++) {
            if (radios[r].checked) { refundType = radios[r].value; break; }
        }
        var reasonEl = byId('cancel-reason');
        var reason = reasonEl ? reasonEl.value.trim() : '';

        if (!reason) {
            var msg = byId('cancel-modal-msg');
            if (msg) {
                msg.hidden = false;
                msg.className = 'cd-cancel-msg cd-cancel-msg-error';
                msg.textContent = 'Please provide a reason for the cancellation.';
            }
            if (reasonEl) {
                reasonEl.setAttribute('aria-invalid', 'true');
                reasonEl.focus();
            }
            var confirmBtn = byId('cancel-confirm-btn');
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Cancellation'; }
            var keepBtn = byId('cancel-keep-btn');
            if (keepBtn) { keepBtn.disabled = false; }
            return;
        }
        if (reasonEl) { reasonEl.removeAttribute('aria-invalid'); }

        /* Password: in a trip-cancel cascade the password was already verified
           in the trip-cancel modal; standalone, it comes from this field. */
        var password = '';
        var pwInput = byId('cancel-password');
        if (tripCancelState) {
            password = pendingTripCancelPassword;
        } else {
            password = pwInput ? String(pwInput.value || '') : '';
            if (!password) {
                var pwErr = byId('cancel-password-error');
                if (pwErr) { pwErr.textContent = 'Enter your account password.'; pwErr.hidden = false; }
                if (pwInput && pwInput.focus) { pwInput.focus(); }
                var confirmBtn = byId('cancel-confirm-btn');
                if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Cancellation'; }
                var keepBtn = byId('cancel-keep-btn');
                if (keepBtn) { keepBtn.disabled = false; }
                return;
            }
        }

        var msg = byId('cancel-modal-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-cancel-msg'; }
        var confirmBtn = byId('cancel-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Cancelling...'; }
        var keepBtn = byId('cancel-keep-btn');
        if (keepBtn) { keepBtn.disabled = true; }

        cancelBooking(cancelBookingId, refundType, reason, password);
    }

    function cancelBooking(bookingId, refundType, reason, password) {
        fetch('api/company.php?action=booking_cancel', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingId, refund_type: refundType, reason: reason, password: password || '' })
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (result.status === 401) {
                    var errMsg = byId('cancel-modal-msg');
                    if (errMsg) {
                        errMsg.hidden = false;
                        errMsg.className = 'cd-cancel-msg cd-cancel-msg-error';
                        errMsg.textContent = data.message || 'Your password was not accepted.';
                    }
                    var pwInput = byId('cancel-password');
                    var pwErr = byId('cancel-password-error');
                    if (!tripCancelState) {
                        if (pwErr) { pwErr.textContent = data.message || 'Your password was not accepted.'; pwErr.hidden = false; }
                        if (pwInput && pwInput.select) { pwInput.select(); }
                        if (pwInput && pwInput.focus) { pwInput.focus(); }
                    }
                    var errConfirm = byId('cancel-confirm-btn');
                    if (errConfirm) { errConfirm.disabled = false; errConfirm.textContent = 'Confirm Cancellation'; }
                    var errKeep = byId('cancel-keep-btn');
                    if (errKeep) { errKeep.disabled = false; }
                    return;
                }
                if (!result.ok || result.status !== 200 || !data.success) {
                    var errMsg = byId('cancel-modal-msg');
                    if (errMsg) {
                        errMsg.hidden = false;
                        errMsg.className = 'cd-cancel-msg cd-cancel-msg-error';
                        errMsg.textContent = data.message || 'Unable to cancel the booking.';
                    }
                    var confirmBtn = byId('cancel-confirm-btn');
                    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Cancellation'; }
                    var keepBtn = byId('cancel-keep-btn');
                    if (keepBtn) { keepBtn.disabled = false; }
                    return;
                }
                if (tripCancelState) {
                    /* In trip-cancel queue mode, this booking is done — advance
                       to the next popup, or cancel the trip after the last one.
                       Revenue / trips / bookings reload once, after the trip
                       itself is cancelled. */
                    tripCancelState.index += 1;
                    hideCancelBookingModal();
                    startTripCancelNextBooking();
                    return;
                }
                closeCancelBookingModal();
                toast(data.message || 'Booking cancelled successfully.');
                loadBookings();
                var notice = data.message || 'Booking cancelled successfully.';
                var info = byId('booking-error');
                if (info) {
                    info.hidden = false;
                    info.className = 'cd-bookings-error auth-message success';
                    info.textContent = notice;
                }
            })
            .catch(function () {
                var errMsg = byId('cancel-modal-msg');
                if (errMsg) {
                    errMsg.hidden = false;
                    errMsg.className = 'cd-cancel-msg cd-cancel-msg-error';
                    errMsg.textContent = 'Network error while cancelling the booking.';
                }
                var confirmBtn = byId('cancel-confirm-btn');
                if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Cancellation'; }
                var keepBtn = byId('cancel-keep-btn');
                if (keepBtn) { keepBtn.disabled = false; }
            });
    }

    var bookingsRequestId = 0;   // discards responses from superseded booking requests

    function loadBookings() {
        var rid = ++bookingsRequestId;
        var sec = byId('company-bookings'); if (sec) { sec.hidden = false; }
        var error = byId('booking-error'); if (error) { error.hidden = true; }
        var list = byId('booking-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('booking-empty'); if (empty) { empty.hidden = true; }
        var loading = byId('booking-loading'); if (loading) { loading.hidden = false; }

        var url2 = 'api/company.php?action=bookings';

        fetch(url2, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== bookingsRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showBookingError(data.message || 'Unable to load your bookings.');
                    return;
                }
                currentBookings = data.bookings || [];
                applyBookingFilters();
            })
            .catch(function () {
                if (rid !== bookingsRequestId) { return; }
                showBookingError('Network error while loading your bookings.');
            });
    }

    var walkInState = {
        step: 1,
        bookingType: '',
        tripDate: '',
        tripId: '',
        trip: null,
        paymentMethod: '',
        selectedSeat: null,
        transferRef: '',
        transferSender: '',
        trips: []
    };

    function walkInSeatLayout() {
        return [
            { type: 'standard', left: [1, 2], right: [4, 3] },
            { type: 'standard', left: [5, 6], right: [8, 7] },
            { type: 'standard', left: [9, 10], right: [12, 11] },
            { type: 'standard', left: [13, 14], right: [16, 15] },
            { type: 'standard', left: [17, 18], right: [20, 19] },
            { type: 'standard', left: [21, 22], right: [24, 23] },
            { type: 'standard', left: [25, 26], right: [28, 27] },
            { type: 'door', left: [29, 30], right: [] },
            { type: 'standard', left: [33, 34], right: [32, 31] },
            { type: 'standard', left: [37, 38], right: [36, 35] },
            { type: 'standard', left: [41, 42], right: [40, 39] },
            { type: 'standard', left: [45, 46], right: [44, 43] },
            { type: 'rear', seats: [49, 50, 51, 48, 47] }
        ];
    }

    function walkInSeatButton(num, state) {
        var label = state === 'occupied' ? 'Occupied' : state === 'unavailable' ? 'Unavailable' : 'Available';
        return '<button type="button" class="seat ' + state + '" data-seat="' + num + '" aria-label="Seat ' + String(num).padStart(2, '0') + ', ' + label + '" title="Seat ' + String(num).padStart(2, '0') + ' (' + label + ')"' + (state !== 'available' ? ' disabled' : '') + '>' +
            '<svg class="seat-svg" viewBox="0 0 40 52" aria-hidden="true"><g fill="currentColor"><rect x="8" y="5" width="24" height="30" rx="7"/><rect x="2.5" y="9" width="5" height="27" rx="2.5"/><rect x="32.5" y="9" width="5" height="27" rx="2.5"/><rect x="4" y="39" width="32" height="11" rx="5"/></g><g fill="rgba(255,255,255,0.22)"><rect x="10" y="7" width="20" height="3" rx="1.5"/></g></svg>' +
            '<span class="seat-num">' + String(num).padStart(2, '0') + '</span>' +
            '</button>';
    }

    function walkInSeatRowHtml(row) {
        var html = '<div class="seat-row seat-row-' + row.type + '">';
        if (row.type === 'rear') {
            for (var i = 0; i < row.seats.length; i++) { html += walkInSeatButton(row.seats[i], 'available'); }
        } else {
            for (var l = 0; l < row.left.length; l++) { html += walkInSeatButton(row.left[l], 'available'); }
            html += '<span class="seat-aisle" aria-hidden="true"></span>';
            if (row.type === 'door') {
                html += '<span class="bus-door" role="img" aria-label="Passenger entrance"></span>';
            } else {
                for (var r = 0; r < row.right.length; r++) { html += walkInSeatButton(row.right[r], 'available'); }
            }
        }
        html += '</div>';
        return html;
    }

    function walkInSeatState(num, occupiedSeats, unavailableSeats) {
        if (unavailableSeats.indexOf(num) !== -1) { return 'unavailable'; }
        if (occupiedSeats.indexOf(num) !== -1) { return 'occupied'; }
        return 'available';
    }

    function renderWalkInSeatMap(occupiedSeats, seatCount) {
        var seatMap = byId('walkin-seat-map');
        if (!seatMap) { return; }

        var layout = walkInSeatLayout();
        var unavailableSeats = [];
        for (var n = 1; n <= 51; n++) {
            if (n > (seatCount || 51)) { unavailableSeats.push(n); }
        }
        var html = '';
        for (var i = 0; i < layout.length; i++) {
            var row = layout[i];
            var rowHtml = '<div class="seat-row seat-row-' + row.type + '">';
            if (row.type === 'rear') {
                for (var a = 0; a < row.seats.length; a++) {
                    var seatNumber = row.seats[a];
                    rowHtml += walkInSeatButton(seatNumber, walkInSeatState(seatNumber, occupiedSeats, unavailableSeats));
                }
            } else {
                for (var l = 0; l < row.left.length; l++) {
                    var leftSeat = row.left[l];
                    rowHtml += walkInSeatButton(leftSeat, walkInSeatState(leftSeat, occupiedSeats, unavailableSeats));
                }
                rowHtml += '<span class="seat-aisle" aria-hidden="true"></span>';
                if (row.type === 'door') {
                    rowHtml += '<span class="bus-door" role="img" aria-label="Passenger entrance"></span>';
                } else {
                    for (var r = 0; r < row.right.length; r++) {
                        var rightSeat = row.right[r];
                        rowHtml += walkInSeatButton(rightSeat, walkInSeatState(rightSeat, occupiedSeats, unavailableSeats));
                    }
                }
            }
            rowHtml += '</div>';
            html += rowHtml;
        }
        seatMap.innerHTML = html;

        var selectedSeat = walkInState.selectedSeat;
        if (selectedSeat !== null && selectedSeat !== undefined) {
            var selectedNode = seatMap.querySelector('[data-seat="' + selectedSeat + '"]');
            if (selectedNode) { selectedNode.classList.add('selected'); }
        }

        seatMap.querySelectorAll('.seat').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var num = Number(this.getAttribute('data-seat'));
                if (this.classList.contains('occupied') || this.classList.contains('unavailable')) { return; }
                if (walkInState.selectedSeat === num) {
                    walkInState.selectedSeat = null;
                    this.classList.remove('selected');
                } else {
                    var allowed = this.classList.contains('available');
                    if (!allowed) { return; }
                    walkInState.selectedSeat = num;
                    seatMap.querySelectorAll('.seat').forEach(function (seatBtn) {
                        seatBtn.classList.toggle('selected', Number(seatBtn.getAttribute('data-seat')) === num);
                    });
                }
                updateWalkInSeatSummary();
                clearWalkInError();
            });
        });
    }

    function updateWalkInSeatSummary() {
        var selected = walkInState.selectedSeat !== null && walkInState.selectedSeat !== undefined ? [walkInState.selectedSeat] : [];
        var label = byId('walkin-selected-count');
        var summary = byId('walkin-selected-seats');
        var status = byId('walkin-limit-msg');
        if (label) { label.textContent = 'Selected: ' + selected.length + ' / 1'; }
        if (summary) { summary.textContent = 'Selected Seats: ' + (selected.length ? selected.map(function (n) { return String(n).padStart(2, '0'); }).join(', ') : '—'); }
        if (status) { status.hidden = true; }
    }

    function loadWalkInSeatAvailability() {
        var selectedTrip = getSelectedTripFromWizard();
        if (!selectedTrip) { return; }

        fetch('api/booking.php?action=availability&trip_id=' + encodeURIComponent(String(selectedTrip.id)) + '&date=' + encodeURIComponent(String(selectedTrip.departure_date || walkInState.tripDate)), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                });
            })
            .then(function (data) {
                if (!data || !data.success) { return; }
                var occupied = Array.isArray(data.occupied) ? data.occupied.map(function (n) { return Number(n); }) : [];
                var seatCount = Number(data.seat_count) || 51;
                renderWalkInSeatMap(occupied, seatCount);
                updateWalkInSeatSummary();
            })
            .catch(function () {
                renderWalkInSeatMap([], 51);
                updateWalkInSeatSummary();
            });
    }

    function getSelectedTripFromWizard() {
        if (walkInState.tripId && walkInState.trips.length) {
            for (var i = 0; i < walkInState.trips.length; i++) {
                if (String(walkInState.trips[i].id) === String(walkInState.tripId)) {
                    return walkInState.trips[i];
                }
            }
        }
        return null;
    }

    function refreshWalkInTripOptions() {
        var tripSelect = byId('walkin-trip');
        if (!tripSelect) { return; }
        var dateValue = walkInState.tripDate;
        var filteredTrips = walkInState.trips.filter(function (trip) {
            if (String(trip.status || '').toLowerCase() !== 'scheduled') { return false; }
            if (dateValue && String(trip.departure_date) !== dateValue) { return false; }
            return true;
        });

        tripSelect.innerHTML = '<option value="">Select trip</option>';
        filteredTrips.forEach(function (trip) {
            var opt = document.createElement('option');
            opt.value = String(trip.id);
            opt.textContent = trip.from_city + ' → ' + trip.to_city + ' (' + trip.departure_date + ' ' + trip.departure_time + ')';
            tripSelect.appendChild(opt);
        });
        if (walkInState.tripId && filteredTrips.some(function (trip) { return String(trip.id) === String(walkInState.tripId); })) {
            tripSelect.value = String(walkInState.tripId);
        }
    }

    function renderWalkInDayPicker() {
        var dayList = byId('walkin-booking-day-list');
        if (!dayList || !walkInState.trips.length) { return; }

        var dates = {};
        walkInState.trips.forEach(function (trip) {
            if (String(trip.status || '').toLowerCase() === 'scheduled') {
                dates[trip.departure_date] = true;
            }
        });

        var sortedDates = Object.keys(dates).sort();
        dayList.innerHTML = sortedDates.map(function (date) {
            var d = new Date(date);
            var dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
            var dayNum = d.getDate();
            var isActive = walkInState.tripDate === date ? 'active' : '';
            return '<button type="button" class="cd-day-btn ' + isActive + '" data-date="' + date + '">' +
                '<div>' + dayNum + '</div><div>' + dayName + '</div>' +
                '</button>';
        }).join('');

        dayList.querySelectorAll('.cd-day-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                clearWalkInError();
                var date = this.getAttribute('data-date');
                walkInState.tripDate = date;
                dayList.querySelectorAll('.cd-day-btn').forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                updateWalkInDateLabel();
                refreshWalkInTripOptions();
            });
        });
    }

    function updateWalkInDateLabel() {
        var label = byId('walkin-booking-date-label');
        if (label) {
            if (walkInState.tripDate) {
                var d = new Date(walkInState.tripDate);
                label.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            } else {
                label.textContent = 'Select a date';
            }
        }
    }

    function populateWalkInBookingTrips() {
        return fetch('api/company.php?action=trips', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                });
            })
            .then(function (data) {
                if (!data || !data.success) { return false; }
                walkInState.trips = data.trips || [];
                refreshWalkInTripOptions();
                return true;
            })
            .catch(function () {
                return false;
            });
    }

    function setWalkInStep(step) {
        walkInState.step = step;
        var stepNodes = document.querySelectorAll('.cd-walkin-booking-step');
        for (var i = 0; i < stepNodes.length; i++) {
            stepNodes[i].classList.toggle('active', String(i + 1) === String(step));
        }
        var pills = document.querySelectorAll('.cd-walkin-step-pill');
        for (var j = 0; j < pills.length; j++) {
            var labelValue = Number(j + 1);
            pills[j].classList.toggle('active', labelValue === step);
            pills[j].classList.toggle('done', labelValue < step);
        }
        var nextBtn = byId('walkin-booking-next');
        var confirmBtn = byId('walkin-booking-confirm');
        if (nextBtn) { nextBtn.hidden = step === 6; }
        if (confirmBtn) { confirmBtn.hidden = step !== 6; }
        var backBtn = byId('walkin-booking-back');
        if (backBtn) { backBtn.disabled = step === 1; }
        if (step === 6) { updateWalkInConfirmation(); }
    }

    function clearWalkInError() {
        var errors = document.querySelectorAll('#walkin-booking-form .cd-walkin-field-error');
        for (var i = 0; i < errors.length; i++) {
            errors[i].textContent = '';
            errors[i].hidden = true;
        }
        var invalidFields = document.querySelectorAll('#walkin-booking-form [aria-invalid="true"]');
        for (var j = 0; j < invalidFields.length; j++) {
            invalidFields[j].removeAttribute('aria-invalid');
        }
    }

    function showWalkInError(errorId, message, fieldId) {
        var error = byId(errorId);
        if (error) {
            error.textContent = message || 'Please complete this required field.';
            error.hidden = false;
        }
        var field = fieldId ? byId(fieldId) : null;
        if (field) {
            field.setAttribute('aria-invalid', 'true');
            field.focus();
        }
    }

    function validateWalkInPassenger() {
        var name = byId('walkin-passenger-name') ? byId('walkin-passenger-name').value.trim() : '';
        var phoneInput = byId('walkin-passenger-phone');
        var phoneDigits = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
        if (phoneDigits.length === 10 && phoneDigits.charAt(0) === '0') {
            phoneDigits = phoneDigits.slice(1);
        }
        var ageRaw = byId('walkin-passenger-age') ? byId('walkin-passenger-age').value.trim() : '';
        var genderInput = document.querySelector('input[name="walkin-passenger-gender"]:checked');

        if (!name || name.length < 2) {
            showWalkInError('walkin-passenger-name-error', 'Passenger full name is required.', 'walkin-passenger-name');
            return null;
        }
        if (!/^[1-9][0-9]{8}$/.test(phoneDigits)) {
            showWalkInError('walkin-passenger-phone-error', 'Enter a valid Ethiopian phone number: +251 followed by 9 digits (mobile 9X / 7X or landline 1X…).', 'walkin-passenger-phone');
            return null;
        }
        if (phoneInput) { phoneInput.value = phoneDigits; }

        var age = parseInt(ageRaw, 10);
        if (!ageRaw || !/^\d+$/.test(ageRaw) || age < 1 || age > 200) {
            showWalkInError('walkin-passenger-age-error', 'Passenger age is required and must be between 1 and 200.', 'walkin-passenger-age');
            return null;
        }
        if (!genderInput) {
            showWalkInError('walkin-passenger-gender-error', 'Please select the passenger gender.', null);
            return null;
        }
        return {
            name: name,
            phone: '+251' + phoneDigits,
            age: String(age),
            gender: genderInput.value
        };
    }

    function validateWalkInRefundAccount() {
        var accountName = byId('walkin-refund-account-name') ? byId('walkin-refund-account-name').value.trim() : '';
        var accountNumber = byId('walkin-refund-account-number') ? byId('walkin-refund-account-number').value.trim() : '';
        var bankType = byId('walkin-refund-account-type') ? byId('walkin-refund-account-type').value : '';
        var otherBank = byId('walkin-refund-account-other') ? byId('walkin-refund-account-other').value.trim() : '';
        if (!accountName) {
            showWalkInError('walkin-refund-account-name-error', 'Refund account name is required.', 'walkin-refund-account-name');
            return false;
        }
        if (!accountNumber) {
            showWalkInError('walkin-refund-account-number-error', 'Refund account number is required.', 'walkin-refund-account-number');
            return false;
        }
        if (!bankType) {
            showWalkInError('walkin-refund-account-type-error', 'Please select the bank for this refund account.', 'walkin-refund-account-type');
            return false;
        }
        if (bankType === 'Other' && !otherBank) {
            showWalkInError('walkin-refund-account-other-error', 'Please enter the bank name.', 'walkin-refund-account-other');
            return false;
        }
        return true;
    }

    function updateWalkInConfirmation() {
        var source = walkInState.bookingType === 'office' ? 'Office / Walk-in' : walkInState.bookingType === 'call_in' ? 'Call-in' : '—';
        var trip = getSelectedTripFromWizard();
        var passengerName = byId('walkin-passenger-name') ? byId('walkin-passenger-name').value.trim() : '';
        var passengerPhoneRaw = byId('walkin-passenger-phone') ? byId('walkin-passenger-phone').value.trim() : '';
        var passengerDigits = passengerPhoneRaw.replace(/\D/g, '');
        if (passengerDigits.length === 10 && passengerDigits.charAt(0) === '0') { passengerDigits = passengerDigits.slice(1); }
        var passengerPhone = passengerDigits ? ('+251' + passengerDigits) : '';
        var paymentMethod = walkInState.paymentMethod === 'cash' ? 'Cash' : walkInState.paymentMethod === 'transfer' ? 'Bank Transfer' : '—';
        var seatLabel = walkInState.selectedSeat !== null && walkInState.selectedSeat !== undefined ? String(walkInState.selectedSeat).padStart(2, '0') : '—';
        var tripLabel = trip ? trip.from_city + ' → ' + trip.to_city + ' (' + trip.departure_date + ' ' + trip.departure_time + ')' : '—';
        var summary = document.getElementById('walkin-confirm-source');
        if (summary) { summary.textContent = source; }
        summary = document.getElementById('walkin-confirm-trip');
        if (summary) { summary.textContent = tripLabel; }
        summary = document.getElementById('walkin-confirm-seat');
        if (summary) { summary.textContent = seatLabel; }
        summary = document.getElementById('walkin-confirm-passenger');
        if (summary) {
            var passengerLabel = passengerName ? passengerName : '';
            if (passengerPhone) { passengerLabel = passengerLabel ? passengerLabel + ' · ' + passengerPhone : passengerPhone; }
            summary.textContent = passengerLabel || '—';
        }
        summary = document.getElementById('walkin-confirm-payment');
        if (summary) { summary.textContent = paymentMethod + (walkInState.paymentMethod === 'transfer' && walkInState.transferRef ? ' · ' + walkInState.transferRef : ''); }
        summary = document.getElementById('walkin-confirm-refund');
        if (summary) {
            var rName = byId('walkin-refund-account-name') ? byId('walkin-refund-account-name').value.trim() : '';
            var rNumber = byId('walkin-refund-account-number') ? byId('walkin-refund-account-number').value.trim() : '';
            var rBank = '';
            var rType = byId('walkin-refund-account-type');
            if (rType && rType.value) {
                rBank = rType.value === 'Other'
                    ? (byId('walkin-refund-account-other') ? byId('walkin-refund-account-other').value.trim() : '')
                    : rType.value;
            }
            var parts = [];
            if (rName) { parts.push(rName); }
            if (rBank) { parts.push(rBank); }
            if (rNumber) { parts.push(rNumber); }
            summary.textContent = parts.length ? parts.join(' · ') : '—';
        }
    }

    function openWalkInBookingForm() {
        var modal = byId('walkin-booking-modal');
        if (!modal) { return; }
        var form = byId('walkin-booking-form');
        if (form) { form.reset(); }
        walkInState = {
            step: 1,
            bookingType: '',
            tripDate: '',
            tripId: '',
            trip: null,
            paymentMethod: '',
            selectedSeat: null,
            transferRef: '',
            transferSender: '',
            trips: walkInState.trips || []
        };
        clearWalkInError();
        setWalkInStep(1);
        var submitBtn = byId('walkin-booking-confirm');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✓ Confirm Booking'; }
        var typeInputs = document.querySelectorAll('input[name="walkin-booking-type"]');
        for (var i = 0; i < typeInputs.length; i++) { typeInputs[i].checked = false; }
        var payInputs = document.querySelectorAll('input[name="walkin-payment-method"]');
        for (var p = 0; p < payInputs.length; p++) { payInputs[p].checked = false; }
        var transferFields = byId('walkin-transfer-fields');
        if (transferFields) { transferFields.classList.remove('visible'); }
        var rName = byId('walkin-refund-account-name'); if (rName) { rName.value = ''; }
        var rNumber = byId('walkin-refund-account-number'); if (rNumber) { rNumber.value = ''; }
        var rType = byId('walkin-refund-account-type'); if (rType) { rType.value = ''; }
        var rOtherWrap = byId('walkin-refund-account-other-wrap'); if (rOtherWrap) { rOtherWrap.hidden = true; }
        var rOther = byId('walkin-refund-account-other'); if (rOther) { rOther.value = ''; }
        walkInState.tripDate = '';
        populateWalkInBookingTrips().then(function () {
            renderWalkInDayPicker();
            updateWalkInDateLabel();
        });
        modal.hidden = false;
    }

    function closeWalkInBookingForm() {
        var modal = byId('walkin-booking-modal');
        if (modal) { modal.hidden = true; }
        clearWalkInError();
        walkInState = {
            step: 1,
            bookingType: '',
            tripDate: '',
            tripId: '',
            trip: null,
            paymentMethod: '',
            selectedSeat: null,
            transferRef: '',
            transferSender: '',
            trips: walkInState.trips || []
        };
    }

    function submitWalkInBookingForm() {
        var form = byId('walkin-booking-form');
        if (!form) { return; }

        clearWalkInError();
        var tripId = byId('walkin-trip') ? byId('walkin-trip').value : '';
        var passengerName = '';
        var passengerPhone = '';
        var passengerAge = '';
        var passengerGender = '';
        var paymentInput = document.querySelector('input[name="walkin-payment-method"]:checked');
        var paymentMethod = paymentInput ? paymentInput.value : '';
        var transferTransaction = byId('walkin-transfer-transaction') ? byId('walkin-transfer-transaction').value.trim() : '';

        if (!walkInState.bookingType) {
            showWalkInError('walkin-booking-type-error', 'Please choose a booking source before continuing.', null);
            return;
        }
        if (!walkInState.tripDate || !tripId) {
            showWalkInError(!walkInState.tripDate ? 'walkin-date-error' : 'walkin-trip-error', !walkInState.tripDate ? 'Travel date is required.' : 'Please select a valid trip.', !walkInState.tripDate ? null : 'walkin-trip');
            return;
        }
        if (walkInState.selectedSeat === null || walkInState.selectedSeat === undefined) {
            showWalkInError('walkin-seat-error', 'Please choose a seat before continuing.', null);
            return;
        }
        var passengerData = validateWalkInPassenger();
        if (!passengerData) { return; }
        if (!validateWalkInRefundAccount()) { return; }
        passengerName = passengerData.name;
        passengerPhone = passengerData.phone;
        passengerAge = passengerData.age;
        passengerGender = passengerData.gender;
        if (!paymentMethod) {
            showWalkInError('walkin-payment-method-error', 'Please choose a payment method.', null);
            return;
        }
        if (paymentMethod === 'transfer' && !transferTransaction) {
            showWalkInError('walkin-transfer-transaction-error', 'A transfer transaction number is required for bank transfer payments.', 'walkin-transfer-transaction');
            return;
        }

        var payload = {
            trip_id: tripId,
            passenger_name: passengerName,
            passenger_phone: passengerPhone,
            passenger_age: passengerAge,
            passenger_gender: passengerGender,
            seat_number: String(walkInState.selectedSeat),
            payment_method: paymentMethod,
            payment_reference: paymentMethod === 'transfer' ? transferTransaction : '',
            refund_account_name: byId('walkin-refund-account-name') ? byId('walkin-refund-account-name').value.trim() : '',
            refund_account_number: byId('walkin-refund-account-number') ? byId('walkin-refund-account-number').value.trim() : '',
            refund_bank: (function () {
                var sel = byId('walkin-refund-account-type');
                if (!sel || !sel.value) { return ''; }
                if (sel.value === 'Other') {
                    return byId('walkin-refund-account-other') ? byId('walkin-refund-account-other').value.trim() : '';
                }
                return sel.value;
            })()
        };

        var submitBtn = byId('walkin-booking-confirm');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Booking...'; }

        fetch('api/company.php?action=booking_create', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || result.status !== 201 || !data.success) {
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirm Booking'; }
                    showWalkInError('walkin-booking-submit-error', data.message || 'Unable to create the walk-in booking.', null);
                    return;
                }
                var bookingRef = data.booking ? data.booking.booking_reference : '';
                if (!bookingRef) {
                    showWalkInError('walkin-booking-submit-error', 'The booking was created but no reference was returned.', null);
                    return;
                }
                closeWalkInBookingForm();
                loadBookings();
                loadPayments();
                var notice = data.message || 'Office booking created.';
                var info = byId('booking-error');
                if (info) {
                    info.hidden = false;
                    info.className = 'cd-bookings-error auth-message success';
                    info.textContent = notice;
                }
                /* Show the digital ticket in-page — same backend payload and the
                   same ticket design the passenger confirmation page uses. */
                loadWalkInTicket(bookingRef);
            })
            .catch(function () {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirm Booking'; }
                showWalkInError('walkin-booking-submit-error', 'Network error while creating the walk-in booking.', null);
            });
    }

    /* ============================================================
       Booking ticket popup — loaded from the SAME backend payload
       the passenger confirmation page uses (api/booking.php?action=get)
       and rendered in-page, so the office sees the identical ticket +
       Download / Print option. Used by the "View Ticket" action on each
       booking card AND by walk-in confirmations — a company session may
       open any booking on its own trips.
       ============================================================ */

    function formatTicketDate(iso) {
        if (!iso) { return ''; }
        var d = new Date(String(iso) + 'T00:00:00');
        if (isNaN(d.getTime())) { return String(iso); }
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatTicketDuration(minutes) {
        var m = Number(minutes);
        if (isNaN(m) || m <= 0) { return ''; }
        var h = Math.floor(m / 60);
        var mm = m % 60;
        return h + 'h ' + ('0' + mm).slice(-2) + 'm';
    }

    function formatTicketPrice(n) {
        return 'ETB ' + Number(n).toLocaleString();
    }

    function loadWalkInTicket(bookingRef) {
        var modal = byId('walkin-ticket-modal');
        if (!modal || !bookingRef) { return; }
        var loading = byId('walkin-ticket-loading');
        var error = byId('walkin-ticket-error');
        var body = byId('walkin-ticket-body');
        if (loading) { loading.hidden = false; }
        if (error) { error.hidden = true; }
        if (body) { body.hidden = true; }
        modal.hidden = false;

        fetch('api/booking.php?action=get&ref=' + encodeURIComponent(bookingRef), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success || !data.booking) {
                    showWalkInTicketError(data.message || 'Unable to load the ticket.');
                    return;
                }
                renderWalkInTicket(data.booking);
            })
            .catch(function () {
                showWalkInTicketError('Network error while loading the ticket.');
            });
    }

    function showWalkInTicketError(message) {
        var loading = byId('walkin-ticket-loading'); if (loading) { loading.hidden = true; }
        var error = byId('walkin-ticket-error');
        if (error) {
            error.hidden = false;
            error.textContent = message || 'Unable to load the ticket.';
        }
        var body = byId('walkin-ticket-body'); if (body) { body.hidden = true; }
    }

    /* Renders the exact same ticket fields the passenger confirmation page
       renders (mirrors js/confirmation.js applyBookingFromApi + renderTicket). */
    function renderWalkInTicket(b) {
        var bookingRef = b.reference || '';
        var passengers = Array.isArray(b.passengers) ? b.passengers : [];
        var passengerNames = [];
        for (var p = 0; p < passengers.length; p++) {
            passengerNames.push(passengers[p].name || ('Passenger ' + (p + 1)));
        }
        var seats = Array.isArray(b.seats) ? b.seats.slice() : [];
        var date = b.date || '';
        var total = Number(b.total) || 0;
        var trip = {
            from: b.from || '',
            to: b.to || '',
            depart: b.depart || '',
            arrive: b.arrive || '',
            minutes: Number(b.minutes) || 0,
            company: b.company || '',
            type: b.tripType || 'Standard',
            busType: b.busType || ''
        };

        byId('ticket-ref').textContent = bookingRef;
        byId('t-ref').textContent = bookingRef;
        byId('t-departure-city').textContent = trip.from;
        byId('t-depart-time').textContent = trip.depart;
        byId('t-arrival-city').textContent = trip.to;
        byId('t-arrival-time').textContent = trip.arrive;
        byId('t-duration').textContent = formatTicketDuration(trip.minutes);
        byId('t-passengers').textContent = passengerNames.join(', ') || 'Passenger';
        byId('t-company').textContent = trip.company;
        byId('t-date').textContent = formatTicketDate(date);
        byId('t-depart').textContent = trip.depart;
        byId('t-arrive').textContent = trip.arrive;
        byId('t-seats').textContent = seats.join(', ');
        byId('t-type').textContent = trip.type;
        byId('t-total').textContent = formatTicketPrice(total);

        var loading = byId('walkin-ticket-loading'); if (loading) { loading.hidden = true; }
        var error = byId('walkin-ticket-error'); if (error) { error.hidden = true; }
        var body = byId('walkin-ticket-body'); if (body) { body.hidden = false; }
    }

    function closeWalkInTicket() {
        var modal = byId('walkin-ticket-modal');
        if (modal) { modal.hidden = true; }
    }

    /* Populate the trip filter with ONLY the authenticated company's own trips.
       The server stays authoritative — a manipulated option value can never
       reach another company's data because action=bookings re-checks ownership. */
    function loadBookingTripOptions() {
        var fromSelect = byId('booking-from-filter');
        var toSelect = byId('booking-to-filter');
        if (!fromSelect || !toSelect) { return; }

        fetch('api/company.php?action=trips', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                });
            })
            .then(function (data) {
                if (!data || !data.success) { return; }
                bookingTripOptions = data.trips || [];
                var fromCurrent = fromSelect.value || '';
                var toCurrent = toSelect.value || '';
                var fromCities = {};
                var toCities = {};
                bookingTripOptions.forEach(function (t) {
                    fromCities[t.from_city] = true;
                    toCities[t.to_city] = true;
                });
                fromSelect.innerHTML = '<option value="">All cities</option>';
                toSelect.innerHTML = '<option value="">All cities</option>';
                Object.keys(fromCities).sort().forEach(function (city) {
                    var opt = document.createElement('option');
                    opt.value = city;
                    opt.textContent = city;
                    fromSelect.appendChild(opt);
                });
                Object.keys(toCities).sort().forEach(function (city) {
                    var opt = document.createElement('option');
                    opt.value = city;
                    opt.textContent = city;
                    toSelect.appendChild(opt);
                });
                fromSelect.value = fromCurrent;
                toSelect.value = toCurrent;
                if (window.ETCityPicker) {
                    window.ETCityPicker.sync('booking-from-filter');
                    window.ETCityPicker.sync('booking-to-filter');
                }
                renderBookingDayPicker();
                updateBookingDateLabel();
            })
            .catch(function () { /* non-fatal: filter stays on "All trips" */ });
    }


 /* Revenue / Payments (read-only reporting UI). */
    var currentPayments = [];
    var selectedRevenueDate = '';
    var selectedPaymentStatus = 'all';

    function paymentStatusBadge(status) {
        var val = String(status || '').toLowerCase();
        return '<span class="cd-payment-badge ' + val + '">' + escHtml(val) + '</span>';
    }

    function showRevenueError(message) {
        var loading = byId('revenue-loading'); if (loading) { loading.hidden = true; }
        var empty = byId('payment-empty'); if (empty) { empty.hidden = true; }
        var list = byId('payment-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var error = byId('revenue-error');
        if (error) {
            error.hidden = false;
            error.className = 'cd-revenue-error auth-message error';
            error.textContent = message || 'Unable to load your revenue. Please try again later.';
        }
    }

    function setRevStat(id, value) {
        var el = byId(id);
        if (el) { el.textContent = value; }
    }

    function renderPayments(payments) {
        var loading = byId('payment-loading'); if (loading) { loading.hidden = true; }
        var error = byId('revenue-error'); if (error) { error.hidden = true; }
        var list = byId('payment-list');
        var empty = byId('payment-empty');

        if (!payments || !payments.length) {
            if (list) { list.innerHTML = ''; list.hidden = true; }
            if (empty) {
                var emptyMsg = 'No payments found for your trips yet. Payments will appear here once passengers pay for seats on your scheduled trips.';
                if (selectedPaymentStatus !== 'all') {
                    if (selectedPaymentStatus === 'paid') { emptyMsg = 'No paid payments match the current filters.'; }
                    else if (selectedPaymentStatus === 'refunded') { emptyMsg = 'No refunded payments match the current filters.'; }
                } else if (selectedRevenueDate) {
                    emptyMsg = 'No payments match the current filters.';
                }
                empty.textContent = emptyMsg;
                empty.hidden = false;
            }
            return;
        }

        var html = payments.map(function (p) {
            var refundedAmount = Number(p.refunded_amount) || 0;
            var cancellationDetail = '';
            if (String(p.booking_status) === 'cancelled') {
                var refundLabel = String(p.refund_type) === 'half' ? 'Half refund' : String(p.refund_type) === 'full' ? 'Full refund' : 'No refund';
                cancellationDetail = '<span class="cd-payment-row-text">Cancelled · ' + refundLabel +
                    (refundedAmount ? ': ETB ' + formatMoney(refundedAmount) + ' · Net retained: ETB ' + formatMoney(Math.max(0, Number(p.amount || 0) - refundedAmount)) : '') +
                    '</span>';
            }
            return '<div class="cd-payment-card" data-payment-id="' + p.id + '">' +
                '<span class="cd-payment-ref">' + escHtml(p.booking_reference) + '</span>' +
                '<span class="cd-payment-route">' + escHtml(p.route_from) + ' \u2192 ' + escHtml(p.route_to) + '</span>' +
                '<span class="cd-payment-row-text">Departure: ' + escHtml(p.departure_date) + ' ' + escHtml(p.departure_time) + '</span>' +
                '<span class="cd-payment-row-text">Booking #' + p.booking_id + ' \u2022 Trip #' + p.trip_id + '</span>' +
                '<span class="cd-payment-amount">ETB ' + formatMoney(p.amount) + '</span>' +
                '<span class="cd-payment-row-text">Method: ' + escHtml(p.method) +
                    (p.transaction_reference ? ' \u2022 ' + escHtml(p.transaction_reference) : '') + '</span>' +
                '<span class="cd-payment-row-text">' + paymentStatusBadge(p.status) + '</span>' +
                cancellationDetail +
                '<span class="cd-payment-row-text">Payment date: ' + escHtml(p.created_at) + '</span>' +
                '</div>';
        }).join('');

        if (list) {
            list.innerHTML = html;
            list.hidden = false;
        }
        if (empty) { empty.hidden = true; }
    }

    function renderRevenueDayPicker() {
        var list = byId('revenue-day-list');
        if (!list) { return; }
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var html = '';
        for (var i = 0; i < 14; i++) {
            var day = new Date(today); day.setDate(today.getDate() + i);
            var iso = bookingDateISO(day);
            html += '<button type="button" class="cd-day-button" data-revenue-date="' + iso + '" aria-pressed="' + String(iso === selectedRevenueDate) + '"><span>' + day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() + '</span><b>' + day.getDate() + '</b></button>';
        }
        list.innerHTML = html;
        var buttons = list.querySelectorAll('[data-revenue-date]');
        for (var j = 0; j < buttons.length; j++) { buttons[j].addEventListener('click', function () { var date = this.getAttribute('data-revenue-date'); selectedRevenueDate = selectedRevenueDate === date ? '' : date; renderRevenueDayPicker(); applyRevenueFilters(); }); }
    }

    function applyRevenueFilters() {
        var from = byId('revenue-from-filter'); var to = byId('revenue-to-filter');
        var fromValue = from ? from.value : ''; var toValue = to ? to.value : '';
        var label = byId('revenue-date-label');
        if (label) { label.textContent = selectedRevenueDate ? new Date(selectedRevenueDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'All upcoming departure dates'; }
        renderPayments(currentPayments.filter(function (payment) {
            var statusOk = selectedPaymentStatus === 'all' || String(payment.status) === selectedPaymentStatus;
            return (!selectedRevenueDate || String(payment.departure_date) === selectedRevenueDate) && (!fromValue || String(payment.route_from) === fromValue) && (!toValue || String(payment.route_to) === toValue) && statusOk;
        }));
    }

    function populateRevenueCities(payments) {
        var from = byId('revenue-from-filter'); var to = byId('revenue-to-filter');
        if (!from || !to) { return; }
        var fromValue = from.value || ''; var toValue = to.value || ''; var fromCities = {}; var toCities = {};
        payments.forEach(function (payment) { fromCities[payment.route_from] = true; toCities[payment.route_to] = true; });
        from.innerHTML = '<option value="">All cities</option>'; to.innerHTML = '<option value="">All cities</option>';
        Object.keys(fromCities).sort().forEach(function (city) { var option = document.createElement('option'); option.value = city; option.textContent = city; from.appendChild(option); });
        Object.keys(toCities).sort().forEach(function (city) { var option = document.createElement('option'); option.value = city; option.textContent = city; to.appendChild(option); });
        from.value = fromValue; to.value = toValue;
        if (window.ETCityPicker) {
            window.ETCityPicker.sync('revenue-from-filter');
            window.ETCityPicker.sync('revenue-to-filter');
        }
        renderRevenueDayPicker();
    }

        function paymentsFilterUrl() {
        var url = 'api/company.php?action=payments';
        return url;
    }

    /* ---------- Revenue overview modal (migrated from the admin Revenue detail) ---------- */
    var revenueOverviewRequestId = 0;   // discards responses from superseded overview requests

    function populateRevenueOverviewYears() {
        var sel = byId('cd-revenue-overview-year');
        if (!sel) { return; }
        var current = new Date().getFullYear();
        var html = '<option value="">All years</option>';
        for (var y = current; y >= current - 5; y--) {
            html += '<option value="' + y + '">' + y + '</option>';
        }
        sel.innerHTML = html;
    }

    function showRevenueOverviewError(message) {
        var loading = byId('revenue-overview-loading'); if (loading) { loading.hidden = true; }
        var box = byId('revenue-overview-detail'); if (box) { box.hidden = true; }
        var error = byId('revenue-overview-error');
        if (error) {
            error.hidden = false;
            error.className = 'cd-revenue-error auth-message error';
            error.textContent = message || 'Unable to load your revenue overview. Please try again later.';
        }
    }

    function renderRevenueOverview(data) {
        var loading = byId('revenue-overview-loading'); if (loading) { loading.hidden = true; }
        var bd = (data && data.breakdown) || {};
        var total = bd.total || { bookings: 0, paid: 0, refunds: 0, net: 0 };
        var online = bd.online || {};
        var office = bd.office || {};
        var parcels = bd.parcels || {};

        setRevStat('cd-rev-ov-bookings', String(total.bookings == null ? 0 : total.bookings));
        setRevStat('cd-rev-ov-online', String(online.bookings == null ? 0 : online.bookings));
        setRevStat('cd-rev-ov-office', String(office.bookings == null ? 0 : office.bookings));
        setRevStat('cd-rev-ov-parcels', String(parcels.bookings == null ? 0 : parcels.bookings));
        setRevStat('cd-rev-ov-paid', formatMoney(total.paid));
        setRevStat('cd-rev-ov-refunds', formatMoney(total.refunds));
        setRevStat('cd-rev-ov-net', formatMoney(total.net));

        var label = byId('cd-revenue-overview-period-label');
        if (label) { label.textContent = (data.period && data.period.label) || 'All time'; }

        var body = byId('cd-revenue-overview-rows');
        if (!body) { return; }
        var rows = [
            ['Website bookings', online],
            ['Office bookings', office],
            ['Parcels', parcels],
            ['Total', total]
        ];
        var html = '';
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i][1] || {};
            var cls = i === rows.length - 1 ? ' class="cd-revenue-overview-total"' : '';
            html += '<tr' + cls + '>' +
                '<td>' + rows[i][0] + '</td>' +
                '<td>' + (row.bookings == null ? 0 : row.bookings) + '</td>' +
                '<td>' + formatMoney(row.paid) + '</td>' +
                '<td>' + formatMoney(row.refunds) + '</td>' +
                '<td>' + formatMoney(row.net) + '</td>' +
                '</tr>';
        }
        body.innerHTML = html;
    }

    function loadRevenueOverview() {
        var rid = ++revenueOverviewRequestId;
        var loading = byId('revenue-overview-loading'); if (loading) { loading.hidden = false; }
        var error = byId('revenue-overview-error'); if (error) { error.hidden = true; }
        var box = byId('revenue-overview-detail'); if (box) { box.hidden = true; }

        var p = [];
        var month = byId('cd-revenue-overview-month');
        if (month && month.value) { p.push('month=' + encodeURIComponent(month.value)); }
        var year = byId('cd-revenue-overview-year');
        if (year && year.value) { p.push('year=' + encodeURIComponent(year.value)); }
        var q = p.length ? '&' + p.join('&') : '';

        fetch('api/company.php?action=revenue_breakdown' + q, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== revenueOverviewRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showRevenueOverviewError(data.message || 'Unable to load your revenue overview.');
                    return;
                }
                renderRevenueOverview(data);
                var boxAgain = byId('revenue-overview-detail'); if (boxAgain) { boxAgain.hidden = false; }
            })
            .catch(function () {
                if (rid !== revenueOverviewRequestId) { return; }
                showRevenueOverviewError('Network error while loading your revenue overview.');
            });
    }

    function openRevenueOverview() {
        var modal = byId('cd-revenue-overview-modal');
        if (!modal) { return; }
        var detail = byId('revenue-overview-detail'); if (detail) { detail.hidden = true; }
        var error = byId('revenue-overview-error'); if (error) { error.hidden = true; }
        modal.hidden = false;
        loadRevenueOverview();
    }

    function closeRevenueOverview() {
        var modal = byId('cd-revenue-overview-modal');
        if (modal) { modal.hidden = true; }
    }

    var paymentsRequestId = 0;   // discards responses from superseded payment requests

    function renderInlineRevenueSummary(data) {
        var bd = (data && data.breakdown) || {};
        var online = bd.online || {}, office = bd.office || {}, parcels = bd.parcels || {}, total = bd.total || {};
        setRevStat('cd-rev-inline-online', 'ETB ' + formatMoney(online.paid));
        setRevStat('cd-rev-inline-office', 'ETB ' + formatMoney(office.paid));
        setRevStat('cd-rev-inline-parcels', 'ETB ' + formatMoney(parcels.paid));
        setRevStat('cd-rev-inline-paid', 'ETB ' + formatMoney(total.paid));
        setRevStat('cd-rev-inline-refunds', 'ETB ' + formatMoney(total.refunds));
        setRevStat('cd-rev-inline-net', 'ETB ' + formatMoney(total.net));
        var rows = [['Website bookings', online], ['Office bookings', office], ['Parcels', parcels], ['Total', total]];
        var body = byId('cd-revenue-inline-rows');
        if (body) {
            body.innerHTML = rows.map(function (row, index) {
                var value = row[1] || {};
                return '<tr' + (index === rows.length - 1 ? ' class="cd-revenue-overview-total"' : '') + '><td>' + row[0] + '</td><td>' + (value.bookings == null ? 0 : value.bookings) + '</td><td>' + formatMoney(value.paid) + '</td><td>' + formatMoney(value.refunds) + '</td><td>' + formatMoney(value.net) + '</td></tr>';
            }).join('');
        }
        var box = byId('revenue-inline-summary'); if (box) { box.hidden = false; }
    }

    function loadInlineRevenueSummary() {
        fetch('api/company.php?action=revenue_breakdown', { method: 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
            .then(function (res) { return res.json().catch(function () { return { success: false }; }).then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) { if (result.ok && result.data && result.data.success) { renderInlineRevenueSummary(result.data); } })
            .catch(function () { /* Payment records stay usable if the summary is temporarily unavailable. */ });
    }

    function loadPayments() {
        var rid = ++paymentsRequestId;
        var sec = byId('company-revenue'); if (sec) { sec.hidden = false; }
        var error = byId('revenue-error'); if (error) { error.hidden = true; }
        var list = byId('payment-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('payment-empty'); if (empty) { empty.hidden = true; }
        var loading = byId('payment-loading'); if (loading) { loading.hidden = false; }
        loadInlineRevenueSummary();

        fetch(paymentsFilterUrl(), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== paymentsRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showRevenueError(data.message || 'Unable to load your payments.');
                    return;
                }
                currentPayments = data.payments || [];
                populateRevenueCities(currentPayments);
                applyRevenueFilters();
            })
            .catch(function () {
                if (rid !== paymentsRequestId) { return; }
                showRevenueError('Network error while loading your payments.');
            });
    }

    function loadRevenueTripOptions() {
        var sel = byId('revenue-trip-filter');
        if (!sel) { return; }

        fetch('api/company.php?action=trips', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false };
                });
            })
            .then(function (data) {
                if (!data || !data.success) { return; }
                var trips = data.trips || [];
                var current = String(sel.value || '');
                sel.innerHTML = '<option value="">All trips</option>';
                trips.forEach(function (t) {
                    var opt = document.createElement('option');
                    opt.value = String(t.id);
                    opt.textContent = t.from_city + ' \u2192 ' + t.to_city + ' (' + t.departure_date + ')';
                    sel.appendChild(opt);
                });
                if (current) { sel.value = current; }
            })
            .catch(function () { /* non-fatal */ });
    }

    /* ===== Company profile management (additive) ===== */
    function setProfileError(message) {
        var sec = byId('company-profile'); if (sec) { sec.hidden = false; }
        var loading = byId('profile-loading'); if (loading) { loading.hidden = true; }
        var success = byId('profile-success'); if (success) { success.hidden = true; }
        var ferr = byId('profile-form-error'); if (ferr) { ferr.hidden = true; }
        var err = byId('profile-error');
        if (err) {
            err.hidden = false;
            err.className = 'cd-profile-error auth-message error';
            err.textContent = message || 'Unable to load your profile.';
        }
    }

    function setProfileFormError(message) {
        var err = byId('profile-form-error');
        if (err) {
            err.hidden = false;
            err.className = 'auth-message error';
            err.textContent = message || 'Unable to save your profile.';
        }
    }

    function clearProfileMessages() {
        var err = byId('profile-error'); if (err) { err.hidden = true; }
        var ferr = byId('profile-form-error'); if (ferr) { ferr.hidden = true; }
        var success = byId('profile-success'); if (success) { success.hidden = true; }
    }

    function profileValue(v) {
        return String(v == null || v === '' ? '\u2014' : v);
    }

    /* Show the phone without the locked +251 prefix inside the edit field. */
    function localPhoneValue(v) {
        var s = String(v == null ? '' : v).trim();
        if (s.indexOf('+251') === 0) { s = s.slice(4); }
        return s.trim();
    }

    /* Build the full stored phone number: locked +251 prefix + local digits.
       Strips a leading 0 (09X -> 9X) to match the app's phone convention. */
    function fullPhoneValue(v) {
        var digits = String(v == null ? '' : v).replace(/\D/g, '');
        if (digits.length === 10 && digits.charAt(0) === '0') { digits = digits.slice(1); }
        else if (digits.length > 10) { digits = digits.slice(0, 10); }
        return digits ? ('+251' + digits) : '';
    }

    /* ---------- Multiple phone numbers ---------- */
    /* One editable +251 phone row used inside the profile edit form. The
       country code is appended automatically on save; the input holds only
       the local national digits (mobile 9X/7X or landline 1X…). */
    function profilePhoneRowHtml(value) {
        var local = localPhoneValue(value);
        return '<div class="cd-phone-row">' +
            '<div class="phone-field">' +
                '<span class="phone-prefix" aria-hidden="true">+251</span>' +
                '<input type="tel" class="field-input cd-phone-input" name="phones[]" maxlength="12" placeholder="9XX XXX XXXX" inputmode="numeric" autocomplete="tel-national" value="' + escHtml(local) + '">' +
            '</div>' +
            '<button type="button" class="btn btn-ghost cd-phone-remove" aria-label="Remove this phone number">&times;</button>' +
        '</div>';
    }

    function addProfilePhoneRow(value) {
        var list = byId('profile-phone-list');
        if (!list) { return; }
        var holder = document.createElement('div');
        holder.innerHTML = profilePhoneRowHtml(value);
        list.appendChild(holder.firstChild);
        var input = list.lastElementChild ? list.lastElementChild.querySelector('.cd-phone-input') : null;
        if (input) { input.focus(); }
    }

    function removeProfilePhoneRow(btn) {
        var row = btn.closest ? btn.closest('.cd-phone-row') : null;
        if (row && row.parentNode) { row.parentNode.removeChild(row); }
        /* Always keep at least one editable phone row. */
        var list = byId('profile-phone-list');
        if (list && !list.querySelector('.cd-phone-row')) { addProfilePhoneRow(''); }
    }

    /* Fill the phone rows from the loaded company profile. */
    function populateProfilePhoneList(company) {
        var list = byId('profile-phone-list');
        if (!list) { return; }
        list.innerHTML = '';
        var numbers = (company.phones && company.phones.length)
            ? company.phones
            : (company.phone ? [company.phone] : ['']);
        for (var i = 0; i < numbers.length; i++) { addProfilePhoneRow(numbers[i]); }
    }

    /* Normalize every visible phone row to its full +251 value. Duplicates and
       empty rows are dropped so the saved list stays clean. */
    function collectProfilePhoneInputs() {
        var out = [];
        var rows = document.querySelectorAll('#profile-phone-list .cd-phone-input');
        for (var i = 0; i < rows.length; i++) {
            var full = fullPhoneValue(rows[i].value);
            if (full && out.indexOf(full) === -1) { out.push(full); }
        }
        return out;
    }

    /* ---------- Onboard amenities ---------- */
    /* The catalog the dashboard profile editor offers. Only the displayed icon
       lives here; the text name is what gets stored and compared. */
    var AMENITY_CATALOG = [
        { name: 'Reclining Seats', icon: '\uD83D\uDECB' },
        { name: 'Headrests', icon: '\uD83E\uDE91' },
        { name: 'Arm Support', icon: '\uD83D\uDCAA' },
        { name: 'AC', icon: '\u2744\uFE0F' },
        { name: 'Entertainment', icon: '\uD83C\uDEAC' },
        { name: 'Snacks', icon: '\uD83C\uDF7F' },
        { name: 'Water', icon: '\uD83D\uDCA7' },
        { name: 'Wi-Fi', icon: '\uD83D\uDCF6' },
        { name: 'Luggage Space', icon: '\uD83E\uDDF3' },
        { name: 'Multiple Pickup', icon: '\uD83D\uDE8F' }
    ];
    var currentProfileAmenities = [];

    /* Resolve the icon for an amenity name (fallback: plain check mark). */
    function amenityInfo(name) {
        for (var i = 0; i < AMENITY_CATALOG.length; i++) {
            if (AMENITY_CATALOG[i].name === name) { return AMENITY_CATALOG[i]; }
        }
        return { name: name, icon: '\u2713' };
    }

    /* One selected amenity chip inside the picker (with x to remove). */
    function amenityChipHtml(name) {
        var a = amenityInfo(name);
        return '<span class="cd-amenity-chip">' +
            '<span class="cd-amenity-chip-icon" aria-hidden="true">' + a.icon + '</span>' +
            '<span>' + escHtml(a.name) + '</span>' +
            '<button type="button" class="cd-amenity-remove" data-amenity-action="remove" data-amenity="' + escHtml(a.name) + '" aria-label="Remove ' + escHtml(a.name) + '">&times;</button>' +
        '</span>';
    }

    /* Render the public-profile amenity chips (view mode). */
    function renderAmenityView() {
        var view = byId('profile-amenities-view');
        if (!view) { return; }
        if (!currentProfileAmenities.length) { view.textContent = '\u2014'; return; }
        var html = '';
        for (var i = 0; i < currentProfileAmenities.length; i++) {
            var a = amenityInfo(currentProfileAmenities[i]);
            html += '<span class="cd-profile-amenity-view-chip">' +
                '<span class="cd-amenity-view-icon" aria-hidden="true">' + a.icon + '</span>' +
                escHtml(a.name) +
            '</span>';
        }
        view.innerHTML = html;
    }

    /* Render both halves of the picker: selected chips (with x) and the
       available icon list (with +). */
    function renderAmenityPicker() {
        var selected = byId('profile-amenities-selected');
        var available = byId('profile-amenities-available');
        var selEmpty = byId('profile-amenities-selected-empty');

        if (selected) {
            var sHtml = '';
            for (var i = 0; i < currentProfileAmenities.length; i++) {
                sHtml += amenityChipHtml(currentProfileAmenities[i]);
            }
            selected.innerHTML = sHtml;
            selected.hidden = currentProfileAmenities.length === 0;
            if (selEmpty) { selEmpty.hidden = currentProfileAmenities.length > 0; }
        }

        if (available) {
            var aHtml = '';
            for (var j = 0; j < AMENITY_CATALOG.length; j++) {
                if (currentProfileAmenities.indexOf(AMENITY_CATALOG[j].name) !== -1) { continue; }
                aHtml += '<button type="button" class="cd-amenity-item" data-amenity-action="add" data-amenity="' + escHtml(AMENITY_CATALOG[j].name) + '" aria-label="Add ' + escHtml(AMENITY_CATALOG[j].name) + '">' +
                    '<span class="cd-amenity-item-icon" aria-hidden="true">' + AMENITY_CATALOG[j].icon + '</span>' +
                    '<span class="cd-amenity-item-name">' + escHtml(AMENITY_CATALOG[j].name) + '</span>' +
                    '<span class="cd-amenity-item-plus" aria-hidden="true">+</span>' +
                '</button>';
            }
            available.innerHTML = aHtml || '<span class="cd-amenity-available-empty">All amenities added \u2713</span>';
        }

        renderAmenityView();
    }

    /* Toggle an amenity: add moves catalog -> selected, remove back. */
    function handleAmenityClick(name, action) {
        var idx = currentProfileAmenities.indexOf(name);
        if (action === 'add' && idx === -1) {
            currentProfileAmenities.push(name);
        } else if (action === 'remove' && idx !== -1) {
            currentProfileAmenities.splice(idx, 1);
        }
        renderAmenityPicker();
    }

    function setProfileLink(el, value) {
        if (!el) { return; }
        if (value) {
            el.textContent = value;
            el.href = value;
        } else {
            el.textContent = '\u2014';
            el.href = '#';
        }
    }

    function setProfileImagePreview(id, value, fallback) {
        var box = byId(id);
        if (!box) { return; }
        var image = box.querySelector('img');
        var label = box.querySelector('span');
        if (image && value) {
            image.src = value;
            image.hidden = false;
            if (label) { label.hidden = true; }
        } else {
            if (image) { image.removeAttribute('src'); image.hidden = true; }
            if (label) { label.textContent = fallback; label.hidden = false; }
        }
    }

    /* ===== Reviews (passenger feedback) =====
       Real passenger reviews for this company (from api/review.php). The
       operator can filter by star rating, like reviews, and reply to them.
       Replies appear on the passenger-facing company page. */
    var currentCompanyId = null;
    var reviewsRequestId = 0;
    var currentReviews = [];
    var reviewFilter = null;

    function reviewStarsHtml(rating) {
        var filled = Math.round(Number(rating) || 0);
        var s = '';
        for (var i = 0; i < 5; i++) { s += (i < filled) ? '\u2605' : '\u2606'; }
        return s;
    }

    function formatReviewDate(value) {
        if (!value) { return ''; }
        var iso = String(value);
        if (iso.indexOf(' ') > 0) { iso = iso.replace(' ', 'T'); }
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return String(value).slice(0, 10); }
        try {
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) { return String(value).slice(0, 10); }
    }

    function renderReviewFilterBar() {
        var bar = byId('review-filterbar');
        if (!bar) { return; }
        if (!currentReviews.length) { bar.hidden = true; bar.innerHTML = ''; return; }
        var options = [[null, 'All feedback'], [5, '5 stars'], [4, '4 stars'], [3, '3 stars'], [2, '2 stars'], [1, '1 star']];
        var html = '';
        for (var i = 0; i < options.length; i++) {
            var val = options[i][0]; var label = options[i][1];
            var active = val === reviewFilter;
            var count = 0;
            for (var k = 0; k < currentReviews.length; k++) { if (val === null || Number(currentReviews[k].rating) === val) { count++; } }
            html += '<button type="button" class="cd-review-filter' + (active ? ' is-active' : '') + '" data-review-filter="' + (val === null ? '' : val) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + label + ' <span class="cd-review-filter-count">' + count + '</span></button>';
        }
        bar.innerHTML = html;
        bar.hidden = false;
    }

    function reviewLikeButtonHtml(r) {
        var liked = !!r.liked;
        return '<button type="button" class="cd-review-like' + (liked ? ' is-liked' : '') + '" data-review-id="' + r.id + '" aria-pressed="' + (liked ? 'true' : 'false') + '" aria-label="' + (liked ? 'Unlike this review' : 'Like this review') + '">' +
            (liked ? '\u2665' : '\u2661') + ' <span class="cd-review-like-count">' + (Number(r.likes) || 0) + '</span>' +
        '</button>';
    }

    function reviewReplyBlockHtml(r) {
        if (!r.reply) { return ''; }
        return '<div class="cd-review-reply" data-review-id="' + r.id + '">' +
            '<span class="cd-review-reply-label">Company reply</span>' +
            '<p>' + escHtml(r.reply) + '</p>' +
            '<span class="cd-review-reply-meta">Published ' + (formatReviewDate(r.reply_at) || '') + '</span>' +
        '</div>';
    }

    function reviewCardHtml(r) {
        var editing = Number(reviewEditingReplyId) === Number(r.id);
        var initial = String(r.name || 'P').trim().charAt(0).toUpperCase() || 'P';
        return '<article class="cd-review-card' + (editing ? ' is-editing' : '') + '" data-review-id="' + r.id + '">' +
            '<div class="cd-review-card-head">' +
                '<span class="cd-review-avatar" aria-hidden="true">' + escHtml(initial) + '</span>' +
                '<div class="cd-review-person"><strong>' + escHtml(r.name || 'Passenger') + '</strong><span class="cd-review-meta">' + (formatReviewDate(r.created_at) || 'Recent review') + '</span></div>' +
                (r.verified ? '<span class="cd-review-badge">Verified</span>' : '') +
                '<span class="cd-review-rating" aria-label="Rated ' + r.rating + ' out of 5"><span aria-hidden="true">★</span> ' + Number(r.rating || 0).toFixed(1) + '</span>' +
            '</div>' +
            (r.comment ? '<p class="cd-review-text">' + escHtml(r.comment) + '</p>' : '<p class="cd-review-text cd-review-no-comment">No written comment.</p>') +
            '<div class="cd-review-actions">' + reviewLikeButtonHtml(r) +
                (!editing ? '<button type="button" class="cd-review-reply-btn" data-review-id="' + r.id + '">' + (r.reply ? 'Edit response' : 'Respond') + '</button>' : '') +
            '</div>' +
            (editing ? reviewReplyEditorHtml(r) : reviewReplyBlockHtml(r)) +
        '</article>';
    }

    function reviewReplyEditorHtml(r) {
        return '<div class="cd-review-reply-editor">' +
            '<div class="cd-review-reply-editor-head"><span>Public response</span><small data-review-reply-count>' + String(r.reply || '').length + ' / 1000</small></div>' +
            '<textarea class="cd-review-reply-input" maxlength="1000" placeholder="Write a reply to this passenger...">' + escHtml(r.reply || '') + '</textarea>' +
            '<div class="cd-review-reply-editor-actions">' +
                '<button type="button" class="btn btn-sm btn-secondary cd-review-reply-cancel" data-review-id="' + r.id + '">Cancel</button>' +
                '<button type="button" class="btn btn-sm btn-primary cd-review-reply-save" data-review-id="' + r.id + '">' + (r.reply ? 'Save reply' : 'Post reply') + '</button>' +
            '</div>' +
        '</div>';
    }
    function renderReviewCards() {
        var list = byId('review-list');
        var empty = byId('review-empty');
        var filtered = (reviewFilter === null) ? currentReviews : currentReviews.filter(function (x) { return x.rating === reviewFilter; });
        if (filtered.length) {
            var html = filtered.map(reviewCardHtml).join('');
            if (list) { list.innerHTML = html; list.hidden = false; }
            if (empty) { empty.hidden = true; }
        } else {
            if (list) { list.innerHTML = ''; list.hidden = true; }
            if (empty) {
                empty.hidden = false;
                empty.textContent = reviewFilter === null ? 'No reviews yet.' : 'No reviews match this rating yet.';
            }
        }
    }

    function renderReviews(data) {
        var sec = byId('company-reviews'); if (sec) { sec.hidden = false; }
        var loading = byId('review-loading'); if (loading) { loading.hidden = true; }
        var error = byId('review-error'); if (error) { error.hidden = true; }

        var summary = byId('review-summary');
        if (summary) {
            var rating = Number(data.rating) || 0;
            var reviews = data.reviews || [];
            var ratingCounts = [0, 0, 0, 0, 0, 0];
            for (var i = 0; i < reviews.length; i++) { var reviewRating = Math.round(Number(reviews[i].rating) || 0); if (reviewRating >= 1 && reviewRating <= 5) { ratingCounts[reviewRating]++; } }
            var totalReviews = Number(data.reviewCount) || reviews.length;
            var distribution = '';
            for (var star = 5; star >= 1; star--) {
                var count = ratingCounts[star];
                var width = totalReviews ? Math.round((count / totalReviews) * 100) : 0;
                distribution += '<div class="cd-review-distribution-row"><b>' + star + ' ★</b><span class="cd-review-distribution-track"><i class="cd-review-distribution-fill" style="width:' + width + '%"></i></span><span>' + count + '</span></div>';
            }
            summary.hidden = false;
            summary.innerHTML =
                '<div class="cd-review-score-panel"><p class="cd-review-kicker">Passenger sentiment</p><span class="cd-review-score">' + rating.toFixed(1) + '</span><span class="cd-review-stars" role="img" aria-label="Rated ' + rating.toFixed(1) + ' out of 5">' + reviewStarsHtml(rating) + '</span><span class="cd-review-count">' + totalReviews.toLocaleString() + ' review' + (totalReviews === 1 ? '' : 's') + '</span></div>' +
                '<div class="cd-review-distribution" aria-label="Rating distribution">' + distribution + '</div>';
        }

        currentReviews = data.reviews || [];
        renderReviewFilterBar();
        renderReviewCards();
    }

    function showReviewsError(message) {
        var loading = byId('review-loading'); if (loading) { loading.hidden = true; }
        var list = byId('review-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('review-empty'); if (empty) { empty.hidden = true; }
        var error = byId('review-error');
        if (error) {
            error.hidden = false;
            error.textContent = message || 'Unable to load your reviews. Please try again later.';
        }
    }

    function loadReviews() {
        var loading = byId('review-loading'); if (loading) { loading.hidden = false; }
        var error = byId('review-error'); if (error) { error.hidden = true; }
        var empty = byId('review-empty'); if (empty) { empty.hidden = true; }
        var list = byId('review-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        if (!currentCompanyId) { if (loading) { loading.hidden = true; } return; }

        var rid = ++reviewsRequestId;
        fetch('api/review.php?action=list&company_id=' + encodeURIComponent(currentCompanyId), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== reviewsRequestId) { return; }
                var loadEl = byId('review-loading'); if (loadEl) { loadEl.hidden = true; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showReviewsError(data.message || 'Unable to load your reviews.');
                    return;
                }
                renderReviews(data);
            })
            .catch(function () {
                if (rid !== reviewsRequestId) { return; }
                showReviewsError('Network error while loading your reviews.');
            });
    }
var reviewEditingReplyId = null;

    function currentReviewById(id) {
        for (var i = 0; i < currentReviews.length; i++) {
            if (currentReviews[i].id === Number(id)) { return currentReviews[i]; }
        }
        return null;
    }

    function showReviewActionMessage(message) {
        var error = byId('review-error');
        if (!error || !message) { return; }
        error.textContent = message;
        error.hidden = false;
        setTimeout(function () { if (error.textContent === message) { error.hidden = true; } }, 4000);
    }

    function toggleReviewLike(id) {
        if (!id) { return; }
        var url = 'api/review.php?action=like';
        fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
            body: 'review_id=' + encodeURIComponent(id)
        })
            .then(function (res) { return res.json().catch(function () { return { success: false, message: 'Invalid server response.' }; }); })
            .then(function (json) {
                if (!json || json.success !== true) {
                    showReviewActionMessage((json && json.message) || 'Unable to update the like.');
                    return;
                }
                var review = currentReviewById(id);
                if (review) {
                    review.likes = json.likes; review.liked = !!json.liked;
                }
                renderReviewCards();
            })
            .catch(function () { showReviewActionMessage('Network error while updating the like.'); });
    }

    function beginReviewReply(id) {
        reviewEditingReplyId = Number(id) || null;
        renderReviewCards();
        setTimeout(function () {
            var editor = document.querySelector('.cd-review-card.is-editing .cd-review-reply-input');
            if (editor) { editor.focus(); }
        }, 0);
    }

    function cancelReviewReply() {
        reviewEditingReplyId = null;
        renderReviewCards();
    }

    function submitReviewReply(id, reply) {
        if (!id) { return; }
        var url = 'api/review.php?action=reply';
        fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
            body: 'review_id=' + encodeURIComponent(id) + '&reply=' + encodeURIComponent(reply)
        })
            .then(function (res) { return res.json().catch(function () { return { success: false, message: 'Invalid server response.' }; }); })
            .then(function (json) {
                if (!json || json.success !== true) {
                    showReviewActionMessage((json && json.message) || 'Unable to save the reply.');
                    return;
                }
                var review = currentReviewById(id);
                if (review && json.review) {
                    review.reply = json.review.reply || null;
                    review.reply_at = json.review.reply_at || null;
                }
                reviewEditingReplyId = null;
                renderReviewCards();
                showReviewActionMessage('Review reply saved. It now appears on your passenger-facing profile.');
            })
            .catch(function () { showReviewActionMessage('Network error while saving the reply.'); });
    }

    /* ===== Complaints: passenger feedback triage (real backend) =====
       Passengers file complaints about this company (api/complaint.php).
       The operator loads them here (api/company.php?action=complaints),
       filters by status, and replies from a chat modal: the passenger's
       original message plus every response render as a conversation, and
       the composer appends new messages. The thread is append-only —
       once a response is sent it cannot be edited or deleted. */
    var complaintsRequestId = 0;
    var complaintFilter = null;                    // status filter
    var complaintsCounts = {};                     // status → count, always full
    var currentComplaints = [];
    var activeComplaintModalId = null;             // complaint id whose modal is open
    var activeComplaintModalComplaint = null;      // in-flight copy shown in the chat modal
    var complaintSending = false;                  // guard: one chat send at a time
    var complaintSentNoteTimer = 0;                // fades the "message sent" note
    var complaintLocalMessages = [];               // optimistic bubbles awaiting confirmation
    var complaintLocalMessageSeq = 0;              // unique key for optimistic bubbles

    var COMPLAINT_STATUSES = [
        ['open', 'Open'],
        ['in_progress', 'In progress'],
        ['resolved_pending', 'Awaiting confirmation'],
        ['resolved', 'Resolved'],
        ['closed', 'Closed'],
        ['escalated', 'Escalated']
    ];

    /* Statuses the company may choose directly. \"resolved\" requires the
       passenger to confirm (two-way resolution) and \"escalated\" is raised by
       the passenger, so neither appears in the company's status dropdown. */
    var COMPANY_COMPLAINT_STATUSES = [
        ['open', 'Open'],
        ['in_progress', 'In progress'],
        ['resolved_pending', 'Mark as resolved for confirmation'],
        ['closed', 'Close complaint']
    ];

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

    function complaintStatusLabel(status) {
        for (var i = 0; i < COMPLAINT_STATUSES.length; i++) {
            if (COMPLAINT_STATUSES[i][0] === status) { return COMPLAINT_STATUSES[i][1]; }
        }
        return 'Open';
    }

    function complaintCategoryLabel(category) {
        return COMPLAINT_CATEGORY_LABELS[category] || 'Other';
    }

    function complaintCardHtml(c) {
        var initial = String(c.passenger_name || 'P').trim().charAt(0).toUpperCase() || 'P';
        var context = '';
        if (c.booking_reference || c.route || c.departure) {
            if (c.booking_reference) { context += '<span>Booking ' + escHtml(c.booking_reference) + '</span>'; }
            if (c.route) { context += '<span>' + escHtml(c.route) + '</span>'; }
            if (c.departure) { context += '<span>Departs ' + escHtml(c.departure) + '</span>'; }
        }
        var responseCount = (Array.isArray(c.responses) && c.responses.length) ? c.responses.length : (c.response ? 1 : 0);
        return '<article class="cd-complaint-card' + (c.status === 'open' ? ' is-new' : '') + '" data-complaint-id="' + c.id + '">' +
            '<div class="cd-complaint-card-head">' +
                '<span class="cd-complaint-avatar" aria-hidden="true">' + escHtml(initial) + '</span>' +
                '<div class="cd-complaint-person"><strong>' + escHtml(c.passenger_name || 'Passenger') + '</strong><span class="cd-complaint-meta">' + (formatReviewDate(c.created_at) || 'Recent complaint') + '</span></div>' +
                '<span class="cd-complaint-status-badge is-' + escHtml(c.status) + '">' + escHtml(complaintStatusLabel(c.status)) + '</span>' +
            '</div>' +
            '<h4 class="cd-complaint-subject">' + escHtml(c.subject) + '</h4>' +
            '<p class="cd-complaint-text">' + escHtml(c.message) + '</p>' +
            (context ? '<div class="cd-complaint-context">' + context + '</div>' : '') +
            '<div class="cd-complaint-actions">' +
                '<span class="cd-complaint-category">' + escHtml(complaintCategoryLabel(c.category)) + '</span>' +
                '<button type="button" class="btn btn-primary btn-sm cd-complaint-handle-btn" data-complaint-id="' + c.id + '">' +
                    (responseCount ? 'Handle complaint (' + responseCount + ')' : 'Handle complaint') +
                '</button>' +
            '</div>' +
        '</article>';
    }

    function renderComplaintFilterBar() {
        var bar = byId('complaint-filterbar');
        if (!bar) { return; }
        if (!currentComplaints.length && complaintFilter === null) { bar.hidden = true; bar.innerHTML = ''; return; }
        var options = [[null, 'All'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved_pending', 'Awaiting confirmation'], ['resolved', 'Resolved'], ['escalated', 'Escalated'], ['closed', 'Closed']];
        var html = '';
        var total = 0;
        for (var statusKey in complaintsCounts) { total += Number(complaintsCounts[statusKey]) || 0; }
        for (var i = 0; i < options.length; i++) {
            var val = options[i][0]; var label = options[i][1];
            var active = complaintFilter === val;
            var count = val === null ? total : (Number(complaintsCounts[val]) || 0);
            html += '<button type="button" class="cd-complaint-filter' + (active ? ' is-active' : '') + '" data-complaint-filter="' + (val === null ? '' : val) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + label + ' <span class="cd-complaint-filter-count">' + count + '</span></button>';
        }
        bar.innerHTML = html;
        bar.hidden = false;
    }

    function complaintStatusActive(c) {
        return complaintFilter === null || c.status === complaintFilter;
    }

    function renderComplaintCards() {
        var list = byId('complaint-list');
        var empty = byId('complaint-empty');
        var filtered = currentComplaints.filter(complaintStatusActive);
        if (filtered.length) {
            var html = filtered.map(complaintCardHtml).join('');
            if (list) { list.innerHTML = html; list.hidden = false; }
            if (empty) { empty.hidden = true; }
        } else {
            if (list) { list.innerHTML = ''; list.hidden = true; }
            if (empty) {
                empty.hidden = false;
                empty.textContent = complaintFilter === null
                    ? 'No complaints yet. Passenger feedback will appear here as soon as it is filed.'
                    : 'No complaints match the selected status.';
            }
        }
    }

    function renderComplaints(data) {
        var sec = byId('company-complaints'); if (sec) { sec.hidden = false; }
        var loading = byId('complaint-loading'); if (loading) { loading.hidden = true; }
        var error = byId('complaint-error'); if (error) { error.hidden = true; }

        complaintsCounts = data.counts || {};
        var total = 0;
        for (var statusKey in complaintsCounts) { total += Number(complaintsCounts[statusKey]) || 0; }

        var summary = byId('complaint-summary');
        if (summary) {
            summary.hidden = false;
            summary.innerHTML =
                '<div class="cd-complaint-summary-stat"><b>' + total + '</b><span>Total</span></div>' +
                '<div class="cd-complaint-summary-stat is-open"><b>' + (Number(complaintsCounts.open) || 0) + '</b><span>Open</span></div>' +
                '<div class="cd-complaint-summary-stat is-in_progress"><b>' + (Number(complaintsCounts.in_progress) || 0) + '</b><span>In progress</span></div>' +
                '<div class="cd-complaint-summary-stat is-resolved_pending"><b>' + (Number(complaintsCounts.resolved_pending) || 0) + '</b><span>Awaiting confirmation</span></div>' +
                '<div class="cd-complaint-summary-stat is-resolved"><b>' + (Number(complaintsCounts.resolved) || 0) + '</b><span>Resolved</span></div>' +
                '<div class="cd-complaint-summary-stat is-escalated"><b>' + (Number(complaintsCounts.escalated) || 0) + '</b><span>Escalated</span></div>' +
                '<div class="cd-complaint-summary-stat is-closed"><b>' + (Number(complaintsCounts.closed) || 0) + '</b><span>Closed</span></div>';
        }

        currentComplaints = data.complaints || [];
        renderComplaintFilterBar();
        renderComplaintCards();
    }

    function showComplaintsError(message) {
        var loading = byId('complaint-loading'); if (loading) { loading.hidden = true; }
        var list = byId('complaint-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('complaint-empty'); if (empty) { empty.hidden = true; }
        var error = byId('complaint-error');
        if (error) {
            error.hidden = false;
            error.textContent = message || 'Unable to load your complaints. Please try again later.';
        }
    }

    function loadComplaints() {
        var loading = byId('complaint-loading'); if (loading) { loading.hidden = false; }
        var error = byId('complaint-error'); if (error) { error.hidden = true; }
        var empty = byId('complaint-empty'); if (empty) { empty.hidden = true; }
        var list = byId('complaint-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        if (!currentCompanyId) { if (loading) { loading.hidden = true; } return; }

        var rid = ++complaintsRequestId;
        var url = 'api/company.php?action=complaints';
        if (complaintFilter) { url += '&status=' + encodeURIComponent(complaintFilter); }
        fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== complaintsRequestId) { return; }
                var loadEl = byId('complaint-loading'); if (loadEl) { loadEl.hidden = true; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showComplaintsError(data.message || 'Unable to load your complaints.');
                    return;
                }
                renderComplaints(data);
            })
            .catch(function () {
                if (rid !== complaintsRequestId) { return; }
                showComplaintsError('Network error while loading your complaints.');
            });
    }

    function currentComplaintById(id) {
        for (var i = 0; i < currentComplaints.length; i++) {
            if (currentComplaints[i].id === Number(id)) { return currentComplaints[i]; }
        }
        return null;
    }

    /* ===== Handle-complaint modal ===== */

    /* Statuses a company can choose; resolved/escalated are locked for the
       company and shown as a disabled placeholder so the current state is
       always visible in the dropdown. */
    function complaintModalStatusOptions(selected) {
        var html = '';
        var found = false;
        for (var i = 0; i < COMPANY_COMPLAINT_STATUSES.length; i++) {
            var val = COMPANY_COMPLAINT_STATUSES[i][0]; var label = COMPANY_COMPLAINT_STATUSES[i][1];
            if (val === selected) { found = true; }
            html += '<option value="' + val + '"' + (selected === val ? ' selected' : '') + '>' + label + '</option>';
        }
        if (!found && selected) {
            var lockedLabel = {
                resolved: 'Resolved (customer confirmed)',
                escalated: 'Escalated to support'
            }[selected] || String(selected).replace('_', ' ');
            html = '<option value="' + selected + '" selected disabled>' + lockedLabel + '</option>' + html;
        }
        return html;
    }

    /* Small colored pill showing the current status. */
    function complaintStatusPillHtml(status) {
        var safe = String(status || 'open').replace(/[^a-z_]/g, '');
        return '<span class="cd-chat-status-pill is-' + escHtml(safe) + '">' + escHtml(complaintStatusLabel(status)) + '</span>';
    }

    /* The status changer panel: current pill + a select to move the complaint
       forward and a dedicated "Update status" submit. Locked states (customer
       confirmed resolved / escalated to support) render a read-only pill with
       an explanatory note instead of the control. */
    function complaintStatusBarHtml(complaint) {
        var status = complaint.status;
        if (status === 'resolved' || status === 'escalated') {
            return '<div class="cd-chat-statusbar is-locked">' +
                '<div class="cd-chat-statusbar-top">' +
                    '<span class="cd-chat-statusbar-label">Status</span>' +
                    complaintStatusPillHtml(status) +
                '</div>' +
                complaintStatusLockedNote(complaint) +
            '</div>';
        }
        return '<div class="cd-chat-statusbar">' +
            '<div class="cd-chat-statusbar-top">' +
                '<span class="cd-chat-statusbar-label">Status</span>' +
                complaintStatusPillHtml(status) +
                '<span class="cd-chat-statusbar-hint" id="complaint-status-hint">Set where the complaint stands</span>' +
            '</div>' +
            '<div class="cd-chat-statusbar-row">' +
                '<select id="complaint-modal-status">' + complaintModalStatusOptions(status) + '</select>' +
                '<button type="button" id="complaint-status-apply" class="btn btn-sm cd-chat-status-apply" disabled>Update status</button>' +
            '</div>' +
            '<p id="complaint-status-msg" class="cd-chat-status-msg" hidden></p>' +
        '</div>';
    }

    /* When the passenger escalated or confirmed, the company sees a read-only
       note instead of a status control. */
    function complaintStatusLockedNote(complaint) {
        var status = complaint.status;
        if (status === 'escalated') {
            return '<p class="cd-chat-status-note is-escalated">Escalated to ET Transport support — the admin is reviewing this complaint.</p>';
        }
        if (status === 'resolved') {
            return '<p class="cd-chat-status-note is-resolved">Resolved — the customer confirmed this complaint is closed.</p>';
        }
        if (status === 'resolved_pending') {
            return '<p class="cd-chat-status-note is-pending">Awaiting confirmation — the customer needs to agree this complaint is resolved.</p>';
        }
        return '';
    }

    /* Chat time label like "Sep 9 · 10:05 AM". Falls back to the date-only
       formatter when the value cannot be parsed. */
    function chatTimeLabel(value) {
        if (!value) { return ''; }
        var iso = String(value).indexOf(' ') > 0 ? String(value).replace(' ', 'T') : String(value);
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return formatReviewDate(value); }
        try {
            return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        } catch (e) { return formatReviewDate(value); }
    }

    /* The passenger's original complaint opens the conversation (left side). */
    function complaintIntroBubbleHtml(c) {
        var when = chatTimeLabel(c.created_at) || 'Recent complaint';
        var chips = '';
        var parts = [];
        if (c.booking_reference) { parts.push('Booking ' + c.booking_reference); }
        if (c.route) { parts.push(c.route); }
        if (c.departure) { parts.push('Departs ' + c.departure); }
        for (var i = 0; i < parts.length; i++) { chips += '<span>' + escHtml(parts[i]) + '</span>'; }
        return '<div class="cd-chat-bubble is-passenger">' +
            '<p>' + escHtml(c.message) + '</p>' +
            (chips ? '<div class="cd-chat-context">' + chips + '</div>' : '') +
            '<span class="cd-chat-bubble-meta">' + escHtml(c.passenger_name || 'Passenger') + ' \u00b7 ' + escHtml(when) + '</span>' +
        '</div>';
    }

    /* Confirmed company replies (right-aligned green bubbles). */
    function complaintChatBubbleHtml(r) {
        return '<div class="cd-chat-bubble is-company">' +
            '<p>' + escHtml(r.message) + '</p>' +
            '<span class="cd-chat-bubble-meta">You' + (r.created_at ? ' \u00b7 ' + escHtml(chatTimeLabel(r.created_at)) : '') + '</span>' +
        '</div>';
    }

    /* Optimistic company bubble shown the instant Send is pressed. While the
       request is in flight it reads "Sending…"; if it fails it becomes a
       red bubble that can be tapped to retry. */
    function complaintLocalBubbleHtml(lm) {
        var cls = lm.state === 'sending' ? ' is-sending' : ' is-failed';
        var meta = lm.state === 'sending' ? 'Sending\u2026' : 'Didn\u2019t send \u00b7 tap to retry';
        return '<div class="cd-chat-bubble is-company' + cls + '" data-complaint-local-key="' + lm.key + '"' +
            (lm.state === 'failed' ? ' role="button" tabindex="0" title="Tap to retry" aria-label="Failed message, tap to retry"' : '') + '>' +
            '<p>' + escHtml(lm.message) + '</p>' +
            '<span class="cd-chat-bubble-meta">' + escHtml(meta) + '</span>' +
        '</div>';
    }

    /* Status teller chip — centered in the chat, not a message bubble. */
    function complaintStatusTellerHtml(r) {
        return '<div class="cd-chat-teller"><span class="cd-chat-teller-text">' + escHtml(r.message) + '</span>' +
            '<span class="cd-chat-teller-meta">' + (r.created_at ? escHtml(chatTimeLabel(r.created_at)) : '') + '</span></div>';
    }

    /* One ordered chat stream: the passenger's original complaint, every
       thread entry (status tellers render as centered chips; chat messages
       align by actor), then any locally-optimistic bubbles. */
    function buildComplaintThread() {
        var complaint = activeComplaintModalComplaint;
        var lines = [{
            side: 'passenger',
            avatar: String(complaint.passenger_name || 'P').trim().charAt(0).toUpperCase() || 'P',
            html: complaintIntroBubbleHtml(complaint)
        }];
        var responses = (Array.isArray(complaint.responses) && complaint.responses.length)
            ? complaint.responses
            : (complaint.response ? [{ id: -1, message: complaint.response, created_at: complaint.response_at, updated_at: complaint.response_at, kind: 'message', actor: 'company' }] : []);
        for (var i = 0; i < responses.length; i++) {
            var r = responses[i];
            if (r.kind === 'status') {
                lines.push({ side: 'teller', avatar: '', html: complaintStatusTellerHtml(r) });
            } else {
                var actorIsPassenger = r.actor === 'passenger';
                lines.push({
                    side: actorIsPassenger ? 'passenger' : 'company',
                    avatar: actorIsPassenger
                        ? String(complaint.passenger_name || 'P').trim().charAt(0).toUpperCase() || 'P'
                        : 'You',
                    html: actorIsPassenger
                        ? complaintPassengerReplyHtml(r, complaint)
                        : complaintChatBubbleHtml(r)
                });
            }
        }
        for (var j = 0; j < complaintLocalMessages.length; j++) {
            lines.push({ side: 'company', avatar: 'You', html: complaintLocalBubbleHtml(complaintLocalMessages[j]) });
        }
        return lines;
    }

    /* Passenger reply bubble (left side, same styling as the intro). */
    function complaintPassengerReplyHtml(r, complaint) {
        var when = r.created_at ? chatTimeLabel(r.created_at) : '';
        return '<div class="cd-chat-bubble is-passenger">' +
            '<p>' + escHtml(r.message) + '</p>' +
            '<span class="cd-chat-bubble-meta">' + escHtml(complaint.passenger_name || 'Passenger') + (when ? ' \u00b7 ' + escHtml(when) : '') + '</span>' +
        '</div>';
    }

    /* Render the thread with grouped bubbles; consecutive messages from one
       side stack tightly and reuse the avatar row. */
    function renderComplaintThread() {
        var lines = buildComplaintThread();
        var html = '';
        var prevSide = null;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].side === 'teller') {
                html += lines[i].html;
                prevSide = null;
                continue;
            }
            var cont = prevSide === lines[i].side;
            html += '<div class="cd-chat-row is-' + lines[i].side + (cont ? ' is-continuation' : '') + '">' +
                '<span class="cd-chat-avatar' + (lines[i].side === 'company' ? ' is-company' : '') + '" aria-hidden="true">' + escHtml(lines[i].avatar) + '</span>' +
                lines[i].html +
            '</div>';
            prevSide = lines[i].side;
        }
        return html;
    }

    function scrollComplaintThreadToBottom() {
        var thread = byId('complaint-chat-thread');
        if (thread) { thread.scrollTop = thread.scrollHeight; }
    }

    function renderComplaintModal() {
        var modal = byId('complaint-modal');
        if (!modal) { return; }
        var complaint = activeComplaintModalComplaint;
        if (!complaint) { closeComplaintModal(); return; }

        var body = byId('complaint-modal-body');
        if (!body) { return; }
        var initial = String(complaint.passenger_name || 'P').trim().charAt(0).toUpperCase() || 'P';
        body.innerHTML =
            '<div class="cd-complaint-modal-box" role="dialog" aria-modal="true" aria-labelledby="complaint-modal-title">' +
                '<div class="cd-chat-head">' +
                    '<div class="cd-chat-head-person">' +
                        '<span class="cd-complaint-avatar" aria-hidden="true">' + escHtml(initial) + '</span>' +
                        '<div class="cd-chat-head-info">' +
                            '<strong id="complaint-modal-title">' + escHtml(complaint.passenger_name || 'Passenger') + '</strong>' +
                            '<small>' + escHtml(complaint.subject || complaintCategoryLabel(complaint.category)) + '</small>' +
                        '</div>' +
                    '</div>' +
                    '<button type="button" id="complaint-modal-close" class="cd-complaint-modal-close" aria-label="Close complaint">\u00d7</button>' +
                '</div>' +
                complaintStatusBarHtml(complaint) +
                '<div id="complaint-chat-thread" class="cd-chat-thread" aria-live="polite">' + renderComplaintThread() + '</div>' +
                '<div class="cd-chat-composer">' +
                    '<div class="cd-chat-composer-row">' +
                        '<textarea id="complaint-modal-new-response-text" maxlength="1000" rows="1" placeholder="Type a message\u2026"></textarea>' +
                        '<button type="button" id="complaint-chat-send" class="cd-chat-send-btn" aria-label="Send message" disabled>' +
                            '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>' +
                        '</button>' +
                    '</div>' +
                    '<div class="cd-complaint-modal-error" role="alert" hidden></div>' +
                    '<p id="complaint-chat-sent" class="cd-chat-sent-note" role="status" hidden></p>' +
                '</div>' +
            '</div>';
        modal.hidden = false;
        scrollComplaintThreadToBottom();
        var composer = byId('complaint-modal-new-response-text');
        if (composer && composer.focus) {
            try { composer.focus(); } catch (e) { /* non-critical */ }
        }
        syncComplaintSendButton();
        syncComplaintStatusApply();
        autoResizeComplaintComposer();
    }

    function openComplaintModal(id) {
        var complaint = currentComplaintById(id);
        if (!complaint) { return; }
        activeComplaintModalId = Number(id);
        activeComplaintModalComplaint = complaint;
        complaintSending = false;
        complaintLocalMessages = [];
        complaintLocalMessageSeq = 0;
        renderComplaintModal();
    }

    function closeComplaintModal() {
        var modal = byId('complaint-modal');
        if (modal) { modal.hidden = true; }
        activeComplaintModalId = null;
        activeComplaintModalComplaint = null;
        complaintSending = false;
        complaintLocalMessages = [];
        complaintLocalMessageSeq = 0;
    }

    function showComplaintModalError(message) {
        var err = byId('complaint-modal-error') || document.querySelector('.cd-complaint-modal-error');
        if (!err) { return; }
        err.textContent = message;
        err.hidden = false;
    }

    /* Sent responses are append-only — there is deliberately no editing or
       deleting in the chat UI (and the API rejects response_id edits too). */

    /* Send from the chat composer — messages only. The message appears in the
       thread the instant Send is pressed (optimistic), then the server
       confirms it and the bubble becomes permanent. Status changes are a
       separate action via the status changer (see applyComplaintStatus). */
    function submitComplaintUpdate(id) {
        var complaint = activeComplaintModalComplaint;

        if (!complaint || complaintSending) { return; }

        var newRespEl = byId('complaint-modal-new-response-text');
        var text = newRespEl ? newRespEl.value.trim() : '';

        if (!text) {
            showComplaintModalError('Type a message to the passenger first.');
            return;
        }

        var localKey = ++complaintLocalMessageSeq;
        complaintLocalMessages.push({ key: localKey, message: text, state: 'sending' });
        if (newRespEl) { newRespEl.value = ''; }
        renderComplaintModal();
        scrollComplaintThreadToBottom();
        performComplaintSend(id, text, localKey);
    }

    /* ---- Status changer ---- */

    /* Enable/disable the "Update status" submit whenever the selection
       differs from the complaint's actual status, and surface a hint. */
    function syncComplaintStatusApply() {
        var complaint = activeComplaintModalComplaint;
        var statusEl = byId('complaint-modal-status');
        var btn = byId('complaint-status-apply');
        if (!complaint || !statusEl || !btn) { return; }
        var changed = statusEl.value !== complaint.status;
        btn.disabled = complaintSending || !changed;
        statusEl.classList.toggle('is-changed', changed);
        var hint = byId('complaint-status-hint');
        if (hint) {
            hint.textContent = changed ? 'Pressing Update will notify the passenger.' : 'Set where the complaint stands';
        }
    }

    function showComplaintStatusMsg(message, type) {
        var el = byId('complaint-status-msg');
        if (!el) { return; }
        el.textContent = message;
        el.className = 'cd-chat-status-msg' + (type === 'ok' ? ' is-ok' : ' is-err');
        el.hidden = false;
    }

    /* Submit ONLY a status change (no message). The server records a status
       teller in the thread so both sides see the transition. */
    function applyComplaintStatus() {
        var complaint = activeComplaintModalComplaint;
        if (!complaint || complaintSending) { return; }

        var statusEl = byId('complaint-modal-status');
        var selected = statusEl ? statusEl.value : complaint.status;
        if (!selected || selected === complaint.status) {
            showComplaintStatusMsg('Choose a different status to update it.', 'err');
            return;
        }

        var btn = byId('complaint-status-apply');
        complaintSending = true;
        if (btn) { btn.disabled = true; btn.textContent = 'Updating\u2026'; }

        var payload = 'complaint_id=' + encodeURIComponent(complaint.id) + '&status=' + encodeURIComponent(selected);

        fetch('api/company.php?action=complaint_update', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
            body: payload
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                complaintSending = false;
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    if (btn) { btn.disabled = false; btn.textContent = 'Update status'; }
                    showComplaintStatusMsg(data.message || 'Unable to update the status.', 'err');
                    syncComplaintStatusApply();
                    return;
                }
                if (data.complaint) {
                    activeComplaintModalComplaint = reconcileComplaintPayload(data.complaint);
                    upsertComplaintLocally(data.complaint);
                }
                renderComplaintModal();
                scrollComplaintThreadToBottom();
                showComplaintStatusMsg('Status updated to ' + complaintStatusLabel(selected) + ' \u2014 the passenger has been notified.', 'ok');
                setTimeout(function () {
                    var msg = byId('complaint-status-msg');
                    if (msg) { msg.hidden = true; }
                }, 4000);
                loadComplaints();
            })
            .catch(function () {
                complaintSending = false;
                if (btn) { btn.disabled = false; btn.textContent = 'Update status'; }
                showComplaintStatusMsg('Network error while updating the status.', 'err');
                syncComplaintStatusApply();
            });
    }

    /* Merge a fresh server payload into the currently-open complaint so the
       thread never loses messages. Instead of wholesale replacing the
       responses array (which could collapse the thread if a payload ever came
       back incomplete), we union by row id — keeping every response we
       already know and appending any new ones — in arrival order. Rows
       without an id (local optimistic bubbles) dedupe by message text. */
    function reconcileComplaintPayload(serverComplaint) {
        var base = activeComplaintModalComplaint || {};
        var next = {
            id: (serverComplaint && serverComplaint.id) || base.id,
            passenger_id: (serverComplaint && serverComplaint.passenger_id) || base.passenger_id,
            passenger_name: (serverComplaint && serverComplaint.passenger_name) || base.passenger_name,
            booking_id: (serverComplaint && serverComplaint.booking_id) || base.booking_id,
            booking_reference: (serverComplaint && serverComplaint.booking_reference) || base.booking_reference,
            category: (serverComplaint && serverComplaint.category) || base.category,
            subject: (serverComplaint && serverComplaint.subject) || base.subject,
            message: (serverComplaint && serverComplaint.message) || base.message,
            status: (serverComplaint && serverComplaint.status) || base.status,
            response: (serverComplaint && serverComplaint.response) || base.response,
            response_at: (serverComplaint && serverComplaint.response_at) || base.response_at,
            route: (serverComplaint && serverComplaint.route) || base.route,
            departure: (serverComplaint && serverComplaint.departure) || base.departure,
            created_at: (serverComplaint && serverComplaint.created_at) || base.created_at,
            updated_at: (serverComplaint && serverComplaint.updated_at) || base.updated_at,
            responses: []
        };
        var seenIds = {};
        var seenTexts = {};
        function pushResponse(r) {
            if (!r) { return; }
            var idKey = r.id != null ? 'id:' + r.id : null;
            if (idKey && seenIds[idKey]) { return; }
            if (idKey) { seenIds[idKey] = 1; }
            var textKey = String(r.message || '').trim();
            if (textKey && !idKey && seenTexts[textKey]) { return; }
            if (textKey && !idKey) { seenTexts[textKey] = 1; }
            next.responses.push(r);
        }
        var oldList = (Array.isArray(base.responses)) ? base.responses : [];
        for (var i = 0; i < oldList.length; i++) { pushResponse(oldList[i]); }
        var freshList = (serverComplaint && Array.isArray(serverComplaint.responses)) ? serverComplaint.responses : [];
        for (var j = 0; j < freshList.length; j++) { pushResponse(freshList[j]); }
        return next;
    }

    /* True when the open thread already contains a response with this text. */
    function complaintThreadHasText(text) {
        var list = (activeComplaintModalComplaint && Array.isArray(activeComplaintModalComplaint.responses))
            ? activeComplaintModalComplaint.responses : [];
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].message) === String(text)) { return true; }
        }
        return false;
    }

    /* The actual POST for a chat message only (status unchanged); shared by the
       composer and by retrying a failed bubble. */
    function performComplaintSend(id, text, localKey) {
        var payload = 'complaint_id=' + encodeURIComponent(id);
        if (text) { payload += '&response=' + encodeURIComponent(text); }

        complaintSending = true;
        syncComplaintSendButton();
        var err = byId('complaint-modal-error'); if (err) { err.hidden = true; }

        fetch('api/company.php?action=complaint_update', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
            body: payload
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                complaintSending = false;
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    if (localKey) { markComplaintLocalFailed(localKey); renderComplaintModal(); }
                    else { showComplaintModalError(data.message || 'Unable to send your message.'); }
                    syncComplaintSendButton();
                    return;
                }
                /* Merge the server payload into the open thread instead of
                   replacing it, so earlier messages are never lost. */
                if (data.complaint) {
                    activeComplaintModalComplaint = reconcileComplaintPayload(data.complaint);
                    upsertComplaintLocally(data.complaint);
                }
                /* If the server did not echo back the message we just sent
                   (e.g. an incomplete payload), keep it as a confirmed bubble
                   so it never silently disappears from the chat. */
                if (localKey) {
                    var sentText = '';
                    for (var k = 0; k < complaintLocalMessages.length; k++) {
                        if (complaintLocalMessages[k].key === Number(localKey)) {
                            sentText = complaintLocalMessages[k].message;
                            break;
                        }
                    }
                    removeComplaintLocalMessage(localKey);
                    if (sentText && !complaintThreadHasText(sentText)) {
                        activeComplaintModalComplaint.responses.push({
                            id: -1,
                            message: sentText,
                            created_at: new Date().toISOString()
                        });
                    }
                }
                renderComplaintModal();
                scrollComplaintThreadToBottom();
                showComplaintSentNote();
                loadComplaints();
            })
            .catch(function () {
                complaintSending = false;
                if (localKey) { markComplaintLocalFailed(localKey); renderComplaintModal(); }
                else showComplaintModalError('Network error while sending your message.');
                syncComplaintSendButton();
            });
    }

    /* ---- Optimistic-message helpers ---- */

    function complaintLocalMessageIndex(key) {
        for (var i = 0; i < complaintLocalMessages.length; i++) {
            if (complaintLocalMessages[i].key === Number(key)) { return i; }
        }
        return -1;
    }

    function removeComplaintLocalMessage(key) {
        var i = complaintLocalMessageIndex(key);
        if (i >= 0) { complaintLocalMessages.splice(i, 1); }
    }

    function markComplaintLocalFailed(key) {
        var i = complaintLocalMessageIndex(key);
        if (i >= 0) { complaintLocalMessages[i].state = 'failed'; }
    }

    /* Tap a failed bubble (or press Enter) to re-send that exact message. */
    function retryComplaintLocalMessage(key) {
        var i = complaintLocalMessageIndex(key);
        if (i < 0 || complaintSending) { return; }

        var msg = complaintLocalMessages[i].message;

        complaintLocalMessages[i].state = 'sending';
        renderComplaintModal();
        scrollComplaintThreadToBottom();
        performComplaintSend(activeComplaintModalId, msg, key);
    }

    function syncComplaintSendButton() {
        var input = byId('complaint-modal-new-response-text');
        var btn = byId('complaint-chat-send');
        if (!input || !btn) { return; }
        btn.disabled = complaintSending || !input.value.trim();
    }

    function autoResizeComplaintComposer() {
        var input = byId('complaint-modal-new-response-text');
        if (!input) { return; }
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 128) + 'px';
    }

    /* Replace the live copy of a complaint with the server's fresh payload so
       the list behind the modal shows the latest status and response count. */
    function upsertComplaintLocally(updated) {
        for (var i = 0; i < currentComplaints.length; i++) {
            if (currentComplaints[i].id === Number(updated.id)) { currentComplaints[i] = updated; return; }
        }
        currentComplaints.unshift(updated);
    }

    function showComplaintSentNote() {
        var note = byId('complaint-chat-sent');
        if (!note) { return; }
        note.textContent = 'Message sent \u2014 the passenger can see it on their dashboard.';
        note.hidden = false;
        clearTimeout(complaintSentNoteTimer);
        complaintSentNoteTimer = setTimeout(function () { note.hidden = true; }, 3000);
    }

    function renderProfile(company) {
        var sec = byId('company-profile'); if (sec) { sec.hidden = false; }
        var loading = byId('profile-loading'); if (loading) { loading.hidden = true; }
        var err = byId('profile-error'); if (err) { err.hidden = true; }

        var view = byId('profile-view'); if (view) { view.hidden = false; }
        var form = byId('profile-form'); if (form) { form.hidden = true; }
        var editBtn = byId('btn-edit-profile'); if (editBtn) { editBtn.hidden = false; }

        byId('profile-name').textContent = profileValue(company.name);
        byId('profile-slug').textContent = company.slug ? '#' + company.slug : '\u2014';
        byId('profile-email').textContent = profileValue(company.email);
        var phonesShown = (company.phones && company.phones.length)
            ? company.phones
            : (company.phone ? [company.phone] : []);
        byId('profile-phone').textContent = profileValue(phonesShown.join(' \u00b7 '));
        byId('profile-founded').textContent = profileValue(company.founded);
        byId('profile-address').textContent = profileValue(company.address);
        byId('profile-head-office').textContent = profileValue(company.head_office);
        byId('profile-website').textContent = profileValue(company.website);
        byId('profile-desc').textContent = company.description ? company.description : '';
        currentProfileAmenities = (Array.isArray(company.amenities) && company.amenities.length)
            ? company.amenities.slice()
            : [];
        renderAmenityPicker();
        var statusBadge = byId('profile-status');
        if (statusBadge) {
            statusBadge.textContent = String(company.status ? company.status : '\u2014');
            statusBadge.className = 'cd-profile-status' + (typeof company.status === 'string' && company.status ? ' is-' + company.status : '');
        }
        setProfileImagePreview('profile-cover-view', company.cover_image, 'PREVIEW');
        setProfileImagePreview('profile-logo-view', company.logo, 'LOGO');
        var passengerPreview = byId('cd-passenger-preview');
        if (passengerPreview) {
            passengerPreview.href = company.slug ? 'company.html?company=' + encodeURIComponent(company.slug) : 'company.html';
        }

        var nameInput = byId('profile-input-name');
        if (nameInput) { nameInput.value = company.name || ''; }
        var emailInput = byId('profile-input-email');
        if (emailInput) { emailInput.value = company.email || ''; }
        populateProfilePhoneList(company);
        var foundedInput = byId('profile-input-founded');
        if (foundedInput) { foundedInput.value = company.founded || ''; }
        var addressInput = byId('profile-input-address');
        if (addressInput) { addressInput.value = company.address || ''; }
        var websiteInput = byId('profile-input-website');
        if (websiteInput) { websiteInput.value = company.website || ''; }
        var headOfficeInput = byId('profile-input-head-office');
        if (headOfficeInput) { headOfficeInput.value = company.head_office || ''; }
        var logoInput = byId('profile-input-logo');
        if (logoInput) { logoInput.value = ''; }
        var coverInput = byId('profile-input-cover');
        if (coverInput) { coverInput.value = ''; }
        var removeLogo = byId('profile-remove-logo'); if (removeLogo) { removeLogo.checked = false; }
        var removeCover = byId('profile-remove-cover'); if (removeCover) { removeCover.checked = false; }
        setProfileImagePreview('profile-logo-preview', company.logo, 'LOGO');
        setProfileImagePreview('profile-cover-preview', company.cover_image, 'COVER');
        var descInput = byId('profile-input-description');
        if (descInput) { descInput.value = company.description || ''; }
    }

    function loadProfile() {
        var sec = byId('company-profile'); if (sec) { sec.hidden = false; }
        var loading = byId('profile-loading'); if (loading) { loading.hidden = false; }
        var err = byId('profile-error'); if (err) { err.hidden = true; }

        fetch('api/company.php?action=profile', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    setProfileError(data.message || 'Unable to load your profile.');
                    return;
                }
                renderProfile(data.company);
            })
            .catch(function () {
                setProfileError('Network error while loading your profile.');
            });
    }

    function openProfileForm() {
        clearProfileMessages();
        var view = byId('profile-view'); if (view) { view.hidden = true; }
        var form = byId('profile-form'); if (form) { form.hidden = false; }
        var editBtn = byId('btn-edit-profile'); if (editBtn) { editBtn.hidden = true; }
        var bs = byId('profile-branches'); if (bs) { bs.hidden = true; }
    }

    function closeProfileForm() {
        clearProfileMessages();
        var form = byId('profile-form'); if (form) { form.hidden = true; }
        var view = byId('profile-view'); if (view) { view.hidden = false; }
        var editBtn = byId('btn-edit-profile'); if (editBtn) { editBtn.hidden = false; }
        var bs = byId('profile-branches'); if (bs) { bs.hidden = false; }
    }

    function submitProfileForm() {
        var form = byId('profile-form');
        if (form && !form.checkValidity()) {
            setProfileFormError('Please fill in the required fields.');
            return;
        }

        clearProfileMessages();
        var saveBtn = byId('btn-profile-save');
        var original = saveBtn ? saveBtn.textContent : '';
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }

        var phones = collectProfilePhoneInputs();

        var payload = new FormData(form);
        /* The inline phone inputs carry only the local national digits; replace
           them with the normalized full +251 values below (delete() clears every
           raw row in one call). */
        payload.delete('phone');
        if (payload.getAll) { payload.delete('phones[]'); }
        for (var pi = 0; pi < phones.length; pi++) {
            payload.append('phones[]', phones[pi]);
        }

        /* Onboard amenities — the picker's current selection. */
        payload.delete('amenities[]');
        for (var ai = 0; ai < currentProfileAmenities.length; ai++) {
            payload.append('amenities[]', currentProfileAmenities[ai]);
        }

        fetch('api/company.php?action=profile_update', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
            body: payload
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = original; }
                if (!result.ok || result.status !== 200 || !data.success) {
                    setProfileFormError(data.message || 'Unable to save your profile.');
                    return;
                }
                renderProfile(data.company);
                var success = byId('profile-success');
                if (success) {
                    success.hidden = false;
                    success.textContent = 'Your company profile was saved successfully.';
                }
            })
            .catch(function () {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = original; }
                setProfileFormError('Network error while saving your profile.');
            });
    }

    /* ===== Company branches (additive) ===== */
    function cdEsc(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    var currentBranches = [];

    function setBranchError(message) {
        var loading = byId('branch-loading'); if (loading) { loading.hidden = true; }
        var err = byId('branch-error');
        if (err) {
            err.hidden = false;
            err.className = 'cd-profile-error auth-message error';
            err.textContent = message || 'Unable to load your branches.';
        }
    }

    function setBranchFormError(message) {
        var err = byId('branch-form-error');
        if (err) {
            err.hidden = false;
            err.textContent = message || 'Unable to save the branch.';
        }
    }

    function clearBranchMessages() {
        var err = byId('branch-error'); if (err) { err.hidden = true; }
        var ferr = byId('branch-form-error'); if (ferr) { ferr.hidden = true; }
    }

    function renderBranches(list) {
        currentBranches = Array.isArray(list) ? list : [];
        var listEl = byId('branch-list');
        var emptyEl = byId('branch-empty');
        if (emptyEl) {
            emptyEl.hidden = currentBranches.length > 0;
            emptyEl.textContent = 'No branches yet. Add your first branch so passengers can find you.';
        }
        if (listEl) {
            listEl.hidden = currentBranches.length === 0;
            var html = '';
            for (var i = 0; i < currentBranches.length; i++) {
                var b = currentBranches[i];
                html += '<div class="cd-profile-branch-card">' +
                    '<h4>' + cdEsc(b.name || 'Branch') + '</h4>' +
                    (b.is_head ? '<span class="cd-branch-head-tag">Head office</span>' : '') +
                    (b.city ? '<p class="cd-branch-line"><b>City</b> ' + cdEsc(b.city) + '</p>' : '') +
                    (b.address ? '<p class="cd-branch-line"><b>Address</b> ' + cdEsc(b.address) + '</p>' : '') +
                    (b.hours ? '<p class="cd-branch-line"><b>Hours</b> ' + cdEsc(b.hours) + '</p>' : '') +
                    (b.phone ? '<p class="cd-branch-line"><b>Phone</b> <a href="tel:' + String(b.phone).replace(/\s+/g, '') + '">' + cdEsc(b.phone) + '</a></p>' : '') +
                    (b.email ? '<p class="cd-branch-line"><b>Email</b> <a href="mailto:' + cdEsc(b.email) + '">' + cdEsc(b.email) + '</a></p>' : '') +
                    (b.status === 'inactive' ? '<p class="cd-branch-line"><b>Status</b> <span class="cd-branch-status-off">Hidden from public profile</span></p>' : '') +
                    '<div class="cd-branch-actions">' +
                        '<button type="button" class="btn btn-secondary btn-sm" data-branch-edit="' + b.id + '">Edit</button>' +
                        '<button type="button" class="btn btn-danger btn-sm" data-branch-delete="' + b.id + '">Delete</button>' +
                    '</div>' +
                '</div>';
            }
            listEl.innerHTML = html;
        }
    }
function loadBranches() {
        var sec = byId('profile-branches'); if (sec) { sec.hidden = false; }
        var loading = byId('branch-loading'); if (loading) { loading.hidden = false; }
        var err = byId('branch-error'); if (err) { err.hidden = true; }
        fetch('api/company.php?action=branches', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (loading) { loading.hidden = true; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    setBranchError(data.message || 'Unable to load your branches.');
                    return;
                }
                renderBranches(data.branches || []);
            })
            .catch(function () {
                if (loading) { loading.hidden = true; }
                setBranchError('Network error while loading your branches.');
            });
    }

    function openBranchForm(branch) {
        clearBranchMessages();
        var idInput = byId('branch-id'); if (idInput) { idInput.value = branch ? branch.id : ''; }
        var nameInput = byId('branch-input-name'); if (nameInput) { nameInput.value = branch ? branch.name : ''; }
        var cityInput = byId('branch-input-city'); if (cityInput) { cityInput.value = branch ? branch.city : ''; }
        var addrInput = byId('branch-input-address'); if (addrInput) { addrInput.value = branch ? branch.address : ''; }
        var hourInput = byId('branch-input-hours'); if (hourInput) { hourInput.value = branch ? branch.hours : ''; }
        var phoneInput = byId('branch-input-phone'); if (phoneInput) { phoneInput.value = branch ? localPhoneValue(branch.phone) : ''; }
        var emailInput = byId('branch-input-email'); if (emailInput) { emailInput.value = branch ? branch.email : ''; }
        var headChk = byId('branch-input-head'); if (headChk) { headChk.checked = !!(branch && branch.is_head); }
        var statusChk = byId('branch-input-status'); if (statusChk) { statusChk.checked = !(branch && branch.status === 'inactive'); }
        var title = byId('branch-form-title'); if (title) { title.textContent = branch ? 'Edit Branch' : 'Add Branch'; }
        var heading = byId('branch-modal-heading'); if (heading) { heading.textContent = branch ? 'Edit branch' : 'Add a branch'; }
        var modal = byId('branch-form-modal'); if (modal) { modal.hidden = false; }
        if (nameInput) { nameInput.focus(); }
    }

    function closeBranchForm() {
        clearBranchMessages();
        var modal = byId('branch-form-modal'); if (modal) { modal.hidden = true; }
        renderBranches(currentBranches);
    }
function submitBranchForm() {
        var form = byId('branch-form');
        if (form && !form.checkValidity()) {
            setBranchFormError('Please fill in the required fields.');
            return;
        }
        clearBranchMessages();
        var saveBtn = byId('btn-branch-save');
        if (saveBtn) { saveBtn.disabled = true; }
        var branchIdInput = byId('branch-id');
        var branchId = branchIdInput ? String(branchIdInput.value || '') : '';
        var phoneInput = byId('branch-input-phone');
        if (phoneInput) { phoneInput.value = fullPhoneValue(phoneInput.value); }
        var payload = new FormData(form);
        var statusChk = byId('branch-input-status');
        if (statusChk && !statusChk.checked) { payload.set('status', 'inactive'); }
        var action = branchId ? 'branch_update' : 'branch_create';
        fetch('api/company.php?action=' + action, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
            body: payload
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (saveBtn) { saveBtn.disabled = false; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    setBranchFormError(data.message || 'Unable to save the branch.');
                    return;
                }
                closeBranchForm();
                toast(data.message || 'Branch saved successfully.');
                loadBranches();
            })
            .catch(function () {
                if (saveBtn) { saveBtn.disabled = false; }
                setBranchFormError('Network error while saving the branch.');
            });
    }

    var pendingBranchDeleteId = null;

    function openBranchDeleteModal(id) {
        var modal = byId('branch-delete-modal');
        var branch = null;
        for (var i = 0; i < currentBranches.length; i++) {
            if (String(currentBranches[i].id) === String(id)) { branch = currentBranches[i]; break; }
        }
        if (!modal || !branch) { return; }

        pendingBranchDeleteId = String(id);

        var nameEl = byId('branch-delete-name');
        if (nameEl) { nameEl.textContent = branch.name || 'Branch'; }
        var cityEl = byId('branch-delete-city');
        if (cityEl) { cityEl.textContent = branch.city || '\u2014'; }

        var msg = byId('branch-delete-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        var confirmBtn = byId('branch-delete-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Branch'; }

        modal.hidden = false;
    }

    function closeBranchDeleteModal() {
        pendingBranchDeleteId = null;
        var modal = byId('branch-delete-modal');
        if (modal) { modal.hidden = true; }
        var msg = byId('branch-delete-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        var confirmBtn = byId('branch-delete-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Branch'; }
    }

    function confirmBranchDelete() {
        if (!pendingBranchDeleteId) { return; }
        deleteBranch(pendingBranchDeleteId);
    }

    function deleteBranch(id) {
        var modal = byId('branch-delete-modal');
        var msg = byId('branch-delete-msg');
        var confirmBtn = byId('branch-delete-confirm-btn');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting\u2026'; }
        var payload = new FormData();
        payload.append('branch_id', String(id));
        fetch('api/company.php?action=branch_delete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
            body: payload
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    if (modal && !modal.hidden && msg) {
                        msg.textContent = data.message || 'Unable to delete the branch.';
                        msg.hidden = false;
                        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Branch'; }
                        return;
                    }
                    toast(data.message || 'Unable to delete the branch.');
                    return;
                }
                if (modal && !modal.hidden) { modal.hidden = true; }
                pendingBranchDeleteId = null;
                toast(data.message || 'Branch deleted.');
                loadBranches();
            })
            .catch(function () {
                if (modal && !modal.hidden && msg) {
                    msg.textContent = 'Network error while deleting the branch.';
                    msg.hidden = false;
                    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete Branch'; }
                    return;
                }
                toast('Network error while deleting the branch.');
            });
    }

    function refreshRevenue() {
        loadRevenueTripOptions();
        loadPayments();
    }

    /* ===== Parcel / freight management (real backend) =====
       Company-scoped CRUD against api/company.php?action=parcels plus
       parcel_create / parcel_update / parcel_delete. Every write carries
       the company scope server-side (auth.php + require_company_scope), so
       another company's parcels can never be touched. */
    var parcelRequestId = 0;   // discards responses from superseded parcel requests
    var currentParcels = [];
    var selectedParcelFilter = 'all';
    var selectedParcelDate = '';
    var parcelSearchTerm = '';

    var PARCEL_STATUSES = [
        { value: 'received', label: 'Received' },
        { value: 'sent', label: 'Sent' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'picked_up', label: 'Received by recipient' },
        { value: 'returned_to_sender', label: 'Returned to sender' },
        { value: 'lost', label: 'Lost' }
    ];
    var PARCEL_TERMINAL_STATUSES = ['picked_up', 'returned_to_sender', 'lost'];
    var PARCEL_STATUS_TRANSITIONS = {
        received: ['sent', 'lost'],
        sent: ['delivered', 'returned_to_sender', 'lost'],
        delivered: ['picked_up', 'returned_to_sender', 'lost']
    };

    var PARCEL_DELETE_REASON_SUGGESTIONS = [
        'Registered by mistake / wrong details',
        'Duplicate parcel entry',
        'Parcel no longer being shipped',
        'Customer cancelled the shipment',
        'Test entry'
    ];

    /* Mirrors the backend pricing (api/company.php PARCEL_TYPES). Price is
   weight in kg × per-type rate, plus 25% of the chosen trip's fare,
   floored at ETB 100, but never more than 75% of the trip fare. Anything
   under 0.5 kg still bills as 0.5 kg. */
    var PARCEL_MIN_CHARGE_KG = 0.5;
    var PARCEL_MIN_PRICE = 100;
    var PARCEL_TRIP_FARE_PERCENT = 0.25;
    /* A parcel can never cost more than 75% of the trip fare. */
    var PARCEL_MAX_TRIP_FARE_RATIO = 0.75;
    var PARCEL_TYPES_CONFIG = {
        document:   { label: 'Document',   rate: 30 },
        standard:   { label: 'Standard',   rate: 35 },
        electronic: { label: 'Electronics', rate: 40 },
        fragile:    { label: 'Fragile',    rate: 50 },
        perishable: { label: 'Perishable', rate: 45 }
    };

    function parcelTypeLabel(value) {
        var t = PARCEL_TYPES_CONFIG[value];
        return t ? t.label : 'Standard';
    }

    /* Find the currently selected trip (if any) in the fetched route trips. */
    function selectedParcelTrip() {
        var sel = byId('parcel-trip');
        var id = sel ? String(sel.value || '') : '';
        if (!id) { return null; }
        for (var i = 0; i < parcelRouteTripsCache.length; i++) {
            if (String(parcelRouteTripsCache[i].id) === id) { return parcelRouteTripsCache[i]; }
        }
        return null;
    }

    function parcelPrice(weightKg, type, tripFare) {
        var rate = (PARCEL_TYPES_CONFIG[type] || PARCEL_TYPES_CONFIG.standard).rate;
        var weightCost = Math.max(Number(weightKg), PARCEL_MIN_CHARGE_KG) * rate;
        var tripFareNum = Number(tripFare);
        var tripCost = (tripFareNum > 0) ? tripFareNum * PARCEL_TRIP_FARE_PERCENT : 0;
        var computed = weightCost + tripCost;
        if (tripFareNum > 0) {
            /* Hard cap: never more than 75% of the trip fare. */
            return Math.min(computed, tripFareNum * PARCEL_MAX_TRIP_FARE_RATIO);
        }
        return Math.max(PARCEL_MIN_PRICE, computed);
    }

    function updateParcelPricePreview() {
        var preview = byId('parcel-price-preview');
        var breakdown = byId('parcel-price-breakdown');
        var weightEl = byId('parcel-weight');
        var typeEl = byId('parcel-type');
        if (!preview || !weightEl || !typeEl) { return; }
        var weight = Number(String(weightEl.value || '').trim());
        var type = typeEl.value || 'standard';
        var trip = selectedParcelTrip();
        var tripFare = trip ? Number(trip.price) : 0;
        if (!(weight > 0)) {
            preview.textContent = 'ETB 0.00';
            if (breakdown) { breakdown.textContent = ''; }
            return;
        }
        var billed = Math.max(weight, PARCEL_MIN_CHARGE_KG);
        var rate = (PARCEL_TYPES_CONFIG[type] || PARCEL_TYPES_CONFIG.standard).rate;
        var weightCost = billed * rate;
        var tripCost = (tripFare > 0) ? tripFare * PARCEL_TRIP_FARE_PERCENT : 0;
        var computed = weightCost + tripCost;
        var cap = (tripFare > 0) ? tripFare * PARCEL_MAX_TRIP_FARE_RATIO : 0;
        var price = parcelPrice(weight, type, tripFare);
        preview.textContent = 'ETB ' + formatMoney(price);
        if (breakdown) {
            var parts = [billed + ' kg × ETB ' + rate + ' = ETB ' + formatMoney(weightCost)];
            if (tripFare > 0) {
                parts.push('trip 25% = ETB ' + formatMoney(tripCost) + ' · max 75% fare = ETB ' + formatMoney(cap));
            }
            if (tripFare > 0 && price < computed) {
                parts.push('capped at 75% of trip fare');
            } else if (price === PARCEL_MIN_PRICE && price > computed) {
                parts.push('min ETB ' + PARCEL_MIN_PRICE);
            }
            breakdown.textContent = parts.join(' · ') + ' → ETB ' + formatMoney(price);
        }
    }

    function parcelStatusLabel(value) {
        for (var s = 0; s < PARCEL_STATUSES.length; s++) {
            if (PARCEL_STATUSES[s].value === value) { return PARCEL_STATUSES[s].label; }
        }
        return 'Received';
    }

    function closeParcelStatusMenus(exceptId) {
        var menus = document.querySelectorAll('.cd-parcel-status-menu');
        var toggles = document.querySelectorAll('.cd-parcel-status-chip[data-parcel-status-toggle]');
        for (var i = 0; i < menus.length; i++) {
            var mid = menus[i].getAttribute('data-parcel-status-menu');
            if (exceptId && mid === exceptId) { continue; }
            menus[i].hidden = true;
            for (var j = 0; j < toggles.length; j++) {
                if (toggles[j].getAttribute('data-parcel-status-toggle') === mid) {
                    toggles[j].setAttribute('aria-expanded', 'false');
                }
            }
        }
    }

    function formatParcelDate(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return String(iso == null ? '' : iso); }
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function parcelById(id) {
        for (var i = 0; i < currentParcels.length; i++) {
            if (String(currentParcels[i].id) === String(id)) { return currentParcels[i]; }
        }
        return null;
    }

    function renderParcels() {
        var list = byId('parcel-list');
        var empty = byId('parcel-empty');
        var error = byId('parcel-error');
        if (error) { error.hidden = true; }
        if (!list) { return; }

        var filtered = currentParcels.filter(function (p) {
            if (selectedParcelFilter !== 'all' && p.status !== selectedParcelFilter) { return false; }
            if (selectedParcelDate && parcelDateKey(p.created_at) !== selectedParcelDate) { return false; }
            if (parcelSearchTerm) {
                var hay = [p.reference, p.sender_name, p.recipient_name, p.from_city, p.to_city].join(' ').toLowerCase();
                if (hay.indexOf(parcelSearchTerm) === -1) { return false; }
            }
            return true;
        });

        if (!filtered.length) {
            list.innerHTML = '';
            list.hidden = true;
            if (empty) {
                empty.textContent = currentParcels.length
                    ? (selectedParcelDate ? 'No parcels were registered on the selected date.' : 'No parcels match your filters.')
                    : 'No parcels yet. Register the first parcel to ship with your buses.';
                empty.hidden = false;
            }
            return;
        }
        if (empty) { empty.hidden = true; }

        var html = filtered.map(function (p) {
            var statusClass = PARCEL_STATUSES.some(function (s) { return s.value === p.status; }) ? p.status : 'received';
            var statusLabel = escHtml(parcelStatusLabel(p.status));
            var statusDot = '<span class="dot" aria-hidden="true"></span>';
            var allowedTransitions = PARCEL_STATUS_TRANSITIONS[p.status] || [];
            var menuItems = PARCEL_STATUSES.filter(function (s) { return allowedTransitions.indexOf(s.value) !== -1; }).map(function (s) {
                return '<button type="button" class="st-' + s.value + (s.value === p.status ? ' is-current' : '') + '" data-parcel-status-set="' + escHtml(p.id) + '" data-parcel-status-value="' + s.value + '">' +
                    '<span class="dot" aria-hidden="true"></span>' + escHtml(s.label) +
                    '<span class="check' + (s.value === p.status ? '' : ' is-empty') + '" aria-hidden="true">&#10003;</span>' +
                '</button>';
            }).join('');
            return '<article class="cd-parcel-card is-' + statusClass + '" data-parcel-id="' + escHtml(p.id) + '">' +
                '<div class="cd-parcel-top">' +
                    '<span class="cd-parcel-ref">' + escHtml(p.reference) + '</span>' +
                    '<span class="cd-parcel-status-wrap">' +
                        (PARCEL_TERMINAL_STATUSES.indexOf(p.status) !== -1
                            ? '<span class="cd-parcel-status-chip st-' + statusClass + '" aria-label="Parcel status is final">'
                            : '<button type="button" class="cd-parcel-status-chip st-' + statusClass + '" data-parcel-status-toggle="' + escHtml(p.id) + '" aria-haspopup="true" aria-expanded="false" aria-label="Change parcel status">') +
                            statusDot + statusLabel + '<span class="caret" aria-hidden="true">&#9662;</span>' +
                        (PARCEL_TERMINAL_STATUSES.indexOf(p.status) !== -1 ? '</span>' : '</button>') +
                        (PARCEL_TERMINAL_STATUSES.indexOf(p.status) !== -1 ? '' : '<div class="cd-parcel-status-menu" data-parcel-status-menu="' + escHtml(p.id) + '" hidden>' + menuItems + '</div>') +
                    '</span>' +
                '</div>' +
                '<div class="cd-parcel-route">' +
                    '<b>' + escHtml(p.from_city) + '</b>' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>' +
                    '<b>' + escHtml(p.to_city) + '</b>' +
                '</div>' +
                '<div class="cd-parcel-people">' +
                    '<span class="cd-parcel-person"><i>From</i><b>' + escHtml(p.sender_name) + '</b><small>+251 ' + escHtml(p.sender_phone) + '</small></span>' +
                    '<span class="cd-parcel-person"><i>To</i><b>' + escHtml(p.recipient_name) + '</b><small>+251 ' + escHtml(p.recipient_phone) + '</small></span>' +
                '</div>' +
                '<div class="cd-record-meta">' +
                    '<span>Weight<b>' + escHtml(p.weight_kg) + ' kg</b></span>' +
                    '<span>Type<b>' + escHtml(parcelTypeLabel(p.parcel_type)) + '</b></span>' +
                    '<span>Price<b>ETB ' + formatMoney(p.price) + '</b></span>' +
                    '<span>Registered<b>' + formatParcelDate(p.created_at) + '</b></span>' +
                    '<span>Status<b>' + escHtml(parcelStatusLabel(p.status)) + '</b></span>' +
                '</div>' +
                (p.notes ? '<p class="cd-parcel-notes">' + escHtml(p.notes) + '</p>' : '') +
                '<div class="cd-parcel-actions">' +
                    '<button type="button" class="btn btn-secondary btn-sm" data-parcel-receipt="' + escHtml(p.id) + '">Show receipt</button>' +
                    '<button type="button" class="btn btn-danger btn-sm" data-parcel-delete="' + escHtml(p.id) + '">Delete</button>' +
                '</div>' +
            '</article>';
        }).join('');

        list.innerHTML = html;
        list.hidden = false;
    }

    function parcelDateISO(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    /* created_at arrives as 'YYYY-MM-DD HH:MM:SS' or an ISO timestamp; this
       returns just the YYYY-MM-DD day key so the day filter can compare it. */
    function parcelDateKey(value) {
        var m = String(value == null ? '' : value).match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : '';
    }

    function updateParcelDateLabel() {
        var label = byId('parcel-date-label');
        if (!label) { return; }
        label.textContent = selectedParcelDate
            ? new Date(selectedParcelDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            : 'All registered dates';
    }

    /* Day strip mirrored from the trips section: today + the previous 13 days,
       because parcels are historical records (created_at), not future departures. */
    function renderParcelDayPicker() {
        var list = byId('parcel-day-list');
        if (!list) { return; }
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var html = '';
        for (var i = 13; i >= 0; i--) {
            var day = new Date(today);
            day.setDate(today.getDate() - i);
            var iso = parcelDateISO(day);
            html += '<button type="button" class="cd-day-button" data-parcel-date="' + iso + '" aria-pressed="' + String(iso === selectedParcelDate) + '"><span>' + day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() + '</span><b>' + day.getDate() + '</b></button>';
        }
        list.innerHTML = html;
        var buttons = list.querySelectorAll('[data-parcel-date]');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function () {
                var date = this.getAttribute('data-parcel-date');
                selectedParcelDate = selectedParcelDate === date ? '' : date;
                renderParcelDayPicker();
                applyParcelFilters();
            });
        }
    }

    function applyParcelFilters() {
        updateParcelDateLabel();
        renderParcels();
    }

    function showParcelError(message) {
        var list = byId('parcel-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('parcel-empty'); if (empty) { empty.hidden = true; }
        var error = byId('parcel-error');
        if (error) {
            error.hidden = false;
            error.className = 'cd-parcel-error auth-message error';
            error.textContent = message || 'Unable to load parcels. Please try again later.';
        }
    }

    function loadParcels() {
        var rid = ++parcelRequestId;
        var sec = byId('company-parcel'); if (sec) { sec.hidden = false; }
        var errorEl = byId('parcel-error'); if (errorEl) { errorEl.hidden = true; }
        var list = byId('parcel-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('parcel-empty'); if (empty) { empty.hidden = true; }

        fetch('api/company.php?action=parcels', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== parcelRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showParcelError(data.message || 'Unable to load parcels.');
                    return;
                }
                currentParcels = Array.isArray(data.parcels) ? data.parcels : [];
                renderParcelDayPicker();
                renderParcels();
            })
            .catch(function () {
                if (rid !== parcelRequestId) { return; }
                showParcelError('Network error while loading parcels.');
            });
    }

    function hideParcelForm() {
        var f = byId('parcel-form');
        if (f) { f.hidden = true; }
        var modal = byId('parcel-form-modal');
        if (modal) { modal.hidden = true; }
    }

    var parcelTripFetchId = 0;   // discards responses from superseded parcel trip fetches
    var parcelRouteTripsCache = [];
    var parcelRouteFetchedKey = ''; // last from|to key the trips strip finished loading for

    function fetchParcelTripsForRoute() {
        var fromEl = byId('parcel-from');
        var toEl = byId('parcel-to');
        var from = fromEl ? String(fromEl.value || '').trim() : '';
        var to = toEl ? String(toEl.value || '').trim() : '';
        /* The city inputs fire change (from the picker) AND blur (when the
           operator clicks into the day strip), so the SAME route can arrive
           twice in a row. Without this guard the second event wipes the strip
           mid-click — the operator then has to tap a date twice before it
           registers. The key is only recorded after a response lands, so a
           failed load still retries on the next event; openParcelForm resets
           the key each time the modal opens so every open refetches. */
        var routeKey = from.toUpperCase() + '|' + to.toUpperCase();
        if (routeKey === parcelRouteFetchedKey) { return; }
        var rid = ++parcelTripFetchId;

        var cell = byId('parcel-travel-date-cell');
        var loading = byId('parcel-travel-loading');
        var empty = byId('parcel-travel-empty');
        var list = byId('parcel-travel-day-list');
        var tripCell = byId('parcel-trip-cell');
        var tripSel = byId('parcel-trip');

        parcelRouteTripsCache = [];
        setParcelFieldError('parcel-travel-date', '');
        setParcelFieldError('parcel-trip', '');
        if (cell) { cell.hidden = true; }
        if (loading) { loading.hidden = true; }
        if (empty) { empty.hidden = true; }
        if (list) { list.innerHTML = ''; }
        if (tripCell) { tripCell.hidden = true; }
        if (tripSel) { tripSel.innerHTML = '<option value="">Select trip</option>'; }
        var tripEmpty = byId('parcel-trip-empty');
        if (tripEmpty) { tripEmpty.hidden = true; }

        if (!from || !to || from.toUpperCase() === to.toUpperCase()) { return; }

        if (loading) { loading.hidden = false; }

        fetch('api/company.php?action=trips', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                if (rid !== parcelTripFetchId) { return; }
                parcelRouteFetchedKey = routeKey;
                if (loading) { loading.hidden = true; }
                var trips = [];
                var data = result.data || {};
                if (result.ok && result.status === 200 && data.success) {
                    trips = (Array.isArray(data.trips) ? data.trips : []).filter(function (t) {
                        return String(t.status || '').toLowerCase() === 'scheduled'
                            && String(t.from_city || '').toUpperCase() === from.toUpperCase()
                            && String(t.to_city || '').toUpperCase() === to.toUpperCase();
                    });
                }
                parcelRouteTripsCache = trips;
                renderParcelTripsForDate();
            })
            .catch(function () {
                if (rid !== parcelTripFetchId) { return; }
                if (loading) { loading.hidden = true; }
                parcelRouteTripsCache = [];
                renderParcelTripsForDate('Could not load trips for this route. Please try again.');
            });
    }

    function renderParcelTripsForDate(errMsg) {
        var cell = byId('parcel-travel-date-cell');
        var list = byId('parcel-travel-day-list');
        var empty = byId('parcel-travel-empty');
        var tripCell = byId('parcel-trip-cell');
        if (!cell || !list) { return; }

        if (!parcelRouteTripsCache.length) {
            cell.hidden = true;
            if (tripCell) { tripCell.hidden = true; }
            list.innerHTML = '';
            var sel = byId('parcel-trip');
            if (sel) { sel.innerHTML = '<option value="">Select trip</option>'; }
            if (!errMsg && empty) { empty.hidden = true; }
            else if (empty) {
                empty.textContent = errMsg;
                empty.hidden = false;
                cell.hidden = false;
            }
            return;
        }

        cell.hidden = false;
        var dates = {};
        for (var i = 0; i < parcelRouteTripsCache.length; i++) { dates[parcelRouteTripsCache[i].departure_date] = true; }
        var sortedDates = Object.keys(dates).sort();
        list.innerHTML = sortedDates.map(function (date) {
            var d = new Date(date);
            var dayNum = isNaN(d.getTime()) ? date : d.getDate();
            var dayName = isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short' });
            var monthName = isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short' });
            return '<button type="button" class="cd-day-btn" data-date="' + date + '">' +
                '<span class="wd">' + dayName + '</span>' +
                '<b class="day">' + dayNum + '</b>' +
                '<span class="mo">' + monthName + '</span>' +
                '</button>';
        }).join('');
        if (empty) { empty.hidden = true; }
        if (tripCell) { tripCell.hidden = true; }
        var buttons = list.querySelectorAll('.cd-day-btn');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function () {
                list.querySelectorAll('.cd-day-btn').forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                refreshParcelTripOptions(this.getAttribute('data-date'));
            });
        }
        /* Show the next available date automatically so the operator sees
           the trip options the moment the strip appears. */
        if (buttons.length) {
            buttons[0].classList.add('active');
            refreshParcelTripOptions(sortedDates[0]);
        }
    }

    function refreshParcelTripOptions(date) {
        setParcelFieldError('parcel-travel-date', '');
        var sel = byId('parcel-trip');
        var empty = byId('parcel-trip-empty');
        var tripCell = byId('parcel-trip-cell');
        if (!sel) { return; }
        var filtered = date ? parcelRouteTripsCache.filter(function (t) { return String(t.departure_date) === String(date); }) : parcelRouteTripsCache;
        if (empty) { empty.hidden = true; }
        if (!date) {
            if (tripCell) { tripCell.hidden = true; }
            sel.innerHTML = '<option value="">Select trip</option>';
            return;
        }
        if (tripCell) { tripCell.hidden = false; }
        sel.innerHTML = '<option value="">Select trip</option>';
        if (!filtered.length) {
            if (empty) { empty.hidden = false; }
            return;
        }
        for (var i = 0; i < filtered.length; i++) {
            var t = filtered[i];
            var opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.departure_time + ' \u00b7 ' + (t.bus_name || 'Bus') + ' (' + t.available_seats + ' seats left) \u00b7 ETB ' + formatMoney(t.price);
            sel.appendChild(opt);
        }
    }

    function parcelPhoneDigits(raw) {
        var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
        if (digits.length === 12 && digits.slice(0, 3) === '251') { digits = digits.slice(3); }
        if (digits.length === 10 && digits.charAt(0) === '0') { digits = digits.slice(1); }
        return digits;
    }

    var PARCEL_FIELD_IDS = [
        'parcel-sender', 'parcel-sender-phone', 'parcel-recipient', 'parcel-recipient-phone',
        'parcel-from', 'parcel-to', 'parcel-weight', 'parcel-trip', 'parcel-travel-date',
        'parcel-payment-cashier', 'parcel-payment-sender', 'parcel-payment-ref'
    ];

    var parcelEditing = false;   // true when the modal is editing an existing parcel
    var parcelStep = 1;          // 1 = details, 2 = payment (new parcels only)
    var parcelPaymentMethod = '';
    var parcelPaymentCashier = '';
    var parcelPaymentSender = '';
    var parcelPaymentRef = '';

    function setParcelFieldError(id, message) {
        var field = byId(id);
        if (field) {
            if (message) {
                field.classList.add('is-invalid');
                field.setAttribute('aria-invalid', 'true');
            } else {
                field.classList.remove('is-invalid');
                field.removeAttribute('aria-invalid');
            }
        }
        var errEl = byId(id + '-error');
        if (errEl) {
            errEl.textContent = message || '';
            errEl.hidden = !message;
        }
    }

    function clearParcelFieldErrors() {
        for (var i = 0; i < PARCEL_FIELD_IDS.length; i++) { setParcelFieldError(PARCEL_FIELD_IDS[i], ''); }
    }

    function syncParcelPaymentMethodUI() {
        var labels = document.querySelectorAll('.cd-parcel-payment-method');
        for (var l = 0; l < labels.length; l++) {
            var input = labels[l].querySelector ? labels[l].querySelector('input[type="radio"]') : null;
            labels[l].classList.toggle('is-selected', !!(input && input.checked));
        }
        var checked = document.querySelector('input[name="parcel-payment-method"]:checked');
        var isTransfer = checked && checked.value === 'transfer';
        var isCash = checked && checked.value === 'cash';
        var tf = byId('parcel-payment-transfer-fields');
        if (tf) {
            tf.hidden = !isTransfer;
            if (isTransfer) { tf.classList.add('visible'); } else { tf.classList.remove('visible'); }
        }
        var cf = byId('parcel-payment-cash-fields');
        if (cf) {
            cf.hidden = !isCash;
            if (isCash) { cf.classList.add('visible'); } else { cf.classList.remove('visible'); }
        }
    }

    function renderParcelPaymentSummary() {
        var box = byId('parcel-payment-summary');
        if (!box) { return; }
        var fromEl = byId('parcel-from'), toEl = byId('parcel-to');
        var weightEl = byId('parcel-weight'), typeEl = byId('parcel-type');
        var from = fromEl ? String(fromEl.value || '').trim() : '';
        var to = toEl ? String(toEl.value || '').trim() : '';
        var weight = weightEl ? String(weightEl.value || '').trim() : '';
        var type = typeEl ? typeEl.value : 'standard';
        var trip = selectedParcelTrip();
        var tripFare = trip ? Number(trip.price) : 0;
        var price = (parseFloat(weight) > 0) ? parcelPrice(weight, type, tripFare) : 0;
        var rows = '';
        var cell = function (k, v) { return '<span class="k">' + k + '</span><span class="v">' + v + '</span>'; };
        rows += cell('Route', escHtml(from) + ' &rarr; ' + escHtml(to));
        rows += cell('Travel date', trip ? (escHtml(trip.departure_date) + ' &middot; ' + escHtml(trip.departure_time)) : '&mdash;');
        rows += cell('Parcel', escHtml(weight || '0') + ' kg &middot; ' + escHtml(parcelTypeLabel(type)));
        rows += cell('Amount to pay', 'ETB ' + formatMoney(price));
        box.innerHTML = rows;
    }

    function goToParcelStep(step) {
        /* Moving forward into the payment step runs details validation first. */
        if (step === 2 && parcelStep !== 2 && !validateParcelDetails()) { return; }
        var step1 = byId('parcel-form-step-1');
        var step2 = byId('parcel-form-step-2');
        var pill1 = byId('parcel-step-1-pill');
        var pill2 = byId('parcel-step-2-pill');
        if (step1) { step1.hidden = step !== 1; }
        if (step2) { step2.hidden = step !== 2; }
        if (pill1) { pill1.className = step === 1 ? 'is-active' : 'is-done'; }
        if (pill2) { pill2.className = step === 2 ? 'is-active' : ''; }
        parcelStep = step;
        if (step === 2) { renderParcelPaymentSummary(); }
    }

    function buildParcelReceiptHtml(parcel) {
        var nameEl = byId('cd-mini-name');
        var companyName = (nameEl && nameEl.textContent && String(nameEl.textContent).trim()) ? String(nameEl.textContent).trim() : 'ET Transport';
        var paidAt = parcel && parcel.created_at ? new Date(String(parcel.created_at).replace(' ', 'T')) : new Date();
        if (isNaN(paidAt.getTime())) { paidAt = new Date(); }
        var dateStr = paidAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
            + ' \u00b7 ' + paidAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        var methodLabel = parcelPaymentMethod === 'transfer' ? 'Bank Transfer' : 'Cash';
        var paymentDetail = methodLabel;
        if (parcelPaymentMethod === 'transfer') {
            paymentDetail = methodLabel
                + (parcelPaymentSender ? ' \u00b7 ' + escHtml(parcelPaymentSender) : '')
                + (parcelPaymentRef ? ' \u00b7 ' + escHtml(parcelPaymentRef) : '');
        } else {
            paymentDetail = methodLabel + (parcelPaymentCashier ? ' \u00b7 Cashier: ' + escHtml(parcelPaymentCashier) : '');
        }
        var trip = null;
        if (parcel.trip_id) {
            for (var i = 0; i < parcelRouteTripsCache.length; i++) {
                if (String(parcelRouteTripsCache[i].id) === String(parcel.trip_id)) { trip = parcelRouteTripsCache[i]; break; }
            }
        }
        var travelLine = trip ? (escHtml(trip.departure_date) + ' \u00b7 ' + escHtml(trip.departure_time)) : '\u2014';
        var field = function (k, v) {
            return '<div class="cd-receipt-field"><span class="k">' + escHtml(k) + '</span><span class="v">' + v + '</span></div>';
        };
        var person = function (k, name, phone) {
            return '<div class="cd-receipt-person"><span class="k">' + escHtml(k) + '</span><b>' + escHtml(name) + '</b><small>+251 ' + escHtml(phone) + '</small></div>';
        };
        var metaRow = function (k, v) { return '<span class="k">' + escHtml(k) + '</span><span class="v">' + v + '</span>'; };
        var html = '';
        html += '<div class="cd-receipt-brand">' +
            '<div class="co"><b>' + escHtml(companyName) + '</b><span>Parcel shipment receipt</span></div>' +
            '<div class="meta">' + metaRow('Receipt no.', escHtml(parcel.reference || '')) + metaRow('Issued', escHtml(dateStr)) + '</div>' +
        '</div>';
        html += '<div class="cd-receipt-fields">';
        html += field('Route', escHtml(String(parcel.from_city || '') + ' \u2192 ' + String(parcel.to_city || '')));
        html += field('Travel', travelLine);
        html += field('Parcel', escHtml(String(parcel.weight_kg || '0')) + ' kg \u00b7 ' + escHtml(parcelTypeLabel(parcel.parcel_type)));
        html += field('Payment', paymentDetail);
        html += '</div>';
        html += '<div class="cd-receipt-people">' +
            person('Sender', parcel.sender_name || '', parcel.sender_phone || '') +
            person('Recipient', parcel.recipient_name || '', parcel.recipient_phone || '') +
        '</div>';
        html += '<div class="cd-receipt-total"><span>Amount paid</span><b>ETB ' + formatMoney(Number(parcel.price)) + '</b></div>';
        return html;
    }

    function showParcelReceipt(parcel) {
        var body = byId('parcel-receipt-body');
        var modal = byId('parcel-receipt-modal');
        if (!body || !modal) { return; }
        body.innerHTML = buildParcelReceiptHtml(parcel);
        if (modal.parentNode !== document.body) { document.body.appendChild(modal); }
        modal.hidden = false;
    }

    function closeParcelReceipt() {
        var modal = byId('parcel-receipt-modal');
        if (modal) { modal.hidden = true; }
    }

    function openParcelForm(parcel) {
        var form = byId('parcel-form');
        var modal = byId('parcel-form-modal');
        if (!form) { return; }
        var error = byId('parcel-form-error');
        if (error) { error.textContent = ''; error.hidden = true; }
        clearParcelFieldErrors();
        setParcelFieldError('parcel-payment-method', '');
        setParcelFieldError('parcel-payment-ref', '');

        /* New parcels flow through details -> payment. Edits stay single-step. */
        parcelEditing = !!parcel;
        parcelStep = 1;
        var stepsEl = byId('parcel-steps');
        if (stepsEl) { stepsEl.hidden = parcelEditing; }
        var submitBtn = byId('parcel-form-submit');
        var nextBtn = byId('parcel-form-next');
        if (submitBtn) { submitBtn.hidden = !parcelEditing; }
        if (nextBtn) { nextBtn.hidden = parcelEditing; }
        var cashRadio = document.querySelector('input[name="parcel-payment-method"][value="cash"]');
        if (cashRadio) { cashRadio.checked = true; }
        var payRefInput = byId('parcel-payment-ref');
        if (payRefInput) { payRefInput.value = ''; }
        var cashierInput = byId('parcel-payment-cashier');
        if (cashierInput) { cashierInput.value = ''; }
        var paySenderInput = byId('parcel-payment-sender');
        if (paySenderInput) { paySenderInput.value = ''; }
        syncParcelPaymentMethodUI();
        goToParcelStep(1);

        var heading = byId('parcel-modal-heading');
        if (heading) { heading.textContent = parcel ? 'Edit Parcel ' + parcel.reference : 'New Parcel'; }
        byId('parcel-id').value = parcel ? parcel.id : '';
        byId('parcel-sender').value = parcel ? (parcel.sender_name || '') : '';
        byId('parcel-sender-phone').value = parcel ? parcelPhoneDigits(parcel.sender_phone) : '';
        byId('parcel-recipient').value = parcel ? (parcel.recipient_name || '') : '';
        byId('parcel-recipient-phone').value = parcel ? parcelPhoneDigits(parcel.recipient_phone) : '';
        byId('parcel-from').value = parcel ? (parcel.from_city || '') : '';
        byId('parcel-to').value = parcel ? (parcel.to_city || '') : '';
        byId('parcel-weight').value = parcel ? parcel.weight_kg : '';
        byId('parcel-type').value = parcel && parcel.parcel_type ? parcel.parcel_type : 'standard';
        updateParcelPricePreview();
        byId('parcel-notes').value = parcel ? (parcel.notes || '') : '';

        if (window.ETCityPicker) {
            window.ETCityPicker.sync('parcel-from');
            window.ETCityPicker.sync('parcel-to');
        }
        parcelRouteFetchedKey = '';
        fetchParcelTripsForRoute();

        form.hidden = false;
        if (modal) {
            if (modal.parentNode !== document.body) { document.body.appendChild(modal); }
            modal.hidden = false;
            var first = byId('parcel-sender');
            if (first) { first.focus(); }
        }
    }

    function parcelDetailsPayload() {
        function valueOf(id) {
            var el = byId(id);
            return el ? String(el.value || '').trim() : '';
        }
        var payload = {
            sender_name: valueOf('parcel-sender'),
            sender_phone: parcelPhoneDigits(valueOf('parcel-sender-phone')),
            recipient_name: valueOf('parcel-recipient'),
            recipient_phone: parcelPhoneDigits(valueOf('parcel-recipient-phone')),
            from_city: valueOf('parcel-from'),
            to_city: valueOf('parcel-to'),
            weight_kg: valueOf('parcel-weight'),
            parcel_type: valueOf('parcel-type') || 'standard',
            notes: valueOf('parcel-notes')
        };
        var id = valueOf('parcel-id');
        if (id) { payload.parcel_id = id; }
        return payload;
    }

    function validateParcelDetails() {
        var error = byId('parcel-form-error');
        if (error) { error.hidden = true; }
        var payload = parcelDetailsPayload();
        var firstInvalid = '';
        function bad(fieldId, message) {
            setParcelFieldError(fieldId, message);
            if (!firstInvalid) { firstInvalid = fieldId; }
        }

        if (!payload.sender_name) { bad('parcel-sender', 'Sender name is required.'); }
        if (!payload.recipient_name) { bad('parcel-recipient', 'Recipient name is required.'); }
        if (!payload.sender_phone) { bad('parcel-sender-phone', 'Sender phone number is required.'); }
        else if (payload.sender_phone.length !== 9) { bad('parcel-sender-phone', 'Enter a valid 9-digit Ethiopian sender phone (after +251).'); }
        if (!payload.recipient_phone) { bad('parcel-recipient-phone', 'Recipient phone number is required.'); }
        else if (payload.recipient_phone.length !== 9) { bad('parcel-recipient-phone', 'Enter a valid 9-digit Ethiopian recipient phone (after +251).'); }
        if (payload.sender_name && payload.recipient_name &&
            payload.sender_name.toUpperCase() === payload.recipient_name.toUpperCase()) {
            bad('parcel-recipient', 'Recipient must have a different name from the sender.');
        }
        if (payload.sender_phone && payload.recipient_phone &&
            payload.sender_phone === payload.recipient_phone) {
            bad('parcel-recipient-phone', 'Recipient must use a different phone number from the sender.');
        }
        if (!payload.from_city) { bad('parcel-from', 'Departure city is required.'); }
        if (!payload.to_city) { bad('parcel-to', 'Destination city is required.'); }
        else if (payload.from_city && payload.from_city.toUpperCase() === payload.to_city.toUpperCase()) { bad('parcel-to', 'Departure and destination must be different cities.'); }
        if (!(parseFloat(payload.weight_kg) > 0)) { bad('parcel-weight', 'Enter a valid parcel weight in kilograms.'); }

        var tripSelect = byId('parcel-trip');
        var tripId = tripSelect ? String(tripSelect.value || '') : '';
        var dateCell = byId('parcel-travel-date-cell');
        var dateList = byId('parcel-travel-day-list');
        var tripCell = byId('parcel-trip-cell');
        var hasDate = dateList ? dateList.querySelector('.cd-day-btn.active') != null : false;
        if (dateCell && !dateCell.hidden && !hasDate) {
            bad('parcel-travel-date', 'Pick a travel date for your shipment.');
        } else if (tripCell && !tripCell.hidden && !tripId) {
            bad('parcel-trip', 'Choose a scheduled trip on that date.');
        }

        if (firstInvalid) {
            var firstEl = byId(firstInvalid);
            if (firstEl && firstEl.focus) { firstEl.focus(); }
            return null;
        }
        if (tripId) { payload.trip_id = tripId; }
        return payload;
    }

    function submitParcelForm() {
        var error = byId('parcel-form-error');
        if (error) { error.hidden = true; }

        /* New-parcel details step: submit / Enter behaves like "Next". */
        if (!parcelEditing && parcelStep === 1) { goToParcelStep(2); return; }

        var payload = validateParcelDetails();
        if (!payload) { return; }

        /* Payment step — new parcels only. */
        if (!parcelEditing) {
            var payRadio = document.querySelector('input[name="parcel-payment-method"]:checked');
            var payMethod = payRadio ? String(payRadio.value || '') : '';
            if (!payMethod) {
                setParcelFieldError('parcel-payment-method', 'Choose a payment method.');
                return;
            }
            parcelPaymentMethod = payMethod;
            if (payMethod === 'transfer') {
                var paySenderEl = byId('parcel-payment-sender');
                var paySender = paySenderEl ? String(paySenderEl.value || '').trim() : '';
                if (!paySender) {
                    setParcelFieldError('parcel-payment-sender', 'Enter the sender / account name.');
                    return;
                }
                var payRefEl = byId('parcel-payment-ref');
                var payRef = payRefEl ? String(payRefEl.value || '').trim() : '';
                if (!payRef) {
                    setParcelFieldError('parcel-payment-ref', 'Enter the TXN / transaction reference.');
                    return;
                }
                parcelPaymentCashier = '';
                parcelPaymentSender = paySender;
                parcelPaymentRef = payRef;
                payload.payment_ref = payRef;
            } else {
                var cashierEl = byId('parcel-payment-cashier');
                var cashier = cashierEl ? String(cashierEl.value || '').trim() : '';
                if (!cashier) {
                    setParcelFieldError('parcel-payment-cashier', 'Enter the cashier name.');
                    return;
                }
                parcelPaymentCashier = cashier;
                parcelPaymentSender = '';
                parcelPaymentRef = '';
            }
            payload.payment_method = payMethod;
        }

        var action = payload.parcel_id ? 'parcel_update' : 'parcel_create';
        var submitBtn = byId('parcel-form-submit');
        if (submitBtn) { submitBtn.disabled = true; }

        fetch('api/company.php?action=' + action, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || !data.success) {
                    if (error) { error.textContent = data.message || 'Unable to save the parcel.'; error.hidden = false; }
                    if (submitBtn) { submitBtn.disabled = false; }
                    return;
                }
                hideParcelForm();
                loadParcels();
                toast(data.message || 'Parcel saved.');
                if (!parcelEditing && data.parcel) { showParcelReceipt(data.parcel); }
            })
            .catch(function () {
                if (error) { error.textContent = 'Network error while saving the parcel.'; error.hidden = false; }
            });
    }

    var pendingParcelStatusChange = null;

    function statusField(label, key, placeholder, required) {
        return '<label for="parcel-status-' + key + '">' + label + (required ? ' *' : '') + '</label><input id="parcel-status-' + key + '" data-status-detail="' + key + '" ' + (required ? 'required' : '') + ' maxlength="180" placeholder="' + placeholder + '">';
    }

    function openParcelStatusModal(id, status) {
        var parcel = parcelById(id);
        var modal = byId('parcel-status-modal');
        if (!parcel || !modal || PARCEL_TERMINAL_STATUSES.indexOf(parcel.status) !== -1 || (PARCEL_STATUS_TRANSITIONS[parcel.status] || []).indexOf(status) === -1) { return; }
        pendingParcelStatusChange = { id: id, status: status };
        var title = byId('parcel-status-title');
        var subtitle = byId('parcel-status-subtitle');
        var fields = byId('parcel-status-fields');
        var error = byId('parcel-status-error');
        if (title) { title.textContent = 'Mark parcel as ' + parcelStatusLabel(status); }
        if (subtitle) { subtitle.textContent = (parcel.reference || 'Parcel') + ' · ' + (parcel.from_city || '') + ' → ' + (parcel.to_city || ''); }
        var html = '';
        if (status === 'sent') {
            html = statusField('Vehicle plate number', 'plate_number', 'e.g. 3-12345 A.A', true) + statusField('Driver name', 'driver_name', 'Full name of driver', true) + statusField('Dispatch time', 'dispatch_time', 'e.g. 10:30 AM', true) + statusField('Dispatch note', 'note', 'Optional loading or route note', false);
        } else if (status === 'delivered') {
            html = statusField('Received at destination by', 'branch_receiver', 'Staff member or branch name', true) + statusField('Arrival time', 'arrival_time', 'e.g. 4:15 PM', true);
        } else if (status === 'picked_up') {
            html = statusField('Who received the parcel?', 'recipient_name', 'Full name of recipient', true) + statusField('ID / phone verification', 'verification', 'Last 4 ID digits or phone number', true) + '<label>Handover method *</label><div class="cd-status-quick-answers" data-status-choice="handover"><button type="button" data-value="Collected at branch">Collected at branch</button><button type="button" data-value="Handed to recipient">Handed to recipient</button></div>';
        } else if (status === 'returned_to_sender') {
            html = '<label>Why was it returned? *</label><div class="cd-status-quick-answers" data-status-choice="reason"><button type="button" data-value="Recipient did not come">Recipient did not come</button><button type="button" data-value="Recipient could not be reached">Recipient could not be reached</button><button type="button" data-value="Sender requested return">Sender requested return</button></div>' + statusField('Accepted by sender', 'sender_receiver', 'Name of sender / representative', true) + statusField('Return handover note', 'note', 'Where and when it was returned', true);
        } else if (status === 'lost') {
            html = '<label>Loss reason *</label><div class="cd-status-quick-answers" data-status-choice="reason"><button type="button" data-value="Could not locate after arrival">Could not locate after arrival</button><button type="button" data-value="Missing during transit">Missing during transit</button><button type="button" data-value="Damaged beyond recovery">Damaged beyond recovery</button></div>' + '<label>Was a refund paid? *</label><div class="cd-status-quick-answers" data-status-choice="refund_paid"><button type="button" data-value="Yes">Yes</button><button type="button" data-value="No">No</button></div>' + '<label for="parcel-status-refund_amount">Refund amount (ETB)</label><input id="parcel-status-refund_amount" data-status-detail="refund_amount" type="number" min="0" step="0.01" placeholder="Required if refund was paid">' + statusField('Refund payment reference', 'refund_reference', 'Required if refund was paid', false);
        }
        html += '<label for="parcel-status-password">Your account password *</label><input id="parcel-status-password" type="password" autocomplete="current-password" required placeholder="Enter your password">';
        if (fields) { fields.innerHTML = html; }
        if (error) { error.hidden = true; error.textContent = ''; }
        modal.hidden = false;
    }

    function closeParcelStatusModal() {
        var modal = byId('parcel-status-modal');
        if (modal) { modal.hidden = true; }
        pendingParcelStatusChange = null;
    }

    function submitParcelStatusChange() {
        if (!pendingParcelStatusChange) { return; }
        var details = {};
        var fields = document.querySelectorAll('#parcel-status-fields [data-status-detail]');
        for (var i = 0; i < fields.length; i++) {
            var value = String(fields[i].value || '').trim();
            if (fields[i].required && !value) { showStatusError('Complete all required details before confirming.'); return; }
            if (value) { details[fields[i].getAttribute('data-status-detail')] = value; }
        }
        var choices = document.querySelectorAll('#parcel-status-fields [data-status-choice]');
        for (var j = 0; j < choices.length; j++) {
            var selected = choices[j].querySelector('.is-selected');
            if (!selected) { showStatusError('Choose an answer for each required question.'); return; }
            details[choices[j].getAttribute('data-status-choice')] = selected.getAttribute('data-value');
        }
        if (pendingParcelStatusChange.status === 'lost' && details.refund_paid === 'Yes' && (!(Number(details.refund_amount) > 0) || !details.refund_reference)) { showStatusError('Enter the refund amount and payment reference.'); return; }
        var passwordField = byId('parcel-status-password');
        var password = passwordField ? String(passwordField.value || '') : '';
        if (!password) { showStatusError('Enter your account password to confirm this status change.'); return; }
        changeParcelStatus(pendingParcelStatusChange.id, pendingParcelStatusChange.status, details, password);
    }

    function showStatusError(message) {
        var error = byId('parcel-status-error');
        if (error) { error.textContent = message; error.hidden = false; }
    }

    function changeParcelStatus(id, status, details, password) {
        var chips = document.querySelectorAll('.cd-parcel-status-chip[data-parcel-status-toggle]');
        for (var c = 0; c < chips.length; c++) {
            if (chips[c].getAttribute('data-parcel-status-toggle') === String(id)) {
                chips[c].classList.add('is-saving');
                break;
            }
        }
        closeParcelStatusMenus();
        fetch('api/company.php?action=parcel_update', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ parcel_id: id, status: status, status_details: details || {}, password: password || '' })
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (result.ok && data.success) { closeParcelStatusModal(); loadParcels(); toast(data.message || 'Parcel status updated successfully.'); return; }
                if (result.status === 401) { showStatusError(data.message || 'Your password was not accepted.'); var pw = byId('parcel-status-password'); if (pw) { pw.value = ''; pw.focus(); } return; }
                toast(data.message || 'Unable to change the parcel status.');
                loadParcels();
            })
            .catch(function () {
                toast('Network error while changing the parcel status.');
                loadParcels();
            });
    }

    function deleteParcel(id) {
        var match = parcelById(id);
        if (!match) { return; }
        openParcelDeleteModal(match);
    }

    function openParcelDeleteModal(parcel) {
        var modal = byId('parcel-delete-modal');
        if (!modal || !parcel) { return; }
        var ref = byId('parcel-delete-ref');
        var route = byId('parcel-delete-route');
        var sender = byId('parcel-delete-sender');
        var status = byId('parcel-delete-status');
        if (ref) { ref.textContent = parcel.reference || ''; }
        if (route) { route.textContent = String(parcel.from_city || '') + ' \u2192 ' + String(parcel.to_city || ''); }
        if (sender) { sender.textContent = String(parcel.sender_name || '') + ' \u00b7 ' + String(parcel.sender_phone || ''); }
        if (status) { status.textContent = parcelStatusLabel(parcel.status); }
        var reason = byId('parcel-delete-reason');
        if (reason) { reason.value = ''; reason.removeAttribute('aria-invalid'); }
        var pwInput = byId('parcel-delete-password');
        if (pwInput) { pwInput.value = ''; }
        var pwErr = byId('parcel-delete-password-error');
        if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
        syncParcelDeletePassword();
        var msg = byId('parcel-delete-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        closeParcelStatusMenus();
        renderParcelDeleteReasonSuggestions();
        if (modal.parentNode !== document.body) { document.body.appendChild(modal); }
        modal.hidden = false;
        var first = byId('parcel-delete-reason');
        if (first && first.focus) { first.focus(); }
    }

    function renderParcelDeleteReasonSuggestions() {
        var container = byId('parcel-delete-reason-suggestions');
        if (!container) { return; }
        container.innerHTML = PARCEL_DELETE_REASON_SUGGESTIONS.map(function (text) {
            return '<button type="button" class="cd-cancel-suggestion" data-reason="' +
                escHtml(text).replace(/"/g, '&quot;') + '">' + escHtml(text) + '</button>';
        }).join('');
        var chips = container.querySelectorAll('.cd-cancel-suggestion');
        for (var i = 0; i < chips.length; i++) {
            chips[i].addEventListener('click', function () {
                var reasonEl = byId('parcel-delete-reason');
                if (reasonEl) {
                    reasonEl.value = this.getAttribute('data-reason');
                    reasonEl.removeAttribute('aria-invalid');
                }
                var msg = byId('parcel-delete-msg');
                if (msg) { msg.hidden = true; msg.textContent = ''; }
            });
        }
    }

    function closeParcelDeleteModal() {
        var modal = byId('parcel-delete-modal');
        if (modal) { modal.hidden = true; }
    }

    /* Mirrors the admin dashboard's syncConfirmPassword: the destructive
       confirm button stays disabled until a password has been typed. */
    function syncParcelDeletePassword() {
        var pwInput = byId('parcel-delete-password');
        var confirmBtn = byId('parcel-delete-confirm-btn');
        if (!pwInput || !confirmBtn) { return; }
        confirmBtn.disabled = String(pwInput.value || '').trim() === '';
    }

    function submitParcelDelete() {
        var confirmBtn = byId('parcel-delete-confirm-btn');
        var parcelId = null;
        var modalRef = byId('parcel-delete-ref');
        if (modalRef) {
            for (var i = 0; i < currentParcels.length; i++) {
                if (String(currentParcels[i].reference) === String(modalRef.textContent)) { parcelId = currentParcels[i].id; break; }
            }
        }
        if (!parcelId) { toast('Unable to find the parcel to delete. Please try again.'); closeParcelDeleteModal(); return; }

        var reasonEl = byId('parcel-delete-reason');
        var reason = reasonEl ? String(reasonEl.value || '').trim() : '';
        var pwInput = byId('parcel-delete-password');
        var password = pwInput ? String(pwInput.value || '') : '';
        var pwErr = byId('parcel-delete-password-error');
        var msg = byId('parcel-delete-msg');

        function badPw(message) {
            if (pwErr) { pwErr.textContent = message; pwErr.hidden = false; }
            if (pwInput && pwInput.select) { pwInput.select(); }
            if (pwInput && pwInput.focus) { pwInput.focus(); }
        }
        if (!reason) {
            if (reasonEl) {
                reasonEl.setAttribute('aria-invalid', 'true');
                if (reasonEl.focus) { reasonEl.focus(); }
            }
            if (msg) { msg.textContent = 'Enter or pick a reason for the deletion.'; msg.hidden = false; msg.className = 'cd-trip-delete-msg'; }
            return;
        }
        if (!password) { badPw('Enter your account password.'); return; }
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }

        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Working\u2026'; }

        fetch('api/company.php?action=parcel_delete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ parcel_id: parcelId, password: password, reason: reason })
        })
            .then(function (res) {
                return res.json().catch(function () {
                    return { success: false, message: 'Invalid server response.' };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            })
            .then(function (result) {
                var data = result.data || {};
                if (confirmBtn) { confirmBtn.textContent = 'Delete Parcel'; }
                syncParcelDeletePassword();
                if (result.status === 401) {
                    badPw(data.message || 'Your password was not accepted.');
                    return;
                }
                if (!result.ok || !data.success) {
                    if (msg) { msg.textContent = data.message || 'Unable to delete the parcel.'; msg.hidden = false; msg.className = 'cd-trip-delete-msg'; }
                    return;
                }
                closeParcelDeleteModal();
                loadParcels();
                toast(data.message || 'Parcel deleted.');
            })
            .catch(function () {
                if (confirmBtn) { confirmBtn.textContent = 'Delete Parcel'; }
                syncParcelDeletePassword();
                if (msg) { msg.textContent = 'Network error while deleting the parcel.'; msg.hidden = false; msg.className = 'cd-trip-delete-msg'; }
            });
    }

    function initParcel() {
        loadParcels();
        renderParcelDayPicker();

        var addBtn = byId('btn-add-parcel');
        if (addBtn) { addBtn.addEventListener('click', function () { openParcelForm(null); }); }

        var search = byId('parcel-search');
        if (search) {
            search.addEventListener('input', function () {
                parcelSearchTerm = search.value.trim().toLowerCase();
                applyParcelFilters();
            });
        }

        var parcelFromEl = byId('parcel-from');
        var parcelToEl = byId('parcel-to');
        var syncParcelRoute = function () {
            fetchParcelTripsForRoute();
        };
        if (parcelFromEl) {
            parcelFromEl.addEventListener('change', syncParcelRoute);
            parcelFromEl.addEventListener('blur', syncParcelRoute);
        }
        if (parcelToEl) {
            parcelToEl.addEventListener('change', syncParcelRoute);
            parcelToEl.addEventListener('blur', syncParcelRoute);
        }

        var clearBtn = byId('btn-clear-parcel-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                selectedParcelFilter = 'all';
                selectedParcelDate = '';
                parcelSearchTerm = '';
                if (search) { search.value = ''; }
                var buttons = document.querySelectorAll('.cd-parcel-filter[data-parcel-status]');
                for (var b = 0; b < buttons.length; b++) {
                    var active = buttons[b].getAttribute('data-parcel-status') === 'all';
                    buttons[b].classList.toggle('is-active', active);
                    buttons[b].setAttribute('aria-pressed', active ? 'true' : 'false');
                }
                renderParcelDayPicker();
                applyParcelFilters();
            });
        }

        var filterButtons = document.querySelectorAll('.cd-parcel-filter[data-parcel-status]');
        for (var f = 0; f < filterButtons.length; f++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    selectedParcelFilter = btn.getAttribute('data-parcel-status') || 'all';
                    var buttons = document.querySelectorAll('.cd-parcel-filter[data-parcel-status]');
                    for (var b = 0; b < buttons.length; b++) {
                        var active = buttons[b] === btn;
                        buttons[b].classList.toggle('is-active', active);
                        buttons[b].setAttribute('aria-pressed', active ? 'true' : 'false');
                    }
                    applyParcelFilters();
                });
            })(filterButtons[f]);
        }

        var form = byId('parcel-form');
        if (form) { form.addEventListener('submit', function (ev) { ev.preventDefault(); submitParcelForm(); }); }

        var weightEl = byId('parcel-weight');
        var typeEl = byId('parcel-type');
        if (weightEl) {
            weightEl.addEventListener('input', updateParcelPricePreview);
            weightEl.addEventListener('change', updateParcelPricePreview);
        }
        if (typeEl) { typeEl.addEventListener('change', updateParcelPricePreview); }
        var tripEl = byId('parcel-trip');
        if (tripEl) { tripEl.addEventListener('change', updateParcelPricePreview); }

        var cancelBtn = byId('parcel-form-cancel');
        if (cancelBtn) { cancelBtn.addEventListener('click', hideParcelForm); }

        var nextBtn = byId('parcel-form-next');
        if (nextBtn) { nextBtn.addEventListener('click', function () { submitParcelForm(); }); }
        var backBtn = byId('parcel-form-back');
        if (backBtn) { backBtn.addEventListener('click', function () { goToParcelStep(1); }); }
        var paymentRadios = document.querySelectorAll('input[name="parcel-payment-method"]');
        for (var pm = 0; pm < paymentRadios.length; pm++) {
            paymentRadios[pm].addEventListener('change', function () {
                syncParcelPaymentMethodUI();
                setParcelFieldError('parcel-payment-method', '');
            });
        }
        var receiptPrint = byId('parcel-receipt-print');
        if (receiptPrint) { receiptPrint.addEventListener('click', function () { document.body.classList.add('printing-parcel-receipt'); window.print(); }); }
        var receiptDone = byId('parcel-receipt-done');
        if (receiptDone) { receiptDone.addEventListener('click', closeParcelReceipt); }
        var receiptClose = byId('parcel-receipt-close');
        if (receiptClose) { receiptClose.addEventListener('click', closeParcelReceipt); }
        var receiptModal = byId('parcel-receipt-modal');
        if (receiptModal) {
            if (receiptModal.parentNode !== document.body) { document.body.appendChild(receiptModal); }
            receiptModal.addEventListener('click', function (ev) {
                if (ev.target === receiptModal) { closeParcelReceipt(); }
            });
        }
        window.addEventListener('afterprint', function () {
            document.body.classList.remove('printing-parcel-receipt');
        });

        /* Live-clear each field's inline error as the operator edits it. */
        for (var fi = 0; fi < PARCEL_FIELD_IDS.length; fi++) {
            (function (fieldId) {
                var fel = byId(fieldId);
                if (!fel) { return; }
                fel.addEventListener('input', function () { setParcelFieldError(fieldId, ''); });
                fel.addEventListener('change', function () { setParcelFieldError(fieldId, ''); });
            })(PARCEL_FIELD_IDS[fi]);
        }

        var listEl = byId('parcel-list');
        if (listEl) {
            listEl.addEventListener('click', function (ev) {
                var target = ev.target;
                if (!target || !target.closest) { return; }
                var delBtn = target.closest('[data-parcel-delete]');
                if (delBtn) { deleteParcel(delBtn.getAttribute('data-parcel-delete')); return; }
                var receiptBtn = target.closest('[data-parcel-receipt]');
                if (receiptBtn) {
                    var receiptParcel = parcelById(receiptBtn.getAttribute('data-parcel-receipt'));
                    if (receiptParcel) { showParcelReceipt(receiptParcel); }
                    return;
                }
                var setBtn = target.closest('[data-parcel-status-set]');
                if (setBtn) {
                    openParcelStatusModal(setBtn.getAttribute('data-parcel-status-set'), setBtn.getAttribute('data-parcel-status-value'));
                    return;
                }
                var toggle = target.closest('[data-parcel-status-toggle]');
                if (toggle) {
                    var tId = toggle.getAttribute('data-parcel-status-toggle');
                    var menu = null;
                    var menus = document.querySelectorAll('.cd-parcel-status-menu');
                    for (var m = 0; m < menus.length; m++) {
                        if (menus[m].getAttribute('data-parcel-status-menu') === tId) { menu = menus[m]; break; }
                    }
                    if (!menu) { return; }
                    var willOpen = menu.hidden;
                    closeParcelStatusMenus();
                    if (willOpen) {
                        menu.hidden = false;
                        toggle.setAttribute('aria-expanded', 'true');
                    }
                    return;
                }
                if (!target.closest('.cd-parcel-status-wrap')) { closeParcelStatusMenus(); }
            });
        }
        document.addEventListener('click', function (ev) {
            var t = ev.target;
            if (t && t.closest && t.closest('#parcel-list')) { return; }
            closeParcelStatusMenus();
        });

        var statusModal = byId('parcel-status-modal');
        if (statusModal) {
            if (statusModal.parentNode !== document.body) { document.body.appendChild(statusModal); }
            statusModal.addEventListener('click', function (ev) {
                if (ev.target === statusModal) { closeParcelStatusModal(); }
                var choice = ev.target && ev.target.closest ? ev.target.closest('[data-status-choice] button') : null;
                if (choice) {
                    var group = choice.parentNode;
                    var buttons = group.querySelectorAll('button');
                    for (var cb = 0; cb < buttons.length; cb++) { buttons[cb].classList.toggle('is-selected', buttons[cb] === choice); }
                    var statusErr = byId('parcel-status-error'); if (statusErr) { statusErr.hidden = true; }
                }
            });
        }
        var statusForm = byId('parcel-status-form');
        if (statusForm) { statusForm.addEventListener('submit', function (ev) { ev.preventDefault(); submitParcelStatusChange(); }); }
        var statusClose = byId('parcel-status-close'); if (statusClose) { statusClose.addEventListener('click', closeParcelStatusModal); }
        var statusCancel = byId('parcel-status-cancel'); if (statusCancel) { statusCancel.addEventListener('click', closeParcelStatusModal); }

        var deleteModal = byId('parcel-delete-modal');
        if (deleteModal) {
            if (deleteModal.parentNode !== document.body) { document.body.appendChild(deleteModal); }
            deleteModal.style.zIndex = '106';
            deleteModal.addEventListener('click', function (ev) {
                if (ev.target === deleteModal) { closeParcelDeleteModal(); }
            });
        }
        var deleteClose = byId('parcel-delete-close');
        if (deleteClose) { deleteClose.addEventListener('click', closeParcelDeleteModal); }
        var deleteKeep = byId('parcel-delete-keep-btn');
        if (deleteKeep) { deleteKeep.addEventListener('click', closeParcelDeleteModal); }
        var deleteConfirm = byId('parcel-delete-confirm-btn');
        if (deleteConfirm) { deleteConfirm.addEventListener('click', submitParcelDelete); }
        var deleteReason = byId('parcel-delete-reason');
        if (deleteReason) {
            deleteReason.addEventListener('input', function () {
                deleteReason.removeAttribute('aria-invalid');
                var msg = byId('parcel-delete-msg');
                if (msg) { msg.hidden = true; msg.textContent = ''; }
            });
        }
        var deletePassword = byId('parcel-delete-password');
        if (deletePassword) {
            deletePassword.addEventListener('input', function () {
                var pwErr = byId('parcel-delete-password-error');
                if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
                syncParcelDeletePassword();
            });
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initWorkspaceNavigation();
        loadOverview();
        loadFleet();
        loadRoutes();
        loadTrips();
        loadBookingTripOptions();
        loadBookings();
        loadRevenueTripOptions();
        populateRevenueOverviewYears();
        loadPayments();
        loadProfile();
        loadBranches();
        loadComplaints();
        initParcel();

        var refreshReviews = byId('btn-refresh-reviews');
        if (refreshReviews) { refreshReviews.addEventListener('click', loadReviews); }

        var reviewFilterBar = byId('review-filterbar');
        if (reviewFilterBar) {
            reviewFilterBar.addEventListener('click', function (ev) {
                var btn = ev.target.closest ? ev.target.closest('.cd-review-filter') : null;
                if (!btn) { return; }
                var raw = btn.getAttribute('data-review-filter');
                reviewFilter = raw === '' ? null : Number(raw);
                renderReviewFilterBar();
                renderReviewCards();
            });
        }

        var reviewListEl = byId('review-list');
        if (reviewListEl) {
            reviewListEl.addEventListener('input', function (ev) {
                var input = ev.target;
                if (!input || !input.classList || !input.classList.contains('cd-review-reply-input')) { return; }
                var card = input.closest ? input.closest('.cd-review-card') : null;
                var count = card ? card.querySelector('[data-review-reply-count]') : null;
                if (count) { count.textContent = input.value.length + ' / 1000'; }
            });
            reviewListEl.addEventListener('click', function (ev) {
                var target = ev.target.closest ? ev.target.closest('.cd-review-like, .cd-review-reply-btn, .cd-review-reply-save, .cd-review-reply-cancel') : null;
                if (!target) { return; }
                var id = target.getAttribute('data-review-id');
                if (!id) { return; }
                if (target.classList.contains('cd-review-like')) { toggleReviewLike(id); return; }
                if (target.classList.contains('cd-review-reply-btn')) { beginReviewReply(id); return; }
                if (target.classList.contains('cd-review-reply-cancel')) { cancelReviewReply(); return; }
                if (target.classList.contains('cd-review-reply-save')) {
                    var card = target.closest ? target.closest('.cd-review-card') : null;
                    var input = card ? card.querySelector('.cd-review-reply-input') : null;
                    var text = input ? input.value.trim() : '';
                    if (!text) { showReviewActionMessage('Write a reply message first.'); return; }
                    submitReviewReply(id, text);
                }
            });
        }

        var complaintFilterBar = byId('complaint-filterbar');
        if (complaintFilterBar) {
            complaintFilterBar.addEventListener('click', function (ev) {
                var btn = ev.target.closest ? ev.target.closest('.cd-complaint-filter') : null;
                if (!btn) { return; }
                complaintFilter = btn.getAttribute('data-complaint-filter') || null;
                loadComplaints();
            });
        }

        var complaintListEl = byId('complaint-list');
        if (complaintListEl) {
            complaintListEl.addEventListener('click', function (ev) {
                var target = ev.target.closest ? ev.target.closest('.cd-complaint-handle-btn') : null;
                if (!target) { return; }
                var id = target.getAttribute('data-complaint-id');
                if (id) { openComplaintModal(id); }
            });
        }

        var complaintModal = byId('complaint-modal');
        if (complaintModal) {
            complaintModal.addEventListener('click', function (ev) {
                if (ev.target === complaintModal) { closeComplaintModal(); return; }
                var closeBtn = ev.target.closest ? ev.target.closest('#complaint-modal-close') : null;
                if (closeBtn) { closeComplaintModal(); return; }
                var failed = ev.target.closest ? ev.target.closest('.cd-chat-bubble.is-failed') : null;
                if (failed) {
                    var key = failed.getAttribute('data-complaint-local-key');
                    if (key) { retryComplaintLocalMessage(key); }
                    return;
                }
                var applyStatus = ev.target.closest ? ev.target.closest('#complaint-status-apply') : null;
                if (applyStatus) { applyComplaintStatus(); return; }
                var sendBtn = ev.target.closest ? ev.target.closest('#complaint-chat-send') : null;
                if (sendBtn) { submitComplaintUpdate(activeComplaintModalId); }
            });
            /* Changing the status select live-updates the submit button and hint. */
            complaintModal.addEventListener('change', function (ev) {
                if (ev.target && ev.target.id === 'complaint-modal-status') {
                    syncComplaintStatusApply();
                }
            });
            complaintModal.addEventListener('keydown', function (ev) {
                if (ev.key === 'Escape') { closeComplaintModal(); return; }
                var composer = ev.target.closest ? ev.target.closest('#complaint-modal-new-response-text') : null;
                if (composer) {
                    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
                        ev.preventDefault();
                        submitComplaintUpdate(activeComplaintModalId);
                    }
                    return;
                }
                var failed = ev.target.closest ? ev.target.closest('.cd-chat-bubble.is-failed') : null;
                if (failed && (ev.key === 'Enter' || ev.key === ' ')) {
                    ev.preventDefault();
                    var key = failed.getAttribute('data-complaint-local-key');
                    if (key) { retryComplaintLocalMessage(key); }
                }
            });
            complaintModal.addEventListener('input', function (ev) {
                if (ev.target && ev.target.id === 'complaint-modal-new-response-text') {
                    syncComplaintSendButton();
                    autoResizeComplaintComposer();
                }
            });
        }

        var addBtn = byId('btn-add-bus');
        if (addBtn) { addBtn.addEventListener('click', openAddForm); }

        var cancel = byId('bus-form-cancel');
        if (cancel) { cancel.addEventListener('click', hideBusForm); }

        var form = byId('bus-form');
        if (form) {
            form.addEventListener('submit', function (ev) {
                ev.preventDefault();
                submitBusForm();
            });
        }

        var addRouteBtn = byId('btn-add-route');
        if (addRouteBtn) { addRouteBtn.addEventListener('click', openAddRouteForm); }

        var routeCancel = byId('route-form-cancel');
        if (routeCancel) { routeCancel.addEventListener('click', hideRouteForm); }

        var routeFormEl = byId('route-form');
        if (routeFormEl) {
            routeFormEl.addEventListener('submit', function (ev) {
                ev.preventDefault();
                submitRouteForm();
            });
        }

        /* Vice versa toggle: remember the preference, keep the switch text and the
           return-route hint in sync as the operator types the two cities or
           flips the switch. */
        var vvBox = byId('route-vice-versa');
        if (vvBox) {
            vvBox.addEventListener('change', function () {
                saveViceVersaPref(vvBox.checked);
                updateViceVersaUI();
            });
        }
        var routeFromEl = byId('route-from');
        if (routeFromEl) {
            routeFromEl.addEventListener('input', updateViceVersaUI);
            routeFromEl.addEventListener('blur', updateViceVersaUI);
        }
        var routeToEl = byId('route-to');
        if (routeToEl) {
            routeToEl.addEventListener('input', updateViceVersaUI);
            routeToEl.addEventListener('blur', updateViceVersaUI);
        }

        var addTripBtn = byId('btn-add-trip');
        if (addTripBtn) { addTripBtn.addEventListener('click', openAddTripForm); }

        var tripCancel = byId('trip-form-cancel');
        if (tripCancel) { tripCancel.addEventListener('click', hideTripForm); }

        var tripForm = byId('trip-form');
        if (tripForm) {
            tripForm.addEventListener('submit', function (ev) {
                ev.preventDefault();
                submitTripForm();
            });
        }

        /* Wire the top filter buttons (All trips / Scheduled / Cancelled). */
        var tripFilterButtons = document.querySelectorAll('.cd-trip-filter[data-trip-filter]');
        for (var fi = 0; fi < tripFilterButtons.length; fi++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    selectedTripStatus = btn.getAttribute('data-trip-filter') || 'all';
                    var buttons = document.querySelectorAll('.cd-trip-filter[data-trip-filter]');
                    for (var b = 0; b < buttons.length; b++) {
                        var active = buttons[b] === btn;
                        buttons[b].classList.toggle('is-active', active);
                        buttons[b].setAttribute('aria-pressed', active ? 'true' : 'false');
                    }
                    applyTripFilter();
                });
            })(tripFilterButtons[fi]);
        }

        /* Render the trips departure-date day strip. */
        renderTripDayPicker();

        var tripRefresh = byId('btn-refresh-trips');
        if (tripRefresh) { tripRefresh.addEventListener('click', loadTrips); }

        var clearTripFilters = byId('btn-clear-trip-filters');
        if (clearTripFilters) {
            clearTripFilters.addEventListener('click', function () {
                selectedTripDate = '';
                selectedTripStatus = 'all';
                var statusButtons = document.querySelectorAll('.cd-trip-filter[data-trip-filter]');
                for (var tb = 0; tb < statusButtons.length; tb++) {
                    var active = statusButtons[tb].getAttribute('data-trip-filter') === 'all';
                    statusButtons[tb].classList.toggle('is-active', active);
                    statusButtons[tb].setAttribute('aria-pressed', active ? 'true' : 'false');
                }
                renderTripDayPicker();
                applyTripFilter();
            });
        }


        var bookingRefresh = byId('btn-refresh-bookings');
        if (bookingRefresh) { bookingRefresh.addEventListener('click', loadBookings); }

        var walkInBtn = byId('btn-add-walkin-booking');
        if (walkInBtn) { walkInBtn.addEventListener('click', openWalkInBookingForm); }
        var walkInClose = byId('walkin-booking-close');
        if (walkInClose) { walkInClose.addEventListener('click', closeWalkInBookingForm); }
        var walkInCancel = byId('walkin-booking-cancel');
        if (walkInCancel) { walkInCancel.addEventListener('click', closeWalkInBookingForm); }
        var walkInBack = byId('walkin-booking-back');
        if (walkInBack) {
            walkInBack.addEventListener('click', function () {
                if (walkInState.step > 1) {
                    setWalkInStep(walkInState.step - 1);
                }
            });
        }
        var walkInNext = byId('walkin-booking-next');
        if (walkInNext) {
            walkInNext.addEventListener('click', function () {
                clearWalkInError();
                var typeInputs = document.querySelectorAll('input[name="walkin-booking-type"]:checked');
                var bookingType = typeInputs.length ? typeInputs[0].value : '';
                if (walkInState.step === 1) {
                    if (!bookingType) {
                        showWalkInError('walkin-booking-type-error', 'Please choose whether this was an office or call-in booking.', null);
                        return;
                    }
                    walkInState.bookingType = bookingType;
                    setWalkInStep(2);
                    return;
                }
                if (walkInState.step === 2) {
                    var tripInput = byId('walkin-trip');
                    if (!walkInState.tripDate) {
                        showWalkInError('walkin-date-error', 'Travel date is required.', null);
                        return;
                    }
                    if (!tripInput || !tripInput.value) {
                        showWalkInError('walkin-trip-error', 'Please pick a valid trip for this date.', 'walkin-trip');
                        return;
                    }
                    walkInState.tripId = tripInput.value;
                    walkInState.trip = getSelectedTripFromWizard();
                    setWalkInStep(3);
                    loadWalkInSeatAvailability();
                    return;
                }
                if (walkInState.step === 3) {
                    if (walkInState.selectedSeat === null || walkInState.selectedSeat === undefined) {
                        showWalkInError('walkin-seat-error', 'Please pick a seat for the passenger.', null);
                        return;
                    }
                    setWalkInStep(4);
                    return;
                }
                if (walkInState.step === 4) {
                    if (!validateWalkInPassenger()) { return; }
                    if (!validateWalkInRefundAccount()) { return; }
                    setWalkInStep(5);
                    return;
                }
                if (walkInState.step === 5) {
                    var paymentSelection = document.querySelector('input[name="walkin-payment-method"]:checked');
                    if (!paymentSelection) {
                        showWalkInError('walkin-payment-method-error', 'Please choose a payment method.', null);
                        return;
                    }
                    walkInState.paymentMethod = paymentSelection.value;
                    if (walkInState.paymentMethod === 'transfer') {
                        var transferTransaction = byId('walkin-transfer-transaction') ? byId('walkin-transfer-transaction').value.trim() : '';
                        if (!transferTransaction) {
                            showWalkInError('walkin-transfer-transaction-error', 'Transaction number is required for bank transfer.', 'walkin-transfer-transaction');
                            return;
                        }
                        walkInState.transferRef = transferTransaction;
                    } else {
                        walkInState.transferRef = '';
                        walkInState.transferSender = '';
                    }
                    setWalkInStep(6);
                    updateWalkInConfirmation();
                    return;
                }
            });
        }
        var walkInConfirm = byId('walkin-booking-confirm');
        if (walkInConfirm) { walkInConfirm.addEventListener('click', submitWalkInBookingForm); }
        var walkInDate = byId('walkin-booking-date');
        if (walkInDate) {
            walkInDate.addEventListener('change', function () {
                clearWalkInError();
                walkInState.tripDate = walkInDate.value;
                refreshWalkInTripOptions();
            });
        }
        var walkInTripSelect = byId('walkin-trip');
        if (walkInTripSelect) {
            walkInTripSelect.addEventListener('change', function () {
                clearWalkInError();
                walkInState.tripId = walkInTripSelect.value;
                walkInState.trip = getSelectedTripFromWizard();
                if (walkInState.trip) { loadWalkInSeatAvailability(); }
            });
        }
        var walkInTypeInputs = document.querySelectorAll('input[name="walkin-booking-type"]');
        for (var f = 0; f < walkInTypeInputs.length; f++) {
            walkInTypeInputs[f].addEventListener('change', function () {
                clearWalkInError();
            });
        }
        var walkInPaymentInputs = document.querySelectorAll('input[name="walkin-payment-method"]');
        for (var g = 0; g < walkInPaymentInputs.length; g++) {
            walkInPaymentInputs[g].addEventListener('change', function () {
                var transferFields = byId('walkin-transfer-fields');
                if (transferFields) {
                    transferFields.classList.toggle('visible', this.value === 'transfer');
                }
                clearWalkInError();
            });
        }
        var walkInPhoneInput = byId('walkin-passenger-phone');
        if (walkInPhoneInput) {
            walkInPhoneInput.addEventListener('input', function () {
                var digits = this.value.replace(/\D/g, '');
                if (digits.length === 10 && digits.charAt(0) === '0') { digits = digits.slice(1); }
                if (digits.length > 9) { digits = digits.slice(0, 9); }
                this.value = digits;
                clearWalkInError();
            });
        }
        ['walkin-passenger-name', 'walkin-passenger-age', 'walkin-transfer-transaction', 'walkin-refund-account-name', 'walkin-refund-account-number', 'walkin-refund-account-other'].forEach(function (fieldId) {
            var field = byId(fieldId);
            if (field) { field.addEventListener('input', clearWalkInError); }
        });
        /* Refund account "Other bank" toggle in the walk-in wizard. */
        var walkInRefundType = byId('walkin-refund-account-type');
        var walkInRefundOtherWrap = byId('walkin-refund-account-other-wrap');
        if (walkInRefundType && walkInRefundOtherWrap) {
            walkInRefundType.addEventListener('change', function () {
                walkInRefundOtherWrap.hidden = this.value !== 'Other';
                if (this.value !== 'Other') {
                    var otherInput = byId('walkin-refund-account-other');
                    if (otherInput) { otherInput.value = ''; }
                }
                clearWalkInError();
            });
        }
        var walkInGenderInputs = document.querySelectorAll('input[name="walkin-passenger-gender"]');
        for (var h =  0; h < walkInGenderInputs.length; h++) {
            walkInGenderInputs[h].addEventListener('change', clearWalkInError);
        }
        var walkInForm = byId('walkin-booking-form');
        if (walkInForm) {
            walkInForm.addEventListener('submit', function (ev) {
                ev.preventDefault();
                submitWalkInBookingForm();
            });
        }
        var walkInModal = byId('walkin-booking-modal');
        if (walkInModal) {
            /* Mount at <body> level like the bus/trip modals so the fixed overlay
               lives in the root stacking context and always paints above the
               sticky header / dashboard shell, regardless of how the modal is
               nested in the static markup. */
            if (walkInModal.parentNode !== document.body) {
                document.body.appendChild(walkInModal);
            }
            walkInModal.style.zIndex = '102';
            walkInModal.addEventListener('click', function (ev) {
                if (ev.target === walkInModal) { closeWalkInBookingForm(); }
            });
        }

        /* ----- Walk-in ticket popup wiring ----- */
        var walkinTicketModal = byId('walkin-ticket-modal');
        if (walkinTicketModal) {
            /* Mount at <body> level like the other modals on this page so the
               fixed overlay always paints above the dashboard shell. */
            if (walkinTicketModal.parentNode !== document.body) {
                document.body.appendChild(walkinTicketModal);
            }
            walkinTicketModal.style.zIndex = '103';
            walkinTicketModal.addEventListener('click', function (ev) {
                if (ev.target === walkinTicketModal) { closeWalkInTicket(); }
            });
        }
        var walkinTicketClose = byId('walkin-ticket-close');
        if (walkinTicketClose) { walkinTicketClose.addEventListener('click', closeWalkInTicket); }
        var walkinTicketDone = byId('walkin-ticket-done');
        if (walkinTicketDone) { walkinTicketDone.addEventListener('click', closeWalkInTicket); }
        var walkinTicketPrint = byId('walkin-ticket-print');
        if (walkinTicketPrint) {
            walkinTicketPrint.addEventListener('click', function () {
                document.body.classList.add('printing-walkin-ticket');
                window.print();
            });
        }
        window.addEventListener('afterprint', function () {
            document.body.classList.remove('printing-walkin-ticket');
        });

        var bookingFromFilter = byId('booking-from-filter');
        if (bookingFromFilter) { bookingFromFilter.addEventListener('change', applyBookingFilters); }
        var bookingToFilter = byId('booking-to-filter');
        if (bookingToFilter) { bookingToFilter.addEventListener('change', applyBookingFilters); }

        /* Wire the booking status filter buttons (All bookings / Active / Cancelled). */
        var bookingStatusFilterButtons = document.querySelectorAll('.cd-booking-status-filter[data-booking-status]');
        for (var bsf = 0; bsf < bookingStatusFilterButtons.length; bsf++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    selectedBookingStatus = btn.getAttribute('data-booking-status') || 'all';
                    var buttons = document.querySelectorAll('.cd-booking-status-filter[data-booking-status]');
                    for (var b = 0; b < buttons.length; b++) {
                        var active = buttons[b] === btn;
                        buttons[b].classList.toggle('is-active', active);
                        buttons[b].setAttribute('aria-pressed', active ? 'true' : 'false');
                    }
                    applyBookingFilters();
                });
            })(bookingStatusFilterButtons[bsf]);
        }

        var clearBookingFilters = byId('btn-clear-booking-filters');
        if (clearBookingFilters) {
            clearBookingFilters.addEventListener('click', function () {
                selectedBookingDate = '';
                selectedBookingStatus = 'all';
                if (bookingFromFilter) { bookingFromFilter.value = ''; }
                if (bookingToFilter) { bookingToFilter.value = ''; }
                if (window.ETCityPicker) {
                    window.ETCityPicker.sync('booking-from-filter');
                    window.ETCityPicker.sync('booking-to-filter');
                }
                var statusButtons = document.querySelectorAll('.cd-booking-status-filter[data-booking-status]');
                for (var b = 0; b < statusButtons.length; b++) {
                    var active = statusButtons[b].getAttribute('data-booking-status') === 'all';
                    statusButtons[b].classList.toggle('is-active', active);
                    statusButtons[b].setAttribute('aria-pressed', active ? 'true' : 'false');
                }
                renderBookingDayPicker();
                applyBookingFilters();
            });
        }

        /* ----- Cancel-booking modal wiring ----- */
        var cancelModal = byId('cancel-booking-modal');
        if (cancelModal) {
            if (cancelModal.parentNode !== document.body) {
                document.body.appendChild(cancelModal);
            }
            cancelModal.style.zIndex = '102';
            cancelModal.addEventListener('click', function (ev) {
                if (ev.target === cancelModal) { closeCancelBookingModal(); }
            });
        }
        var cancelClose = byId('cancel-modal-close');
        if (cancelClose) { cancelClose.addEventListener('click', closeCancelBookingModal); }
        var cancelKeep = byId('cancel-keep-btn');
        if (cancelKeep) { cancelKeep.addEventListener('click', closeCancelBookingModal); }
        var cancelConfirm = byId('cancel-confirm-btn');
        if (cancelConfirm) { cancelConfirm.addEventListener('click', submitCancelBooking); }
        var cancelPwInput = byId('cancel-password');
        if (cancelPwInput) {
            cancelPwInput.addEventListener('input', function () {
                var pwErr = byId('cancel-password-error');
                if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
                syncCancelBookingPassword();
            });
        }
        var cancelRefundRadios = document.querySelectorAll('input[name="cancel-refund-type"]');
        for (var cr = 0; cr < cancelRefundRadios.length; cr++) {
            cancelRefundRadios[cr].addEventListener('change', function () {
                renderCancelReasonSuggestions();
                var reasonEl = byId('cancel-reason');
                if (reasonEl) { reasonEl.removeAttribute('aria-invalid'); }
                var msg = byId('cancel-modal-msg');
                if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-cancel-msg'; }
            });
        }

        /* ----- Trip-cancel confirmation modal wiring ----- */
        var tripCancelModal = byId('trip-cancel-modal');
        if (tripCancelModal) {
            if (tripCancelModal.parentNode !== document.body) {
                document.body.appendChild(tripCancelModal);
            }
            tripCancelModal.style.zIndex = '103';
            tripCancelModal.addEventListener('click', function (ev) {
                if (ev.target === tripCancelModal) { closeTripCancelModal(); }
            });
        }
        var tripCancelClose = byId('trip-cancel-close');
        if (tripCancelClose) { tripCancelClose.addEventListener('click', closeTripCancelModal); }
        var tripCancelKeep = byId('trip-cancel-keep-btn');
        if (tripCancelKeep) { tripCancelKeep.addEventListener('click', closeTripCancelModal); }
        var tripCancelConfirm = byId('trip-cancel-confirm-btn');
        if (tripCancelConfirm) { tripCancelConfirm.addEventListener('click', confirmTripCancel); }
        var tripCancelPwInput = byId('trip-cancel-password');
        if (tripCancelPwInput) {
            tripCancelPwInput.addEventListener('input', function () {
                var pwErr = byId('trip-cancel-password-error');
                if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
                syncTripCancelConfirm();
            });
        }

        /* ----- Trip-delete confirmation modal wiring ----- */
        var tripDeleteModal = byId('trip-delete-modal');
        if (tripDeleteModal) {
            if (tripDeleteModal.parentNode !== document.body) {
                document.body.appendChild(tripDeleteModal);
            }
            tripDeleteModal.style.zIndex = '104';
            tripDeleteModal.addEventListener('click', function (ev) {
                if (ev.target === tripDeleteModal) { closeTripDeleteModal(); }
            });
        }
        var tripDeleteClose = byId('trip-delete-close');
        if (tripDeleteClose) { tripDeleteClose.addEventListener('click', closeTripDeleteModal); }
        var tripDeleteKeep = byId('trip-delete-keep-btn');
        if (tripDeleteKeep) { tripDeleteKeep.addEventListener('click', closeTripDeleteModal); }
        var tripDeleteConfirm = byId('trip-delete-confirm-btn');
        if (tripDeleteConfirm) { tripDeleteConfirm.addEventListener('click', confirmTripDelete); }

        /* ----- Route-delete confirmation modal wiring ----- */
        var routeDeleteModal = byId('route-delete-modal');
        if (routeDeleteModal) {
            if (routeDeleteModal.parentNode !== document.body) {
                document.body.appendChild(routeDeleteModal);
            }
            routeDeleteModal.style.zIndex = '105';
            routeDeleteModal.addEventListener('click', function (ev) {
                if (ev.target === routeDeleteModal) { closeRouteDeleteModal(); }
            });
        }
        var routeDeleteClose = byId('route-delete-close');
        if (routeDeleteClose) { routeDeleteClose.addEventListener('click', closeRouteDeleteModal); }
        var routeDeleteKeep = byId('route-delete-keep-btn');
        if (routeDeleteKeep) { routeDeleteKeep.addEventListener('click', closeRouteDeleteModal); }
        var routeDeleteConfirm = byId('route-delete-confirm-btn');
        if (routeDeleteConfirm) { routeDeleteConfirm.addEventListener('click', confirmRouteDelete); }

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' || ev.key === 'Esc' || ev.key === 27) {
                var wtkModal = byId('walkin-ticket-modal');
                if (wtkModal && !wtkModal.hidden) { closeWalkInTicket(); }
                var cbModal = byId('cancel-booking-modal');
                if (cbModal && !cbModal.hidden) { closeCancelBookingModal(); }
                var busModal = byId('bus-form-modal');
                if (busModal && !busModal.hidden) { hideBusForm(); }
                var tripModal = byId('trip-form-modal');
                if (tripModal && !tripModal.hidden) { hideTripForm(); }
                var tcModal = byId('trip-cancel-modal');
                if (tcModal && !tcModal.hidden) { closeTripCancelModal(); }
                var tdModal = byId('trip-delete-modal');
                if (tdModal && !tdModal.hidden) { closeTripDeleteModal(); }
                var rdModal = byId('route-delete-modal');
                if (rdModal && !rdModal.hidden) { closeRouteDeleteModal(); }
                var bfModal = byId('branch-form-modal');
                if (bfModal && !bfModal.hidden) { closeBranchForm(); }
                var bdModal = byId('branch-delete-modal');
                if (bdModal && !bdModal.hidden) { closeBranchDeleteModal(); }
                var roModal = byId('cd-revenue-overview-modal');
                if (roModal && !roModal.hidden) { closeRevenueOverview(); }
                var pdModal = byId('parcel-delete-modal');
                if (pdModal && !pdModal.hidden) { closeParcelDeleteModal(); }
                var parcelModal = byId('parcel-form-modal');
                if (parcelModal && !parcelModal.hidden) { hideParcelForm(); }
                var prModal = byId('parcel-receipt-modal');
                if (prModal && !prModal.hidden) { closeParcelReceipt(); }
                var complaintModalEl = byId('complaint-modal');
                if (complaintModalEl && !complaintModalEl.hidden) { closeComplaintModal(); }
            }
        });

        var revRefresh = byId('btn-refresh-revenue');
        if (revRefresh) { revRefresh.addEventListener('click', refreshRevenue); }

        var revOverviewBtn = byId('btn-revenue-overview');
        if (revOverviewBtn) { revOverviewBtn.addEventListener('click', openRevenueOverview); }

        var revApplyOverview = byId('btn-apply-revenue-overview');
        if (revApplyOverview) { revApplyOverview.addEventListener('click', loadRevenueOverview); }

        var revOverviewModal = byId('cd-revenue-overview-modal');
        if (revOverviewModal) {
            revOverviewModal.addEventListener('click', function (ev) {
                if (ev.target === revOverviewModal) { closeRevenueOverview(); }
            });
        }
        var revOverviewClose = byId('cd-revenue-overview-close');
        if (revOverviewClose) { revOverviewClose.addEventListener('click', closeRevenueOverview); }

        var revSearch = byId('btn-search-revenue');
        if (revSearch) { revSearch.addEventListener('click', refreshRevenue); }

        var revFromFilter = byId('revenue-from-filter');
        if (revFromFilter) { revFromFilter.addEventListener('change', applyRevenueFilters); }
        var revToFilter = byId('revenue-to-filter');
        if (revToFilter) { revToFilter.addEventListener('change', applyRevenueFilters); }

        /* Wire the payment status filter buttons (All payments / Paid / Refunded). */
        var revStatusButtons = document.querySelectorAll('.cd-payment-filter[data-payment-status]');
        for (var rsf = 0; rsf < revStatusButtons.length; rsf++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    selectedPaymentStatus = btn.getAttribute('data-payment-status') || 'all';
                    var buttons = document.querySelectorAll('.cd-payment-filter[data-payment-status]');
                    for (var b = 0; b < buttons.length; b++) {
                        var active = buttons[b] === btn;
                        buttons[b].classList.toggle('is-active', active);
                        buttons[b].setAttribute('aria-pressed', active ? 'true' : 'false');
                    }
                    applyRevenueFilters();
                });
            })(revStatusButtons[rsf]);
        }

        var clearRevenueFilters = byId('btn-clear-revenue-filters');
        if (clearRevenueFilters) {
            clearRevenueFilters.addEventListener('click', function () {
                selectedRevenueDate = '';
                selectedPaymentStatus = 'all';
                if (revFromFilter) { revFromFilter.value = ''; }
                if (revToFilter) { revToFilter.value = ''; }
                if (window.ETCityPicker) {
                    window.ETCityPicker.sync('revenue-from-filter');
                    window.ETCityPicker.sync('revenue-to-filter');
                }
                var statusButtons = document.querySelectorAll('.cd-payment-filter[data-payment-status]');
                for (var b = 0; b < statusButtons.length; b++) {
                    var active = statusButtons[b].getAttribute('data-payment-status') === 'all';
                    statusButtons[b].classList.toggle('is-active', active);
                    statusButtons[b].setAttribute('aria-pressed', active ? 'true' : 'false');
                }
                renderRevenueDayPicker();
                applyRevenueFilters();
            });
        }
        var editProfileBtn = byId('btn-edit-profile');
        if (editProfileBtn) { editProfileBtn.addEventListener('click', openProfileForm); }

        var cancelProfileBtn = byId('btn-profile-cancel');
        if (cancelProfileBtn) { cancelProfileBtn.addEventListener('click', closeProfileForm); }

        var addBranchBtn = byId('btn-add-branch');
        if (addBranchBtn) { addBranchBtn.addEventListener('click', function () { openBranchForm(null); }); }

        var cancelBranchBtn = byId('btn-branch-cancel');
        if (cancelBranchBtn) { cancelBranchBtn.addEventListener('click', closeBranchForm); }

        var branchForm = byId('branch-form');
        if (branchForm) {
            branchForm.addEventListener('submit', function (ev) {
                ev.preventDefault();
                submitBranchForm();
            });
        }

        /* ----- Branch form modal (add/edit) mounting ----- */
        var branchFormModal = byId('branch-form-modal');
        if (branchFormModal) {
            if (branchFormModal.parentNode !== document.body) {
                document.body.appendChild(branchFormModal);
            }
            branchFormModal.style.zIndex = '106';
            branchFormModal.addEventListener('click', function (ev) {
                if (ev.target === branchFormModal) { closeBranchForm(); }
            });
        }
        var branchModalClose = byId('branch-modal-close');
        if (branchModalClose) { branchModalClose.addEventListener('click', closeBranchForm); }

        var branchListEl = byId('branch-list');
        if (branchListEl) {
            branchListEl.addEventListener('click', function (ev) {
                var t = ev.target;
                if (!t || !t.getAttribute) { return; }
                var editId = t.getAttribute('data-branch-edit');
                if (editId) {
                    var match = null;
                    for (var bi = 0; bi < currentBranches.length; bi++) {
                        if (String(currentBranches[bi].id) === editId) { match = currentBranches[bi]; break; }
                    }
                    openBranchForm(match);
                    return;
                }
                var delId = t.getAttribute('data-branch-delete');
                if (delId) { openBranchDeleteModal(delId); }
            });
        }

        /* ----- Branch-delete confirmation modal wiring ----- */
        var branchDeleteModal = byId('branch-delete-modal');
        if (branchDeleteModal) {
            if (branchDeleteModal.parentNode !== document.body) {
                document.body.appendChild(branchDeleteModal);
            }
            branchDeleteModal.style.zIndex = '107';
            branchDeleteModal.addEventListener('click', function (ev) {
                if (ev.target === branchDeleteModal) { closeBranchDeleteModal(); }
            });
        }
        var branchDeleteClose = byId('branch-delete-close');
        if (branchDeleteClose) { branchDeleteClose.addEventListener('click', closeBranchDeleteModal); }
        var branchDeleteKeep = byId('branch-delete-keep-btn');
        if (branchDeleteKeep) { branchDeleteKeep.addEventListener('click', closeBranchDeleteModal); }
        var branchDeleteConfirm = byId('branch-delete-confirm-btn');
        if (branchDeleteConfirm) { branchDeleteConfirm.addEventListener('click', confirmBranchDelete); }

        var profileForm = byId('profile-form');
        if (profileForm) {
            profileForm.addEventListener('change', function (ev) {
                var input = ev.target;
                if (input.id !== 'profile-input-logo' && input.id !== 'profile-input-cover') { return; }
                var file = input.files && input.files[0];
                if (!file) { return; }
                var reader = new FileReader();
                reader.onload = function () {
                    setProfileImagePreview(input.id === 'profile-input-logo' ? 'profile-logo-preview' : 'profile-cover-preview', String(reader.result || ''), input.id === 'profile-input-logo' ? 'LOGO' : 'COVER');
                };
                reader.readAsDataURL(file);
            });
            profileForm.addEventListener('submit', function (ev) {
                ev.preventDefault();
                submitProfileForm();
            });
        }

        /* Add / remove phone rows in the profile form. */
        var addPhoneBtn = byId('btn-add-phone');
        if (addPhoneBtn) {
            addPhoneBtn.addEventListener('click', function () { addProfilePhoneRow(''); });
        }
        var phoneList = byId('profile-phone-list');
        if (phoneList) {
            phoneList.addEventListener('click', function (ev) {
                var btn = ev.target.closest ? ev.target.closest('.cd-phone-remove') : null;
                if (btn) { removeProfilePhoneRow(btn); }
            });
        }

        /* Onboard amenities picker — add (+) / remove (x). */
        var amenityEditor = byId('profile-amenity-editor');
        if (amenityEditor) {
            amenityEditor.addEventListener('click', function (ev) {
                var btn = ev.target.closest ? ev.target.closest('[data-amenity-action]') : null;
                if (!btn) { return; }
                var name = btn.getAttribute('data-amenity');
                var action = btn.getAttribute('data-amenity-action');
                if (name) { handleAmenityClick(name, action); }
            });
        }
    });
})();
