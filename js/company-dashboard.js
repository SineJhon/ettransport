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
            upcomingBookings: 'stat-upcomingBookings',
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
            trips: byId('company-trips'), bookings: byId('company-bookings'), revenue: byId('company-revenue'), profile: byId('company-profile')
        };
        var icon = {
            overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
            fleet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16h18"/><path d="M5 16V9h10l4 4v3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
            passengers: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.8-3.5 2.8-5.5 6-5.5s5.2 2 6 5.5"/><path d="M16 5.5a3 3 0 0 1 0 5"/><path d="M18 14.5c1.6.8 2.6 2.6 3 5"/></svg>',
            revenue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 2 4-6"/></svg>',
            profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4 4-6 8-6s6.6 2 8 6"/></svg>'
        };
        main.className = 'container cd-page';
        main.innerHTML =
            '<div id="cd-workspace" class="cd-workspace">' +
              '<div class="cd-workspace-head"><div><h1>Operator workspace</h1></div><div class="cd-live"><i></i>Account workspace</div></div>' +
              '<div class="cd-layout"><aside class="cd-sidebar"><div class="cd-company-mini"><img id="cd-mini-logo" alt=""><div><strong id="cd-mini-name">Your company</strong><small id="cd-mini-slug">Operator account</small></div></div>' +
                '<nav class="cd-nav" role="tablist" aria-label="Company dashboard sections">' +
                  '<button type="button" role="tab" aria-selected="true" aria-controls="cd-overview" data-cd-view="overview">' + icon.overview + '<span>Overview</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-fleet" data-cd-view="fleet">' + icon.fleet + '<span>Fleet &amp; buses</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-trips" data-cd-view="trips">' + icon.fleet + '<span>Trips</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-passengers" data-cd-view="passengers">' + icon.passengers + '<span>Passengers</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-revenue" data-cd-view="revenue">' + icon.revenue + '<span>Revenue</span></button>' +
                  '<button type="button" role="tab" aria-selected="false" aria-controls="cd-profile" data-cd-view="profile">' + icon.profile + '<span>Public profile</span></button>' +
                '</nav></aside><div class="cd-content">' +
                  '<section id="cd-overview" class="cd-pane" role="tabpanel"><div id="cd-overview-slot"></div><div class="cd-quick-actions"><button type="button" class="cd-quick-action" data-cd-go="fleet" data-cd-action="btn-add-bus"><b class="cd-quick-icon">+</b><span>Add a bus<small>Expand your active fleet</small></span></button><button type="button" class="cd-quick-action" data-cd-go="trips" data-cd-action="btn-add-trip"><b class="cd-quick-icon">↗</b><span>Schedule a trip<small>Open a new departure</small></span></button><button type="button" class="cd-quick-action" data-cd-go="profile" data-cd-action="btn-edit-profile"><b class="cd-quick-icon">✦</b><span>Update public profile<small>Keep passenger details current</small></span></button></div></section>' +
                  '<section id="cd-fleet" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Fleet register</h2><p>Add, edit and update the operating status of every vehicle.</p></div></div></section>' +
                  '<section id="cd-trips" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Trips</h2><p>Publish, update and manage each scheduled departure.</p></div></div></section>' +
                  '<section id="cd-passengers" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Passengers &amp; bookings</h2><p>Review bookings and view each passenger\'s digital ticket.</p></div></div></section>' +
                  '<section id="cd-revenue" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Revenue &amp; payments</h2><p>Review paid, pending and refunded passenger payments.</p></div></div></section>' +
                  '<section id="cd-profile" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Your passenger-facing profile</h2><p>This is the information passengers use to decide who they travel with.</p></div><a id="cd-passenger-preview" class="cd-passenger-preview" href="company.html" target="_blank" rel="noopener">View passenger page ↗</a></div></section>' +
                '</div></div></div>';

        var overviewSlot = byId('cd-overview-slot');
        [nodes.loading, nodes.error, nodes.banner, nodes.stats].forEach(function (node) { if (node) { overviewSlot.appendChild(node); } });
        if (nodes.fleet) { byId('cd-fleet').appendChild(nodes.fleet); }
        if (nodes.trips) { byId('cd-trips').appendChild(nodes.trips); }
        if (nodes.bookings) { byId('cd-passengers').appendChild(nodes.bookings); }
        if (nodes.revenue) { byId('cd-revenue').appendChild(nodes.revenue); }
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
        if (requested === 'fleet' || requested === 'trips' || requested === 'passengers' || requested === 'revenue' || requested === 'profile') { selectView(requested); }

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
       cancellation still goes through cancelTrip() -> trip_status, which the
       server keeps atomic with the booking cancellations. */
    var pendingTripCancelId = null;

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
        var modal = byId('trip-cancel-modal');
        if (modal) { modal.hidden = true; }
        var msg = byId('trip-cancel-msg');
        if (msg) { msg.hidden = true; msg.textContent = ''; msg.className = 'cd-trip-cancel-msg'; }
        var confirmBtn = byId('trip-cancel-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Cancel Trip'; }
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
                ? refundCount + ' paid booking(s) need a refund \u2014 it is NOT processed automatically.'
                : 'No paid bookings are affected \u2014 no refund required.';
            note.hidden = false;
        }
        if (confirmBtn) {
            confirmBtn.textContent = 'Cancel Trip & ' + active.length + ' Booking' + (active.length === 1 ? '' : 's');
        }
    }

    function openTripCancelModal(id) {
        var modal = byId('trip-cancel-modal');
        var trip = tripById(id);
        if (!modal || !trip) { return; }

        pendingTripCancelId = String(id);

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
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Cancel Trip'; }

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
                    if (errConfirm) { errConfirm.disabled = true; }
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
                if (errConfirm) { errConfirm.disabled = true; }
            });
    }

    function confirmTripCancel() {
        if (!pendingTripCancelId) { return; }
        cancelTrip(pendingTripCancelId);
    }

    function cancelTrip(id) {
        var modal = byId('trip-cancel-modal');
        var msg = byId('trip-cancel-msg');
        var confirmBtn = byId('trip-cancel-confirm-btn');
        if (msg) { msg.hidden = true; msg.textContent = ''; }
        if (confirmBtn) { confirmBtn.disabled = true; }

        fetch('api/company.php?action=trip_status', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ trip_id: id, status: 'cancelled' })
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
                var affected = data.affected || {};
                var count = parseInt(affected.count, 10) || 0;
                if (count > 0) {
                    var refunds = 0;
                    if (Array.isArray(affected.bookings)) {
                        for (var k = 0; k < affected.bookings.length; k++) {
                            if (affected.bookings[k] && affected.bookings[k].refund_required) { refunds++; }
                        }
                    }
                    var note = 'Trip cancelled. ' + count + ' booking(s) were affected';
                    if (refunds > 0) {
                        note += ' (' + refunds + ' paid — refund required, not yet processed)';
                    }
                    note += '.';
                    showTripNotice(note);
                }
                loadTrips();
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

    function openCancelBookingModal(bookingId) {
        var modal = byId('cancel-booking-modal');
        if (!modal || !bookingId) { return; }

        var booking = null;
        for (var i = 0; i < currentBookings.length; i++) {
            if (String(currentBookings[i].id) === String(bookingId)) { booking = currentBookings[i]; break; }
        }
        if (!booking) { return; }

        cancelBookingId = bookingId;
        byId('cancel-ref').textContent = booking.booking_reference || '';
        byId('cancel-route').textContent = (booking.route_from || '') + ' \u2192 ' + (booking.route_to || '');
        byId('cancel-date').textContent = (booking.trip_departure_date || '') + ' ' + (booking.trip_departure_time || '');
        byId('cancel-passengers').textContent = booking.passenger_count + ' passenger' + (booking.passenger_count === 1 ? '' : 's');
        byId('cancel-amount').textContent = 'ETB ' + formatMoney(booking.total_amount);
        byId('cancel-payment-status').textContent = booking.payment_status || '';

        var radios = document.querySelectorAll('input[name="cancel-refund-type"]');
        for (var r = 0; r < radios.length; r++) {
            radios[r].checked = radios[r].value === 'none';
        }
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

    function closeCancelBookingModal() {
        var modal = byId('cancel-booking-modal');
        if (modal) { modal.hidden = true; }
        cancelBookingId = null;
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
        var error = byId('walkin-booking-error');
        if (error) { error.textContent = ''; }
    }

    function showWalkInError(message) {
        var error = byId('walkin-booking-error');
        if (error) { error.textContent = message || 'Please complete the required fields.'; }
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
            showWalkInError('Passenger full name is required.');
            return null;
        }
        if (!/^[79][0-9]{8}$/.test(phoneDigits)) {
            showWalkInError('Enter a valid Ethiopian phone number: +251 followed by 9 digits starting with 7 or 9.');
            return null;
        }
        if (phoneInput) { phoneInput.value = phoneDigits; }

        var age = parseInt(ageRaw, 10);
        if (!ageRaw || !/^\d+$/.test(ageRaw) || age < 1 || age > 200) {
            showWalkInError('Passenger age is required and must be between 1 and 200.');
            return null;
        }
        if (!genderInput) {
            showWalkInError('Please select the passenger gender (Male or Female.).');
            return null;
        }
        return {
            name: name,
            phone: '+251' + phoneDigits,
            age: String(age),
            gender: genderInput.value
        };
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
            showWalkInError('Please choose a booking source before continuing.');
            return;
        }
        if (!walkInState.tripDate || !tripId) {
            showWalkInError('Please select a valid travel date and trip.');
            return;
        }
        if (walkInState.selectedSeat === null || walkInState.selectedSeat === undefined) {
            showWalkInError('Please choose a seat before continuing.');
            return;
        }
        var passengerData = validateWalkInPassenger();
        if (!passengerData) { return; }
        passengerName = passengerData.name;
        passengerPhone = passengerData.phone;
        passengerAge = passengerData.age;
        passengerGender = passengerData.gender;
        if (!paymentMethod) {
            showWalkInError('Please choose a payment method.');
            return;
        }
        if (paymentMethod === 'transfer' && !transferTransaction) {
            showWalkInError('A transfer transaction number is required for bank transfer payments.');
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
            payment_reference: paymentMethod === 'transfer' ? transferTransaction : ''
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
                    showWalkInError(data.message || 'Unable to create the walk-in booking.');
                    return;
                }
                var bookingRef = data.booking ? data.booking.booking_reference : '';
                if (!bookingRef) {
                    showWalkInError('The booking was created but no reference was returned.');
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
                showWalkInError('Network error while creating the walk-in booking.');
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
        setRevStat('rev-totalPaidRevenue', formatMoney(rev.total_paid_revenue));
        setRevStat('rev-paidPayments', rev.paid_payment_count == null ? 0 : rev.paid_payment_count);
        setRevStat('rev-pendingPayments', rev.pending_payment_count == null ? 0 : rev.pending_payment_count);
        setRevStat('rev-failedPayments', rev.failed_payment_count == null ? 0 : rev.failed_payment_count);
        setRevStat('rev-refundedPayments', rev.refunded_payment_count == null ? 0 : rev.refunded_payment_count);
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
                    else if (selectedPaymentStatus === 'pending') { emptyMsg = 'No pending payments match the current filters.'; }
                    else if (selectedPaymentStatus === 'failed') { emptyMsg = 'No failed payments match the current filters.'; }
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
            return '<div class="cd-payment-card" data-payment-id="' + p.id + '">' +
                '<span class="cd-payment-ref">' + escHtml(p.booking_reference) + '</span>' +
                '<span class="cd-payment-route">' + escHtml(p.route_from) + ' \u2192 ' + escHtml(p.route_to) + '</span>' +
                '<span class="cd-payment-row-text">Departure: ' + escHtml(p.departure_date) + ' ' + escHtml(p.departure_time) + '</span>' +
                '<span class="cd-payment-row-text">Booking #' + p.booking_id + ' \u2022 Trip #' + p.trip_id + '</span>' +
                '<span class="cd-payment-amount">ETB ' + formatMoney(p.amount) + '</span>' +
                '<span class="cd-payment-row-text">Method: ' + escHtml(p.method) +
                    (p.transaction_reference ? ' \u2022 ' + escHtml(p.transaction_reference) : '') + '</span>' +
                '<span class="cd-payment-row-text">' + paymentStatusBadge(p.status) + '</span>' +
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
        byId('profile-status').textContent = profileValue(company.status);
        byId('profile-desc').textContent = company.description ? company.description : '';
        setProfileLink(byId('profile-logo'), company.logo);
        setProfileLink(byId('profile-cover'), company.cover_image);
        var passengerPreview = byId('cd-passenger-preview');
        if (passengerPreview) {
            passengerPreview.href = company.slug ? 'company.html?company=' + encodeURIComponent(company.slug) : 'company.html';
        }

        var nameInput = byId('profile-input-name');
        if (nameInput) { nameInput.value = company.name || ''; }
        var emailInput = byId('profile-input-email');
        if (emailInput) { emailInput.value = company.email || ''; }
        var phoneInput = byId('profile-input-phone');
        if (phoneInput) { phoneInput.value = company.phone || ''; }
        var addressInput = byId('profile-input-address');
        if (addressInput) { addressInput.value = company.address || ''; }
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
    }

    function closeProfileForm() {
        clearProfileMessages();
        var form = byId('profile-form'); if (form) { form.hidden = true; }
        var view = byId('profile-view'); if (view) { view.hidden = false; }
        var editBtn = byId('btn-edit-profile'); if (editBtn) { editBtn.hidden = false; }
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

    function refreshRevenue() {
        loadRevenueSummary();
        loadRevenueTripOptions();
        loadPayments();
    }

    document.addEventListener('DOMContentLoaded', function () {
        initWorkspaceNavigation();
        loadOverview();
        loadFleet();
        loadTrips();
        loadBookingTripOptions();
        loadBookings();
        loadRevenueSummary();
        loadRevenueTripOptions();
        loadPayments();
        loadProfile();

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
                        showWalkInError('Please choose whether this was an office or call-in booking.');
                        return;
                    }
                    walkInState.bookingType = bookingType;
                    setWalkInStep(2);
                    return;
                }
                if (walkInState.step === 2) {
                    var tripInput = byId('walkin-trip');
                    if (!walkInState.tripDate) {
                        showWalkInError('Travel date is required.');
                        return;
                    }
                    if (!tripInput || !tripInput.value) {
                        showWalkInError('Please pick a valid trip for this date.');
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
                        showWalkInError('Please pick a seat for the passenger.');
                        return;
                    }
                    setWalkInStep(4);
                    return;
                }
                if (walkInState.step === 4) {
                    if (!validateWalkInPassenger()) { return; }
                    setWalkInStep(5);
                    return;
                }
                if (walkInState.step === 5) {
                    var paymentSelection = document.querySelector('input[name="walkin-payment-method"]:checked');
                    if (!paymentSelection) {
                        showWalkInError('Please choose a payment method.');
                        return;
                    }
                    walkInState.paymentMethod = paymentSelection.value;
                    if (walkInState.paymentMethod === 'transfer') {
                        var transferTransaction = byId('walkin-transfer-transaction') ? byId('walkin-transfer-transaction').value.trim() : '';
                        if (!transferTransaction) {
                            showWalkInError('Transaction number is required for bank transfer.');
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

        /* Wire the payment status filter buttons (All payments / Paid / Pending / Failed / Refunded). */
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
