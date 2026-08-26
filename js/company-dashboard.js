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

    function loadOverview() {
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
                  '<section id="cd-passengers" class="cd-pane" role="tabpanel" hidden><div class="cd-pane-title"><div><h2>Passengers &amp; bookings</h2><p>Review bookings and open passenger manifests for each departure.</p></div></div></section>' +
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
        var list = byId('bus-list'); if (list) { list.hidden = true; }
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
            if (list) { list.hidden = true; }
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

    function loadFleet() {
        var fleet = byId('company-fleet'); if (fleet) { fleet.hidden = false; }
        var error = byId('bus-error'); if (error) { error.hidden = true; }
        var list = byId('bus-list'); if (list) { list.hidden = true; }
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
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showBusError(data.message || 'Unable to load your fleet.');
                    return;
                }
                currentFleet = data.buses || [];
                renderFleet(currentFleet);
            })
            .catch(function () {
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

    function applyTripFilter() {
        renderTrips(currentTrips.filter(function (trip) {
            return selectedTripStatus === 'all' || trip.status === selectedTripStatus;
        }));
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
        var list = byId('trip-list'); if (list) { list.hidden = true; }
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
            if (list) { list.hidden = true; }
            if (empty) { empty.hidden = false; }
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
                cancelTrip(this.getAttribute('data-trip-cancel'));
            });
        }
    }

    function loadTrips() {
        var sec = byId('company-trips'); if (sec) { sec.hidden = false; }
        var error = byId('trip-error'); if (error) { error.hidden = true; }
        var list = byId('trip-list'); if (list) { list.hidden = true; }
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
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showTripError(data.message || 'Unable to load your trips.');
                    return;
                }
                currentTrips = data.trips || [];
                currentRoutes = data.routes || [];
                renderTrips(currentTrips);
            })
            .catch(function () {
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

    function cancelTrip(id) {
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
                    showTripError(data.message || 'Unable to cancel the trip.');
                    return;
                }
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
                showTripError('Network error while cancelling the trip.');
            });
    }

    /* ============================================================
 Bookings / Passengers (company operator view).
       Read-only; ownership is enforced server-side via trips.company_id.
       ============================================================ */

    var currentBookings = [];
    var bookingTripOptions = null;
    var selectedBookingDate = '';

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
        var filtered = currentBookings.filter(function (booking) {
            return (!selectedBookingDate || String(booking.trip_departure_date) === selectedBookingDate) &&
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
        var list = byId('booking-list'); if (list) { list.hidden = true; }
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
            if (list) { list.hidden = true; }
            if (empty) { empty.hidden = false; }
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
                    '<button type="button" class="btn btn-secondary btn-sm" data-manifest="' + b.id + '">View Manifest</button>' +
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
        var btns = list.querySelectorAll('button[data-manifest]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                openManifest(this.getAttribute('data-manifest'));
            });
        }
    }

    function loadBookings() {
        var sec = byId('company-bookings'); if (sec) { sec.hidden = false; }
        var error = byId('booking-error'); if (error) { error.hidden = true; }
        var list = byId('booking-list'); if (list) { list.hidden = true; }
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
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showBookingError(data.message || 'Unable to load your bookings.');
                    return;
                }
                currentBookings = data.bookings || [];
                applyBookingFilters();
            })
            .catch(function () {
                showBookingError('Network error while loading your bookings.');
            });
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

    function showManifestError(message) {
        var loading = byId('manifest-loading'); if (loading) { loading.hidden = true; }
        var content = byId('manifest-content'); if (content) { content.hidden = true; }
        var error = byId('manifest-error');
        if (error) {
            error.hidden = false;
            error.textContent = message || 'Unable to load the manifest. Please try again later.';
        }
    }

    function openManifest(id) {
        var modal = byId('manifest-modal');
        if (!modal) { return; }
        modal.hidden = false;
        var content = byId('manifest-content'); if (content) { content.hidden = true; }
        var error = byId('manifest-error'); if (error) { error.hidden = true; }
        var loading = byId('manifest-loading'); if (loading) { loading.hidden = false; }

        fetch('api/company.php?action=manifest&booking_id=' + encodeURIComponent(String(id)), {
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
                    showManifestError(data.message || 'Unable to load the manifest.');
                    return;
                }
                renderManifest(data);
            })
            .catch(function () {
                showManifestError('Network error while loading the manifest.');
            });
    }

    function manifestField(label, value) {
        return '<div><span class="cd-manifest-label">' + label + '</span><span class="cd-manifest-value">' + value + '</span></div>';
    }

    function renderManifest(resp) {
        var loading = byId('manifest-loading'); if (loading) { loading.hidden = true; }
        var error = byId('manifest-error'); if (error) { error.hidden = true; }
        var content = byId('manifest-content');
        if (!content) { return; }

        var b = resp.booking || {};
        var trip = b.trip || {};
        var passengers = resp.passengers || [];

        var rows = passengers.map(function (p) {
            var meta = [];
            if (p.age != null) { meta.push('Age ' + p.age); }
            if (p.gender) { meta.push(escHtml(p.gender)); }
            if (p.phone) { meta.push(escHtml(p.phone)); }
            return '<div class="cd-manifest-row">' +
                '<span class="cd-manifest-seat">Seat ' + escHtml(p.seat_number) + '</span>' +
                '<strong>' + escHtml(p.name) + '</strong>' +
                (meta.length ? ' <span class="cd-bookings-msg">(' + meta.join(', ') + ')</span>' : '') +
            '</div>';
        }).join('');

        content.innerHTML =
            '<h4 class="cd-manifest-section-title">Booking</h4>' +
            '<div class="cd-manifest-summary">' +
                manifestField('Booking Reference', escHtml(b.booking_reference)) +
                manifestField('Booking Status', bookingBadge(b.booking_status)) +
                manifestField('Payment Status', paymentBadge(b.payment_status)) +
                manifestField('Total Amount', 'ETB ' + formatMoney(b.total_amount)) +
                manifestField('Booked On', escHtml(b.created_at)) +
            '</div>' +
            '<h4 class="cd-manifest-section-title">Trip</h4>' +
            '<div class="cd-manifest-summary">' +
                manifestField('Route', escHtml(trip.from_city) + ' &#8594; ' + escHtml(trip.to_city)) +
                manifestField('Departure', escHtml(trip.departure_date) + ' ' + escHtml(trip.departure_time)) +
                manifestField('Arrival', trip.arrival_time ? escHtml(trip.arrival_time) : '\u2014') +
                manifestField('Bus', escHtml(trip.bus_name || '') + ' (' + escHtml(trip.bus_registration || '\u2014') + ')') +
                manifestField('Bus Type', escHtml(trip.bus_type || '\u2014')) +
            '</div>' +
            '<h4 class="cd-manifest-section-title">Passengers (' + passengers.length + ')</h4>' +
            '<div class="cd-manifest-rows">' +
                (passengers.length ? rows : '<p class="cd-manifest-empty">No passenger records for this booking.</p>') +
            '</div>';

        content.hidden = false;
    }

    function closeManifest() {
        var modal = byId('manifest-modal');
        if (modal) { modal.hidden = true; }
        var content = byId('manifest-content'); if (content) { content.hidden = true; }
        var error = byId('manifest-error'); if (error) { error.hidden = true; }
        var loading = byId('manifest-loading'); if (loading) { loading.hidden = true; }
    }

 /* Revenue / Payments (read-only reporting UI). */
    var currentPayments = [];
    var selectedRevenueDate = '';

    function paymentStatusBadge(status) {
        var val = String(status || '').toLowerCase();
        return '<span class="cd-payment-badge ' + val + '">' + escHtml(val) + '</span>';
    }

    function showRevenueError(message) {
        var loading = byId('revenue-loading'); if (loading) { loading.hidden = true; }
        var empty = byId('payment-empty'); if (empty) { empty.hidden = true; }
        var list = byId('payment-list'); if (list) { list.hidden = true; }
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
            if (list) { list.hidden = true; }
            if (empty) { empty.hidden = false; }
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
        var from = byId('revenue-from-filter'); var to = byId('revenue-to-filter'); var status = byId('revenue-status-filter');
        var fromValue = from ? from.value : ''; var toValue = to ? to.value : ''; var statusValue = status ? status.value : '';
        var label = byId('revenue-date-label');
        if (label) { label.textContent = selectedRevenueDate ? new Date(selectedRevenueDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'All upcoming departure dates'; }
        renderPayments(currentPayments.filter(function (payment) {
            return (!selectedRevenueDate || String(payment.departure_date) === selectedRevenueDate) && (!fromValue || String(payment.route_from) === fromValue) && (!toValue || String(payment.route_to) === toValue) && (!statusValue || String(payment.status) === statusValue);
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

    function loadRevenueSummary() {
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
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showRevenueError(data.message || 'Unable to load your revenue summary.');
                    return;
                }
                renderRevenueSummary(data.revenue);
            })
            .catch(function () {
                showRevenueError('Network error while loading your revenue.');
            });
    }

    function loadPayments() {
        var sec = byId('company-revenue'); if (sec) { sec.hidden = false; }
        var error = byId('revenue-error'); if (error) { error.hidden = true; }
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


        var bookingRefresh = byId('btn-refresh-bookings');
        if (bookingRefresh) { bookingRefresh.addEventListener('click', loadBookings); }

        var bookingFromFilter = byId('booking-from-filter');
        if (bookingFromFilter) { bookingFromFilter.addEventListener('change', applyBookingFilters); }
        var bookingToFilter = byId('booking-to-filter');
        if (bookingToFilter) { bookingToFilter.addEventListener('change', applyBookingFilters); }
        var clearBookingFilters = byId('btn-clear-booking-filters');
        if (clearBookingFilters) {
            clearBookingFilters.addEventListener('click', function () {
                selectedBookingDate = '';
                if (bookingFromFilter) { bookingFromFilter.value = ''; }
                if (bookingToFilter) { bookingToFilter.value = ''; }
                renderBookingDayPicker();
                applyBookingFilters();
            });
        }

        var manifestClose = byId('manifest-close');
        if (manifestClose) { manifestClose.addEventListener('click', closeManifest); }

                var manifestModal = byId('manifest-modal');
        if (manifestModal) {
            manifestModal.addEventListener('click', function (ev) {
                if (ev.target === manifestModal) { closeManifest(); }
            });
        }

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' || ev.key === 'Esc' || ev.key === 27) {
                var m = byId('manifest-modal');
                if (m && !m.hidden) { closeManifest(); }
                var busModal = byId('bus-form-modal');
                if (busModal && !busModal.hidden) { hideBusForm(); }
                var tripModal = byId('trip-form-modal');
                if (tripModal && !tripModal.hidden) { hideTripForm(); }
            }
        });

        var revRefresh = byId('btn-refresh-revenue');
        if (revRefresh) { revRefresh.addEventListener('click', refreshRevenue); }

        var revStatusFilter = byId('revenue-status-filter');
        if (revStatusFilter) { revStatusFilter.addEventListener('change', applyRevenueFilters); }
        var revFromFilter = byId('revenue-from-filter');
        if (revFromFilter) { revFromFilter.addEventListener('change', applyRevenueFilters); }
        var revToFilter = byId('revenue-to-filter');
        if (revToFilter) { revToFilter.addEventListener('change', applyRevenueFilters); }
        var clearRevenueFilters = byId('btn-clear-revenue-filters');
        if (clearRevenueFilters) {
            clearRevenueFilters.addEventListener('click', function () {
                selectedRevenueDate = '';
                if (revStatusFilter) { revStatusFilter.value = ''; }
                if (revFromFilter) { revFromFilter.value = ''; }
                if (revToFilter) { revToFilter.value = ''; }
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
