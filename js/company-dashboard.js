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
            trips: byId('company-trips'), bookings: byId('company-bookings'), revenue: byId('company-revenue'), profile: byId('company-profile'), routes: byId('company-routes'), reviews: byId('company-reviews')
        };
        var icon = {
            overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
            fleet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16h18"/><path d="M5 16V9h10l4 4v3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
            passengers: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.8-3.5 2.8-5.5 6-5.5s5.2 2 6 5.5"/><path d="M16 5.5a3 3 0 0 1 0 5"/><path d="M18 14.5c1.6.8 2.6 2.6 3 5"/></svg>',
            revenue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 2 4-6"/></svg>',
            route: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/></svg>',
            profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4 4-6 8-6s6.6 2 8 6"/></svg>',
            reviews: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2  L14.25 8.91  L21.51 8.91  L15.63 13.18  L17.88 20.09  L12 15.82  L6.12 20.09  L8.37 13.18  L2.49 8.91  L9.75 8.91  Z"/></svg>'
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
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-revenue" data-cd-view="revenue">' + icon.revenue + '<span>Revenue</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-reviews" data-cd-view="reviews">' + icon.reviews + '<span>Reviews</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-profile" data-cd-view="profile">' + icon.profile + '<span>Public profile</span></button>' +
                '</nav></aside><div class="cd-content">' +
                  '<section id="cd-overview" class="cd-pane" role="tabpanel"><div id="cd-overview-slot"></div><div class="cd-quick-actions"><button type="button" class="cd-quick-action" data-cd-go="fleet" data-cd-action="btn-add-bus"><b class="cd-quick-icon">+</b><span>Add a bus<small>Expand your active fleet</small></span></button><button type="button" class="cd-quick-action" data-cd-go="trips" data-cd-action="btn-add-trip"><b class="cd-quick-icon">↗</b><span>Schedule a trip<small>Open a new departure</small></span></button><button type="button" class="cd-quick-action" data-cd-go="routes" data-cd-action="btn-add-route"><b class="cd-quick-icon">⇄</b><span>Add Routes<small>Add and update city pairs</small></span></button><button type="button" class="cd-quick-action" data-cd-go="profile" data-cd-action="btn-edit-profile"><b class="cd-quick-icon">✦</b><span>Update public profile<small>Keep passenger details current</small></span></button></div></section>' +
                  '<section id="cd-fleet" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Fleet register</h2><p>Add, edit and update the operating status of every vehicle.</p></div></div></section>' +
                  '<section id="cd-trips" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Trips</h2><p>Publish, update and manage each scheduled departure.</p></div></div></section>' +
                  '<section id="cd-passengers" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Passengers &amp; bookings</h2><p>Review bookings and view each passenger\'s digital ticket.</p></div></div></section>' +
                  '<section id="cd-revenue" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Revenue &amp; payments</h2><p>Review paid and refunded passenger payments.</p></div></div></section>' +
                  '<section id="cd-routes" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Routes</h2></div></div></section>' +
                  '<section id="cd-reviews" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Reviews</h2><p>What passengers say about travelling with your company.</p></div></div></section>' +
                  '<section id="cd-profile" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Your passenger-facing profile</h2><p>This is the information passengers use to decide who they travel with.</p></div><a id="cd-passenger-preview" class="cd-passenger-preview" href="company.html" target="_blank" rel="noopener">View passenger page ↗</a></div></section>' +
                '</div></div></div>';

        var overviewSlot = byId('cd-overview-slot');
        [nodes.loading, nodes.error, nodes.banner, nodes.stats].forEach(function (node) { if (node) { overviewSlot.appendChild(node); } });
        if (nodes.fleet) { byId('cd-fleet').appendChild(nodes.fleet); }
        if (nodes.trips) { byId('cd-trips').appendChild(nodes.trips); }
        if (nodes.bookings) { byId('cd-passengers').appendChild(nodes.bookings); }
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

        function selectView(view) {
            var panes = document.querySelectorAll('.cd-content > .cd-pane');
            var buttons = document.querySelectorAll('[data-cd-view]');
            for (var i = 0; i < panes.length; i++) { panes[i].hidden = panes[i].id !== 'cd-' + view; }
            for (var j = 0; j < buttons.length; j++) { buttons[j].setAttribute('aria-selected', String(buttons[j].getAttribute('data-cd-view') === view)); }
            try { window.history.replaceState(null, '', '#' + view); } catch (e) { /* non-critical */ }
        }
        var navButtons = document.querySelectorAll('[data-cd-view]');
        for (var b = 0; b < navButtons.length; b++) { navButtons[b].addEventListener('click', function () { selectView(this.getAttribute('data-cd-view')); }); }
        var quickActions = document.querySelectorAll('[data-cd-go]');
        for (var q = 0; q < quickActions.length; q++) { quickActions[q].addEventListener('click', function () { selectView(this.getAttribute('data-cd-go')); var target = byId(this.getAttribute('data-cd-action')); if (target) { target.click(); } }); }
        var requested = window.location.hash.replace('#', '');
        if (requested === 'fleet' || requested === 'trips' || requested === 'passengers' || requested === 'revenue' || requested === 'routes' || requested === 'reviews' || requested === 'profile') { selectView(requested); }

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
            return '<div class="cd-bus-card" data-bus-id="' + b.id + '">' +
                '<span class="cd-bus-name">' + escHtml(b.name) + '</span>' +
                '<span class="cd-bus-badge ' + badge + '">' + escHtml(b.status) + '</span>' +
                '<div class="cd-record-meta"><span>Registration<b>' + reg + '</b></span><span>Class<b>' + escHtml(b.bus_type) + '</b></span><span>Capacity<b>' + b.seat_count + ' seats</b></span></div>' +
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
        byId('bus-type').value = 'standard';
        byId('bus-seats').value = '';
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
        byId('bus-type').value = bus.bus_type || 'standard';
        byId('bus-seats').value = bus.seat_count;
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
            bus_type: byId('bus-type').value,
            seat_count: byId('bus-seats').value,
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
        renderStationRows('pickup', ['']);
        renderStationRows('dropoff', ['']);
        var statusBox = byId('route-status');
        if (statusBox) { statusBox.checked = true; }
        updateRouteStatusUI();
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
        renderStationRows('pickup', Array.isArray(route.pickup_stations) ? route.pickup_stations : []);
        renderStationRows('dropoff', Array.isArray(route.dropoff_stations) ? route.dropoff_stations : []);
        var statusBox = byId('route-status');
        if (statusBox) { statusBox.checked = String(route.status) !== 'inactive'; }
        updateRouteStatusUI();
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
        var payload = {
            from_city: byId('route-from').value.trim(),
            to_city: byId('route-to').value.trim(),
            duration: byId('route-duration').value.trim(),
            status: (byId('route-status') && byId('route-status').checked) ? 'active' : 'inactive',
            pickup_stations: pickupStations,
            dropoff_stations: dropoffStations
        };
        if (id) { payload.route_id = id; }
        var action = id ? 'route_update' : 'route_create';

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
                    if (errEl) { errEl.textContent = data.message || 'Unable to save the route.'; }
                    return;
                }
                hideRouteForm();
                loadRoutes();
                /* New trips should immediately see the updated route catalog. */
                loadTrips();
            })
            .catch(function () {
                if (errEl) { errEl.textContent = 'Network error while saving the route.'; }
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
        var modal = byId('trip-cancel-modal');
        if (modal) { modal.hidden = true; }
        var msg = byId('trip-cancel-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-trip-cancel-msg'; }
        var confirmBtn = byId('trip-cancel-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Cancel Trip'; }
        var reasonEl = byId('trip-cancel-reason');
        if (reasonEl) { reasonEl.value = ''; reasonEl.removeAttribute('aria-invalid'); }
        var suggestions = byId('trip-cancel-reason-suggestions');
        if (suggestions) { suggestions.innerHTML = ''; }
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
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Cancel Trip'; }
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
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Cancel Trip & ' + active.length + ' Booking' + (active.length === 1 ? '' : 's');
        }
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

        var active = (Array.isArray(tripCancelActiveBookings) ? tripCancelActiveBookings : []).slice();
        closeTripCancelModal();

        if (active.length === 0) {
            /* No active bookings — cancel the trip directly. */
            cancelTrip(id, 0, reason);
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
            tripCancelState = null;
            hideCancelBookingModal();
            cancelTrip(tripId, total, reason);
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

    function cancelTrip(id, bookingCount, reason) {
        var modal = byId('trip-cancel-modal');
        var msg = byId('trip-cancel-msg');
        var confirmBtn = byId('trip-cancel-confirm-btn');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        if (confirmBtn) { confirmBtn.disabled = true; }

        fetch('api/company.php?action=trip_status', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ trip_id: id, status: 'cancelled', reason: reason || '' })
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
                loadRevenueSummary();
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

        var msg = byId('cancel-modal-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-cancel-msg'; }
        var confirmBtn = byId('cancel-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Cancellation'; }
        var keepBtn = byId('cancel-keep-btn');
        if (keepBtn) { keepBtn.disabled = false; }

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
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Cancellation'; }
        var keepBtn = byId('cancel-keep-btn');
        if (keepBtn) { keepBtn.disabled = false; }
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

        var msg = byId('cancel-modal-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-cancel-msg'; }
        var confirmBtn = byId('cancel-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Cancelling...'; }
        var keepBtn = byId('cancel-keep-btn');
        if (keepBtn) { keepBtn.disabled = true; }

        cancelBooking(cancelBookingId, refundType, reason);
    }

    function cancelBooking(bookingId, refundType, reason) {
        fetch('api/company.php?action=booking_cancel', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingId, refund_type: refundType, reason: reason })
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
                loadBookings();
                loadRevenueSummary();
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
        if (!/^[79][0-9]{8}$/.test(phoneDigits)) {
            showWalkInError('walkin-passenger-phone-error', 'Enter a valid Ethiopian phone number: +251 followed by 9 digits starting with 7 or 9.', 'walkin-passenger-phone');
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
                loadRevenueSummary();
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

    function renderRevenueSummary(rev) {
        rev = rev || {};
        setRevStat('rev-grossPaidRevenue', formatMoney(rev.gross_paid_revenue));
        setRevStat('rev-refundsPaid', formatMoney(rev.refunds_paid));
        setRevStat('rev-netRevenue', formatMoney(rev.net_revenue));
        setRevStat('rev-paidPayments', rev.paid_payment_count == null ? 0 : rev.paid_payment_count);
        setRevStat('rev-refundedPayments', rev.refunded_payment_count == null ? 0 : rev.refunded_payment_count);
        setRevStat('rev-noRefundCancellations', rev.no_refund_cancellation_count == null ? 0 : rev.no_refund_cancellation_count);
        setRevStat('rev-halfRefunds', rev.half_refund_count == null ? 0 : rev.half_refund_count);
        setRevStat('rev-fullRefunds', rev.full_refund_count == null ? 0 : rev.full_refund_count);
        var box = byId('revenue-summary');
        if (box) { box.hidden = false; }
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
        from.value = fromValue; to.value = toValue; renderRevenueDayPicker();
    }

        function paymentsFilterUrl() {
        var url = 'api/company.php?action=payments';
        return url;
    }

    var revenueRequestId = 0;   // discards responses from superseded revenue requests

    function loadRevenueSummary() {
        var rid = ++revenueRequestId;
        fetch('api/company.php?action=revenue', {
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
                if (rid !== revenueRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showRevenueError(data.message || 'Unable to load your revenue summary.');
                    return;
                }
                renderRevenueSummary(data.revenue);
            })
            .catch(function () {
                if (rid !== revenueRequestId) { return; }
                showRevenueError('Network error while loading your revenue.');
            });
    }

    var paymentsRequestId = 0;   // discards responses from superseded payment requests

    function loadPayments() {
        var rid = ++paymentsRequestId;
        var sec = byId('company-revenue'); if (sec) { sec.hidden = false; }
        var error = byId('revenue-error'); if (error) { error.hidden = true; }
        var list = byId('payment-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('payment-empty'); if (empty) { empty.hidden = true; }
        var loading = byId('payment-loading'); if (loading) { loading.hidden = false; }

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
        byId('profile-phone').textContent = profileValue(company.phone);
        byId('profile-address').textContent = profileValue(company.address);
        byId('profile-head-office').textContent = profileValue(company.head_office);
        byId('profile-website').textContent = profileValue(company.website);
        byId('profile-desc').textContent = company.description ? company.description : '';
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
        var phoneInput = byId('profile-input-phone');
        if (phoneInput) { phoneInput.value = localPhoneValue(company.phone); }
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

        var phoneInput = byId('profile-input-phone');
        if (phoneInput) { phoneInput.value = fullPhoneValue(phoneInput.value); }

        var payload = new FormData(form);

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
                toast(data.message || 'Branch saved.');
                closeBranchForm();
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
        loadRevenueSummary();
        loadRevenueTripOptions();
        loadPayments();
    }

    document.addEventListener('DOMContentLoaded', function () {
        initWorkspaceNavigation();
        loadOverview();
        loadFleet();
        loadRoutes();
        loadTrips();
        loadBookingTripOptions();
        loadBookings();
        loadRevenueSummary();
        loadRevenueTripOptions();
        loadPayments();
        loadProfile();
        loadBranches();

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
            }
        });

        var revRefresh = byId('btn-refresh-revenue');
        if (revRefresh) { revRefresh.addEventListener('click', refreshRevenue); }

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
    });
})();
