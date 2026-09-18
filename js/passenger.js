/* ============================================================
   ET Transport — passenger.js
   Passenger Information (frontend-only, mock data).
   Reads booking context from the URL, renders one form per seat,
   validates input, and saves the completed details to a temporary
   sessionStorage booking state used by the payment step.
   ============================================================ */

(function () {
    'use strict';

    /* ---------- URL & formatting helpers ---------- */
    function getParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    function pad(n) {
        return ('0' + n).slice(-2);
    }

    function formatPrice(n) {
        return 'ETB ' + n.toLocaleString();
    }

    function formatDate(iso) {
        if (!iso) { return ''; }
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) { return iso; }
        return d.toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    /* ---------- Shared demo trip data ---------- */
    var trips = (window.ETTransportData && Array.isArray(window.ETTransportData.trips))
        ? window.ETTransportData.trips.slice()
        : [
        { id: 1, company: 'Selam Express',    from: 'Addis Ababa', to: 'Arba Minch', depart: '06:30', arrive: '14:45', minutes: 495, price: 720,  rating: 4.8, type: 'Standard' },
        { id: 2, company: 'Dashen Motors',    from: 'Addis Ababa', to: 'Arba Minch', depart: '07:45', arrive: '15:30', minutes: 465, price: 740,  rating: 4.4, type: 'Standard' },
        { id: 3, company: 'Ethio Abay Lines', from: 'Addis Ababa', to: 'Arba Minch', depart: '08:00', arrive: '16:30', minutes: 510, price: 650,  rating: 4.5, type: 'Standard' },
        { id: 4, company: 'SkyLink Coaches',  from: 'Addis Ababa', to: 'Arba Minch', depart: '10:15', arrive: '18:45', minutes: 510, price: 480,  rating: 4.2, type: 'Standard' },
        { id: 5, company: 'Lion Express',     from: 'Addis Ababa', to: 'Arba Minch', depart: '13:00', arrive: '21:00', minutes: 480, price: 850,  rating: 4.6, type: 'Standard' },
        { id: 6, company: 'GreenLion Travel', from: 'Addis Ababa', to: 'Arba Minch', depart: '15:30', arrive: '23:45', minutes: 495, price: 1100, rating: 4.9, type: 'Standard' },
        { id: 7, company: 'Abay River Bus',   from: 'Addis Ababa', to: 'Arba Minch', depart: '18:00', arrive: '02:45', minutes: 525, price: 950,  rating: 4.3, type: 'Standard' },
        { id: 8, company: 'Yeha Coaches',     from: 'Addis Ababa', to: 'Arba Minch', depart: '19:30', arrive: '04:00', minutes: 510, price: 1250, rating: 4.7, type: 'Standard' },

 /* ---------- company trips (see js/company.js) ---------- */
        { id: 1001, company: 'Selam Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '06:30', arrive: '15:30', minutes: 540, price: 900, rating: 4.8, type: 'Standard', seats: 18, busType: 'Scania Touring', offsetDays: 2 },
        { id: 1002, company: 'Selam Bus', from: 'Addis Ababa', to: 'Mekelle', depart: '05:30', arrive: '18:00', minutes: 750, price: 1200, rating: 4.9, type: 'Standard', seats: 9, busType: 'MAN Lion\u2019s Coach', offsetDays: 4 },
        { id: 1021, company: 'Yegna Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '10:30', arrive: '19:30', minutes: 540, price: 850, rating: 4.4, type: 'Standard', seats: 25, busType: 'MAN Lion\u2019s Coach', offsetDays: 3 },
        { id: 1022, company: 'Yegna Bus', from: 'Addis Ababa', to: 'Gondar', depart: '06:00', arrive: '18:30', minutes: 750, price: 1050, rating: 4.5, type: 'Standard', seats: 8, busType: 'Golden Dragon XML6125', offsetDays: 6 },
        { id: 1031, company: 'Golden Bus', from: 'Addis Ababa', to: 'Dessie', depart: '08:30', arrive: '15:00', minutes: 390, price: 600, rating: 4.3, type: 'Standard', seats: 20, busType: 'Yutong ZK6107H', offsetDays: 2 },
        { id: 1032, company: 'Golden Bus', from: 'Addis Ababa', to: 'Adama', depart: '09:00', arrive: '10:40', minutes: 100, price: 220, rating: 4.2, type: 'Standard', seats: 30, busType: 'King Long XMQ6898', offsetDays: 1 },
        { id: 1041, company: 'Zemen Bus', from: 'Addis Ababa', to: 'Dire Dawa', depart: '06:45', arrive: '15:15', minutes: 510, price: 820, rating: 4.6, type: 'Standard', seats: 14, busType: 'Neoplan Skyliner', offsetDays: 3 },
        { id: 1042, company: 'Zemen Bus', from: 'Addis Ababa', to: 'Jijiga', depart: '05:45', arrive: '18:00', minutes: 735, price: 1100, rating: 4.7, type: 'Standard', seats: 6, busType: 'Mercedes-Benz Tourismo', offsetDays: 5 },
        { id: 1051, company: 'ODAA Bus', from: 'Addis Ababa', to: 'Jimma', depart: '07:30', arrive: '15:30', minutes: 480, price: 700, rating: 4.4, type: 'Standard', seats: 11, busType: 'Yutong ZK6122H9', offsetDays: 2 },
        { id: 1052, company: 'ODAA Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '13:00', arrive: '18:10', minutes: 310, price: 480, rating: 4.3, type: 'Standard', seats: 27, busType: 'Foton AUV BJ6129', offsetDays: 4 },
        { id: 1061, company: 'Abay Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '07:00', arrive: '16:00', minutes: 540, price: 880, rating: 4.2, type: 'Standard', seats: 19, busType: 'Yutong ZK6107H', offsetDays: 3 },
        { id: 1071, company: 'Ethio Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '06:15', arrive: '11:20', minutes: 305, price: 480, rating: 4.1, type: 'Standard', seats: 31, busType: 'King Long XMQ6898', offsetDays: 2 },
    ];

    /* ---------- Read & validate URL context ---------- */
    var tripId = parseInt(getParam('trip'), 10);
    var passengers = parseInt(getParam('passengers'), 10);
    var date = getParam('date');
    var seatsParam = getParam('seats');

    var appEl = document.getElementById('passenger-app');
    var errorEl = document.getElementById('app-error');
    var errorMsg = document.getElementById('app-error-msg');

    /* Look up the trip */
    var trip = null;

 /* prefer the real (database) trip snapshot saved by
       search.js / company.js when the demo dataset has no matching id. */
    function snapshotTrip(id) {
        try {
            var raw = window.sessionStorage.getItem('etTransportSelectedTrip');
            if (!raw) { return null; }
            var obj = JSON.parse(raw);
            if (obj && obj.v === 1 && obj.trip && Number(obj.trip.id) === Number(id)) {
                return obj.trip;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    trip = snapshotTrip(tripId);
    if (!trip) {
        for (var t = 0; t < trips.length; t++) {
            if (trips[t].id === tripId) { trip = trips[t]; break; }
        }
    }

    /* Parse & validate seats: must be whole seat numbers within the coach */
    var seats = [];
    if (seatsParam) {
        var parts = seatsParam.split(',');
        for (var s = 0; s < parts.length; s++) {
            var raw = parts[s].trim();
            var num = parseInt(raw, 10);
            if (/^\d{1,2}$/.test(raw) && num >= 1 && num <= 51) {
                seats.push(pad(num));
            }
        }
    }

    /* ---- Decide which state to show ---- */
    function showError(message) {
        appEl.hidden = true;
        errorMsg.textContent = message;
        errorEl.hidden = false;
    }

    if (!trip || !passengers || passengers < 1 || seats.length === 0) {
        showError('Your booking information is missing.');
        return;
    }

    if (seats.length !== passengers) {
        showError('Your seat selection and the number of passengers do not match. Please go back and reselect your seats.');
        return;
    }

    /* ---------- Render trip summary ---------- */
    document.getElementById('trip-company').textContent = trip.company;
    document.getElementById('trip-route').textContent = trip.from + ' \u2192 ' + trip.to;
    document.getElementById('trip-date').textContent = formatDate(date);
    document.getElementById('trip-depart').textContent = trip.depart;
    document.getElementById('trip-arrive').textContent = trip.arrive;
    document.getElementById('trip-passengers').textContent = passengers;
    document.getElementById('trip-seats').textContent = seats.join(', ');
    document.title = 'Passenger Information | ' + trip.company + ' | ET Transport';

    /* ---------- Render order summary ---------- */
    document.getElementById('order-seats').textContent = seats.join(', ');
    document.getElementById('order-passengers').textContent = passengers;
    document.getElementById('order-price').textContent = formatPrice(trip.price);
    document.getElementById('order-total').textContent = formatPrice(trip.price * passengers);

    appEl.hidden = false;

    /* ============================================================
       Passenger form generation
       ============================================================ */
    var cardsEl = document.getElementById('passenger-cards');
    var passengerCards = [];

    function buildCard(i, seat) {
        var suffix = 'p' + (i + 1);
        var card = document.createElement('article');
        card.className = 'card passenger-card';
        card.dataset.index = i;

        card.innerHTML =
            '<header class="passenger-head">' +
                '<h2 class="passenger-title">Passenger <span>' + (i + 1) + '</span></h2>' +
                '<span class="seat-badge" title="Assigned seat">SEAT ' + seat + '</span>' +
            '</header>' +

            '<div class="field-group">' +
                '<label for="' + suffix + '-name">Full Name</label>' +
                '<input type="text" id="' + suffix + '-name" class="field-input p-name" ' +
                    'placeholder="Enter passenger\'s full name" autocomplete="name" ' +
                    'aria-describedby="' + suffix + '-name-err">' +
                '<span class="field-error p-name-err" id="' + suffix + '-name-err" role="alert"></span>' +
            '</div>' +

            '<div class="field-row">' +
                '<div class="field-group">' +
                    '<label for="' + suffix + '-age">Age</label>' +
                    '<input type="number" id="' + suffix + '-age" class="field-input p-age" ' +
                        'min="1" max="100" inputmode="numeric" step="1" ' +
                        'placeholder="e.g. 25" aria-describedby="' + suffix + '-age-err">' +
                    '<span class="field-error p-age-err" id="' + suffix + '-age-err" role="alert"></span>' +
                '</div>' +
                '<div class="field-group">' +
                    '<label for="' + suffix + '-gender">Gender</label>' +
                    '<select id="' + suffix + '-gender" class="field-input p-gender" ' +
                        'aria-describedby="' + suffix + '-gender-err">' +
                        '<option value="">Select gender</option>' +
                        '<option value="Male">Male</option>' +
                        '<option value="Female">Female</option>' +
                    '</select>' +
                    '<span class="field-error p-gender-err" id="' + suffix + '-gender-err" role="alert"></span>' +
                '</div>' +
            '</div>' +

            '<div class="field-group">' +
                '<label for="' + suffix + '-phone">Phone Number</label>' +
                '<div class="phone-field">' +
                    '<span class="phone-prefix" aria-hidden="true">+251</span>' +
                    '<input type="tel" id="' + suffix + '-phone" class="field-input p-phone" ' +
                        'placeholder="9XX XXX XXXX" autocomplete="tel-national" inputmode="numeric" ' +
                        'aria-describedby="' + suffix + '-phone-err" spellcheck="false">' +
                '</div>' +
                '<span class="phone-info p-phone-info" id="' + suffix + '-phone-info"></span>' +
                '<span class="field-error p-phone-err" id="' + suffix + '-phone-err" role="alert"></span>' +
            '</div>' +

            '<div class="field-group">' +
                '<label for="' + suffix + '-email">Email (Optional)</label>' +
                '<input type="email" id="' + suffix + '-email" class="field-input p-email" ' +
                    'placeholder="example@email.com" autocomplete="email" ' +
                    'aria-describedby="' + suffix + '-email-err">' +
                '<span class="field-error p-email-err" id="' + suffix + '-email-err" role="alert"></span>' +
            '</div>';

        cardsEl.appendChild(card);
        return card;
    }

    for (var i = 0; i < passengers; i++) {
        passengerCards.push(buildCard(i, seats[i]));
    }

    /* ---------- Phone helpers (Ethiopian, country code locked to +251) ---------- */
    /* Keep only digits; if the user typed an 09-prefixed number, strip the leading 0. */
    function normalizeLocal(raw) {
        var digits = raw.replace(/\D/g, '');
        if (digits.length === 10 && digits.charAt(0) === '0') {
            digits = digits.slice(1);
        } else if (digits.length > 10) {
            digits = digits.slice(0, 10);
        }
        return digits;
    }

    /* A valid local Ethiopian number is 9 digits: mobiles start 9/7
       (9XXXXXXXX) and landlines start with the area code 1-6 (11XXXXXXX). */
    function validLocal(digits) {
        return /^[1-9][0-9]{8}$/.test(digits);
    }

    function validEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    /* ---------- Validation & inline errors ---------- */
    function setError(card, key, message) {
        var field = card.querySelector('.p-' + key);
        var err = card.querySelector('.p-' + key + '-err');
        field.classList.add('field-invalid');
        err.textContent = message || '';
    }

    function clearError(card, key) {
        var field = card.querySelector('.p-' + key);
        var err = card.querySelector('.p-' + key + '-err');
        field.classList.remove('field-invalid');
        err.textContent = '';
    }

    /* Validate the phone field, set displayed full number, return true if valid. */
    function validatePhone(card) {
        var input = card.querySelector('.p-phone');
        var digits = normalizeLocal(input.value);
        var infoEl = card.querySelector('.p-phone-info');

        input.value = digits; // keep the local value clean & normalized on screen

        if (validLocal(digits)) {
            var full = '+251' + digits;
            card.dataset.phone = full;
            infoEl.textContent = 'Stored as ' + full;
            infoEl.classList.add('show');
            clearError(card, 'phone');
            return true;
        }
        card.dataset.phone = '';
        infoEl.textContent = '';
        infoEl.classList.remove('show');
        setError(card, 'phone', 'Please enter a valid Ethiopian phone number.');
        return false;
    }

    function validatePassenger(i) {
        var card = passengerCards[i];
        var ok = true;

        /* Full name (required) */
        var name = card.querySelector('.p-name').value.trim();
        if (!name) {
            setError(card, 'name', 'Please enter the passenger\u2019s full name.');
            ok = false;
        } else {
            clearError(card, 'name');
        }

        /* Age (required, whole number 1-100) */
        var ageRaw = card.querySelector('.p-age').value.trim();
        var ageNum = parseInt(ageRaw, 10);
        var ageOk = /^\d+$/.test(ageRaw) && ageNum >= 1 && ageNum <= 100;
        if (!ageRaw) {
            setError(card, 'age', 'Please enter the passenger\u2019s age.');
            ok = false;
        } else if (!ageOk) {
            setError(card, 'age', 'Please enter a valid age (whole number, 1 to 100).');
            ok = false;
        } else {
            clearError(card, 'age');
        }

        /* Gender (required) */
        var gender = card.querySelector('.p-gender').value;
        if (!gender) {
            setError(card, 'gender', 'Please select a gender.');
            ok = false;
        } else {
            clearError(card, 'gender');
        }

        /* Phone (required, Ethiopian +251) */
        if (!validatePhone(card)) { ok = false; }

        /* Email (optional, but must be valid if provided) */
        var email = card.querySelector('.p-email').value.trim();
        if (email && !validEmail(email)) {
            setError(card, 'email', 'Please enter a valid email address.');
            ok = false;
        } else {
            clearError(card, 'email');
        }

        return ok;
    }

    /* Enable the payment button only when every passenger is valid. */
    var payBtn = document.getElementById('pay-btn');
    var payMsg = document.getElementById('pay-msg');

    function updatePayState() {
        var allValid = true;
        for (var i = 0; i < passengerCards.length; i++) {
            if (!validatePassenger(i)) { allValid = false; }
        }
        payBtn.disabled = !allValid;
    }

    cardsEl.addEventListener('input', function (event) {
        var target = event.target;
        var card = target.closest('.passenger-card');
        if (!card) { return; }
        if (target.classList.contains('p-phone')) {
            validatePhone(card); // normalise + show stored number right away
        }
        updatePayState();
    });

    cardsEl.addEventListener('change', function (event) {
        var target = event.target;
        var card = target.closest('.passenger-card');
        if (!card) { return; }
        if (target.classList.contains('p-gender')) {
            updatePayState(); // select only fires 'change'
        }
    });

    /* ============================================================
       Saved-profile pre-fill — the dashboard's "Edit Profile" modal
       stores reusable passenger details plus a refund account. When
       a profile is saved on this device, the passenger page asks
       whether to reuse it; choosing "Use saved details" fills
       passenger 1 and the refund account, then locks those fields.
       ============================================================ */
    function loadSavedProfile() {
        if (!window.ETTransportStore) { return null; }
        var p = window.ETTransportStore.get('etTransportProfile');
        return (p && typeof p === 'object' && p.fullName) ? p : null;
    }

    function ageFromDob(iso) {
        if (!iso) { return ''; }
        var bd = new Date(iso + 'T00:00:00');
        if (isNaN(bd.getTime())) { return ''; }
        var now = new Date();
        var age = now.getFullYear() - bd.getFullYear();
        var m = now.getMonth() - bd.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) { age--; }
        return (age >= 1 && age <= 100) ? String(age) : '';
    }

    /* ============================================================
       Saved-profile pre-fill — gated behind an explicit prompt.
       When a profile is found, the popup asks whether to reuse it.
       "Use saved details" fills passenger 1 + the refund account
       and LOCKS the filled fields (inputs read-only, selects
       disabled); each locked banner has an "Edit" link to break
       the lock. "Enter manually" keeps the whole form blank.
       ============================================================ */
    var savedProfile = loadSavedProfile();

    /* Convert a stored international number (+251 9XX...) back to the
       local 9-digit value the phone field expects. */
    function localFromStored(full) {
        var d = String(full || '').replace(/\D/g, '');
        if (d.length === 12 && d.slice(0, 3) === '251') { d = d.slice(3); }
        return d;
    }

    /* Lock / unlock one field — inputs become read-only, selects disabled. */
    function lockField(el) {
        if (!el) { return; }
        el.dataset.prefilled = '1';
        if (el.tagName === 'SELECT') { el.disabled = true; }
        else { el.readOnly = true; }
    }

    function unlockField(el) {
        if (!el) { return; }
        el.dataset.prefilled = '';
        if (el.tagName === 'SELECT') { el.disabled = false; }
        else { el.readOnly = false; }
    }

    /* Fill a field only when a value exists, then lock it. */
    function fillLocked(input, value) {
        if (!input || !value) { return; }
        input.value = value;
        lockField(input);
    }

    function fillRefundFromProfile(profile) {
        var ra = profile.refundAccount;
        var rName = document.getElementById('refund-account-name');
        var rBank = document.getElementById('refund-account-type');
        var rOther = document.getElementById('refund-account-other');
        var rOtherWrap = document.getElementById('refund-account-other-wrap');
        var rNum = document.getElementById('refund-account-number');
        if (!ra || !rName || !rBank) { return; }

        var nameVal = '', bankVal = '', otherVal = '', numVal = '';
        if (ra.mode === 'mine') {
            nameVal = profile.fullName || '';
            bankVal = 'TeleBirr';
            numVal = ra.number || localFromStored(profile.phone || '');
        } else {
            nameVal = ra.name || '';
            bankVal = ra.bank || '';
            otherVal = (ra.bank === 'Other' && ra.otherBank) ? ra.otherBank : '';
            numVal = ra.number || '';
        }
        fillLocked(rName, nameVal);
        fillLocked(rBank, bankVal);
        if (rNum) { fillLocked(rNum, numVal); }
        if (rOther) { fillLocked(rOther, otherVal); }
        if (rOtherWrap) { rOtherWrap.hidden = (bankVal !== 'Other'); }
    }

    function fillPassengerFromProfile(profile) {
        var card = passengerCards[0];
        if (!card) { return; }
        fillLocked(card.querySelector('.p-name'), profile.fullName);
        if (profile.phone) {
            var phoneInput = card.querySelector('.p-phone');
            if (phoneInput) {
                phoneInput.value = localFromStored(profile.phone);
                lockField(phoneInput);
            }
        }
        fillLocked(card.querySelector('.p-email'), profile.email);
        if (profile.gender === 'Male' || profile.gender === 'Female') {
            var genderSel = card.querySelector('.p-gender');
            if (genderSel) { genderSel.value = profile.gender; lockField(genderSel); }
        }
        var ageInput = card.querySelector('.p-age');
        if (ageInput) {
            var savedAge = ageFromDob(profile.dob);
            if (savedAge) { ageInput.value = savedAge; lockField(ageInput); }
        }
    }

    /* -------- Locked-banner notes + unlock links -------- */
    function hasPrefilled(el) {
        return !!(el && el.querySelector('[data-prefilled="1"]'));
    }

    function addPassengerLockNote(card) {
        var head = card.querySelector('.passenger-head');
        var note = document.createElement('div');
        note.className = 'prefill-lock-note';
        note.innerHTML =
            '<span class="prefill-lock-ic" aria-hidden="true">&#128274;</span>' +
            '<span class="prefill-lock-copy">Filled from your saved profile &mdash; locked for this booking.</span>' +
            '<button type="button" class="prefill-unlock-link" data-unlock="passenger">Edit</button>';
        if (head && head.nextElementSibling) { card.insertBefore(note, head.nextElementSibling); }
        else { card.appendChild(note); }
    }

    function addRefundLockNote() {
        var card = document.getElementById('refund-account-card');
        if (!card) { return; }
        var hint = card.querySelector('.refund-account-hint');
        var note = document.createElement('div');
        note.className = 'prefill-lock-note';
        note.innerHTML =
            '<span class="prefill-lock-ic" aria-hidden="true">&#128274;</span>' +
            '<span class="prefill-lock-copy">Filled from your saved profile &mdash; locked for this booking.</span>' +
            '<button type="button" class="prefill-unlock-link" data-unlock="refund">Edit</button>';
        if (hint && hint.nextElementSibling) { card.insertBefore(note, hint.nextElementSibling); }
        else { card.appendChild(note); }
    }

    function unlockCardFields() {
        var card = passengerCards[0];
        if (!card) { return; }
        ['.p-name', '.p-age', '.p-gender', '.p-phone', '.p-email'].forEach(function (sel) {
            unlockField(card.querySelector(sel));
        });
        var note = card.querySelector('.prefill-lock-note');
        if (note) { note.remove(); }
    }

    function unlockRefundFields() {
        ['refund-account-name', 'refund-account-type', 'refund-account-other', 'refund-account-number'].forEach(function (id) {
            unlockField(document.getElementById(id));
        });
        var card = document.getElementById('refund-account-card');
        var note = card ? card.querySelector('.prefill-lock-note') : null;
        if (note) { note.remove(); }
    }

    function applyPrefill(profile) {
        fillRefundFromProfile(profile);
        fillPassengerFromProfile(profile);

        if (hasPrefilled(passengerCards[0])) { addPassengerLockNote(passengerCards[0]); }
        if (hasPrefilled(document.getElementById('refund-account-card'))) { addRefundLockNote(); }

        closePrefillModal();
        if (cardsAllValid()) { updatePayState(); }
    }

    /* -------- Prefill prompt modal (ask before filling anything) -------- */
    var prefillModal = document.getElementById('prefill-modal');
    var prefillYesBtn = document.getElementById('prefill-yes');
    var prefillNoBtn = document.getElementById('prefill-no');
    var prefillCloseBtn = document.getElementById('prefill-modal-close');

    function closePrefillModal() {
        if (prefillModal) { prefillModal.hidden = true; }
        document.body.classList.remove('modal-open');
    }

    function openPrefillModal(profile) {
        if (!prefillModal) { return; }
        var preview = document.getElementById('prefill-preview');
        if (preview) {
            preview.innerHTML = '';
            var ra = profile.refundAccount || null;
            var rows = [
                ['Passenger', profile.fullName || ''],
                ['Phone', profile.phone || ''],
                ['Email', profile.email || ''],
                ['Refund account', (ra && (ra.mode === 'mine' ? 'TeleBirr' : ra.bank)) || '']
            ];
            for (var i = 0; i < rows.length; i++) {
                if (!rows[i][1]) { continue; }
                var dt = document.createElement('dt');
                dt.textContent = rows[i][0];
                var dd = document.createElement('dd');
                dd.textContent = rows[i][1];
                preview.appendChild(dt);
                preview.appendChild(dd);
            }
        }
        prefillModal.hidden = false;
        document.body.classList.add('modal-open');
        /* The profile's own prefill preference sets the default choice. */
        var defaultBtn = profile.prefillBooking ? prefillYesBtn : prefillNoBtn;
        if (defaultBtn) { defaultBtn.focus(); }
    }

    function skipPrefill() {
        closePrefillModal();   /* form stays blank & editable */
    }

    if (prefillYesBtn) {
        prefillYesBtn.addEventListener('click', function () {
            if (savedProfile) { applyPrefill(savedProfile); }
        });
    }
    if (prefillNoBtn) { prefillNoBtn.addEventListener('click', skipPrefill); }
    if (prefillCloseBtn) { prefillCloseBtn.addEventListener('click', skipPrefill); }

    /* Unlock links inside the locked banners (both cards). */
    document.addEventListener('click', function (event) {
        var el = event.target;
        var btn = (el && el.closest) ? el.closest('.prefill-unlock-link') : null;
        if (!btn) { return; }
        if (btn.dataset.unlock === 'passenger') { unlockCardFields(); }
        else if (btn.dataset.unlock === 'refund') { unlockRefundFields(); }
        updatePayState();
    });

    /* Escape also backs out of the prompt. */
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && prefillModal && !prefillModal.hidden) {
            skipPrefill();
        }
    });

    /* Enable "Continue to Payment" only when the pre-filled details are
       complete; skip early error markers so "Prefer not to say" profiles
       (and other partially-saved data) stay clean until the user edits. */
    function cardsAllValid() {
        for (var v = 0; v < passengerCards.length; v++) {
            var c = passengerCards[v];
            if (!c.querySelector('.p-name').value.trim()) { return false; }
            var ageRaw = c.querySelector('.p-age').value.trim();
            var ageNum = parseInt(ageRaw, 10);
            if (!/^\d+$/.test(ageRaw) || ageNum < 1 || ageNum > 100) { return false; }
            if (!c.querySelector('.p-gender').value) { return false; }
            if (!validLocal(normalizeLocal(c.querySelector('.p-phone').value))) { return false; }
        }
        return true;
    }
    /* Ask once before filling anything — the popup only appears when a
       saved profile exists; otherwise the form simply starts blank. */
    if (savedProfile) {
        openPrefillModal(savedProfile);
    } else if (cardsAllValid()) {
        updatePayState();
    }

    /* -------- Refund account bank toggle (show "Other" text when selected) -------- */
    var refundBankTypeEl = document.getElementById('refund-account-type');
    var refundBankOtherWrap = document.getElementById('refund-account-other-wrap');
    if (refundBankTypeEl && refundBankOtherWrap) {
        refundBankTypeEl.addEventListener('change', function () {
            if (refundBankTypeEl.value === 'Other') {
                refundBankOtherWrap.hidden = false;
            } else {
                refundBankOtherWrap.hidden = true;
                var otherInput = document.getElementById('refund-account-other');
                if (otherInput) { otherInput.value = ''; }
            }
        });
    }

 /* ---------- Continue to Payment ---------- */
    payBtn.addEventListener('click', function () {
        // Re-validate everything one last time before leaving the page
        var allValid = true;
        for (var i = 0; i < passengerCards.length; i++) {
            if (!validatePassenger(i)) { allValid = false; }
        }
        if (!allValid) {
            updatePayState();
            return;
        }

        // Collect the completed passenger details
        var details = [];
        for (var j = 0; j < passengerCards.length; j++) {
            var card = passengerCards[j];
            details.push({
                name: card.querySelector('.p-name').value.trim(),
                age: parseInt(card.querySelector('.p-age').value, 10),
                gender: card.querySelector('.p-gender').value,
                phone: card.dataset.phone || '',
                email: card.querySelector('.p-email').value.trim()
            });
        }

        // Save the temporary booking state for the payment + confirmation steps
        var refundBankSel = document.getElementById('refund-account-type');
        var refundBankOther = document.getElementById('refund-account-other');
        var refundBankValue = '';
        if (refundBankSel && refundBankSel.value) {
            refundBankValue = refundBankSel.value === 'Other' && refundBankOther && refundBankOther.value.trim()
                ? refundBankOther.value.trim()
                : refundBankSel.value;
        }
        var bookingState = {
            tripId: tripId,
            passengers: passengers,
            date: date,
            seats: seats.slice(),
            passengerDetails: details,
            refundAccount: {
                name: (document.getElementById('refund-account-name') || {}).value ? document.getElementById('refund-account-name').value.trim() : '',
                number: (document.getElementById('refund-account-number') || {}).value ? document.getElementById('refund-account-number').value.trim() : '',
                bank: refundBankValue
            }
        };

        payMsg.hidden = true;
        try {
            sessionStorage.setItem('etTransportBooking', JSON.stringify(bookingState));
        } catch (e) { /* ignore storage errors in the prototype */ }
        window.location.href = 'payment.html';
    });

})();


