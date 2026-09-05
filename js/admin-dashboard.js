/* ============================================================
   ET Transport â€” admin-dashboard.js
   Admin operator dashboard: platform overview + company
   application lifecycle controls.

   Every read comes from api/admin.php and every mutation is a POST
   to api/admin.php?action=company_* with ONLY { company_id }. The
   server session role is authoritative; this client never sends
   role/user_id/status and never trusts a browser-supplied status.
   ============================================================ */

(function () {
    'use strict';

    function byId(id) {
        return document.getElementById(id);
    }

    function hide(el) {
        if (el) { el.hidden = true; }
    }

    function show(el) {
        if (el) { el.hidden = false; }
    }

    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatMoney(value) {
        var num = Number(value);
        if (isNaN(num)) { return '0'; }
        return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    function formatDate(s) {
        if (!s) { return '\u2014'; }
        return String(s).slice(0, 10);
    }

    function setError(el, message) {
        if (!el) { return; }
        show(el);
        el.className = 'auth-message error';
        el.textContent = message || 'Something went wrong.';
    }

    function parseJson(res) {
        return res.json().catch(function () {
            return { success: false, message: 'Invalid server response.' };
        }).then(function (json) {
            return { ok: res.ok, status: res.status, data: json };
        });
    }

    function badgeClass(status) {
        return 'ad-badge ' + String(status == null ? '' : status);
    }

    var currentCompanies = [];
    var currentDetail = null;
    var pendingMutation = null;
    var selectedCompanyStatus = '';   // active status filter button value ('' = All)

    /* ---------- Admin identity ---------- */
    function loadIdentity() {
        if (!window.ETAuth || !window.ETAuth.getCurrentUser) { return; }
        window.ETAuth.getCurrentUser().then(function (user) {
            var el = byId('ad-admin-identity');
            if (el && user) {
                el.textContent = 'Signed in as ' + user.name + ' (' + user.role + ')';
                show(el);
            }
        }).catch(function () { /* non-fatal */ });
    }

    /* ---------- Overview ---------- */
    var adOverviewRequestId = 0;   // discards responses from superseded overview requests

    function loadOverview() {
        var rid = ++adOverviewRequestId;
        show(byId('section-overview'));
        hide(byId('ad-error'));

        fetch('api/admin.php?action=overview', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(parseJson)
            .then(function (result) {
                if (rid !== adOverviewRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    setError(byId('ad-error'), data.message || 'Unable to load the platform overview.');
                    return;
                }

                var map = {
                    totalCompanies: 'ad-stat-totalCompanies',
                    pendingCompanies: 'ad-stat-pendingCompanies',
                    approvedCompanies: 'ad-stat-approvedCompanies',
                    rejectedCompanies: 'ad-stat-rejectedCompanies',
                    suspendedCompanies: 'ad-stat-suspendedCompanies',
                    totalCompanyUsers: 'ad-stat-totalCompanyUsers',
                    totalBuses: 'ad-stat-totalBuses',
                    totalTrips: 'ad-stat-totalTrips',
                    totalBookings: 'ad-stat-totalBookings',
                    totalPaidRevenue: 'ad-stat-totalPaidRevenue'
                };

                Object.keys(map).forEach(function (key) {
                    var el = byId(map[key]);
                    if (!el) { return; }
                    var value = data.overview ? data.overview[key] : 0;
                    el.textContent = key === 'totalPaidRevenue' ? formatMoney(value) : String(value == null ? 0 : value);
                });
            })
            .catch(function () {
                if (rid !== adOverviewRequestId) { return; }
                setError(byId('ad-error'), 'Network error while loading the platform overview.');
            });
    }
/* ---------- Company list ---------- */
    function renderCompanies(companies) {
        currentCompanies = Array.isArray(companies) ? companies : [];
        applyFilter();
    }

    /* Mark one status filter button active and re-render the table. */
    function setCompanyStatusFilter(value) {
        selectedCompanyStatus = value || '';
        var buttons = document.querySelectorAll('.ad-status-filter[data-status-filter]');
        for (var i = 0; i < buttons.length; i++) {
            var active = (buttons[i].getAttribute('data-status-filter') || '') === selectedCompanyStatus;
            buttons[i].classList.toggle('is-active', active);
            buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        applyFilter();
    }

    function applyFilter() {
        var tbody = byId('ad-company-rows');
        if (!tbody) { return; }

        var filter = selectedCompanyStatus;

        var filtered = currentCompanies.filter(function (c) {
            return filter === '' || c.status === filter;
        });

        hide(byId('ad-list-loading'));
        hide(byId('ad-list-error'));

        var empty = byId('ad-list-empty');
        var table = byId('ad-company-table');

        tbody.innerHTML = '';
        if (!filtered.length) {
            show(empty);
            if (table) { table.hidden = true; }
            return;
        }

        hide(empty);
        if (table) { table.hidden = false; }

        var html = filtered.map(function (c) {
            var rating = c.review_count > 0 ? (c.avg_rating + ' (' + c.review_count + ')') : '\u2014';
            return '<tr data-company-id="' + c.id + '" data-status="' + escHtml(c.status) + '">' +
                '<td>' +
                    '<div class="ad-co-name">' +
                        (c.logo ? '<img class="ad-co-logo" src="' + escHtml(c.logo) + '" alt="">' : '') +
                        '<span>' + escHtml(c.name) + '</span>' +
                    '</div>' +
                    '<span class="ad-co-slug">@' + escHtml(c.slug) + '</span>' +
                '</td>' +
                '<td><span class="' + badgeClass(c.status) + '">' + escHtml(c.status) + '</span></td>' +
                '<td><span class="' + badgeClass(c.account_status) + '">' + escHtml(c.account_status) + '</span></td>' +
                '<td>' + c.bus_count + '</td>' +
                '<td>' + c.trip_count + '</td>' +
                '<td>' + c.booking_count + '</td>' +
                '<td>' + rating + '</td>' +
                '<td>' + formatDate(c.created_at) + '</td>' +
                '<td><button type="button" class="btn btn-secondary btn-sm" data-view="' + c.id + '">View</button></td>' +
            '</tr>';
        }).join('');

        tbody.innerHTML = html;
        wireRowEvents();
    }

    function wireRowEvents() {
        var buttons = document.querySelectorAll('#ad-company-rows button[data-view]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function () {
                var id = parseInt(this.getAttribute('data-view'), 10);
                if (id > 0) { openDetail(id); }
            });
        }
    }

    var adCompaniesRequestId = 0;   // discards responses from superseded company list requests

    function loadCompanies() {
        var rid = ++adCompaniesRequestId;
        show(byId('ad-list-loading'));
        hide(byId('ad-list-error'));
        hide(byId('ad-list-empty'));

        fetch('api/admin.php?action=companies', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(parseJson)
            .then(function (result) {
                if (rid !== adCompaniesRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    hide(byId('ad-list-loading'));
                    setError(byId('ad-list-error'), data.message || 'Unable to load companies.');
                    return;
                }
                renderCompanies(data.companies || []);
            })
            .catch(function () {
                if (rid !== adCompaniesRequestId) { return; }
                hide(byId('ad-list-loading'));
                setError(byId('ad-list-error'), 'Network error while loading companies.');
            });
    }

    /* ---------- Company detail ---------- */
    function openDetail(id) {
        var body = byId('ad-detail-body');
        var section = byId('section-detail');
        if (section) { section.hidden = false; }
        show(byId('ad-detail-loading'));
        hide(body);
        hide(byId('ad-detail-error'));

        fetch('api/admin.php?action=company&id=' + encodeURIComponent(id), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(parseJson)
            .then(function (result) {
                hide(byId('ad-detail-loading'));
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    hide(body);
                    setError(byId('ad-detail-error'), data.message || 'Unable to load the company.');
                    return;
                }
                renderDetail(data.company);
            })
            .catch(function () {
                hide(byId('ad-detail-loading'));
                hide(body);
                setError(byId('ad-detail-error'), 'Network error while loading the company.');
            });
    }

    function setText(id, value) {
        var el = byId(id);
        if (el) { el.textContent = value; }
    }
function renderDetail(c) {
        if (!c) { return; }
        currentDetail = c;

        setText('ad-detail-title', 'Company Detail \u2014 ' + c.name);
        setText('ad-detail-name', c.name);
        setText('ad-detail-slug', '@' + (c.slug || ''));

        var st = byId('ad-detail-status');
        if (st) {
            st.className = badgeClass(c.status);
            st.textContent = c.status ? c.status.toUpperCase() : '';
        }
        var ac = byId('ad-detail-account-status');
        if (ac) {
            ac.className = badgeClass(c.account_status);
            ac.textContent = c.account_status ? c.account_status.toUpperCase() : '';
        }

        var logo = byId('ad-detail-logo');
        if (logo) {
            if (c.logo) {
                logo.src = c.logo;
                show(logo);
            } else {
                logo.removeAttribute('src');
                hide(logo);
            }
        }

        setText('ad-detail-owner', c.owner_name || '\u2014');
        setText('ad-detail-email', c.owner_email || '\u2014');
        setText('ad-detail-phone', c.phone || c.owner_phone || '\u2014');
        setText('ad-detail-address', c.address || '\u2014');
        setText('ad-detail-buses', String(c.bus_count));
        setText('ad-detail-trips', String(c.trip_count));
        setText('ad-detail-bookings', String(c.booking_count));
        setText('ad-detail-passengers', String(c.passenger_count));
        setText('ad-detail-rating', c.review_count > 0 ? (c.avg_rating + ' / 5 (' + c.review_count + ')') : '\u2014');
        setText('ad-detail-revenue', formatMoney(c.total_paid_revenue));
        setText('ad-detail-created', formatDate(c.created_at));
        setText('ad-detail-updated', formatDate(c.updated_at));
        setText('ad-detail-description', c.description || '');

        renderActions(c);
        show(byId('ad-detail-body'));
    }

    function renderActions(c) {
        var box = byId('ad-detail-actions');
        if (!box) { return; }
        box.innerHTML = '';

        var actions = [];
        if (c.status === 'pending') {
            actions = [
                { action: 'approve', label: 'Approve', cls: 'btn-primary' },
                { action: 'reject', label: 'Reject', cls: 'btn-secondary' }
            ];
        } else if (c.status === 'approved') {
            actions = [
                { action: 'suspend', label: 'Suspend', cls: 'btn-secondary' },
                { action: 'reject', label: 'Reject', cls: 'btn-secondary' }
            ];
        } else if (c.status === 'suspended') {
            actions = [
                { action: 'activate', label: 'Activate', cls: 'btn-primary' }
            ];
        }

        if (!actions.length) {
            box.textContent = 'No actions are available for this status.';
            return;
        }

        actions.forEach(function (a) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn ' + a.cls + ' btn-sm ad-action';
            b.setAttribute('data-action', a.action);
            b.textContent = a.label;
            b.addEventListener('click', function () {
                askConfirmation(a.action);
            });
            box.appendChild(b);
        });
    }
/* ---------- Confirmation modal (never mutate on a single click) ---------- */
    function askConfirmation(action) {
        if (!currentDetail) { return; }

        var titles = {
            approve: 'Approve this company?',
            reject: 'Reject this company?',
            suspend: 'Suspend this company?',
            activate: 'Activate this company?'
        };
        var messages = {
            approve: 'Approve "' + currentDetail.name + '"? The owner will be able to sign in and manage the company immediately.',
            reject: 'Reject "' + currentDetail.name + '"? The owner will lose access permanently and login stays blocked.',
            suspend: 'Suspend "' + currentDetail.name + '"? Trips and data are kept, but the owner will not be able to sign in.',
            activate: 'Reactivate "' + currentDetail.name + '"? The owner will be able to sign in again.'
        };

        setText('ad-modal-title', titles[action] || 'Confirm action');
        setText('ad-modal-message', messages[action] || 'Continue with this action?');

        pendingMutation = { action: action, companyId: currentDetail.id };
        show(byId('ad-modal'));
    }

    function closeModal() {
        pendingMutation = null;
        hide(byId('ad-modal'));
    }

    function runMutation(action, companyId) {
        var confirmBtn = byId('ad-modal-confirm');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Working\u2026';
        }

        fetch('api/admin.php?action=company_' + action, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ company_id: companyId })
        })
            .then(parseJson)
            .then(function (result) {
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm';
                }

                var data = result.data || {};
                closeModal();

                if (!result.ok || result.status !== 200 || !data.success) {
                    setError(byId('ad-detail-error'), data.message || 'The action could not be completed.');
                    loadCompanies();
                    return;
                }

                if (data.company) {
                    renderDetail(data.company);
                }
                loadOverview();
                loadCompanies();
            })
            .catch(function () {
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm';
                }
                closeModal();
                setError(byId('ad-detail-error'), 'Network error while applying the action.');
            });
    }

    function closeDetail() {
        currentDetail = null;
        hide(byId('section-detail'));
    }

 /* ---------- read-only operational oversight ---------- */
    var sectionMap = {
        overview: ['section-overview'],
        companies: ['section-companies'],
        passengers: ['section-bookings'],
        revenue: ['section-trips'],
        reviews: ['section-reviews']
    };

    function setActiveTab(name) {
        var tabs = document.querySelectorAll('#ad-tabs .ad-tab');
        for (var i = 0; i < tabs.length; i++) {
            var selected = tabs[i].getAttribute('data-section') === name;
            tabs[i].className = 'ad-tab' + (selected ? ' active' : '');
            tabs[i].setAttribute('aria-selected', selected ? 'true' : 'false');
        }
    }

    function switchSection(name) {
        var map = sectionMap[name] || ['section-overview', 'section-companies'];
        var all = ['section-overview', 'section-companies', 'section-detail', 'section-trips', 'section-bookings', 'section-reviews'];
        for (var i = 0; i < all.length; i++) {
            hide(byId(all[i]));
        }
        for (var j = 0; j < map.length; j++) {
            var el = byId(map[j]);
            if (el) { show(el); }
        }
        setActiveTab(name);
        if (name === 'revenue') { loadTrips(); }
        if (name === 'passengers') { loadBookings(); }
        if (name === 'reviews') { renderReviews(); }
    }

    function renderReviews() {
        var grid = byId('ad-review-grid');
        var empty = byId('ad-reviews-empty');
        if (!grid) { return; }
        var reviewed = currentCompanies.filter(function (company) { return Number(company.review_count) > 0; });
        if (!reviewed.length) { grid.innerHTML = ''; show(empty); return; }
        hide(empty);
        grid.innerHTML = reviewed.map(function (company) {
            var rating = Math.max(0, Math.min(5, Math.round(Number(company.avg_rating) || 0)));
            return '<article class="ad-review-card"><h3>' + escHtml(company.name) + '</h3><p class="ad-stars" aria-label="' + rating + ' out of 5 stars">' + '★'.repeat(rating) + '☆'.repeat(5 - rating) + '</p><p>' + escHtml(company.avg_rating) + ' average from ' + escHtml(company.review_count) + ' approved review' + (Number(company.review_count) === 1 ? '' : 's') + '.</p></article>';
        }).join('');
    }

    function populateCompanyFilters() {
        fetch('api/admin.php?action=companies', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        }).then(parseJson).then(function (result) {
            var data = result.data || {};
            var list = data.companies || [];
            ['ad-trip-company', 'ad-booking-company'].forEach(function (id) {
                var sel = byId(id);
                if (!sel) { return; }
                sel.innerHTML = '<option value="">All companies</option>';
                list.forEach(function (c) {
                    var o = document.createElement('option');
                    o.value = c.id;
                    o.textContent = c.name;
                    sel.appendChild(o);
                });
            });
        }).catch(function () { /* non-fatal */ });
    }

    function currentTripsQuery() {
        var p = [];
        var co = byId('ad-trip-company'); if (co && co.value) { p.push('company_id=' + encodeURIComponent(co.value)); }
        var st = byId('ad-trip-status'); if (st && st.value) { p.push('status=' + encodeURIComponent(st.value)); }
        var df = byId('ad-trip-date-from'); if (df && df.value) { p.push('date_from=' + encodeURIComponent(df.value)); }
        var dt = byId('ad-trip-date-to'); if (dt && dt.value) { p.push('date_to=' + encodeURIComponent(dt.value)); }
        return p.length ? '&' + p.join('&') : '';
    }

    var adTripsRequestId = 0;   // discards responses from superseded trip requests

    function loadTrips() {
        var rid = ++adTripsRequestId;
        show(byId('ad-trips-loading'));
        hide(byId('ad-trips-error'));
        hide(byId('ad-trips-empty'));
        fetch('api/admin.php?action=trips' + currentTripsQuery(), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        }).then(parseJson).then(function (result) {
            hide(byId('ad-trips-loading'));
            if (rid !== adTripsRequestId) { return; }
            var data = result.data || {};
            if (!result.ok || result.status !== 200 || !data.success) {
                setError(byId('ad-trips-error'), data.message || 'Unable to load trips.');
                return;
            }
            renderTrips(data.trips || []);
        }).catch(function () {
            if (rid !== adTripsRequestId) { return; }
            hide(byId('ad-trips-loading'));
            setError(byId('ad-trips-error'), 'Network error while loading trips.');
        });
    }

        function renderTrips(trips) {
        var body = byId('ad-trips-rows');
        var empty = byId('ad-trips-empty');
        if (!trips.length) { body.innerHTML = ''; show(empty); return; }
        hide(empty);
        var html = '';
        trips.forEach(function (t) {
            var cancelledNote = '';
            var affectedCount = parseInt(t.affected_booking_count, 10) || 0;
            if (t.status === 'cancelled' && affectedCount > 0) {
                var refundCount = parseInt(t.refund_required, 10) || 0;
                cancelledNote = affectedCount + ' cancelled booking(s)' +
                    (refundCount > 0 ? ' &middot; ' + refundCount + ' refund required' : '');
            }
            html += '<tr>' +
                '<td><span class="ad-co-name">' + escHtml(t.company_name) + '</span><span class="ad-sub">#' + t.company_id + '</span></td>' +
                '<td><span class="ad-route">' + escHtml(t.from_city) + ' \u2192 ' + escHtml(t.to_city) + '</span><span class="ad-sub">' + (t.route_duration != null ? t.route_duration + ' min' : '\u2014') + '</span></td>' +
                '<td>' + escHtml(t.bus_name || '\u2014') + '<span class="ad-sub">' + escHtml(t.bus_registration || '') + ' \u00b7 ' + escHtml(t.bus_type || '') + '</span></td>' +
                '<td>' + formatDate(t.departure_date) + '<span class="ad-sub">' + String(t.departure_time || '').slice(0, 5) + '</span></td>' +
                '<td>' + (t.arrival_time ? String(t.arrival_time).slice(0, 5) : '\u2014') + '</td>' +
                '<td>' + formatMoney(t.price) + '</td>' +
                '<td>' + t.seat_capacity + '</td>' +
                '<td>' + t.booked_seats + '</td>' +
                '<td>' + t.available_seats + '</td>' +
                (cancelledNote ? '<td class="ad-cancelled-note">' + cancelledNote + '</td>' : '<td></td>') +
                '<td><span class="ad-badge ' + badgeClass(t.status) + '">' + escHtml(t.status || '') + '</span></td>' +
                '</tr>';
        });
        body.innerHTML = html;
    }

    function currentBookingsQuery() {
        var p = [];
        var co = byId('ad-booking-company'); if (co && co.value) { p.push('company_id=' + encodeURIComponent(co.value)); }
        var tr = byId('ad-booking-trip'); if (tr && tr.value) { p.push('trip_id=' + encodeURIComponent(tr.value)); }
        var bs = byId('ad-booking-status'); if (bs && bs.value) { p.push('booking_status=' + encodeURIComponent(bs.value)); }
        var ps = byId('ad-payment-status'); if (ps && ps.value) { p.push('payment_status=' + encodeURIComponent(ps.value)); }
        var df = byId('ad-booking-date-from'); if (df && df.value) { p.push('date_from=' + encodeURIComponent(df.value)); }
        var dt = byId('ad-booking-date-to'); if (dt && dt.value) { p.push('date_to=' + encodeURIComponent(dt.value)); }
        return p.length ? '&' + p.join('&') : '';
    }

    var adBookingsRequestId = 0;   // discards responses from superseded booking requests

    function loadBookings() {
        var rid = ++adBookingsRequestId;
        show(byId('ad-bookings-loading'));
        hide(byId('ad-bookings-error'));
        hide(byId('ad-bookings-empty'));
        fetch('api/admin.php?action=bookings' + currentBookingsQuery(), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        }).then(parseJson).then(function (result) {
            hide(byId('ad-bookings-loading'));
            if (rid !== adBookingsRequestId) { return; }
            var data = result.data || {};
            if (!result.ok || result.status !== 200 || !data.success) {
                setError(byId('ad-bookings-error'), data.message || 'Unable to load bookings.');
                return;
            }
            renderBookings(data.bookings || []);
        }).catch(function () {
            if (rid !== adBookingsRequestId) { return; }
            hide(byId('ad-bookings-loading'));
            setError(byId('ad-bookings-error'), 'Network error while loading bookings.');
        });
    }

        function renderBookings(bookings) {
        var body = byId('ad-bookings-rows');
        var empty = byId('ad-bookings-empty');
        if (!bookings.length) { body.innerHTML = ''; show(empty); return; }
        hide(empty);
        var html = '';
        bookings.forEach(function (b) {
            html += '<tr data-booking-id="' + b.id + '">' +
                '<td>' + escHtml(b.booking_reference) + '</td>' +
                '<td><span class="ad-co-name">' + escHtml(b.company_name) + '</span><span class="ad-sub">#' + b.company_id + '</span></td>' +
                '<td><span class="ad-route">' + escHtml(b.route_from) + ' \u2192 ' + escHtml(b.route_to) + '</span></td>' +
                '<td>' + formatDate(b.departure_date) + '<span class="ad-sub">' + String(b.departure_time || '').slice(0, 5) + '</span></td>' +
                '<td>' + escHtml(b.bus_name || '\u2014') + '<span class="ad-sub">' + escHtml(b.bus_registration || '') + '</span></td>' +
                '<td>' + b.passenger_count + '</td>' +
                '<td>' + formatMoney(b.total_amount) + '</td>' +
                '<td><span class="ad-badge ' + badgeClass(b.booking_status) + '">' + escHtml(b.booking_status || '') + '</span></td>' +
                '<td><span class="ad-badge ' + badgeClass(b.payment_status) + '">' + escHtml(b.payment_status || '') + '</span></td>' +
                '<td>' + formatDate(b.created_at) + '</td>' +
                '<td><button type="button" class="btn btn-secondary btn-sm" data-manifest="' + b.id + '">View Manifest</button></td>' +
                '</tr>';
        });
        body.innerHTML = html;
        var buttons = body.querySelectorAll('button[data-manifest]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function () {
                var id = parseInt(this.getAttribute('data-manifest'), 10);
                if (id > 0) { openManifest(id); }
            });
        }
    }

    function manifestField(k, v) {
        return '<div class="ad-manifest-grid-item"><span class="k">' + escHtml(k) + '</span><span class="v">' + escHtml(v == null ? '\u2014' : v) + '</span></div>';
    }

    function openManifest(id) {
        var modal = byId('ad-manifest-modal');
        var content = byId('ad-manifest-content');
        if (modal) { modal.hidden = false; }
        show(byId('ad-manifest-loading'));
        hide(byId('ad-manifest-error'));
        hide(content);
        fetch('api/admin.php?action=manifest&booking_id=' + encodeURIComponent(id), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        }).then(parseJson).then(function (result) {
            hide(byId('ad-manifest-loading'));
            var data = result.data || {};
            if (!result.ok || result.status !== 200 || !data.success) {
                hide(content);
                setError(byId('ad-manifest-error'), data.message || 'Unable to load the manifest.');
                return;
            }
            renderManifest(data);
        }).catch(function () {
            hide(byId('ad-manifest-loading'));
            hide(content);
            setError(byId('ad-manifest-error'), 'Network error while loading the manifest.');
        });
    }

    function renderManifest(resp) {
        var content = byId('ad-manifest-content');
        show(content);
        var b = resp.booking || {};
        var t = resp.trip || {};
        var pax = resp.passengers || [];
        byId('ad-manifest-booking').innerHTML =
            manifestField('Reference', b.booking_reference) +
            manifestField('Booking Status', b.booking_status) +
            manifestField('Payment Status', b.payment_status) +
            manifestField('Total (ETB)', formatMoney(b.total_amount)) +
            manifestField('Created', b.created_at);
        byId('ad-manifest-trip').innerHTML =
            manifestField('Company', t.company_name) +
            manifestField('Route', (t.from_city || '') + ' \u2192 ' + (t.to_city || '')) +
            manifestField('Departure', formatDate(t.departure_date) + ' ' + String(t.departure_time || '').slice(0, 5)) +
            manifestField('Arrival', t.arrival_time ? String(t.arrival_time).slice(0, 5) : '\u2014') +
            manifestField('Bus', t.bus_name + (t.bus_registration ? ' (' + t.bus_registration + ')' : '') + ' \u00b7 ' + (t.bus_type || ''));
        var pbody = byId('ad-manifest-passengers');
        if (!pax.length) {
            pbody.innerHTML = '<tr><td colspan="5" class="ad-muted">No passenger records for this booking.</td></tr>';
        } else {
            var html = '';
            pax.forEach(function (p) {
                html += '<tr class="ad-manifest-row">' +
                    '<td>' + escHtml(p.seat_number == null ? '\u2014' : p.seat_number) + '</td>' +
                    '<td>' + escHtml(p.name) + '</td>' +
                    '<td>' + (p.age == null ? '\u2014' : p.age) + '</td>' +
                    '<td>' + escHtml(p.gender || '\u2014') + '</td>' +
                    '<td>' + escHtml(p.phone || '\u2014') + '</td>' +
                    '</tr>';
            });
            pbody.innerHTML = html;
        }
    }

    function closeManifest() {
        var modal = byId('ad-manifest-modal');
        if (modal) { modal.hidden = true; }
    }

    /* ---------- Add company (same flow as a public company registration) ---------- */
    function openAddCompany() {
        var modal = byId('ad-add-company-modal');
        if (!modal) { return; }
        var form = byId('ad-add-company-form');
        if (form) { form.reset(); }
        hide(byId('ad-add-company-error'));
        modal.hidden = false;
        var first = byId('add-company-name');
        if (first) { first.focus(); }
    }

    function closeAddCompany() {
        var modal = byId('ad-add-company-modal');
        if (modal) { modal.hidden = true; }
    }

    function submitAddCompany(e) {
        e.preventDefault();

        var msg = byId('ad-add-company-error');
        var submitBtn = byId('btn-add-company-submit');

        var name = byId('add-company-name').value.trim();
        var email = byId('add-company-email').value.trim();
        var phone = byId('add-company-phone').value.trim();
        var password = byId('add-company-password').value;
        var confirm = byId('add-company-confirm').value;
        var companyName = byId('add-company-company-name').value.trim();
        var companyAddress = byId('add-company-address').value.trim();
        var companyDescription = byId('add-company-description').value.trim();

        function fail(message) {
            setError(msg, message);
            return;
        }

        /* Mirrors the validation the public register form + api/auth.php apply. */
        if (name.length < 2) { return fail('Please enter a valid full name.'); }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { return fail('Please enter a valid email address.'); }
        if (phone !== '' && !/^[+0-9][0-9\-]{6,20}$/.test(phone)) { return fail('Please enter a valid phone number.'); }
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
            return fail('Password must be at least 8 characters and include letters and numbers.');
        }
        if (confirm === '' || confirm !== password) { return fail('Password confirmation does not match.'); }
        if (companyName.length < 2) { return fail('Company name is required.'); }
        if (companyAddress === '') { return fail('Company address is required.'); }

        hide(msg);
        if (submitBtn) { submitBtn.disabled = true; }

        /* Same endpoint + payload the public company registration posts to. */
        var payload = {
            role: 'company',
            name: name,
            email: email,
            phone: phone,
            password: password,
            password_confirmation: confirm,
            company_name: companyName,
            company_address: companyAddress,
            company_description: companyDescription
        };

        var data = new FormData();
        Object.keys(payload).forEach(function (key) {
            data.append(key, payload[key]);
        });

        fetch('api/auth.php?action=register', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
            body: data
        })
            .then(parseJson)
            .then(function (result) {
                var res = result.data || {};
                if (!result.ok || !res.success) {
                    if (submitBtn) { submitBtn.disabled = false; }
                    setError(msg, res.message || 'Unable to create the company account.');
                    return;
                }
                closeAddCompany();
                loadCompanies();
                loadOverview();
            })
            .catch(function () {
                if (submitBtn) { submitBtn.disabled = false; }
                setError(msg, 'Could not reach the server. Please try again.');
            });
    }

    /* ---------- Wiring ---------- */
    function init() {
        loadIdentity();
        loadOverview();
        loadCompanies();
        /* Pre-load trips/bookings into their hidden tables so the tbody is
           already populated when an operator opens the section. This avoids
           an empty flash while the first fetch resolves. The sections stay
           hidden until clicked (switchSection toggles visibility). */
        loadTrips();
        loadBookings();

        /* Status pill buttons (All / Pending / Approved / Suspended / Rejected). */
        var statusBtns = document.querySelectorAll('.ad-status-filter[data-status-filter]');
        for (var si = 0; si < statusBtns.length; si++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    setCompanyStatusFilter(btn.getAttribute('data-status-filter') || '');
                });
            })(statusBtns[si]);
        }

        var refreshOverview = byId('btn-refresh-overview');
        if (refreshOverview) { refreshOverview.addEventListener('click', loadOverview); }

        var addCompanyBtn = byId('btn-add-company');
        if (addCompanyBtn) { addCompanyBtn.addEventListener('click', openAddCompany); }

        var addCompanyClose = byId('btn-add-company-close');
        if (addCompanyClose) { addCompanyClose.addEventListener('click', closeAddCompany); }

        var addCompanyCancel = byId('btn-add-company-cancel');
        if (addCompanyCancel) { addCompanyCancel.addEventListener('click', closeAddCompany); }

        var addCompanyModal = byId('ad-add-company-modal');
        if (addCompanyModal) {
            addCompanyModal.addEventListener('click', function (e) {
                if (e.target === addCompanyModal) { closeAddCompany(); }
            });
        }

        var addCompanyForm = byId('ad-add-company-form');
        if (addCompanyForm) { addCompanyForm.addEventListener('submit', submitAddCompany); }

        var refreshReviews = byId('btn-refresh-reviews');
        if (refreshReviews) {
            refreshReviews.addEventListener('click', function () {
                loadCompanies();
                window.setTimeout(renderReviews, 300);
            });
        }

        var closeBtn = byId('btn-close-detail');
        if (closeBtn) { closeBtn.addEventListener('click', closeDetail); }

        var modalCancel = byId('ad-modal-cancel');
        if (modalCancel) { modalCancel.addEventListener('click', closeModal); }

                        var modalConfirm = byId('ad-modal-confirm');
        if (modalConfirm) {
            modalConfirm.addEventListener('click', function () {
                var m = pendingMutation;
                if (!m) { return; }
                pendingMutation = null;
                runMutation(m.action, m.companyId);
            });
        }

 /* ---- wiring: tabs, filters, refresh, manifest ---- */
        var tabBtns = document.querySelectorAll('#ad-tabs .ad-tab');
        for (var ti = 0; ti < tabBtns.length; ti++) {
            tabBtns[ti].addEventListener('click', function () {
                switchSection(this.getAttribute('data-section'));
            });
        }

        var applyTrips = byId('btn-apply-trips'); if (applyTrips) { applyTrips.addEventListener('click', loadTrips); }
        var refreshTrips = byId('btn-refresh-trips'); if (refreshTrips) { refreshTrips.addEventListener('click', loadTrips); }
        var applyBook = byId('btn-apply-bookings'); if (applyBook) { applyBook.addEventListener('click', loadBookings); }
        var refreshBook = byId('btn-refresh-bookings'); if (refreshBook) { refreshBook.addEventListener('click', loadBookings); }

        var manClose = byId('ad-manifest-close'); if (manClose) { manClose.addEventListener('click', closeManifest); }
        var manModal = byId('ad-manifest-modal');
        if (manModal) {
            manModal.addEventListener('click', function (e) {
                if (e.target === manModal) { closeManifest(); }
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeManifest();
                closeAddCompany();
            }
        });

        populateCompanyFilters();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
