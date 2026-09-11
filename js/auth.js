/* ============================================================
   ET Transport — auth.js
   Session-based authentication client.
   UX guards are client-side convenience only; API endpoints must
   always enforce authorization server-side.
   ============================================================ */

(function () {
    'use strict';

    function byId(id) {
        return document.getElementById(id);
    }

    function setMessage(message, type) {
        var box = byId('auth-message');
        if (!box) { return; }

        box.hidden = false;
        box.className = 'auth-message ' + (type || 'info');
        box.textContent = message;
    }

    function clearMessage() {
        var box = byId('auth-message');
        if (!box) { return; }
        box.hidden = true;
        box.textContent = '';
        box.className = 'auth-message';
    }

    function roleHome(role) {
        if (role === 'admin') { return 'admin.html'; }
        if (role === 'company') { return 'company-dashboard.html'; }
        return 'passenger.html';
    }

    function toFormData(payload) {
        var data = new FormData();
        Object.keys(payload).forEach(function (key) {
            data.append(key, payload[key]);
        });
        return data;
    }

    function apiCall(action, method, payload) {
        var opts = {
            method: method || 'GET',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        };

        if (opts.method === 'POST') {
            opts.body = toFormData(payload || {});
        }

        return fetch('api/auth.php?action=' + encodeURIComponent(action), opts)
            .then(function (res) {
                return res.json().catch(function () {
                    return {
                        success: false,
                        message: 'Invalid server response.'
                    };
                }).then(function (json) {
                    return { ok: res.ok, status: res.status, data: json };
                });
            });
    }

    function login(payload) {
        return apiCall('login', 'POST', payload);
    }

    function register(payload) {
        return apiCall('register', 'POST', payload);
    }

    function logout() {
        return apiCall('logout', 'POST', {});
    }

    var sessionCache = null;

    function getSession(force) {
        if (sessionCache && !force) {
            /* The cache stores the unwrapped session body (result.data), so
               wrap it back into the { data } shape every consumer expects. */
            return Promise.resolve({ ok: true, status: 200, data: sessionCache });
        }
        return apiCall('session', 'GET').then(function (result) {
            if (result && result.data && typeof result.data.authenticated === 'boolean') {
                sessionCache = result.data;
            }
            return result;
        });
    }

    function isAuthenticated() {
        return getSession().then(function (result) {
            return !!(result.data && result.data.authenticated && result.data.user);
        });
    }

    function getCurrentUser() {
        return getSession().then(function (result) {
            return (result.data && result.data.authenticated && result.data.user) ? result.data.user : null;
        });
    }

    /* Frontend convenience guard — APIs still enforce authorization server-side. */
    function requireAuth() {
        return getSession().then(function (result) {
            var data = result.data || {};
            if (data.authenticated && data.user) {
                return data.user;
            }
            window.location.href = 'login.html';
            return null;
        });
    }

    function requireRole(role) {
        return getSession().then(function (result) {
            var data = result.data || {};
            if (data.authenticated && data.user && data.user.role === role) {
                return data.user;
            }
            if (data.authenticated && data.user) {
                window.location.href = roleHome(data.user.role);
                return null;
            }
            window.location.href = 'login.html';
            return null;
        });
    }

    function toggleCompanyFields(roleValue) {
        var fields = byId('company-fields');
        if (!fields) { return; }

        var isCompany = roleValue === 'company';
        fields.hidden = !isCompany;

        var required = fields.querySelectorAll('[data-company-required="1"]');
        for (var i = 0; i < required.length; i++) {
            required[i].required = isCompany;
        }
    }

    function bindPasswordToggles() {
        var toggles = document.querySelectorAll('.password-toggle[aria-controls]');
        for (var i = 0; i < toggles.length; i++) {
            toggles[i].addEventListener('click', function () {
                var input = byId(this.getAttribute('aria-controls'));
                if (!input) { return; }

                var revealPassword = input.type === 'password';
                input.type = revealPassword ? 'text' : 'password';
                this.setAttribute('aria-pressed', String(revealPassword));
                this.setAttribute('aria-label', revealPassword ? 'Hide password' : 'Show password');

                var label = this.querySelector('.sr-only');
                if (label) {
                    label.textContent = revealPassword ? 'Hide password' : 'Show password';
                }
            });
        }
    }

    /* ---------- Ethiopian phone (locked +251) ----------
       Same convention used across the site: keep only digits, drop a leading
       0 (09X -> 9X) or a pasted 251 prefix, then require exactly 9 local
       digits starting with 7 / 9 (mobile) or 1 (landline, e.g. 11…). */
    function normalizeLocalPhone(raw) {
        var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
        /* Lock the country code: a pasted "+251…" / "251…" prefix is stripped
           as soon as it appears, and a leading 0 (09X) is dropped immediately,
           so only the 9 local digits ever stay in the field. */
        if (digits.indexOf('251') === 0) { digits = digits.slice(3); }
        digits = digits.replace(/^0+/, '');
        if (digits.length > 9) { digits = digits.slice(0, 9); }
        return digits;
    }

    function validLocalPhone(digits) {
        return /^[179][0-9]{8}$/.test(digits);
    }

    function sanitizeRegisterPhone() {
        var input = byId('register-phone');
        if (!input) { return; }

        var digits = normalizeLocalPhone(input.value);
        if (digits.length > 9) { digits = digits.slice(0, 9); }
        input.value = digits;

        var info = byId('register-phone-info');
        if (!info) { return; }
        if (validLocalPhone(digits)) {
            info.textContent = 'Stored as +251' + digits;
            info.classList.add('show');
            input.classList.remove('field-invalid');
        } else {
            info.textContent = '';
            info.classList.remove('show');
        }
    }

    /* Live password requirements checklist (below the password input). */
    function updatePasswordRequirements() {
        var pw = byId('register-password');
        var value = pw ? pw.value : '';
        var checks = {
            length: value.length >= 6,
            letter: /[A-Za-z]/.test(value),
            number: /\d/.test(value)
        };
        var keys = Object.keys(checks);
        for (var i = 0; i < keys.length; i++) {
            var li = document.querySelector('.pw-reqs li[data-pw-req="' + keys[i] + '"]');
            if (li) { li.classList.toggle('is-met', checks[keys[i]]); }
        }
        updateConfirmHint();
    }

    /* Live confirm-password match hint. */
    function updateConfirmHint() {
        var hint = byId('register-confirm-hint');
        if (!hint) { return; }
        var pw = byId('register-password') ? byId('register-password').value : '';
        var confirm = byId('register-confirm') ? byId('register-confirm').value : '';
        if (!confirm) {
            hint.textContent = hint.getAttribute('data-default') || 'Passwords must match.';
            hint.className = 'field-hint';
        } else if (pw === confirm) {
            hint.textContent = 'Passwords match.';
            hint.className = 'field-hint ok';
        } else {
            hint.textContent = 'Passwords do not match.';
            hint.className = 'field-hint bad';
        }
    }

    function bindRegisterForm() {
        var form = byId('register-form');
        if (!form) { return; }

        var roleInput = byId('register-role');
        if (roleInput) {
            toggleCompanyFields(roleInput.value);
            roleInput.addEventListener('change', function () {
                toggleCompanyFields(roleInput.value);
            });
        }

        var registerPhoneInput = byId('register-phone');
        if (registerPhoneInput) {
            sanitizeRegisterPhone();
            registerPhoneInput.addEventListener('input', sanitizeRegisterPhone);
        }

        var registerPasswordInput = byId('register-password');
        if (registerPasswordInput) {
            updatePasswordRequirements();
            registerPasswordInput.addEventListener('input', updatePasswordRequirements);
        }

        var registerConfirmInput = byId('register-confirm');
        if (registerConfirmInput) {
            registerConfirmInput.addEventListener('input', updateConfirmHint);
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            clearMessage();

            /* Phone is locked to +251 in the UI; validate the 9 local digits
               and store the full number as +251… (same rule as the rest of
               the site: mobile 7X / 9X or landline 1X). */
            var phoneDigits = normalizeLocalPhone(byId('register-phone').value);
            if (!validLocalPhone(phoneDigits)) {
                var invalidPhone = byId('register-phone');
                if (invalidPhone) { invalidPhone.classList.add('field-invalid'); }
                setMessage('Please enter a valid Ethiopian phone number: +251 followed by 9 digits (mobile 9X / 7X or landline 11X…).', 'error');
                return;
            }
            var validPhone = byId('register-phone');
            if (validPhone) { validPhone.classList.remove('field-invalid'); }

            var payload = {
                name: byId('register-name').value.trim(),
                email: byId('register-email').value.trim(),
                phone: '+251' + phoneDigits,
                password: byId('register-password').value,
                role: (roleInput ? roleInput.value : 'passenger')
            };

            /* Password strength must match the checklist and the server rule:
               6+ characters, at least one letter, at least one number. */
            if (payload.password.length < 6 || !/[A-Za-z]/.test(payload.password) || !/\d/.test(payload.password)) {
                setMessage('Password must be at least 6 characters and include letters and numbers.', 'error');
                return;
            }

            var confirmInput = byId('register-confirm');
            if (confirmInput) {
                if (!confirmInput.value) {
                    setMessage('Please confirm your password.', 'error');
                    return;
                }
                if (confirmInput.value !== payload.password) {
                    setMessage('Password confirmation does not match.', 'error');
                    return;
                }
                payload.password_confirmation = confirmInput.value;
            }

            if (payload.role === 'company') {
                payload.company_name = byId('company-name').value.trim();
                payload.company_address = byId('company-address').value.trim();
                payload.company_description = byId('company-description').value.trim();
            }

            register(payload).then(function (result) {
                if (!result.data.success) {
                    setMessage(result.data.message || 'Registration failed.', 'error');
                    return;
                }

                setMessage(result.data.message || 'Registration successful.', 'success');

                if (payload.role === 'company') {
                    form.reset();
                    toggleCompanyFields('passenger');
                    if (roleInput) { roleInput.value = 'passenger'; }
                    return;
                }

                var target = result.data.redirectTo || roleHome((result.data.user && result.data.user.role) || 'passenger');
                window.location.href = target;
            }).catch(function () {
                setMessage('Could not reach the server. Make sure you are running through http://localhost/etio-transport/.', 'error');
            });
        });
    }

    function bindLoginForm() {
        var form = byId('login-form');
        if (!form) { return; }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            clearMessage();

            var payload = {
                email: byId('login-email').value.trim(),
                password: byId('login-password').value
            };

            login(payload).then(function (result) {
                if (!result.data.success) {
                    setMessage(result.data.message || 'Login failed.', 'error');
                    return;
                }

                setMessage(result.data.message || 'Login successful.', 'success');
                var target = result.data.redirectTo || roleHome((result.data.user && result.data.user.role) || 'passenger');
                window.location.href = target;
            }).catch(function () {
                setMessage('Could not reach the server. Make sure you are running through http://localhost/etio-transport/.', 'error');
            });
        });
    }

    function wireLogoutButton(el) {
        if (!el) { return; }
        el.addEventListener('click', function (e) {
            e.preventDefault();
            logout().finally(function () {
                window.location.href = 'login.html';
            });
        });
    }

    function bindLogoutButtons() {
        var buttons = document.querySelectorAll('[data-auth-logout="1"]');
        if (!buttons.length) { return; }
        for (var i = 0; i < buttons.length; i++) {
            wireLogoutButton(buttons[i]);
        }
    }

    /* ---------- Shared navbar auth state (Step 10) ---------- */
    function renderNavActions(container, user) {
        if (!container) { return; }
        container.innerHTML = '';

        if (user) {
            var dashLink = document.createElement('a');
            dashLink.href = roleHome(user.role);
            dashLink.className = 'btn btn-login';
            dashLink.textContent = 'Dashboard';

            var outLink = document.createElement('a');
            outLink.href = '#';
            outLink.className = 'btn btn-login';
            outLink.textContent = 'Logout';
            outLink.setAttribute('data-auth-logout', '1');
            wireLogoutButton(outLink);

            container.appendChild(dashLink);
            container.appendChild(outLink);
            return;
        }

        var loginLink = document.createElement('a');
        loginLink.href = 'login.html';
        loginLink.className = 'btn btn-login';
        loginLink.textContent = 'Login';

        var regLink = document.createElement('a');
        regLink.href = 'register.html';
        regLink.className = 'btn btn-login';
        regLink.textContent = 'Register';

        container.appendChild(loginLink);
        container.appendChild(regLink);
    }

        /* ---------- Passenger notification bell (shared, authoritative) ----------
       The bell lives in its OWN always-visible nav slot (not inside
       .nav-actions, which is hidden on mobile) so it stays usable at 390px.
       Only authenticated passengers mount it; guests/company/admin never do,
       so they never hit the protected notification API.
    */
    function ensureBellSlot(nav) {
        if (!nav) { return null; }
        var slot = document.getElementById('nav-bell-slot');
        if (!slot) {
            slot = document.createElement('div');
            slot.id = 'nav-bell-slot';
            slot.className = 'nav-bell-slot';
            var actions = nav.querySelector('[data-nav-auth="1"]');
            if (actions) { nav.insertBefore(slot, actions); }
            else { nav.appendChild(slot); }
        }
        return slot;
    }

    function mountPassengerBell(user) {
        var nav = document.querySelector('.navbar');
        var slot = ensureBellSlot(nav);
        if (!slot) { return; }
        if (slot._etBell && window.ETNotifications && window.ETNotifications.unmountBell) {
            window.ETNotifications.unmountBell(slot);
        }
        if (user && user.role === 'passenger' && window.ETNotifications && window.ETNotifications.mountBell) {
            window.ETNotifications.mountBell(slot, user);
        } else {
            if (slot._etBell) { slot.innerHTML = ''; delete slot._etBell; }
        }
    }

    function bindNavbar() {
        var containers = document.querySelectorAll('[data-nav-auth="1"]');
        if (!containers.length) { return; }

        var apply = function (user) {
            for (var i = 0; i < containers.length; i++) {
                renderNavActions(containers[i], user);
            }
            mountPassengerBell(user);
        };

        getSession().then(function (result) {
            var data = result.data || {};
            apply((data.authenticated && data.user) ? data.user : null);
            if (data.authenticated && data.user) {
                fillIdentity();
            }
        }).catch(function () {
            apply(null);
        });
    }

    function fillIdentity() {
        var box = document.querySelector('[data-auth-identity]');
        if (!box) { return; }
        getSession().then(function (result) {
            var data = result.data || {};
            var user = (data.authenticated && data.user) ? data.user : null;
            if (user) {
                box.hidden = false;
                box.textContent = 'Signed in as ' + user.name + ' (' + user.role + ')';
            }
        });
    }

    /* ---------- Hybrid guard: booking context ---------- */
    function hasBookingContext() {
        try {
            var params = new URLSearchParams(window.location.search);
            if (params.get('trip')) { return true; }
        } catch (e) { /* URLSearchParams unavailable */ }
        try {
            if (window.sessionStorage.getItem('etTransportBooking')) { return true; }
        } catch (e) { /* storage unavailable */ }
        return false;
    }

    function enforcePageGuard() {
        var body = document.body;
        if (!body) { return; }

        var requiresAuth = body.getAttribute('data-auth-required') === '1';
        var requiredRole = body.getAttribute('data-auth-role') || '';
        var requiresApprovedCompany = body.getAttribute('data-auth-company-approved') === '1';
        var guestOnly = body.getAttribute('data-auth-guest-only') === '1';
        var bookingContextOnly = body.getAttribute('data-auth-booking-context') === '1';

        if (!requiresAuth && !requiredRole && !requiresApprovedCompany && !guestOnly && !bookingContextOnly) {
            return;
        }

        /* Hybrid passenger page: an active mock booking flow (guest) is allowed
           without authentication so the unauthenticated flow keeps working. The
           page is still protected when opened bare (no trip context). */
        if (bookingContextOnly && hasBookingContext()) {
            fillIdentity();
            return;
        }

        getSession().then(function (result) {
            var data = result.data || {};
            var isAuthenticated = !!data.authenticated;
            var user = data.user || null;

            if (guestOnly && isAuthenticated && user) {
                window.location.href = roleHome(user.role);
                return;
            }

            if (requiresAuth && !isAuthenticated) {
                window.location.href = 'login.html';
                return;
            }

            if (!isAuthenticated) {
                return;
            }

            if (requiredRole && user.role !== requiredRole) {
                window.location.href = roleHome(user.role);
                return;
            }

            if (requiresApprovedCompany) {
                if (user.role !== 'company' || user.companyStatus !== 'approved' || user.status !== 'active') {
                    window.location.href = 'login.html';
                }
            }
        }).catch(function () {
            if (requiresAuth) {
                window.location.href = 'login.html';
            }
        });
    }

    window.ETAuth = {
        login: login,
        register: register,
        logout: logout,
        getSession: getSession,
        isAuthenticated: isAuthenticated,
        getCurrentUser: getCurrentUser,
        requireAuth: requireAuth,
        requireRole: requireRole,
        roleHome: roleHome,
        enforcePageGuard: enforcePageGuard
    };

    document.addEventListener('DOMContentLoaded', function () {
        bindPasswordToggles();
        bindLoginForm();
        bindRegisterForm();
        bindLogoutButtons();
        bindNavbar();
        fillIdentity();
        enforcePageGuard();
    });
})();
