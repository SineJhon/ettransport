/* ============================================================
   ET Transport — js/notifications.js
   Global passenger notification bell.

   - ONE shared reader for the existing, authoritative notification
     API (api/notification.php: list / read / read_all). This is the
     SAME endpoint the dashboard uses — NOT a second notification
     system; the dashboard panel remains authoritative.
   - Authenticates through the existing same-origin session cookie.
   - Mounted by js/auth.js into a dedicated, always-visible slot of
     the shared navbar for authenticated PASSENGERS only. Guests /
     company / admin never mount a bell and never call the protected
     endpoint (the server also enforces ownership).
   - Lightweight: no polling, no WebSockets, no service worker.
     Refreshes on panel open, after booking/payment/cancellation/
     review success, and after mark-read / mark-all-read.
   ============================================================ */

(function () {
    'use strict';

    var API = 'api/notification.php';

    /* Shared read-only mirror of the same DB data the dashboard reads. */
    var state = { items: [], unread: 0, mode: 'idle' };
    var wrappers = [];          // bell wrappers, one per mounted nav
    var panelOpen = false;
    var activeWrap = null;
    var refreshTimer = null;
    var docBound = false;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function timeLabel(iso) {
        if (!iso) { return ''; }
        var d = new Date(String(iso).replace(' ', 'T'));
        if (isNaN(d.getTime())) { return String(iso); }
        var diff = Math.floor((new Date() - d) / 60000);
        if (diff < 1) { return 'Just now'; }
        if (diff < 60) { return Math.floor(diff) + 'm ago'; }
        var t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        var now = new Date();
        if (d.toDateString() === now.toDateString()) { return 'Today, ' + t; }
        var y = new Date(now); y.setDate(now.getDate() - 1);
        if (d.toDateString() === y.toDateString()) { return 'Yesterday, ' + t; }
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + t;
    }

    function iconFor(type) {
        type = String(type || '').toLowerCase();
        if (type === 'booking') { return '&#128652;'; }
        if (type === 'payment') { return '&#128176;'; }
        if (type === 'review') { return '&#11088;'; }
        if (type === 'cancellation') { return '&#10060;'; }
        return '&#128276;';
    }

    function fetchJson(rel) {
        if (!window.fetch) { return Promise.resolve({ ok: false, status: 0, data: null }); }
        return window.fetch(rel, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        }).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (json) {
                return { ok: res.ok, status: res.status, data: json };
            });
        }).catch(function () { return { ok: false, status: 0, data: null }; });
    }

    function postForm(rel, payload) {
        if (!window.fetch) { return Promise.resolve({ ok: false, status: 0, data: null }); }
        var body = new URLSearchParams();
        for (var k in (payload || {})) { body.append(k, payload[k]); }
        return window.fetch(rel, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        }).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (json) {
                return { ok: res.ok, status: res.status, data: json };
            });
        }).catch(function () { return { ok: false, status: 0, data: null }; });
    }

    /* ---- derive the canonical { items, unread } shape from the API ---- */
    function derive(json) {
        var items = [];
        if (json && Array.isArray(json.notifications)) {
            items = json.notifications.map(function (n) {
                return {
                    id: String(n.id),
                    title: n.title || '',
                    message: n.message || '',
                    type: n.type || 'general',
                    read: !!n.read,
                    time: timeLabel(n.created_at),
                    icon: iconFor(n.type)
                };
            });
        }
        var computed = 0;
        for (var i = 0; i < items.length; i++) { if (!items[i].read) { computed++; } }
        var unread = (typeof json.unreadCount === 'number') ? json.unreadCount : computed;
        return { items: items, unread: unread };
    }

    function loadList(quiet) {
        state.mode = 'loading';
        syncBadges();
        if (!quiet || panelOpen) { renderPanel(); }
        fetchJson(API + '?action=list').then(function (res) {
            var data = res.data;
            if (!data || !data.success || !Array.isArray(data.notifications)) {
                state.mode = 'error'; state.items = []; state.unread = 0;
            } else {
                var d = derive(data);
                state.mode = 'loaded'; state.items = d.items; state.unread = d.unread;
            }
            syncBadges();
            if (panelOpen) { renderPanel(); }
        });
    }

    /* Debounced — call after bookings/payments/cancellation/review. */
    function refresh() {
        if (refreshTimer) { clearTimeout(refreshTimer); }
        refreshTimer = setTimeout(function () { loadList(true); }, 0);
    }

    function setPanelOpen(open) {
        panelOpen = !!open;
        for (var i = 0; i < wrappers.length; i++) {
            var w = wrappers[i];
            if (w.panel) { w.panel.hidden = !panelOpen; }
            if (w.btn) {
                w.btn.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
                w.btn.classList.toggle('open', panelOpen);
            }
        }
    }

    function openPanel(wrap) {
        activeWrap = wrap || activeWrap;
        /* Always refresh from the authoritative API when the panel opens so the
           browser never displays stale notification state. */
        loadList();
        setPanelOpen(true);
    }

    function closePanel() {
        setPanelOpen(false);
        activeWrap = null;
    }


    function syncBadges() {
        for (var i = 0; i < wrappers.length; i++) {
            var w = wrappers[i];
            if (!w || !w.badge) { continue; }
            w.badge.textContent = String(state.unread > 99 ? '99+' : state.unread);
            w.badge.hidden = state.unread <= 0;
            w.badge.setAttribute('aria-label', state.unread > 0
                ? state.unread + ' unread notifications' : 'No unread notifications');
        }
    }

    function renderPanel() {
        for (var i = 0; i < wrappers.length; i++) {
            var w = wrappers[i];
            if (!w || !w.list) { continue; }
            var html = '';
            if (state.mode === 'loading') {
                html = '<div class="nav-bell-empty"><p class="nav-bell-ico-big" aria-hidden="true">&#9203;</p><p>Loading&hellip;</p></div>';
            } else if (state.mode === 'error') {
                html = '<div class="nav-bell-empty"><p>Could not load notifications.</p></div>';
            } else if (!state.items.length) {
                html = '<div class="nav-bell-empty"><p class="nav-bell-ico-big" aria-hidden="true">&#128276;</p><p>No notifications</p></div>';
            } else {
                for (var j = 0; j < state.items.length; j++) {
                    var n = state.items[j];
                    html += '<button type="button" class="nav-bell-item ' + (n.read ? 'is-read' : 'is-unread') + '" data-id="' + esc(n.id) + '">' +
                        '<span class="nav-bell-ico-small" aria-hidden="true">' + (n.icon || '&#128276;') + '</span>' +
                        '<span class="nav-bell-body"><strong>' + esc(n.title) + '</strong>' +
                        '<span class="nav-bell-msg">' + esc(n.message) + '</span>' +
                        '<span class="nav-bell-time">' + esc(n.time || '') + '</span></span></button>';
                }
            }
            w.list.innerHTML = html;
            w.head.hidden = state.mode === 'idle';
            var headCount = w.head.querySelector ? w.head.querySelector('.nav-bell-head-count') : null;
            if (headCount) { headCount.textContent = state.unread > 0 ? (state.unread + ' unread') : 'All caught up'; }
            if (w.markAllBtn) { w.markAllBtn.hidden = (state.mode === 'loaded' && state.unread > 0) ? false : true; }
        }
    }

    /* Mark ONE notification read. Optimistic UI update, then persist to DB;
       if the authoritative API did not confirm, re-fetch (do not fake success). */
    function markOne(id) {
        if (!id) { return; }
        var idx = -1;
        for (var i = 0; i < state.items.length; i++) {
            if (state.items[i].id === String(id)) { idx = i; break; }
        }
        var wasUnread = idx >= 0 && !state.items[idx].read;
        if (idx >= 0) { state.items[idx].read = true; }
        if (wasUnread) { state.unread = Math.max(0, state.unread - 1); }
        syncBadges();
        renderPanel();
        postForm(API + '?action=read', { id: id }).then(function (res) {
            if (!(res.ok && res.data && res.data.success)) { loadList(true); }
        });
    }

    function markAll() {
        var hadUnread = state.unread > 0;
        for (var i = 0; i < state.items.length; i++) { state.items[i].read = true; }
        state.unread = 0;
        syncBadges();
        renderPanel();
        if (hadUnread) {
            postForm(API + '?action=read_all', {}).then(function (res) {
                if (!(res.ok && res.data && res.data.success)) { loadList(true); }
            });
        }
    }

    function bindGlobal() {
        if (docBound) { return; }
        docBound = true;
        document.addEventListener('click', function (e) {
            if (!panelOpen || !activeWrap) { return; }
            var t = e.target;
            if (!(t && (activeWrap.wrap === t || activeWrap.wrap.contains(t)))) { closePanel(); }
        });
                document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { closePanel(); }
        });
    }

    function mountBell(container, user) {
        if (!container) { return null; }
        if (container._etBell) { return container._etBell; }

        var wrap = document.createElement('div');
        wrap.className = 'nav-bell-wrap';
        wrap.setAttribute('data-nav-bell', '1');
        wrap.innerHTML =
            '<button type="button" class="nav-bell nav-bell-btn" aria-haspopup="true" aria-expanded="false" aria-controls="nav-bell-panel" aria-label="Notifications">' +
                '<span class="nav-bell-ico" aria-hidden="true">\ud83d\udd14</span>' +
                '<span class="nav-bell-count" role="status" aria-live="polite" hidden>0</span>' +
            '</button>' +
            '<div id="nav-bell-panel" class="nav-bell-panel" hidden role="menu" aria-label="Notification panel">' +
                '<div class="nav-bell-head">' +
                    '<span class="nav-bell-head-title">Notifications</span>' +
                    '<span class="nav-bell-head-count"></span>' +
                '</div>' +
                '<div class="nav-bell-actions"><button type="button" class="nav-bell-markall btn btn-secondary btn-sm">Mark all as read</button></div>' +
                '<div class="nav-bell-list"></div>' +
            '</div>';
        container.appendChild(wrap);

        var w = {
            wrap: wrap,
            btn: wrap.querySelector('.nav-bell-btn'),
            badge: wrap.querySelector('.nav-bell-count'),
            panel: wrap.querySelector('#nav-bell-panel'),
            head: wrap.querySelector('.nav-bell-head'),
            list: wrap.querySelector('.nav-bell-list'),
            markAllBtn: wrap.querySelector('.nav-bell-markall')
        };
        wrappers.push(w);
        container._etBell = w;
        bindGlobal();

        w.btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (panelOpen && activeWrap === w) { closePanel(); } else { openPanel(w); }
        });
        w.panel.addEventListener('click', function (e) {
            var t = e.target;
            var item = t && t.closest ? t.closest('.nav-bell-item') : null;
            if (item) { e.stopPropagation(); markOne(item.getAttribute('data-id')); return; }
            var markAllBtn = t && t.closest ? t.closest('.nav-bell-markall') : null;
            if (markAllBtn) { e.stopPropagation(); markAll(); }
        });

        syncBadges();
        renderPanel();
        if (user && user.role === 'passenger') { loadList(); }
        return w;
    }

    function unmountBell(container) {
        if (!container || !container._etBell) { return; }
        var idx = wrappers.indexOf(container._etBell);
        if (idx !== -1) { wrappers.splice(idx, 1); }
        if (container._etBell.wrap && container._etBell.wrap.parentNode === container) {
            container._etBell.wrap.parentNode.removeChild(container._etBell.wrap);
        }
        delete container._etBell;
    }

    window.ETNotifications = {
        mountBell: mountBell,
        unmountBell: unmountBell,
        refresh: refresh,
        openPanel: openPanel,
        closePanel: closePanel,
        markRead: markOne,
        markAllRead: markAll
    };
})();


