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

    function debounce(fn, wait) {
        var t = null;
        return function () {
            var context = this;
            var args = arguments;
            if (t) { clearTimeout(t); }
            t = setTimeout(function () {
                t = null;
                fn.apply(context, args);
            }, wait);
        };
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

    /* A shared, non-blocking completion message for actions that close an
       admin modal. It uses the site's existing toast styling and is created
       only once, so no page markup is required. */
    function toast(message) {
        var el = byId('admin-dash-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'admin-dash-toast';
            el.className = 'dash-toast';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.classList.add('show');
        window.clearTimeout(el._toastTimer);
        el._toastTimer = window.setTimeout(function () { el.classList.remove('show'); }, 3500);
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

    /* Display bucket for the status filter pills. "Approved" shows only
       approved + account-active companies; suspended companies (approval
       stays 'approved', account becomes 'suspended') appear under their own
       bucket. Legacy rows that still carry companies.status='suspended' are
       also bucketed as suspended. */
    function companyBucket(c) {
        if (!c) { return ''; }
        if (c.status === 'approved' && c.account_status === 'suspended') { return 'suspended'; }
        if (c.status === 'suspended') { return 'suspended'; }
        return c.status || '';
    }

    var REASON_SUGGESTIONS = [
        'Not Enough Information Submitted',
        'Incomplete Company Profile',
        'Invalid Company Information',
        'Documents Could Not Be Verified',
        'Duplicate Company Account',
        'Company Information Does Not Match',
        'Violation of Platform Rules',
        'Suspicious or Fraudulent Activity',
        'Repeated Customer Complaints',
        'Inactive Company',
        'Temporary Suspension for Review',
        'Other'
    ];
    var pendingReasonData = null;   // { action, companyId }
    var selectedReasonChip = null;

    var currentCompanies = [];
    var currentDetail = null;
    var pendingMutation = null;
    var selectedCompanyStatus = '';   // active status filter button value ('' = All)
    var selectedCompanySearch = '';   // live company name/slug/email search term

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

        /* Keep the Reviews section fresh when it is the active tab. */
        var reviewsSection = byId('section-reviews');
        if (reviewsSection && !reviewsSection.hidden) {
            loadReviews();
        }
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
        var term = selectedCompanySearch.toLowerCase();

        var filtered = currentCompanies.filter(function (c) {
            if (filter !== '' && companyBucket(c) !== filter) { return false; }
            if (term) {
                var hay = ((c.name || '') + ' ' + (c.slug || '') + ' ' + (c.email || '') + ' ' + (c.owner_name || '') + ' ' + (c.owner_email || '')).toLowerCase();
                if (hay.indexOf(term) === -1) { return false; }
            }
            return true;
        });

        var cnt = byId('ad-company-count');
        if (cnt) { cnt.textContent = filtered.length + ' compan' + (filtered.length === 1 ? 'y' : 'ies'); }

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
            var bucket = companyBucket(c);
            return '<tr data-company-id="' + c.id + '" data-status="' + escHtml(bucket) + '">' +
                '<td>' +
                    '<div class="ad-co-name">' +
                        (c.logo ? '<img class="ad-co-logo" src="' + escHtml(c.logo) + '" alt="">' : '') +
                        '<span>' + escHtml(c.name) + '</span>' +
                    '</div>' +
                    '<span class="ad-co-slug">@' + escHtml(c.slug) + '</span>' +
                '</td>' +
                '<td><span class="' + badgeClass(bucket) + '">' + escHtml(bucket) + '</span></td>' +
                '<td><span class="' + badgeClass(c.account_status) + '">' + escHtml(c.account_status) + '</span></td>' +
                '<td>' + c.bus_count + '</td>' +
                '<td>' + c.trip_count + '</td>' +
                '<td>' + c.booking_count + '</td>' +
                '<td>' + rating + '</td>' +
                '<td>' + formatDate(c.created_at) + '</td>' +
                '<td><button type="button" class="btn btn-secondary btn-sm" data-manage="' + c.id + '">Manage</button></td>' +
            '</tr>';
        }).join('');

        tbody.innerHTML = html;
        wireRowEvents();
    }

    function wireRowEvents() {
        var buttons = document.querySelectorAll('#ad-company-rows button[data-manage]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function () {
                var id = parseInt(this.getAttribute('data-manage'), 10);
                if (id > 0) { openManage(id); }
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
            var bucket = companyBucket(c);
            st.className = badgeClass(bucket);
            st.textContent = bucket ? bucket.toUpperCase() : '';
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
        var bucket = companyBucket(c);
        if (bucket === 'pending') {
            actions = [
                { action: 'approve', label: 'Approve', cls: 'btn-primary' },
                { action: 'reject', label: 'Reject', cls: 'btn-secondary' }
            ];
        } else if (bucket === 'approved') {
            actions = [
                { action: 'suspend', label: 'Suspend', cls: 'btn-secondary' }
            ];
        } else if (bucket === 'suspended') {
            actions = [
                { action: 'activate', label: 'Unsuspend', cls: 'btn-primary' }
            ];
        } else if (bucket === 'rejected') {
            actions = [
                { action: 'approve', label: 'Approve', cls: 'btn-primary' }
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
                if (a.action === 'reject' || a.action === 'suspend') {
                    openReasonModal(a.action);
                } else {
                    askConfirmation(a.action);
                }
            });
            box.appendChild(b);
        });
    }
/* ---------- Manage company modal (Suspend / Activate / Delete / List-Unlist) ---------- */
    function openManage(id) {
        var modal = byId('ad-manage-modal');
        if (!modal) { return; }

        hide(byId('ad-manage-error'));
        hide(byId('ad-manage-body'));
        modal.hidden = false;

        fetch('api/admin.php?action=company&id=' + encodeURIComponent(id), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(parseJson)
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    setError(byId('ad-manage-error'), data.message || 'Unable to load the company.');
                    return;
                }
                currentDetail = data.company;
                renderManage(data.company);
                show(byId('ad-manage-body'));
            })
            .catch(function () {
                setError(byId('ad-manage-error'), 'Network error while loading the company.');
            });
    }

    function renderManage(c) {
        if (!c) { return; }

        var bucket = companyBucket(c);

        setText('ad-manage-title', 'Manage Company');
        setText('ad-manage-sub', c.name + ' \u00b7 @' + (c.slug || ''));

        var logo = byId('ad-manage-logo');
        if (logo) {
            if (c.logo) {
                logo.src = c.logo;
                show(logo);
            } else {
                logo.removeAttribute('src');
                hide(logo);
            }
        }

        var st = byId('ad-manage-status');
        if (st) {
            st.className = badgeClass(bucket);
            st.textContent = bucket.toUpperCase();
        }

        var listedBadge = byId('ad-manage-listed-badge');
        if (listedBadge) {
            var unlisted = c.listed === 0;
            listedBadge.className = 'ad-badge ad-badge-listed' + (unlisted ? ' unlisted' : '');
            listedBadge.textContent = unlisted ? 'UNLISTED' : 'LISTED';
        }

        /* Listing can only be toggled while approval='approved' AND
           account='active'. Otherwise the fixed badge explains why. */
        var canToggleListing = (bucket === 'approved');
        var toggle = byId('ad-manage-listed');
        var listingNote = byId('ad-manage-listing-note');
        if (toggle) {
            toggle.checked = c.listed === 1;
            toggle.disabled = !canToggleListing;
        }
        if (listingNote) {
            if (canToggleListing) {
                listingNote.textContent = 'Controls whether this company is shown on the passenger-facing Companies page, public profile and search. Turning it off does not suspend the company.';
            } else if (bucket === 'suspended') {
                listingNote.textContent = 'This company is suspended and stays hidden. Turning the public listing back on is available again after unsuspension.';
            } else if (bucket === 'rejected') {
                listingNote.textContent = 'This company is rejected and stays hidden. Listing can be enabled again only after it is approved.';
            } else {
                listingNote.textContent = 'This company is pending approval and stays hidden. Approval is required before it can be publicly listed.';
            }
        }

        var reasonRow = byId('ad-manage-reason-row');
        var reasonTitle = byId('ad-manage-reason-title');
        var reasonText = byId('ad-manage-reason-text');
        if (reasonRow && reasonTitle && reasonText) {
            var hasReason = (bucket === 'suspended' || bucket === 'rejected') && c.current_reason;
            if (hasReason) {
                reasonRow.hidden = false;
                reasonTitle.textContent = (c.current_action === 'suspended' ? 'Suspension reason' : 'Rejection reason');
                reasonText.textContent = c.current_reason + (c.current_action_at ? ' \u00b7 ' + String(c.current_action_at).slice(0, 10) : '');
            } else {
                reasonRow.hidden = true;
                reasonTitle.textContent = 'Latest review';
                reasonText.textContent = '';
            }
        }

        var actionTitle = byId('ad-manage-action-title');
        var actionNote = byId('ad-manage-action-note');
        if (actionTitle) {
            actionTitle.textContent = bucket === 'pending' ? 'Review application' : 'Account status';
        }
        if (actionNote) {
            if (bucket === 'pending') {
                actionNote.textContent = 'This company is awaiting your decision.';
            } else if (bucket === 'approved') {
                actionNote.textContent = 'This company can sign in and operate.\u2002' + (c.listed === 1 ? 'It is currently publicly listed.' : 'It is currently hidden from public areas.');
            } else if (bucket === 'suspended') {
                actionNote.textContent = 'This company cannot sign in while suspended. Unsuspending restores its previous listing state.';
            } else if (bucket === 'rejected') {
                actionNote.textContent = 'This company cannot sign in. Approving it will let the owner in; it will stay hidden until listed.';
            } else {
                actionNote.textContent = '';
            }
        }

        renderManageActions(c);
    }

    function renderManageActions(c) {
        var box = byId('ad-manage-actions');
        if (!box) { return; }
        box.innerHTML = '';

        var actions = [];
        var bucket = companyBucket(c);
        if (bucket === 'pending') {
            actions = [
                { action: 'approve', label: 'Approve', cls: 'btn-primary' },
                { action: 'reject', label: 'Reject', cls: 'btn-secondary' }
            ];
        } else if (bucket === 'approved') {
            actions = [
                { action: 'suspend', label: 'Suspend', cls: 'btn-secondary' }
            ];
        } else if (bucket === 'suspended') {
            actions = [
                { action: 'activate', label: 'Unsuspend', cls: 'btn-primary' }
            ];
        } else if (bucket === 'rejected') {
            actions = [
                { action: 'approve', label: 'Approve', cls: 'btn-primary' }
            ];
        }

        if (!actions.length) {
            box.textContent = 'No status actions are available.';
            return;
        }

        actions.forEach(function (a) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn ' + a.cls + ' btn-sm ad-action';
            b.setAttribute('data-action', a.action);
            b.textContent = a.label;
            b.addEventListener('click', function () {
                if (a.action === 'reject' || a.action === 'suspend') {
                    openReasonModal(a.action);
                } else {
                    askConfirmation(a.action);
                }
            });
            box.appendChild(b);
        });
    }

    function closeManage() {
        currentDetail = null;
        hide(byId('ad-manage-modal'));
    }

    /* ---------- Confirmation modal (never mutate on a single click) ---------- */
    function askConfirmation(action, reason) {
        if (!currentDetail) { return; }

        var titles = {
            approve: 'Approve company?',
            reject: 'Reject company?',
            suspend: 'Suspend company?',
            activate: 'Unsuspend company?',
            delete: 'Delete company?',
            list: 'List company?',
            unlist: 'Unlist company?'
        };
        var messages = {
            approve: 'Approve "' + currentDetail.name + '"? The owner will gain access.',
            reject: 'Reject "' + currentDetail.name + '"? The owner loses access.',
            suspend: 'Suspend "' + currentDetail.name + '"? Access is paused.',
            activate: 'Restore access for "' + currentDetail.name + '"?',
            delete: 'Permanently delete "' + currentDetail.name + '"? This cannot be undone.',
            list: 'Show "' + currentDetail.name + '" on the public directory?',
            unlist: 'Hide "' + currentDetail.name + '" from the public directory?'
        };

        /* Red accent bar for destructive actions. */
        var modalBox = byId('ad-modal-box');
        if (modalBox) {
            modalBox.classList.toggle('is-danger', action === 'delete');
        }

        if (reason) {
            var actionWord = action === 'suspend' ? 'Suspension' : 'Rejection';
            messages[action] = (messages[action] || '') + ' ' + actionWord + ': "' + reason + '"';
        }

        setText('ad-modal-title', titles[action] || 'Confirm action');
        setText('ad-modal-message', messages[action] || 'Continue with this action?');

        var confirmBtn = byId('ad-modal-confirm');
        if (confirmBtn) {
            confirmBtn.className = 'btn ' + (action === 'delete' ? 'btn-danger' : 'btn-primary');
            confirmBtn.textContent = action === 'delete' ? 'Delete'
                : (action === 'list' ? 'List'
                : (action === 'unlist' ? 'Unlist' : 'Confirm'));
        }

        /* Require the admin's own password before any sensitive action. */
        var pwInput = byId('ad-modal-password');
        if (pwInput) {
            pwInput.value = '';
            pwInput.focus();
        }
        var pwErr = byId('ad-modal-password-error');
        if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
        syncConfirmPassword();

        pendingMutation = { action: action, companyId: currentDetail.id, reason: reason || null };
        show(byId('ad-modal'));
    }

    function syncConfirmPassword() {
        var pwInput = byId('ad-modal-password');
        var confirmBtn = byId('ad-modal-confirm');
        if (!pwInput || !confirmBtn) { return; }
        confirmBtn.disabled = pwInput.value.trim() === '';
    }

    function closeModal() {
        pendingMutation = null;
        var pwInput = byId('ad-modal-password');
        if (pwInput) { pwInput.value = ''; }
        var pwErr = byId('ad-modal-password-error');
        if (pwErr) { pwErr.hidden = true; pwErr.textContent = ''; }
        hide(byId('ad-modal'));
    }

    function runMutation(action, companyId, reason) {
        var confirmBtn = byId('ad-modal-confirm');
        var adminPassword = (byId('ad-modal-password') || {}).value || '';
        if (adminPassword === '') {
            var pwErr = byId('ad-modal-password-error');
            if (pwErr) {
                pwErr.textContent = 'Enter your admin password.';
                pwErr.hidden = false;
            }
            var pwInput = byId('ad-modal-password');
            if (pwInput) { pwInput.focus(); }
            return;
        }

        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Working\u2026';
        }

        var payload = { company_id: companyId, admin_password: adminPassword };
        if (reason) { payload.reason = reason; }

        fetch('api/admin.php?action=company_' + action, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
            .then(parseJson)
            .then(function (result) {
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm';
                }

                var data = result.data || {};

                /* Wrong / expired admin password (401): keep the modal open
                   and show the message inline so the admin can retry. All
                   other errors close the modal and appear in the section. */
                if (result.status === 401) {
                    var pwErr = byId('ad-modal-password-error');
                    if (pwErr) {
                        pwErr.textContent = data.message || 'Your admin password was not accepted.';
                        pwErr.hidden = false;
                    }
                    var pwInput = byId('ad-modal-password');
                    if (pwInput) {
                        pwInput.select();
                        pwInput.focus();
                    }
                    return;
                }

                closeModal();

                if (!result.ok || result.status !== 200 || !data.success) {
                    var manageModal = byId('ad-manage-modal');
                    var errBox = (manageModal && !manageModal.hidden) ? byId('ad-manage-error') : byId('ad-detail-error');
                    setError(errBox, data.message || 'The action could not be completed.');
                    loadCompanies();
                    return;
                }

                if (action === 'delete') {
                    closeDetail();
                    closeManage();
                } else if (data.company) {
                    currentDetail = data.company;
                    var manageBody = byId('ad-manage-modal');
                    if (manageBody && !manageBody.hidden) {
                        renderManage(data.company);
                    }
                    var detailSection = byId('section-detail');
                    if (detailSection && !detailSection.hidden) {
                        renderDetail(data.company);
                    }
                }
                loadOverview();
                loadCompanies();
                toast(data.message || 'Company updated successfully.');
            })
            .catch(function () {
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm';
                }
                closeModal();
                var manageModal = byId('ad-manage-modal');
                var errBox = (manageModal && !manageModal.hidden) ? byId('ad-manage-error') : byId('ad-detail-error');
                setError(errBox, 'Network error while applying the action.');
            });
    }

    function closeDetail() {
        currentDetail = null;
        hide(byId('section-detail'));

        /* If this leaves no main section visible, fall back to Companies. */
        var anyVisible = ['section-overview', 'section-companies', 'section-revenue', 'section-passengers', 'section-reviews'].some(function (id) {
            var el = byId(id);
            return el && !el.hidden;
        });
        if (!anyVisible) {
            switchSection('companies');
        }
    }

    /* ---------- Reason modal (Reject / Suspend require a reason) ---------- */
    function openReasonModal(action) {
        if (!currentDetail) { return; }
        pendingReasonData = { action: action, companyId: currentDetail.id };
        selectedReasonChip = null;

        var actionLabel = action === 'suspend' ? 'Suspend' : 'Reject';
        setText('ad-reason-title', actionLabel + ' ' + currentDetail.name);
        setText('ad-reason-sub', '@' + (currentDetail.slug || '') + ' \u00b7 current status: ' + (companyBucket(currentDetail) || '-'));

        var desc = byId('ad-reason-desc');
        if (desc) {
            desc.textContent = action === 'suspend'
                ? 'The owner will immediately lose access and the company will be hidden from the public directory. Provide a clear reason \u2014 it is shown to the owner and kept in the audit history. Re-suspending later records a new reason while preserving the old one.'
                : 'The owner will lose access and the company will be hidden from the public directory. Provide a clear reason \u2014 it is shown to the owner and kept in the audit history.';
        }

        var chipsBox = byId('ad-reason-chips');
        if (chipsBox) {
            chipsBox.innerHTML = '';
            REASON_SUGGESTIONS.forEach(function (text) {
                var chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'ad-reason-chip';
                chip.textContent = text;
                chip.addEventListener('click', function () {
                    selectReasonChip(text);
                });
                chipsBox.appendChild(chip);
            });
        }

        var reasonText = byId('ad-reason-text');
        if (reasonText) {
            reasonText.value = '';
            reasonText.focus();
        }

        var err = byId('ad-reason-error');
        if (err) { err.hidden = true; err.textContent = ''; }

        syncReasonState();
        show(byId('ad-reason-modal'));
    }

    function selectReasonChip(text) {
        var reasonText = byId('ad-reason-text');
        if (!reasonText) { return; }

        selectedReasonChip = text;
        var allChips = document.querySelectorAll('#ad-reason-chips .ad-reason-chip');
        for (var i = 0; i < allChips.length; i++) {
            allChips[i].classList.toggle('is-selected', allChips[i].textContent === text);
        }

        /* "Other" asks for a custom explanation — leave the field empty and focused. */
        if (text === 'Other') {
            reasonText.value = '';
        } else {
            reasonText.value = text;
        }
        reasonText.focus();

        var err = byId('ad-reason-error');
        if (err) { err.hidden = true; err.textContent = ''; }
        syncReasonState();
    }

    function syncReasonState() {
        var reasonText = byId('ad-reason-text');
        var confirmBtn = byId('btn-reason-confirm');
        if (!reasonText || !confirmBtn) { return; }

        var value = reasonText.value.trim();

        /* A chip that no longer matches the text means the admin edited it —
           keep it editable, just drop the highlight. */
        if (selectedReasonChip && value !== selectedReasonChip) {
            selectedReasonChip = null;
            var allChips = document.querySelectorAll('#ad-reason-chips .ad-reason-chip');
            for (var i = 0; i < allChips.length; i++) {
                allChips[i].classList.remove('is-selected');
            }
        }

        confirmBtn.disabled = value === '';
    }

    function closeReasonModal() {
        pendingReasonData = null;
        selectedReasonChip = null;
        hide(byId('ad-reason-modal'));
    }

    function submitReason() {
        if (!pendingReasonData) { return; }
        var reasonText = byId('ad-reason-text');
        var err = byId('ad-reason-error');
        if (!reasonText || !err) { return; }

        var reason = reasonText.value.trim();
        if (reason === '') {
            err.textContent = 'A reason is required to ' + (pendingReasonData.action === 'suspend' ? 'suspend' : 'reject') + ' this company.';
            err.hidden = false;
            reasonText.focus();
            return;
        }

        var action = pendingReasonData.action;
        var companyId = pendingReasonData.companyId;
        closeReasonModal();
        var match = currentCompanies.filter(function (c) { return c.id === companyId; })[0];
        if (match) { currentDetail = match; }
        askConfirmation(action, reason);
    }

 /* ---------- read-only operational oversight ---------- */
    var sectionMap = {
        overview: ['section-overview'],
        companies: ['section-companies'],
        passengers: ['section-passengers'],
        revenue: ['section-revenue'],
        reviews: ['section-reviews'],
        complaints: ['section-complaints']
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
        var all = ['section-overview', 'section-companies', 'section-detail', 'section-revenue', 'section-passengers', 'section-reviews', 'section-complaints'];
        for (var i = 0; i < all.length; i++) {
            hide(byId(all[i]));
        }
        for (var j = 0; j < map.length; j++) {
            var el = byId(map[j]);
            if (el) { show(el); }
        }
        setActiveTab(name);

        /* Remember the active section in the URL hash (e.g. #companies) so a
           page refresh returns to the same tab instead of Overview. */
        if (sectionMap[name]) {
            try {
                if (window.history && window.history.replaceState) {
                    window.history.replaceState(null, '', '#' + name);
                } else {
                    window.location.hash = name;
                }
            } catch (e) { /* hash update is best-effort only */ }
        }

        if (name === 'revenue') { loadRevenue(); }
        if (name === 'passengers') { loadPassengers(); }
        if (name === 'reviews') { loadReviews(); }
        if (name === 'complaints') { loadAdminComplaints(); }
    }

    /* ---------- Reviews: platform sentiment studio (migrated from company dashboard) ---------- */
    var currentReviews = [];
    var reviewFilter = null;
    var reviewEditingReplyId = null;
    var reviewsRequestId = 0;
    var PLATFORM_REVIEW_STORAGE_KEY = 'ettransport_admin_platform_reviews';

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

    /* One seeded platform review — real feedback about ET Transport itself,
       so the admin always has a platform review. Like + reply state persists
       in localStorage so edits survive a refresh. */
    function mockPlatformReview() {
        var mock = {
            id: -1,
            isMock: true,
            isPlatform: true,
            name: 'Hanna Bekele',
            rating: 5,
            comment: 'Booking a ticket was quick and clear, and my wallet top-up went straight through. ET Transport made my trip from Addis Ababa to Arba Minch completely hassle-free!',
            created_at: '2026-08-18 10:24:00',
            verified: false,
            likes: 12,
            liked: false,
            reply: 'Thank you for the kind words! We work every day to make booking buses across Ethiopia simpler. \u2014 ET Transport team',
            reply_at: '2026-08-19 14:05:00',
            company_name: 'ET Transport',
            company_slug: 'platform',
            status: 'approved'
        };
        try {
            var saved = JSON.parse(localStorage.getItem(PLATFORM_REVIEW_STORAGE_KEY) || '{}');
            if (saved && typeof saved === 'object') {
                if (typeof saved.liked === 'boolean' || typeof saved.likes === 'number') {
                    mock.liked = !!saved.liked;
                    mock.likes = Number(saved.likes) || 0;
                }
                if (saved.reply !== undefined) {
                    mock.reply = saved.reply || null;
                    mock.reply_at = saved.reply_at || null;
                }
            }
        } catch (e) { /* storage is best-effort */ }
        return mock;
    }

    function saveMockPlatformReview() {
        try {
            for (var i = 0; i < currentReviews.length; i++) {
                var r = currentReviews[i];
                if (r && r.isMock) {
                    localStorage.setItem(PLATFORM_REVIEW_STORAGE_KEY, JSON.stringify({
                        liked: !!r.liked,
                        likes: Number(r.likes) || 0,
                        reply: r.reply || null,
                        reply_at: r.reply_at || null
                    }));
                    return;
                }
            }
        } catch (e) { /* storage is best-effort */ }
    }

    function reviewLikeButtonHtml(r) {
        var liked = !!r.liked;
        return '<button type="button" class="ad-review-like' + (liked ? ' is-liked' : '') + '" data-review-id="' + r.id + '" aria-pressed="' + (liked ? 'true' : 'false') + '" aria-label="' + (liked ? 'Unlike this review' : 'Like this review') + '">' +
            (liked ? '\u2665' : '\u2661') + ' <span class="ad-review-like-count">' + (Number(r.likes) || 0) + '</span>' +
        '</button>';
    }

    function reviewReplyBlockHtml(r) {
        if (!r.reply) { return ''; }
        return '<div class="ad-review-reply" data-review-id="' + r.id + '">' +
            '<span class="ad-review-reply-label">' + (r.isPlatform ? 'Platform reply' : 'Company reply') + '</span>' +
            '<p>' + escHtml(r.reply) + '</p>' +
            '<span class="ad-review-reply-meta">Published ' + (formatReviewDate(r.reply_at) || '') + '</span>' +
        '</div>';
    }

    function reviewReplyEditorHtml(r) {
        return '<div class="ad-review-reply-editor">' +
            '<div class="ad-review-reply-editor-head"><span>Public response</span><small data-review-reply-count>' + String(r.reply || '').length + ' / 1000</small></div>' +
            '<textarea class="ad-review-reply-input" maxlength="1000" placeholder="Write an official reply to this passenger...">' + escHtml(r.reply || '') + '</textarea>' +
            '<div class="ad-review-reply-editor-actions">' +
                '<button type="button" class="btn btn-sm btn-secondary ad-review-reply-cancel" data-review-id="' + r.id + '">Cancel</button>' +
                '<button type="button" class="btn btn-sm btn-primary ad-review-reply-save" data-review-id="' + r.id + '">' + (r.reply ? 'Save reply' : 'Post reply') + '</button>' +
            '</div>' +
        '</div>';
    }

    function reviewCardHtml(r) {
        var editing = Number(reviewEditingReplyId) === Number(r.id);
        var initial = String(r.name || 'P').trim().charAt(0).toUpperCase() || 'P';
        return '<article class="ad-review-card' + (editing ? ' is-editing' : '') + '" data-review-id="' + r.id + '">' +
            '<div class="ad-review-card-head">' +
                '<span class="ad-review-avatar" aria-hidden="true">' + escHtml(initial) + '</span>' +
                '<div class="ad-review-person"><strong>' + escHtml(r.name || 'Passenger') + '</strong><span class="ad-review-meta">' + (formatReviewDate(r.created_at) || 'Recent review') + '</span></div>' +
                (r.verified ? '<span class="ad-review-badge">Verified</span>' : '') +
                (r.isPlatform ? '<span class="ad-review-badge ad-review-company">ET Transport review</span>' : '<span class="ad-review-badge ad-review-company">' + escHtml(r.company_name || 'Company') + '</span>') +
                (r.status && r.status !== 'approved' ? '<span class="ad-review-badge ad-review-mock">' + escHtml(r.status) + '</span>' : '') +
                '<span class="ad-review-rating" aria-label="Rated ' + r.rating + ' out of 5"><span aria-hidden="true">★</span> ' + Number(r.rating || 0).toFixed(1) + '</span>' +
            '</div>' +
            (r.comment ? '<p class="ad-review-text">' + escHtml(r.comment) + '</p>' : '<p class="ad-review-text ad-review-no-comment">No written comment.</p>') +
            '<div class="ad-review-actions">' + reviewLikeButtonHtml(r) +
                (!editing ? '<button type="button" class="ad-review-reply-btn" data-review-id="' + r.id + '">' + (r.reply ? 'Edit response' : 'Respond') + '</button>' : '') +
            '</div>' +
            (editing ? reviewReplyEditorHtml(r) : reviewReplyBlockHtml(r)) +
        '</article>';
    }

    function countReviewsForFilter(val) {
        var count = 0;
        for (var k = 0; k < currentReviews.length; k++) {
            var r = currentReviews[k];
            if (val === null || Number(r.rating) === val) { count++; }
        }
        return count;
    }

    function renderReviewFilterBar() {
        var bar = byId('ad-reviews-filterbar');
        if (!bar) { return; }
        if (!currentReviews.length) { bar.hidden = true; bar.innerHTML = ''; return; }
        var options = [[null, 'All feedback'], [5, '5 stars'], [4, '4 stars'], [3, '3 stars'], [2, '2 stars'], [1, '1 star']];
        var html = '';
        for (var i = 0; i < options.length; i++) {
            var val = options[i][0]; var label = options[i][1];
            var active = val === reviewFilter;
            html += '<button type="button" class="ad-review-filter' + (active ? ' is-active' : '') + '" data-review-filter="' + (val === null ? '' : val) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + label + ' <span class="ad-review-filter-count">' + countReviewsForFilter(val) + '</span></button>';
        }
        bar.innerHTML = html;
        bar.hidden = false;
    }

    function renderReviewCards() {
        var list = byId('ad-reviews-list');
        var empty = byId('ad-reviews-empty');
        var filtered = (reviewFilter === null) ? currentReviews : currentReviews.filter(function (x) { return Number(x.rating) === reviewFilter; });
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
        var loading = byId('ad-reviews-loading'); if (loading) { loading.hidden = true; }

        /* The admin Reviews tab shows platform reviews ONLY (feedback about
           ET Transport itself), never company reviews. The seeded platform
           review is always shown first; any platform reviews returned by
           the API are appended after it. */
        var serverReviews = (data && Array.isArray(data.reviews)) ? data.reviews : [];
        var platformReviews = [];
        for (var i = 0; i < serverReviews.length; i++) {
            if (serverReviews[i] && serverReviews[i].isPlatform) { platformReviews.push(serverReviews[i]); }
        }
        currentReviews = [mockPlatformReview()].concat(platformReviews);
        reviewFilter = null;

        renderReviewSummary();
        renderReviewFilterBar();
        renderReviewCards();
    }

    function renderReviewSummary() {
        var summary = byId('ad-reviews-summary');
        if (!summary) { return; }

        var reviews = currentReviews || [];
        var ratingCounts = [0, 0, 0, 0, 0, 0];
        var ratingSum = 0;
        for (var i = 0; i < reviews.length; i++) {
            var rv = Math.round(Number((reviews[i] || {}).rating) || 0);
            if (rv >= 1 && rv <= 5) { ratingCounts[rv]++; ratingSum += rv; }
        }
        var totalReviews = reviews.length;
        var rating = totalReviews ? Math.round((ratingSum / totalReviews) * 10) / 10 : 0;
        var distribution = '';
        for (var star = 5; star >= 1; star--) {
            var count = ratingCounts[star];
            var width = totalReviews ? Math.round((count / totalReviews) * 100) : 0;
            distribution += '<div class="ad-review-distribution-row"><b>' + star + ' ★</b><span class="ad-review-distribution-track"><i class="ad-review-distribution-fill" style="width:' + width + '%"></i></span><span>' + count + '</span></div>';
        }
        summary.hidden = false;
        summary.innerHTML =
            '<div class="ad-review-score-panel"><p class="ad-review-kicker">Platform sentiment</p><span class="ad-review-score">' + rating.toFixed(1) + '</span><span class="ad-review-stars" role="img" aria-label="Rated ' + rating.toFixed(1) + ' out of 5">' + reviewStarsHtml(rating) + '</span><span class="ad-review-count">' + totalReviews.toLocaleString() + ' review' + (totalReviews === 1 ? '' : 's') + '</span></div>' +
            '<div class="ad-review-distribution" aria-label="Rating distribution">' + distribution + '</div>';
    }

    function showReviewsError(message) {
        var loading = byId('ad-reviews-loading'); if (loading) { loading.hidden = true; }
        var list = byId('ad-reviews-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var empty = byId('ad-reviews-empty'); if (empty) { empty.hidden = true; }
        var summary = byId('ad-reviews-summary'); if (summary) { summary.hidden = true; }
        var filterbar = byId('ad-reviews-filterbar'); if (filterbar) { filterbar.hidden = true; }
        var error = byId('ad-reviews-error');
        if (error) {
            error.hidden = false;
            error.textContent = message || 'Unable to load platform reviews. Please try again later.';
        }
    }

    function loadReviews() {
        var loading = byId('ad-reviews-loading'); if (loading) { loading.hidden = false; }
        var error = byId('ad-reviews-error'); if (error) { error.hidden = true; }
        var empty = byId('ad-reviews-empty'); if (empty) { empty.hidden = true; }
        var list = byId('ad-reviews-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
        var summary = byId('ad-reviews-summary'); if (summary) { summary.hidden = true; }
        var filterbar = byId('ad-reviews-filterbar'); if (filterbar) { filterbar.hidden = true; }

        var rid = ++reviewsRequestId;
        fetch('api/admin.php?action=reviews', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(parseJson)
            .then(function (result) {
                if (rid !== reviewsRequestId) { return; }
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    showReviewsError(data.message || 'Unable to load platform reviews.');
                    renderReviews({ reviews: [] });   /* keep the platform review visible */
                    return;
                }
                renderReviews(data);
            })
            .catch(function () {
                if (rid !== reviewsRequestId) { return; }
                showReviewsError('Network error while loading platform reviews.');
                renderReviews({ reviews: [] });       /* keep the platform review visible */
            });
    }

    function currentReviewById(id) {
        for (var i = 0; i < currentReviews.length; i++) {
            if (currentReviews[i].id === Number(id)) { return currentReviews[i]; }
        }
        return null;
    }

    function showReviewActionMessage(message) {
        var error = byId('ad-reviews-error');
        if (!error || !message) { return; }
        error.textContent = message;
        error.hidden = false;
        setTimeout(function () { if (error.textContent === message) { error.hidden = true; } }, 4000);
    }

    function toggleReviewLike(id) {
        if (!id) { return; }
        var review = currentReviewById(id);
        if (!review) { return; }

        /* This platform review has no server row yet — toggle it locally and
           persist. */
        if (review.isMock) {
            review.liked = !review.liked;
            review.likes = Math.max(0, (Number(review.likes) || 0) + (review.liked ? 1 : -1));
            saveMockPlatformReview();
            renderReviewCards();
            showReviewActionMessage(review.liked ? 'You like this platform review.' : 'You removed your like from this platform review.');
            return;
        }

        fetch('api/review.php?action=like', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
            body: 'review_id=' + encodeURIComponent(id)
        })
            .then(parseJson)
            .then(function (result) {
                var json = result.data;
                if (!result.ok || !json || json.success !== true) {
                    showReviewActionMessage((json && json.message) || 'Unable to update the like.');
                    return;
                }
                var review = currentReviewById(id);
                if (review) { review.likes = json.likes; review.liked = !!json.liked; }
                renderReviewCards();
            })
            .catch(function () { showReviewActionMessage('Network error while updating the like.'); });
    }

    function beginReviewReply(id) {
        reviewEditingReplyId = Number(id) || null;
        renderReviewCards();
        setTimeout(function () {
            var editor = document.querySelector('.ad-review-card.is-editing .ad-review-reply-input');
            if (editor) { editor.focus(); }
        }, 0);
    }

    function cancelReviewReply() {
        reviewEditingReplyId = null;
        renderReviewCards();
    }

    function submitReviewReply(id, reply) {
        if (!id) { return; }
        var review = currentReviewById(id);
        if (!review) { return; }

        /* This platform review has no server row yet — save the reply locally
           and persist. */
        if (review.isMock) {
            review.reply = (reply && reply.trim()) ? reply.trim() : null;
            review.reply_at = review.reply ? new Date().toISOString() : null;
            reviewEditingReplyId = null;
            saveMockPlatformReview();
            renderReviewCards();
            showReviewActionMessage(review.reply ? 'Platform reply saved. It now shows on this review.' : 'Platform reply removed.');
            return;
        }

        fetch('api/review.php?action=reply', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
            body: 'review_id=' + encodeURIComponent(id) + '&reply=' + encodeURIComponent(reply)
        })
            .then(parseJson)
            .then(function (result) {
                var json = result.data;
                if (!result.ok || !json || json.success !== true) {
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
                showReviewActionMessage('Reply saved. It now appears on the passenger-facing company page.');
            })
            .catch(function () { showReviewActionMessage('Network error while saving the reply.'); });
    }

    /* ---------- Revenue section (per-company list + detail modal) ---------- */
    var currentRevenueCompanies = [];
    var currentRevenueCompanyId = null;
    var revenueRequestId = 0;          // discards responses from superseded revenue list requests
    var companyRevenueRequestId = 0;   // discards responses from superseded breakdown requests

    function loadRevenue() {
        var rid = ++revenueRequestId;
        show(byId('ad-revenue-loading'));
        hide(byId('ad-revenue-error'));
        hide(byId('ad-revenue-empty'));

        fetch('api/admin.php?action=revenue', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        }).then(parseJson).then(function (result) {
            hide(byId('ad-revenue-loading'));
            if (rid !== revenueRequestId) { return; }
            var data = result.data || {};
            if (!result.ok || result.status !== 200 || !data.success) {
                setError(byId('ad-revenue-error'), data.message || 'Unable to load revenue.');
                return;
            }
            renderRevenue(data.companies || []);
        }).catch(function () {
            if (rid !== revenueRequestId) { return; }
            hide(byId('ad-revenue-loading'));
            setError(byId('ad-revenue-error'), 'Network error while loading revenue.');
        });
    }

    function renderRevenue(companies) {
        currentRevenueCompanies = Array.isArray(companies) ? companies : [];
        var body = byId('ad-revenue-rows');
        var empty = byId('ad-revenue-empty');
        if (!body) { return; }

        var term = String(byId('ad-rev-search') ? byId('ad-rev-search').value : '').trim().toLowerCase();
        var status = byId('ad-rev-status') ? byId('ad-rev-status').value : '';
        var sort = byId('ad-rev-sort') ? byId('ad-rev-sort').value : 'revenue-desc';

        var list = currentRevenueCompanies.filter(function (c) {
            if (status && c.status !== status) { return false; }
            if (term) {
                var hay = ((c.name || '') + ' ' + (c.slug || '')).toLowerCase();
                if (hay.indexOf(term) === -1) { return false; }
            }
            return true;
        });

        list.sort(function (a, b) {
            if (sort === 'name') {
                return String(a.name || '').localeCompare(String(b.name || ''));
            }
            var ar = Number(a.collected_revenue) || 0;
            var br = Number(b.collected_revenue) || 0;
            return sort === 'revenue-asc' ? ar - br : br - ar;
        });

        var cnt = byId('ad-rev-count');
        if (cnt) { cnt.textContent = list.length + ' compan' + (list.length === 1 ? 'y' : 'ies'); }

        if (!list.length) { body.innerHTML = ''; show(empty); return; }
        hide(empty);
        var html = '';
        list.forEach(function (c) {
            var logo = c.logo ? '<img class="ad-co-logo" src="' + escHtml(c.logo) + '" alt="">' : '';
            html += '<tr>' +
                '<td><span class="ad-co-name">' + logo + escHtml(c.name) + '</span><span class="ad-co-slug">@' + escHtml(c.slug || '') + '</span></td>' +
                '<td><span class="ad-badge ' + badgeClass(c.status) + '">' + escHtml(c.status || '') + '</span></td>' +
                '<td>' + (c.trip_count || 0) + '</td>' +
                '<td>' + (c.booking_count || 0) + '</td>' +
                '<td>' + formatMoney(c.collected_revenue) + '</td>' +
                '<td><button type="button" class="btn btn-secondary btn-sm" data-revenue-detail="' + c.id + '">Details</button></td>' +
                '</tr>';
        });
        body.innerHTML = html;
    }

    function applyRevenueFilters() {
        renderRevenue(currentRevenueCompanies);
    }

    function showRevenuePeriodLabel(label) {
        var el = byId('ad-revenue-period-label');
        if (el) { el.textContent = label || 'All time'; }
    }

    function loadCompanyRevenue() {
        if (!currentRevenueCompanyId) { return; }
        var rid = ++companyRevenueRequestId;
        show(byId('ad-revenue-detail-loading'));
        hide(byId('ad-revenue-detail-error'));
        hide(byId('ad-revenue-detail'));

        var p = [];
        var month = byId('ad-revenue-month');
        if (month && month.value) { p.push('month=' + encodeURIComponent(month.value)); }
        var year = byId('ad-revenue-year');
        if (year && year.value) { p.push('year=' + encodeURIComponent(year.value)); }
        var q = p.length ? '&' + p.join('&') : '';

        fetch('api/admin.php?action=company_revenue&company_id=' + encodeURIComponent(currentRevenueCompanyId) + q, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        }).then(parseJson).then(function (result) {
            if (rid !== companyRevenueRequestId) { return; }
            hide(byId('ad-revenue-detail-loading'));
            var data = result.data || {};
            if (!result.ok || result.status !== 200 || !data.success) {
                setError(byId('ad-revenue-detail-error'), data.message || 'Unable to load revenue.');
                return;
            }
            renderCompanyRevenue(data);
            show(byId('ad-revenue-detail'));
        }).catch(function () {
            if (rid !== companyRevenueRequestId) { return; }
            hide(byId('ad-revenue-detail-loading'));
            setError(byId('ad-revenue-detail-error'), 'Network error while loading revenue.');
        });
    }

    function renderCompanyRevenue(data) {
        var bd = data.breakdown || {};
        var total = bd.total || { bookings: 0, paid: 0, refunds: 0, net: 0 };
        var online = bd.online || {};
        var office = bd.office || {};
        var parcels = bd.parcels || {};

        setText('ad-rev-stat-bookings', String(total.bookings == null ? 0 : total.bookings));
        setText('ad-rev-stat-online', String(online.bookings == null ? 0 : online.bookings));
        setText('ad-rev-stat-office', String(office.bookings == null ? 0 : office.bookings));
        setText('ad-rev-stat-parcels', String(parcels.bookings == null ? 0 : parcels.bookings));
        setText('ad-rev-stat-paid', formatMoney(total.paid));
        setText('ad-rev-stat-refunds', formatMoney(total.refunds));
        setText('ad-rev-stat-net', formatMoney(total.net));
        showRevenuePeriodLabel(data.period && data.period.label ? data.period.label : 'All time');

        var body = byId('ad-revenue-breakdown-rows');
        if (!body) { return; }
        var rows = [
            ['Website bookings', online],
            ['Office bookings', office],
            ['Parcels', parcels],
            ['Total', total]
        ];
        var html = '';
        rows.forEach(function (r, i) {
            var row = r[1] || {};
            var cls = i === rows.length - 1 ? ' class="ad-rev-total"' : '';
            html += '<tr' + cls + '>' +
                '<td>' + r[0] + '</td>' +
                '<td>' + (row.bookings == null ? 0 : row.bookings) + '</td>' +
                '<td>' + formatMoney(row.paid) + '</td>' +
                '<td>' + formatMoney(row.refunds) + '</td>' +
                '<td>' + formatMoney(row.net) + '</td>' +
                '</tr>';
        });
        body.innerHTML = html;
    }

    function openRevenueModal(companyId) {
        var id = parseInt(companyId, 10);
        if (!id) { return; }
        var match = currentRevenueCompanies.filter(function (c) { return c.id === id; })[0];
        if (match) {
            setText('ad-revenue-title', match.name + ' \u2014 Revenue');
            setText('ad-revenue-sub', '@' + (match.slug || '') + (match.status ? ' \u00b7 ' + match.status : ''));
        } else {
            setText('ad-revenue-title', 'Revenue Detail');
            setText('ad-revenue-sub', '');
        }
        currentRevenueCompanyId = id;
        var modal = byId('ad-revenue-modal');
        if (!modal) { return; }
        hide(byId('ad-revenue-detail'));
        hide(byId('ad-revenue-detail-error'));
        modal.hidden = false;
        loadCompanyRevenue();
    }

    function closeRevenueModal() {
        currentRevenueCompanyId = null;
        hide(byId('ad-revenue-modal'));
    }

    function populateRevenueYears() {
        var sel = byId('ad-revenue-year');
        if (!sel) { return; }
        var current = new Date().getFullYear();
        var html = '<option value="">All years</option>';
        for (var y = current; y >= current - 5; y--) {
            html += '<option value="' + y + '">' + y + '</option>';
        }
        sel.innerHTML = html;
    }

    function currentPassengersQuery() {
        var p = [];
        var q = byId('ad-passenger-search'); if (q && q.value.trim()) { p.push('q=' + encodeURIComponent(q.value.trim())); }
        return p.length ? '&' + p.join('&') : '';
    }

    var adPassengersRequestId = 0;   // discards responses from superseded passenger requests

    function loadPassengers() {
        var rid = ++adPassengersRequestId;
        show(byId('ad-passengers-loading'));
        hide(byId('ad-passengers-error'));
        fetch('api/admin.php?action=passengers' + currentPassengersQuery(), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        }).then(parseJson).then(function (result) {
            hide(byId('ad-passengers-loading'));
            if (rid !== adPassengersRequestId) { return; }
            var data = result.data || {};
            if (!result.ok || result.status !== 200 || !data.success) {
                setError(byId('ad-passengers-error'), data.message || 'Unable to load passengers.');
                return;
            }
            renderPassengers(data.passengers || []);
        }).catch(function () {
            if (rid !== adPassengersRequestId) { return; }
            hide(byId('ad-passengers-loading'));
            setError(byId('ad-passengers-error'), 'Network error while loading passengers.');
        });
    }

        function avatarInitials(name) {
        var initials = String(name || '?').trim().split(/\s+/).filter(function (w) { return w; });
        if (!initials.length) { return '?'; }
        if (initials.length === 1) { return (initials[0].charAt(0) || '?').toUpperCase(); }
        return (initials[0].charAt(0) + initials[initials.length - 1].charAt(0)).toUpperCase();
    }

    function renderPassengers(passengers) {
        var body = byId('ad-passengers-rows');
        var cnt = byId('ad-passengers-count');
        if (cnt) { cnt.textContent = passengers.length + (passengers.length === 1 ? ' passenger' : ' passengers'); }
        if (!passengers.length) {
            body.innerHTML = '<tr><td colspan="7" class="ad-muted">No passengers found.</td></tr>';
            return;
        }
        var html = '';
        passengers.forEach(function (p) {
            html += '<tr data-passenger-id="' + p.id + '">' +
                '<td><span class="ad-passenger-cell"><span class="ad-passenger-avatar">' + escHtml(avatarInitials(p.name)) + '</span><span class="ad-passenger-copy"><strong>' + escHtml(p.name) + '</strong><span>' + escHtml(p.email) + '</span><span>' + escHtml(p.phone || '\u2014') + '</span></span></span></td>' +
                '<td><span class="ad-badge ' + badgeClass(p.status) + '">' + escHtml(p.status || '') + '</span></td>' +
                '<td>' + p.booking_count + '</td>' +
                '<td>' + p.review_count + '</td>' +
                '<td>' + formatMoney(p.total_spent) + '</td>' +
                '<td>' + formatDate(p.created_at) + '</td>' +
                '<td><button type="button" class="btn btn-secondary btn-sm" data-passenger-detail="' + p.id + '">Details</button></td>' +
                '</tr>';
        });
        body.innerHTML = html;
        var buttons = body.querySelectorAll('button[data-passenger-detail]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function () {
                var id = parseInt(this.getAttribute('data-passenger-detail'), 10);
                if (id > 0) { openPassengerDetail(id); }
            });
        }
    }

    /* ---------- Passenger detail modal ---------- */
    function openPassengerDetail(id) {
        var modal = byId('ad-passenger-modal');
        var content = byId('ad-passenger-content');
        if (modal) { modal.hidden = false; }
        show(byId('ad-passenger-loading'));
        hide(byId('ad-passenger-error'));
        hide(content);
        fetch('api/admin.php?action=passenger&id=' + encodeURIComponent(id), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        }).then(parseJson).then(function (result) {
            hide(byId('ad-passenger-loading'));
            var data = result.data || {};
            if (!result.ok || result.status !== 200 || !data.success) {
                hide(content);
                setError(byId('ad-passenger-error'), data.message || 'Unable to load the passenger.');
                return;
            }
            renderPassengerDetail(data);
        }).catch(function () {
            hide(byId('ad-passenger-loading'));
            hide(content);
            setError(byId('ad-passenger-error'), 'Network error while loading the passenger.');
        });
    }

    function renderPassengerDetail(data) {
        var p = data.passenger || {};
        var bookings = data.bookings || [];
        var reviews = data.reviews || [];
        var refunds = data.refunds || [];
        var liked = data.liked_companies || [];

        setText('ad-passenger-title', 'Passenger Detail \u2014 ' + p.name);
        setText('ad-passenger-sub', (p.email || '') + ' \u00b7 account #' + p.id);
        setText('ad-passenger-avatar', avatarInitials(p.name));
        setText('ad-passenger-name', p.name);
        setText('ad-passenger-email', p.email || '\u2014');
        setText('ad-passenger-phone', p.phone || '\u2014');
        setText('ad-passenger-stat-bookings', String(p.booking_count || 0));
        setText('ad-passenger-stat-reviews', String(p.review_count || 0));
        setText('ad-passenger-stat-refunds', String(p.refund_count || 0));
        setText('ad-passenger-stat-liked', String(p.liked_company_count || 0));
        setText('ad-passenger-stat-spent', formatMoney(p.total_spent));

        var st = byId('ad-passenger-status-badge');
        if (st) {
            st.className = badgeClass(p.status);
            st.textContent = p.status ? p.status.toUpperCase() : '';
        }
        setText('ad-passenger-created', formatDate(p.created_at));
        setText('ad-passenger-updated', formatDate(p.updated_at));

        renderPassengerBookings(bookings);
        renderPassengerReviews(reviews);
        renderPassengerRefunds(refunds);
        renderPassengerLiked(liked);

        setPassengerTab('bookings');
        show(byId('ad-passenger-content'));
    }

    function setPassengerTab(name) {
        var tabs = document.querySelectorAll('.ad-passenger-tab[data-p-tab]');
        for (var i = 0; i < tabs.length; i++) {
            var match = tabs[i].getAttribute('data-p-tab') === name;
            tabs[i].className = 'ad-passenger-tab' + (match ? ' is-active' : '');
            tabs[i].setAttribute('aria-selected', match ? 'true' : 'false');
        }
        ['bookings', 'reviews', 'refunds', 'liked'].forEach(function (paneName) {
            var pane = byId('ad-passenger-pane-' + paneName);
            if (pane) { pane.className = 'ad-passenger-pane' + (paneName === name ? ' is-active' : ''); }
        });
    }

    function closePassengerModal() {
        var modal = byId('ad-passenger-modal');
        if (modal) { modal.hidden = true; }
    }

    function renderPassengerBookings(bookings) {
        var body = byId('ad-passenger-bookings-rows');
        if (!bookings.length) {
            body.innerHTML = '<tr><td colspan="9" class="ad-muted">No bookings yet.</td></tr>';
            return;
        }
        var html = '';
        bookings.forEach(function (b) {
            html += '<tr data-pbooking-id="' + b.id + '">' +
                '<td>' + escHtml(b.booking_reference) + '</td>' +
                '<td><span class="ad-route">' + escHtml(b.route_from) + ' \u2192 ' + escHtml(b.route_to) + '</span></td>' +
                '<td><span class="ad-co-name">' + escHtml(b.company_name) + '</span></td>' +
                '<td>' + formatDate(b.departure_date) + '<span class="ad-sub">' + String(b.departure_time || '').slice(0, 5) + '</span></td>' +
                '<td><span class="ad-badge ' + badgeClass(b.booking_status) + '">' + escHtml(b.booking_status || '') + '</span></td>' +
                '<td><span class="ad-badge ' + badgeClass(b.payment_status) + '">' + escHtml(b.payment_status || '') + '</span></td>' +
                '<td>' + formatMoney(b.total_amount) + '</td>' +
                '<td>' + formatDate(b.created_at) + '</td>' +
                '<td><button type="button" class="btn btn-secondary btn-sm" data-pmanifest="' + b.id + '">Manifest</button></td>' +
                '</tr>';
        });
        body.innerHTML = html;
        var buttons = body.querySelectorAll('button[data-pmanifest]');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function () {
                var id = parseInt(this.getAttribute('data-pmanifest'), 10);
                if (id > 0) { openManifest(id); }
            });
        }
    }

    function renderPassengerReviews(reviews) {
        var list = byId('ad-passenger-reviews-list');
        var empty = byId('ad-passenger-reviews-empty');
        if (!reviews.length) { list.innerHTML = ''; show(empty); return; }
        hide(empty);
        var html = '';
        reviews.forEach(function (r) {
            var rating = Math.max(0, Math.min(5, Number(r.rating) || 0));
            var stars = '';
            for (var s = 0; s < 5; s++) { stars += s < rating ? '\u2605' : '\u2606'; }
            html += '<article class="ad-passenger-review"><h4>' + escHtml(r.company_name) + '</h4>' +
                '<p class="ad-stars" aria-label="' + rating + ' out of 5 stars">' + stars + '</p>' +
                (r.comment ? '<p class="ad-passenger-review-quote">' + escHtml(r.comment) + '</p>' : '') +
                '<p><span class="ad-badge ' + badgeClass(r.status) + '">' + escHtml(r.status || 'pending') + '</span> \u00b7 ' + formatDate(r.created_at) + ' \u00b7 ' + r.likes + ' like' + (Number(r.likes) === 1 ? '' : 's') + '</p>' +
                '</article>';
        });
        list.innerHTML = html;
    }

    function renderPassengerRefunds(refunds) {
        var body = byId('ad-passenger-refunds-rows');
        if (!refunds.length) {
            body.innerHTML = '<tr><td colspan="8" class="ad-muted">No refunds recorded.</td></tr>';
            return;
        }
        var html = '';
        refunds.forEach(function (f) {
            html += '<tr>' +
                '<td>' + escHtml(f.booking_reference) + '</td>' +
                '<td>' + escHtml(f.company_name) + '</td>' +
                '<td><span class="ad-route">' + escHtml(f.route_from) + ' \u2192 ' + escHtml(f.route_to) + '</span></td>' +
                '<td><span class="ad-badge ' + badgeClass(f.refund_type) + '">' + escHtml(f.refund_type || '') + '</span></td>' +
                '<td>' + formatMoney(f.refunded_amount) + '</td>' +
                '<td><span class="ad-badge ' + badgeClass(f.booking_status) + '">' + escHtml(f.booking_status || '') + '</span></td>' +
                '<td><span class="ad-badge ' + badgeClass(f.payment_status) + '">' + escHtml(f.payment_status || '') + '</span></td>' +
                '<td>' + formatDate(f.created_at) + '</td>' +
                '</tr>';
        });
        body.innerHTML = html;
    }

    function renderPassengerLiked(liked) {
        var list = byId('ad-passenger-liked-list');
        var empty = byId('ad-passenger-liked-empty');
        if (!liked.length) { list.innerHTML = ''; show(empty); return; }
        hide(empty);
        var html = '';
        liked.forEach(function (co) {
            var logo = co.logo
                ? '<img src="' + escHtml(co.logo) + '" alt="">'
                : '<span class="ad-passenger-avatar" style="width:32px;height:32px;font-size:0.85rem;">' + escHtml(avatarInitials(co.name)) + '</span>';
            html += '<div class="ad-passenger-liked-item">' + logo +
                '<span class="ad-passenger-copy"><a href="company.html?company=' + encodeURIComponent(co.slug || '') + '" target="_blank" rel="noopener">' + escHtml(co.name) + '</a>' +
                '<span>Liked ' + co.liked_review_count + ' review' + (Number(co.liked_review_count) === 1 ? '' : 's') + ' \u00b7 ' + formatDate(co.liked_at) + '</span></span></div>';
        });
        list.innerHTML = html;
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
    function showAddFieldError(fieldId, message) {
        var field = byId(fieldId);
        var err = byId(fieldId + '-error');
        if (field) { field.setAttribute('aria-invalid', 'true'); }
        if (err) {
            err.textContent = message;
            err.hidden = false;
        }
    }

    function clearAddFieldError(fieldId) {
        var field = byId(fieldId);
        var err = byId(fieldId + '-error');
        if (field) { field.removeAttribute('aria-invalid'); }
        if (err) {
            err.textContent = '';
            err.hidden = true;
        }
    }

    function resetAddCompanyForm() {
        var form = byId('ad-add-company-form');
        if (form) { form.reset(); }
        hide(byId('ad-add-company-error'));
        ['add-company-name', 'add-company-email', 'add-company-phone',
         'add-company-password', 'add-company-confirm',
         'add-company-company-name', 'add-company-address'].forEach(clearAddFieldError);
        var reqs = document.querySelectorAll('.ad-pw-reqs li[data-pw-req]');
        for (var i = 0; i < reqs.length; i++) { reqs[i].classList.remove('is-met'); }
        var hint = byId('add-company-confirm-hint');
        if (hint) {
            hint.textContent = hint.getAttribute('data-default') || 'Passwords must match.';
            hint.className = 'ad-add-field-hint';
        }
    }

    /* Live password requirements checklist (below the input). */
    function updatePasswordRequirements() {
        var pw = byId('add-company-password');
        var value = pw ? pw.value : '';
        var checks = {
            length: value.length >= 8,
            letter: /[A-Za-z]/.test(value),
            number: /\d/.test(value)
        };
        var keys = Object.keys(checks);
        for (var i = 0; i < keys.length; i++) {
            var li = document.querySelector('.ad-pw-reqs li[data-pw-req="' + keys[i] + '"]');
            if (li) { li.classList.toggle('is-met', checks[keys[i]]); }
        }
        updateConfirmHint();
    }

    /* Live confirm-password match hint. */
    function updateConfirmHint() {
        var hint = byId('add-company-confirm-hint');
        if (!hint) { return; }
        var pw = byId('add-company-password') ? byId('add-company-password').value : '';
        var confirm = byId('add-company-confirm') ? byId('add-company-confirm').value : '';
        if (!confirm) {
            hint.textContent = hint.getAttribute('data-default') || 'Passwords must match.';
            hint.className = 'ad-add-field-hint';
        } else if (pw === confirm) {
            hint.textContent = 'Passwords match.';
            hint.className = 'ad-add-field-hint ok';
        } else {
            hint.textContent = 'Passwords do not match.';
            hint.className = 'ad-add-field-hint bad';
        }
    }

    /* Phone is locked to +251; the field only holds the local 9 digits. */
    function sanitizeAddCompanyPhone() {
        var input = byId('add-company-phone');
        if (!input) { return; }
        var digits = input.value.replace(/\D/g, '');
        if (digits.length === 10 && digits.charAt(0) === '0') { digits = digits.slice(1); }
        if (digits.indexOf('251') === 0 && digits.length >= 10) { digits = digits.slice(3); }
        if (digits.length > 9) { digits = digits.slice(0, 9); }
        input.value = digits;
    }

    function openAddCompany() {
        var modal = byId('ad-add-company-modal');
        if (!modal) { return; }
        resetAddCompanyForm();
        modal.hidden = false;
        var first = byId('add-company-name');
        if (first) { first.focus(); }
    }

    function closeAddCompany() {
        var modal = byId('ad-add-company-modal');
        if (modal) { modal.hidden = true; }
    }

    function validateAddCompanyField(fieldId) {
        switch (fieldId) {
        case 'add-company-name': {
            var name = byId(fieldId).value.trim();
            if (name.length < 2) { showAddFieldError(fieldId, 'Please enter a valid full name.'); return false; }
            clearAddFieldError(fieldId);
            return true;
        }
        case 'add-company-email': {
            var email = byId(fieldId).value.trim();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showAddFieldError(fieldId, 'Please enter a valid email address.'); return false; }
            clearAddFieldError(fieldId);
            return true;
        }
        case 'add-company-phone': {
            var digits = byId(fieldId).value.replace(/\D/g, '');
            if (!/^[1-9][0-9]{8}$/.test(digits)) {
                showAddFieldError(fieldId, 'Enter a valid Ethiopian phone: +251 followed by 9 digits (mobile 9X / 7X or landline 1X…).');
                return false;
            }
            clearAddFieldError(fieldId);
            return true;
        }
        case 'add-company-password': {
            var pw = byId(fieldId).value;
            if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
                showAddFieldError(fieldId, 'Password must be at least 8 characters and include letters and numbers.');
                return false;
            }
            clearAddFieldError(fieldId);
            return true;
        }
        case 'add-company-confirm': {
            var confirm = byId(fieldId).value;
            var original = byId('add-company-password').value;
            updateConfirmHint();
            return confirm !== '' && confirm === original;
        }
        case 'add-company-company-name': {
            var companyName = byId(fieldId).value.trim();
            if (companyName.length < 2) { showAddFieldError(fieldId, 'Company name is required.'); return false; }
            clearAddFieldError(fieldId);
            return true;
        }
        case 'add-company-address': {
            var address = byId(fieldId).value.trim();
            if (address === '') { showAddFieldError(fieldId, 'Company address is required.'); return false; }
            clearAddFieldError(fieldId);
            return true;
        }
        }
        return true;
    }

    function submitAddCompany(e) {
        e.preventDefault();

        var msg = byId('ad-add-company-error');
        var submitBtn = byId('btn-add-company-submit');

        sanitizeAddCompanyPhone();
        updatePasswordRequirements();

        var fields = [
            'add-company-name',
            'add-company-email',
            'add-company-phone',
            'add-company-password',
            'add-company-confirm',
            'add-company-company-name',
            'add-company-address'
        ];

        for (var i = 0; i < fields.length; i++) {
            if (!validateAddCompanyField(fields[i])) {
                var badField = byId(fields[i]);
                if (badField) { badField.focus(); }
                return;
            }
        }

        hide(msg);
        if (submitBtn) { submitBtn.disabled = true; }

        /* Same endpoint + payload the public company registration posts to. */
        var payload = {
            role: 'company',
            name: byId('add-company-name').value.trim(),
            email: byId('add-company-email').value.trim(),
            phone: '+251' + byId('add-company-phone').value.replace(/\D/g, ''),
            password: byId('add-company-password').value,
            password_confirmation: byId('add-company-confirm').value,
            company_name: byId('add-company-company-name').value.trim(),
            company_address: byId('add-company-address').value.trim(),
            company_description: byId('add-company-description').value.trim()
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
                toast(res.message || 'Company account created successfully.');
                loadCompanies();
                loadOverview();
            })
            .catch(function () {
                if (submitBtn) { submitBtn.disabled = false; }
                setError(msg, 'Could not reach the server. Please try again.');
            });
    }

 /* ---------- Admin complaint oversight ---------- */
    var adminComplaintTarget = 'company'; // 'company' | 'platform' — which scope the list shows
    var adminComplaintFilter = null;      // status filter; null shows every status
    var adminComplaints = [];
    var adminComplaintCounts = {};        // status → count across both scopes
    var adminCompanyComplaintCounts = {}; // status → count for company-targeted complaints
    var adminPlatformComplaintCounts = {};// status → count for platform-targeted complaints
    var activeAdminComplaint = null;
    var adminComplaintSending = false;    // guard: one composer send at a time
    var adminComplaintCompanyId = null;   // null = company overview; set = drilled into one company

    var ADMIN_COMPLAINT_STATUSES = [
        ['open', 'Open'],
        ['in_progress', 'In progress'],
        ['resolved_pending', 'Awaiting confirmation'],
        ['resolved', 'Resolved'],
        ['closed', 'Closed'],
        ['escalated', 'Escalated']
    ];

    var ADMIN_COMPLAINT_CATEGORY_LABELS = {
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

    function adminComplaintStatusLabel(status) {
        for (var i = 0; i < ADMIN_COMPLAINT_STATUSES.length; i++) {
            if (ADMIN_COMPLAINT_STATUSES[i][0] === status) { return ADMIN_COMPLAINT_STATUSES[i][1]; }
        }
        return 'Open';
    }

    function adminComplaintCategoryLabel(category) {
        return ADMIN_COMPLAINT_CATEGORY_LABELS[category] || 'Other';
    }

    /* Display name for the other side of a complaint. Platform complaints are
       against ET Transport itself, so there is no bus company to name. */
    function adminComplaintCounterparty(c) {
        if (!c) { return 'ET Transport'; }
        if (c.target === 'platform' || !c.company_id) { return 'ET Transport'; }
        return c.company_name || 'Company';
    }

    function adminComplaintBadge(status) {
        var safe = String(status || 'open').replace(/[^a-z_]/g, '');
        return '<span class="ad-complaint-status-badge is-' + escHtml(safe) + '">' + escHtml(adminComplaintStatusLabel(status)) + '</span>';
    }

    function adminComplaintPillHtml(status) {
        var safe = String(status || 'open').replace(/[^a-z_]/g, '');
        return '<span class="ad-chat-status-pill is-' + escHtml(safe) + '">' + escHtml(adminComplaintStatusLabel(status)) + '</span>';
    }

    function adminComplaintCardsHtml(complaints) {
        var html = '';
        for (var i = 0; i < complaints.length; i++) {
            var c = complaints[i];
            var isPlatform = c.target === 'platform' || !c.company_id;
            var initial = String(c.passenger_name || 'P').trim().charAt(0).toUpperCase() || 'P';
            var context = '';
            if (c.booking_reference || c.route || c.departure) {
                if (c.booking_reference) { context += '<span>Booking ' + escHtml(c.booking_reference) + '</span>'; }
                if (c.route) { context += '<span>' + escHtml(c.route) + '</span>'; }
                if (c.departure) { context += '<span>Departs ' + escHtml(c.departure) + '</span>'; }
            }
            var responseCount = (Array.isArray(c.responses) && c.responses.length) ? c.responses.length : 0;
            html += '<article class="ad-complaint-card' + (c.status === 'open' ? ' is-new' : '') + '" data-admin-complaint-id="' + c.id + '">' +
                '<div class="ad-complaint-card-head">' +
                    '<span class="ad-complaint-avatar" aria-hidden="true">' + escHtml(initial) + '</span>' +
                    '<div class="ad-complaint-person">' +
                        '<strong>' + escHtml(c.passenger_name || 'Passenger') + '</strong>' +
                        '<span class="ad-complaint-meta">' + escHtml(adminComplaintCounterparty(c)) + (formatReviewDate(c.created_at) ? ' &middot; ' + escHtml(formatReviewDate(c.created_at)) : '') + '</span>' +
                    '</div>' +
                    adminComplaintBadge(c.status) +
                '</div>' +
                '<h4 class="ad-complaint-subject">' + escHtml(c.subject) + '</h4>' +
                '<p class="ad-complaint-text">' + escHtml(c.message) + '</p>' +
                (context ? '<div class="ad-complaint-context">' + context + '</div>' : '') +
                '<div class="ad-complaint-actions">' +
                    '<span class="ad-complaint-category">' + escHtml(adminComplaintCategoryLabel(c.category)) + '</span>' +
                    '<button type="button" class="btn btn-primary btn-sm ad-complaint-handle-btn" data-admin-complaint-open="' + c.id + '">' +
                        (responseCount ? 'Handle complaint (' + responseCount + ')' : 'Handle complaint') +
                    '</button>' +
                '</div>' +
            '</article>';
        }
        return html;
    }

    /* Section label shown above a group of complaints (one per company, or a
       single block for ET Transport platform complaints). */
    function adminComplaintGroupHeadHtml(label, sub, count) {
        return '<div class="ad-complaint-group-head">' +
            '<span class="ad-complaint-group-avatar" aria-hidden="true">' + escHtml(String(label || '?').charAt(0).toUpperCase()) + '</span>' +
            '<strong>' + escHtml(label) + '</strong>' +
            (sub ? '<small>' + escHtml(sub) + '</small>' : '') +
            '<span class="ad-complaint-group-count">' + Number(count) + ' complaint' + (Number(count) === 1 ? '' : 's') + '</span>' +
        '</div>';
    }

    function adminComplaintCountsForTarget() {
        if (adminComplaintTarget === 'platform') { return adminPlatformComplaintCounts; }
        return adminCompanyComplaintCounts;
    }

    function adminComplaintCountTotal(counts) {
        var total = 0;
        for (var statusKey in counts) { total += Number(counts[statusKey]) || 0; }
        return total;
    }

    /* Summary chips — the active scope's status totals (company vs platform). */
    function renderAdminComplaintSummary() {
        var el = byId('ad-complaints-summary'); if (!el) { return; }
        var counts = adminComplaintCountsForTarget();
        var total = adminComplaintCountTotal(counts);
        el.hidden = false;
        el.innerHTML =
            '<div class="ad-complaint-summary-stat"><b>' + total + '</b><span>Total</span></div>' +
            '<div class="ad-complaint-summary-stat is-open"><b>' + (Number(counts.open) || 0) + '</b><span>Open</span></div>' +
            '<div class="ad-complaint-summary-stat is-in_progress"><b>' + (Number(counts.in_progress) || 0) + '</b><span>In progress</span></div>' +
            '<div class="ad-complaint-summary-stat is-resolved_pending"><b>' + (Number(counts.resolved_pending) || 0) + '</b><span>Awaiting confirmation</span></div>' +
            '<div class="ad-complaint-summary-stat is-resolved"><b>' + (Number(counts.resolved) || 0) + '</b><span>Resolved</span></div>' +
            '<div class="ad-complaint-summary-stat is-escalated"><b>' + (Number(counts.escalated) || 0) + '</b><span>Escalated</span></div>' +
            '<div class="ad-complaint-summary-stat is-closed"><b>' + (Number(counts.closed) || 0) + '</b><span>Closed</span></div>';
    }

    /* Status pill toolbar with per-status counts for the active scope. */
    function renderAdminComplaintFilterBar() {
        var bar = byId('ad-complaints-filterbar'); if (!bar) { return; }
        if (!adminComplaints.length && adminComplaintFilter === null) { bar.hidden = true; bar.innerHTML = ''; return; }
        var options = [[null, 'All'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved_pending', 'Awaiting confirmation'], ['escalated', 'Escalated'], ['resolved', 'Resolved'], ['closed', 'Closed']];
        var counts = adminComplaintCountsForTarget();
        var total = adminComplaintCountTotal(counts);
        var html = '';
        for (var i = 0; i < options.length; i++) {
            var val = options[i][0]; var label = options[i][1];
            var active = adminComplaintFilter === val;
            var count = val === null ? total : (Number(counts[val]) || 0);
            html += '<button type="button" class="ad-complaint-filter' + (active ? ' is-active' : '') + '" data-complaint-filter="' + (val === null ? '' : val) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + label + ' <span class="ad-complaint-filter-count">' + count + '</span></button>';
        }
        bar.innerHTML = html;
        bar.hidden = false;
    }

    function adminComplaintMatchesFilter(c) {
        return adminComplaintFilter === null || String(c.status) === adminComplaintFilter;
    }

    /* Group complaints by company (or a single 'platform' group). */
    function adminComplaintGroups(shown) {
        var isPlatform = adminComplaintTarget === 'platform';
        var groups = {};
        var order = [];
        for (var i = 0; i < shown.length; i++) {
            var c = shown[i];
            var key = isPlatform ? 'platform' : String(c.company_id || '0');
            if (!groups[key]) {
                groups[key] = {
                    id: key,
                    name: isPlatform ? 'ET Transport' : (c.company_name || 'Company'),
                    list: []
                };
                order.push(key);
            }
            groups[key].list.push(c);
        }
        order.sort(function (a, b) {
            return String(groups[a].name).toLowerCase().localeCompare(String(groups[b].name).toLowerCase());
        });
        var out = [];
        for (var g = 0; g < order.length; g++) { out.push(groups[order[g]]); }
        return out;
    }

    /* Company overview card: avatar, name, the complaint count, and open /
       escalated chips. Returns '' when the status filter hides every complaint. */
    function adminComplaintCompanyCardHtml(group, isPlatform) {
        var matched = [];
        for (var i = 0; i < group.list.length; i++) {
            if (adminComplaintMatchesFilter(group.list[i])) { matched.push(group.list[i]); }
        }
        if (adminComplaintFilter !== null && !matched.length) { return ''; }

        var initial = String(group.name || '?').trim().charAt(0).toUpperCase() || '?';
        var openN = 0; var escN = 0;
        for (var j = 0; j < matched.length; j++) {
            if (matched[j].status === 'open') { openN++; }
            else if (matched[j].status === 'escalated') { escN++; }
        }
        var chips = '';
        if (openN) { chips += '<span class="ad-complaint-co-chip is-open">' + openN + ' open</span>'; }
        if (escN) { chips += '<span class="ad-complaint-co-chip is-escalated">' + escN + ' escalated</span>'; }
        if (!chips) {
            chips = '<span class="ad-complaint-co-chip is-total">' + matched.length + ' complaint' + (matched.length === 1 ? '' : 's') + '</span>';
        }
        return '<button type="button" class="ad-complaint-co-card" data-admin-complaint-company="' + escHtml(group.id) + '">' +
            '<div class="ad-complaint-co-top">' +
                '<span class="ad-complaint-co-avatar" aria-hidden="true">' + escHtml(initial) + '</span>' +
                '<span class="ad-complaint-co-info">' +
                    '<strong>' + escHtml(group.name) + '</strong>' +
                    '<small>' + (isPlatform ? 'Platform complaints' : 'Bus company') + '</small>' +
                '</span>' +
                '<span class="ad-complaint-co-count">' + matched.length + '</span>' +
            '</div>' +
            '<div class="ad-complaint-co-chips">' + chips + '</div>' +
            '<span class="ad-complaint-co-card-hint">View complaints &rarr;</span>' +
        '</button>';
    }

    /* Detail header shown when drilled into one company's complaints. */
    function adminComplaintDetailHeadHtml(group, count, isPlatform) {
        var initial = String(group.name || '?').trim().charAt(0).toUpperCase() || '?';
        return '<div class="ad-complaint-detail-head">' +
            '<button type="button" class="ad-complaint-back" data-admin-complaint-back="1">&larr; ' + (isPlatform ? 'Overview' : 'All companies') + '</button>' +
            '<span class="ad-complaint-co-avatar" aria-hidden="true">' + escHtml(initial) + '</span>' +
            '<strong>' + escHtml(group.name) + '</strong>' +
            '<span class="ad-complaint-detail-count">' + Number(count) + ' complaint' + (Number(count) === 1 ? '' : 's') + '</span>' +
        '</div>';
    }

    function renderAdminComplaints() {
        var list = byId('ad-complaints-list'); if (!list) { return; }
        var empty = byId('ad-complaints-empty');
        hide(byId('ad-complaints-loading'));
        hide(byId('ad-complaints-error'));

        var target = adminComplaintTarget === 'platform' ? 'platform' : 'company';
        var isPlatform = target === 'platform';
        var shown = [];
        for (var i = 0; i < adminComplaints.length; i++) {
            var c = adminComplaints[i];
            var isPlat = c.target === 'platform' || !c.company_id;
            if ((isPlat && isPlatform) || (!isPlat && !isPlatform)) { shown.push(c); }
        }

        renderAdminComplaintSummary();
        renderAdminComplaintFilterBar();

        if (!shown.length) {
            list.innerHTML = ''; list.hidden = true;
            if (empty) {
                empty.hidden = false;
                empty.textContent = isPlatform ? 'No platform complaints yet.' : 'No company complaints yet.';
            }
            return;
        }

        var groups = adminComplaintGroups(shown);
        var html = '';

        /* Level 1 — companies overview: one card per company with its count. */
        if (adminComplaintCompanyId === null) {
            var cards = '';
            var cardCount = 0;
            for (var g0 = 0; g0 < groups.length; g0++) {
                var card = adminComplaintCompanyCardHtml(groups[g0], isPlatform);
                if (card) { cards += card; cardCount++; }
            }
            if (!cards) {
                list.innerHTML = ''; list.hidden = true;
                if (empty) { empty.hidden = false; empty.textContent = 'No complaints match the selected status.'; }
                return;
            }
            if (!isPlatform) {
                html += adminComplaintGroupHeadHtml('Companies', 'Complaints by company', cardCount);
            }
            html += '<div class="ad-complaint-co-grid">' + cards + '</div>';
            list.innerHTML = html;
            list.hidden = false;
            if (empty) { empty.hidden = true; }
            return;
        }

        /* Level 2 — one company's complaints. */
        var current = null;
        for (var gi = 0; gi < groups.length; gi++) {
            if (String(groups[gi].id) === String(adminComplaintCompanyId)) { current = groups[gi]; break; }
        }
        if (!current) {
            adminComplaintCompanyId = null;
            renderAdminComplaints();
            return;
        }
        var filtered = [];
        for (var fi = 0; fi < current.list.length; fi++) {
            if (adminComplaintMatchesFilter(current.list[fi])) { filtered.push(current.list[fi]); }
        }
        html = adminComplaintDetailHeadHtml(current, filtered.length, isPlatform);
        if (!filtered.length) {
            list.innerHTML = html;
            list.hidden = false;
            if (empty) {
                empty.hidden = false;
                empty.textContent = adminComplaintFilter === null
                    ? 'No complaints for this company yet.'
                    : 'No complaints match the selected status.';
            }
            return;
        }
        html += adminComplaintCardsHtml(filtered);
        list.innerHTML = html;
        list.hidden = false;
        if (empty) { empty.hidden = true; }
    }

    function loadAdminComplaints() {
        var loading = byId('ad-complaints-loading'); if (loading) { loading.hidden = false; }
        var error = byId('ad-complaints-error'); if (error) { error.hidden = true; }
        fetch('api/admin.php?action=complaints', {
            method: 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' }
        })
            .then(parseJson)
            .then(function (result) {
                hide(byId('ad-complaints-loading'));
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    var e = byId('ad-complaints-error');
                    if (e) { e.textContent = data.message || 'Unable to load complaints.'; show(e); }
                    return;
                }
                adminComplaints = Array.isArray(data.complaints) ? data.complaints : [];
                adminComplaintCounts = data.counts || {};
                adminCompanyComplaintCounts = data.company_counts || {};
                adminPlatformComplaintCounts = data.platform_counts || {};
                renderAdminComplaints();
            })
            .catch(function () {
                hide(byId('ad-complaints-loading'));
                var e = byId('ad-complaints-error');
                if (e) { e.textContent = 'Network error while loading complaints.'; show(e); }
            });
    }

function adminComplaintTime(value) {
        if (!value) { return ''; }
        var iso = String(value).indexOf(' ') > 0 ? String(value).replace(' ', 'T') : String(value);
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return ''; }
        try { return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
        catch (e) { return ''; }
    }

    function adminComplaintBubbleMeta(who, when) {
        return '<span class="ad-chat-bubble-meta">' + escHtml(who) + (when ? ' \u00b7 ' + escHtml(when) : '') + '</span>';
    }

    /* Ordered chat stream: the passenger's original complaint as the opening
       bubble, then every thread entry (status tellers render as centered
       chips; messages align by actor — passenger left, company/admin right). */
    function adminComplaintThreadHtml(c) {
        var html = '';
        var initial = String(c.passenger_name || 'P').trim().charAt(0).toUpperCase() || 'P';
        html += '<div class="ad-chat-row is-passenger">' +
            '<span class="ad-chat-avatar" aria-hidden="true">' + escHtml(initial) + '</span>' +
            '<div class="ad-chat-bubble is-passenger">' +
                '<p>' + escHtml(c.message) + '</p>' +
                adminComplaintBubbleMeta(c.passenger_name || 'Passenger', adminComplaintTime(c.created_at)) +
            '</div>' +
        '</div>';
        var entries = (Array.isArray(c.responses) && c.responses.length) ? c.responses : [];
        var prevSide = 'passenger';
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (e.kind === 'status') {
                html += '<div class="ad-chat-teller"><span class="ad-chat-teller-text">' + escHtml(e.message) + '</span>' +
                    (e.created_at ? '<span class="ad-chat-teller-meta">' + escHtml(adminComplaintTime(e.created_at)) + '</span>' : '') + '</div>';
                prevSide = null;
                continue;
            }
            var side = e.actor === 'passenger' ? 'passenger' : (e.actor === 'admin' ? 'admin' : 'company');
            var who = e.actor === 'passenger' ? (c.passenger_name || 'Passenger') : (e.actor === 'admin' ? 'ET Transport Support' : adminComplaintCounterparty(c));
            var avatar = side === 'passenger' ? initial : (side === 'admin' ? 'ET' : String(adminComplaintCounterparty(c) || 'C').trim().charAt(0).toUpperCase() || 'C');
            var cont = prevSide === side;
            html += '<div class="ad-chat-row is-' + side + (cont ? ' is-continuation' : '') + '">' +
                '<span class="ad-chat-avatar' + (side === 'company' ? ' is-company' : '') + (side === 'admin' ? ' is-admin' : '') + '" aria-hidden="true">' + escHtml(avatar) + '</span>' +
                '<div class="ad-chat-bubble is-' + side + '">' +
                    '<p>' + escHtml(e.message) + '</p>' +
                    adminComplaintBubbleMeta(who, adminComplaintTime(e.created_at)) +
                '</div>' +
            '</div>';
            prevSide = side;
        }
        return html || '<div class="ad-chat-teller"><span class="ad-chat-teller-text">' + escHtml(c.message) + '</span></div>';
    }

    function adminComplaintStatusOptions(selected) {
        var opts = [['open','Open'],['in_progress','In progress'],['resolved_pending','Awaiting confirmation'],['resolved','Resolved'],['closed','Closed'],['escalated','Escalated']];
        var html = '';
        for (var i = 0; i < opts.length; i++) {
            html += '<option value="' + opts[i][0] + '"' + (selected === opts[i][0] ? ' selected' : '') + '>' + opts[i][1] + '</option>';
        }
        return html;
    }

    function renderAdminComplaintModal() {
        var c = activeAdminComplaint; if (!c) { return; }
        var box = byId('ad-complaint-modal-box'); if (!box) { return; }
        var initial = String(c.passenger_name || 'P').trim().charAt(0).toUpperCase() || 'P';
        box.innerHTML =
            '<div class="ad-chat-head">' +
                '<div class="ad-chat-head-person">' +
                    '<span class="ad-complaint-avatar" aria-hidden="true">' + escHtml(initial) + '</span>' +
                    '<div class="ad-chat-head-info">' +
                        '<strong id="ad-complaint-modal-title">' + escHtml(c.subject) + '</strong>' +
                        '<small>' + escHtml(c.passenger_name || 'Passenger') + ' \u00b7 ' + escHtml(adminComplaintCounterparty(c)) + '</small>' +
                    '</div>' +
                '</div>' +
                '<button type="button" id="ad-complaint-close" class="ad-complaint-modal-close" aria-label="Close complaint">\u00d7</button>' +
            '</div>' +
            '<div class="ad-chat-statusbar">' +
                '<div class="ad-chat-statusbar-top">' +
                    '<span class="ad-chat-statusbar-label">Status</span>' +
                    adminComplaintPillHtml(c.status) +
                    '<span class="ad-chat-statusbar-hint">Set where the complaint stands</span>' +
                '</div>' +
                '<div class="ad-chat-statusbar-row">' +
                    '<select id="ad-complaint-status">' + adminComplaintStatusOptions(c.status) + '</select>' +
                    '<button type="button" id="ad-complaint-status-apply" class="btn btn-sm ad-chat-status-apply" disabled>Update status</button>' +
                '</div>' +
                '<p id="ad-complaint-status-msg" class="ad-chat-status-msg" hidden></p>' +
            '</div>' +
            '<div class="ad-chat-thread">' + adminComplaintThreadHtml(c) + '</div>' +
            '<div class="ad-chat-composer">' +
                '<div class="ad-chat-composer-row">' +
                    '<textarea id="ad-complaint-response" maxlength="1000" rows="1" placeholder="Write a message to the passenger and company\u2026"></textarea>' +
                    '<button type="button" id="ad-complaint-send" class="ad-chat-send-btn" aria-label="Send message" disabled>' +
                        '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>' +
                    '</button>' +
                '</div>' +
                '<div id="ad-complaint-modal-error" class="ad-complaint-modal-error" role="alert" hidden></div>' +
                '<p id="ad-complaint-sent" class="ad-chat-sent-note" role="status" hidden></p>' +
            '</div>';
        var modal = byId('ad-complaint-modal');
        if (modal) { modal.hidden = false; }
        var thread = box.querySelector('.ad-chat-thread');
        if (thread) { thread.scrollTop = thread.scrollHeight; }
        var composer = byId('ad-complaint-response');
        if (composer && composer.focus) { try { composer.focus(); } catch (e) { } }

        /* Complaints modal — the status changer and composer live in the modal
           content, which is rebuilt on every open, so these listeners are
           attached here (re-run each render), not once at init time. */
        var statusSel = byId('ad-complaint-status');
        var statusApply = byId('ad-complaint-status-apply');
        if (statusSel && statusApply) {
            var keepChanged = statusSel.value !== (c.status || '');
            statusSel.classList.toggle('is-changed', keepChanged);
            statusApply.disabled = !keepChanged;
            statusSel.addEventListener('change', function () {
                var changed = statusSel.value !== (activeAdminComplaint ? activeAdminComplaint.status : '');
                statusSel.classList.toggle('is-changed', changed);
                if (statusApply) { statusApply.disabled = !changed; }
            });
        }
        var respTa = byId('ad-complaint-response');
        var sendBtn = byId('ad-complaint-send');
        if (respTa && sendBtn) {
            sendBtn.disabled = respTa.value.trim().length === 0;
            respTa.addEventListener('input', function () {
                sendBtn.disabled = respTa.value.trim().length === 0;
                var err = byId('ad-complaint-modal-error'); if (err) { err.hidden = true; }
            });
            respTa.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!sendBtn.disabled) { submitAdminComplaintResponse(); }
                }
            });
        }
    }

    function openAdminComplaint(id) {
        var match = adminComplaints.filter(function (c) { return Number(c.id) === Number(id); })[0];
        if (!match) { return; }
        activeAdminComplaint = match;
        adminComplaintSending = false;
        renderAdminComplaintModal();
    }

    function closeAdminComplaintModal() {
        var modal = byId('ad-complaint-modal');
        if (modal) { modal.hidden = true; }
        activeAdminComplaint = null;
        adminComplaintSending = false;
    }

    /* Shared POST to api/admin.php?action=complaint_update. */
    function adminComplaintPost(payload, onDone) {
        var body = new URLSearchParams();
        body.append('complaint_id', activeAdminComplaint.id);
        for (var key in payload) { body.append(key, payload[key]); }
        fetch('api/admin.php?action=complaint_update', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
            body: body.toString()
        })
            .then(parseJson)
            .then(function (result) {
                var data = result.data || {};
                if (!result.ok || result.status !== 200 || !data.success) {
                    onDone(false, data.message || 'Unable to update the complaint.');
                    return;
                }
                if (data.complaint) {
                    activeAdminComplaint = data.complaint;
                    for (var i = 0; i < adminComplaints.length; i++) {
                        if (Number(adminComplaints[i].id) === Number(data.complaint.id)) { adminComplaints[i] = data.complaint; }
                    }
                }
                onDone(true, '');
            })
            .catch(function () {
                onDone(false, 'Network error while updating the complaint.');
            });
    }

    function adminComplaintShowError(message) {
        var err = byId('ad-complaint-modal-error');
        if (err) { err.textContent = message; err.hidden = false; }
    }

    /* Send a chat message (composer only). Status changes are a separate
       action via the status changer — mirroring the company dashboard. */
    function submitAdminComplaintResponse() {
        var c = activeAdminComplaint; if (!c || adminComplaintSending) { return; }
        var respEl = byId('ad-complaint-response');
        var response = respEl ? respEl.value.trim() : '';
        if (!response) { adminComplaintShowError('Type a message first.'); return; }
        adminComplaintSending = true;
        var btn = byId('ad-complaint-send');
        if (btn) { btn.disabled = true; }
        var err = byId('ad-complaint-modal-error'); if (err) { err.hidden = true; }
        adminComplaintPost({ response: response }, function (ok, message) {
            adminComplaintSending = false;
            if (!ok) {
                if (btn) { btn.disabled = false; }
                if (respEl) { respEl.value = response; }
                adminComplaintShowError(message || 'Unable to send the message.');
                return;
            }
            if (respEl) { respEl.value = ''; }
            renderAdminComplaintModal();
            var sent = byId('ad-complaint-sent');
            if (sent) { sent.textContent = 'Message sent \u2014 the passenger and company can see it.'; sent.hidden = false; setTimeout(function () { sent.hidden = true; }, 3000); }
            loadAdminComplaints();
        });
    }

    /* Update only the complaint status from the status changer. */
    function submitAdminComplaintStatus() {
        var c = activeAdminComplaint; if (!c) { return; }
        var statusEl = byId('ad-complaint-status');
        var status = statusEl ? statusEl.value : c.status;
        if (status === c.status) { return; }
        var btn = byId('ad-complaint-status-apply');
        var msg = byId('ad-complaint-status-msg');
        if (btn) { btn.disabled = true; }
        if (msg) { msg.hidden = true; }
        adminComplaintPost({ status: status }, function (ok, message) {
            if (!ok) {
                if (btn) { btn.disabled = false; }
                if (msg) { msg.textContent = message || 'Unable to update the status.'; msg.className = 'ad-chat-status-msg is-err'; msg.hidden = false; }
                return;
            }
            renderAdminComplaintModal();
            if (msg) { msg.textContent = 'Status updated.'; msg.className = 'ad-chat-status-msg is-ok'; msg.hidden = false; setTimeout(function () { msg.hidden = true; }, 3000); }
            loadAdminComplaints();
        });
    }

    /* ---------- Wiring ---------- */
    function init() {
        loadIdentity();

        /* Restore the previously active section from the URL hash (e.g.
           #companies, #revenue) instead of always opening on Overview. */
        var requested = window.location.hash.replace('#', '');
        switchSection(sectionMap[requested] ? requested : 'overview');

        loadOverview();
        loadCompanies();
        /* Pre-load revenue + passengers into their hidden tables so the tbody
           is already populated when an operator opens the section. This avoids
           an empty flash while the first fetch resolves. The sections stay
           hidden until clicked (switchSection toggles visibility). */
        loadRevenue();
        loadPassengers();

        /* Status pill buttons (All / Pending / Approved / Suspended / Rejected). */
        var statusBtns = document.querySelectorAll('.ad-status-filter[data-status-filter]');
        for (var si = 0; si < statusBtns.length; si++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    setCompanyStatusFilter(btn.getAttribute('data-status-filter') || '');
                });
            })(statusBtns[si]);
        }

        /* Company list — live search input (name / slug / email). */
        var compSearch = byId('ad-company-search');
        if (compSearch) {
            compSearch.addEventListener('input', debounce(function () {
                selectedCompanySearch = compSearch.value.trim();
                applyFilter();
            }, 200));
            compSearch.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    selectedCompanySearch = compSearch.value.trim();
                    applyFilter();
                }
            });
        }

        /* Revenue section — search + status + sort controls. */
        var revStatus = byId('ad-rev-status');
        if (revStatus) { revStatus.addEventListener('change', applyRevenueFilters); }
        var revSort = byId('ad-rev-sort');
        if (revSort) { revSort.addEventListener('change', applyRevenueFilters); }
        var revSearch = byId('ad-rev-search');
        if (revSearch) {
            revSearch.addEventListener('input', debounce(applyRevenueFilters, 250));
            revSearch.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { applyRevenueFilters(); }
            });
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

        /* Live per-field validation in the Add Company modal. */
        ['add-company-name', 'add-company-email', 'add-company-phone',
         'add-company-company-name', 'add-company-address'].forEach(function (id) {
            var el = byId(id);
            if (el) {
                el.addEventListener('blur', function () { validateAddCompanyField(id); });
                el.addEventListener('input', function () { clearAddFieldError(id); });
            }
        });
        ['add-company-password', 'add-company-confirm'].forEach(function (id) {
            var el = byId(id);
            if (el) {
                el.addEventListener('blur', function () { validateAddCompanyField(id); });
                el.addEventListener('input', function () {
                    updatePasswordRequirements();
                    clearAddFieldError(id);
                });
            }
        });
        var addPhone = byId('add-company-phone');
        if (addPhone) {
            addPhone.addEventListener('input', function () {
                sanitizeAddCompanyPhone();
                clearAddFieldError('add-company-phone');
            });
        }

        var refreshReviews = byId('btn-refresh-reviews');
        if (refreshReviews) { refreshReviews.addEventListener('click', loadReviews); }

        var reviewsFilterBar = byId('ad-reviews-filterbar');
        if (reviewsFilterBar) {
            reviewsFilterBar.addEventListener('click', function (ev) {
                var btn = ev.target.closest ? ev.target.closest('.ad-review-filter') : null;
                if (!btn) { return; }
                var raw = btn.getAttribute('data-review-filter');
                reviewFilter = raw === '' ? null : Number(raw);
                renderReviewFilterBar();
                renderReviewCards();
            });
        }

        var reviewsListEl = byId('ad-reviews-list');
        if (reviewsListEl) {
            reviewsListEl.addEventListener('input', function (ev) {
                var input = ev.target;
                if (!input || !input.classList || !input.classList.contains('ad-review-reply-input')) { return; }
                var card = input.closest ? input.closest('.ad-review-card') : null;
                var count = card ? card.querySelector('[data-review-reply-count]') : null;
                if (count) { count.textContent = input.value.length + ' / 1000'; }
            });
            reviewsListEl.addEventListener('click', function (ev) {
                var target = ev.target.closest ? ev.target.closest('.ad-review-like, .ad-review-reply-btn, .ad-review-reply-save, .ad-review-reply-cancel') : null;
                if (!target) { return; }
                var id = target.getAttribute('data-review-id');
                if (!id) { return; }
                if (target.classList.contains('ad-review-like')) { toggleReviewLike(id); return; }
                if (target.classList.contains('ad-review-reply-btn')) { beginReviewReply(id); return; }
                if (target.classList.contains('ad-review-reply-cancel')) { cancelReviewReply(); return; }
                if (target.classList.contains('ad-review-reply-save')) {
                    var card = target.closest ? target.closest('.ad-review-card') : null;
                    var input = card ? card.querySelector('.ad-review-reply-input') : null;
                    submitReviewReply(id, input ? input.value : '');
                }
            });
        }

        var closeBtn = byId('btn-close-detail');
        if (closeBtn) { closeBtn.addEventListener('click', closeDetail); }

        var modalCancel = byId('ad-modal-cancel');
        if (modalCancel) { modalCancel.addEventListener('click', closeModal); }

        var modalPw = byId('ad-modal-password');
        if (modalPw) {
            modalPw.addEventListener('input', syncConfirmPassword);
            modalPw.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    var btn = byId('ad-modal-confirm');
                    if (btn && !btn.disabled) { btn.click(); }
                }
            });
        }

                        var modalConfirm = byId('ad-modal-confirm');
        if (modalConfirm) {
            modalConfirm.addEventListener('click', function () {
                var m = pendingMutation;
                if (!m) { return; }
                pendingMutation = null;
                runMutation(m.action, m.companyId, m.reason);
            });
        }

        /* Reason modal wiring (Reject / Suspend). */
        var reasonClose = byId('btn-reason-close');
        if (reasonClose) { reasonClose.addEventListener('click', closeReasonModal); }
        var reasonCancel = byId('btn-reason-cancel');
        if (reasonCancel) { reasonCancel.addEventListener('click', closeReasonModal); }
        var reasonConfirm = byId('btn-reason-confirm');
        if (reasonConfirm) { reasonConfirm.addEventListener('click', submitReason); }
        var reasonTextarea = byId('ad-reason-text');
        if (reasonTextarea) {
            reasonTextarea.addEventListener('input', syncReasonState);
        }
        var reasonModal = byId('ad-reason-modal');
        if (reasonModal) {
            reasonModal.addEventListener('click', function (e) {
                if (e.target === reasonModal) { closeReasonModal(); }
            });
        }

/* ---- wiring: tabs, filters, refresh, manifest ---- */
        var tabBtns = document.querySelectorAll('#ad-tabs .ad-tab');
        for (var ti = 0; ti < tabBtns.length; ti++) {
            tabBtns[ti].addEventListener('click', function () {
                switchSection(this.getAttribute('data-section'));
            });
        }

        var refreshRevenue = byId('btn-refresh-revenue'); if (refreshRevenue) { refreshRevenue.addEventListener('click', loadRevenue); }
        var applyRevenue = byId('btn-apply-revenue'); if (applyRevenue) { applyRevenue.addEventListener('click', loadCompanyRevenue); }
        var searchPass = byId('btn-search-passengers'); if (searchPass) { searchPass.addEventListener('click', loadPassengers); }

        var manClose = byId('ad-manifest-close'); if (manClose) { manClose.addEventListener('click', closeManifest); }
        var manModal = byId('ad-manifest-modal');
        if (manModal) {
            manModal.addEventListener('click', function (e) {
                if (e.target === manModal) { closeManifest(); }
            });
        }

        /* Passenger detail modal wiring. */
        var passClose = byId('ad-passenger-close');
        if (passClose) { passClose.addEventListener('click', closePassengerModal); }
        var passModal = byId('ad-passenger-modal');
        if (passModal) {
            passModal.addEventListener('click', function (e) {
                if (e.target === passModal) { closePassengerModal(); }
            });
        }
        var passTabs = document.querySelectorAll('.ad-passenger-tab[data-p-tab]');
        for (var pi = 0; pi < passTabs.length; pi++) {
            passTabs[pi].addEventListener('click', function () {
                setPassengerTab(this.getAttribute('data-p-tab'));
            });
        }

        /* Search input applies on Enter (same as the trip/booking filters). */
        var passSearch = byId('ad-passenger-search');
        if (passSearch) {
            passSearch.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { loadPassengers(); }
            });
        }

        /* Revenue section wiring. */
        var revRows = byId('ad-revenue-rows');
        if (revRows) {
            revRows.addEventListener('click', function (e) {
                var target = e.target;
                while (target && target !== revRows) {
                    if (target.getAttribute && target.getAttribute('data-revenue-detail')) {
                        openRevenueModal(target.getAttribute('data-revenue-detail'));
                        break;
                    }
                    target = target.parentNode;
                }
            });
        }
        var revClose = byId('ad-revenue-close');
        if (revClose) { revClose.addEventListener('click', closeRevenueModal); }
        var revModal = byId('ad-revenue-modal');
        if (revModal) {
            revModal.addEventListener('click', function (e) {
                if (e.target === revModal) { closeRevenueModal(); }
            });
        }
        populateRevenueYears();

        /* Manage-company modal wiring. */
        var manageClose = byId('btn-manage-close');
        if (manageClose) { manageClose.addEventListener('click', closeManage); }

        var manageModal = byId('ad-manage-modal');
        if (manageModal) {
            manageModal.addEventListener('click', function (e) {
                if (e.target === manageModal) { closeManage(); }
            });
        }

        var listedToggle = byId('ad-manage-listed');
        if (listedToggle) {
            listedToggle.addEventListener('change', function () {
                var target = listedToggle.checked;
                /* Revert the switch immediately — the actual change happens in
                   the confirm modal, which also requires the admin password. */
                listedToggle.checked = !target;
                askConfirmation(target ? 'list' : 'unlist');
            });
        }

        var deleteBtn = byId('btn-manage-delete');
        if (deleteBtn) { deleteBtn.addEventListener('click', function () { askConfirmation('delete'); }); }

        /* Complaint oversight wiring. */
        var refreshComplaints = byId('btn-refresh-complaints');
        if (refreshComplaints) { refreshComplaints.addEventListener('click', loadAdminComplaints); }

        var complaintScopeBar = byId('ad-complaint-scope-bar');
        if (complaintScopeBar) {
            complaintScopeBar.addEventListener('click', function (e) {
                var btn = e.target.closest ? e.target.closest('.ad-status-filter[data-complaint-target]') : null;
                if (!btn) { return; }
                adminComplaintTarget = btn.getAttribute('data-complaint-target') === 'platform' ? 'platform' : 'company';
                adminComplaintCompanyId = null;
                var btns = complaintScopeBar.querySelectorAll('.ad-status-filter');
                for (var i = 0; i < btns.length; i++) {
                    var active = (btns[i].getAttribute('data-complaint-target') || '') === adminComplaintTarget;
                    btns[i].classList.toggle('is-active', active);
                    btns[i].setAttribute('aria-pressed', active ? 'true' : 'false');
                }
                renderAdminComplaints();
            });
        }

        /* Status filter pills (All / Open / In progress / ...). */
        var complaintFilterBar = byId('ad-complaints-filterbar');
        if (complaintFilterBar) {
            complaintFilterBar.addEventListener('click', function (e) {
                var btn = e.target.closest ? e.target.closest('.ad-complaint-filter') : null;
                if (!btn) { return; }
                adminComplaintFilter = btn.getAttribute('data-complaint-filter') || null;
                renderAdminComplaints();
            });
        }

        var adminComplaintList = byId('ad-complaints-list');
        if (adminComplaintList) {
            adminComplaintList.addEventListener('click', function (e) {
                var openBtn = e.target.closest ? e.target.closest('[data-admin-complaint-open]') : null;
                if (openBtn) { openAdminComplaint(openBtn.getAttribute('data-admin-complaint-open')); return; }
                var backBtn = e.target.closest ? e.target.closest('[data-admin-complaint-back]') : null;
                if (backBtn) { adminComplaintCompanyId = null; renderAdminComplaints(); return; }
                var coCard = e.target.closest ? e.target.closest('[data-admin-complaint-company]') : null;
                if (coCard) {
                    adminComplaintCompanyId = coCard.getAttribute('data-admin-complaint-company');
                    renderAdminComplaints();
                }
            });
        }

        var adminComplaintModal = byId('ad-complaint-modal');
        if (adminComplaintModal) {
            adminComplaintModal.addEventListener('click', function (e) {
                if (e.target === adminComplaintModal) { closeAdminComplaintModal(); }
                var closeBtn = e.target.closest ? e.target.closest('#ad-complaint-close') : null;
                if (closeBtn) { closeAdminComplaintModal(); }
                var send = e.target.closest ? e.target.closest('#ad-complaint-send') : null;
                if (send) { submitAdminComplaintResponse(); }
                var apply = e.target.closest ? e.target.closest('#ad-complaint-status-apply') : null;
                if (apply) { submitAdminComplaintStatus(); }
            });
        }

        /* Complaints modal — modal-inner listeners are attached inside
           renderAdminComplaintModal (the modal content is rebuilt on each
           open), so there is nothing else to wire at init time. */

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeModal();
                closeReasonModal();
                closeManifest();
                closePassengerModal();
                closeAddCompany();
                closeManage();
                closeRevenueModal();
                closeAdminComplaintModal();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
