/* ============================================================
   ET Transport — main.js
   Shared page-level behaviours (navigation, auth state, toasts).
   ============================================================ */

/**
 * Mobile Navigation
 * Toggles the navigation links and the hamburger icon state.
 */
(function () {
    var navToggle = document.getElementById('nav-toggle');
    var navLinks = document.getElementById('nav-links');

    if (!navToggle || !navLinks) {
        return;
    }

    navToggle.addEventListener('click', function () {
        var isOpen = navLinks.classList.toggle('open');

        // Update accessibility state on the toggle button
        navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close the mobile menu when a link is clicked
    navLinks.addEventListener('click', function (event) {
        if (event.target.tagName === 'A') {
            navLinks.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
        }
    });
})();

/* ============================================================
 Favorites helper (localStorage only)
   ------------------------------------------------------------
   One of the few sanctioned uses of localStorage: favorites are
   meant to survive page navigation. There is NO authentication or
   backend — data lives only in this browser.

   Storage key:  etTransportFavorites
   Value:        JSON array of company slugs, e.g. ["selam-bus"]
   ============================================================ */
window.ETTransportFavorites = {
    KEY: 'etTransportFavorites',

    /* Read the current list of favorite company slugs (safe). */
    get: function () {
        var raw = null;
        try { raw = window.localStorage.getItem(this.KEY); } catch (e) { /* storage unavailable */ }
        if (!raw) { return []; }
        try {
            var list = JSON.parse(raw);
            return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
        } catch (e) { return []; }
    },

    isFavorite: function (slug) {
        if (!slug) { return false; }
        return this.get().indexOf(slug) !== -1;
    },

    /* Toggle a company slug and persist. Returns the new list. */
    toggle: function (slug) {
        var list = this.get();
        var idx = list.indexOf(slug);
        if (idx === -1) { list.push(slug); } else { list.splice(idx, 1); }
        try { window.localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
        return list;
    },

    /* Replace the whole list (used by "clear all" in the directory). */
    set: function (list) {
        try { window.localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
        return list;
    },

    /* ============================================================
       Passenger-only favorites gate.
       ------------------------------------------------------------
       Favorites are a passenger account feature. Guests may browse
       the companies directory freely, but the saved companies grid,
       the hero button state and every ♡ click live behind a passenger
       login. The same ?next= flow used by booking/seat selection
       sends a guest to login.html (or register.html) and brings them
       straight back once they sign in.
       ============================================================ */

    /* Resolve `true` only for an authenticated passenger. Guests and
       company/admin accounts get `false`, and a failed session check
       also falls back to `false` so favorites are never shown to or
       edited by an anonymous browser. */
    passengerOnly: function () {
        if (!window.ETAuth || !window.ETAuth.getCurrentUser) {
            return Promise.resolve(false);
        }
        return window.ETAuth.getCurrentUser().then(function (user) {
            return !!(user && user.role === 'passenger');
        }).catch(function () {
            return false;
        });
    },

    /* Run onAllowed only for an authenticated passenger. Guests are
       asked to log in or register first (kept on this page via
       ?next=); a logged-in company/admin account is not a passenger,
       so the click is simply ignored. */
    requirePassenger: function (onAllowed) {
        if (typeof onAllowed !== 'function') { return; }
        if (!window.ETAuth || !window.ETAuth.getCurrentUser) { return; }

        function sendToLogin() {
            var next = '';
            try {
                next = encodeURIComponent(window.location.pathname + window.location.search);
            } catch (e) { /* fall through to plain login.html */ }
            window.location.href = 'login.html' + (next ? '?next=' + next : '');
        }

        window.ETAuth.getCurrentUser().then(function (user) {
            if (user && user.role === 'passenger') {
                onAllowed();
                return;
            }
            if (user) { return; } /* signed in as company/admin — passengers only */
            sendToLogin();
        }).catch(function () {
            sendToLogin();
        });
    }
};

/* ============================================================
 Shared sessionStorage JSON helpers
   ------------------------------------------------------------
   Tiny additive utility used by js/confirmation.js (booking
   history + notifications) and js/dashboard.js. Keeps the
   try/catch JSON handling in one place. There is NO backend —
   everything lives inside the current browser tab.
   ============================================================ */
window.ETTransportStore = {
    /* Read a JSON value; safe when storage is unavailable. */
    get: function (key) {
        try {
            var raw = window.sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    },

    /* Write a JSON value; silently ignored when storage fails. */
    set: function (key, value) {
        try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* prototype only */ }
    },

    remove: function (key) {
        try { window.sessionStorage.removeItem(key); } catch (e) { /* prototype only */ }
    },

    /* Read a JSON array; falls back to a fresh array. */
    list: function (key) {
        var value = this.get(key);
        return Object.prototype.toString.call(value) === '[object Array]' ? value : [];
    }
};
