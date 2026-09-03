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
        { id: 1, company: 'Selam Express',    from: 'Addis Ababa', to: 'Arba Minch', depart: '06:30', arrive: '14:45', minutes: 495, price: 720,  rating: 4.8, type: 'Luxury' },
        { id: 2, company: 'Dashen Motors',    from: 'Addis Ababa', to: 'Arba Minch', depart: '07:45', arrive: '15:30', minutes: 465, price: 740,  rating: 4.4, type: 'Luxury' },
        { id: 3, company: 'Ethio Abay Lines', from: 'Addis Ababa', to: 'Arba Minch', depart: '08:00', arrive: '16:30', minutes: 510, price: 650,  rating: 4.5, type: 'Standard' },
        { id: 4, company: 'SkyLink Coaches',  from: 'Addis Ababa', to: 'Arba Minch', depart: '10:15', arrive: '18:45', minutes: 510, price: 480,  rating: 4.2, type: 'Standard' },
        { id: 5, company: 'Lion Express',     from: 'Addis Ababa', to: 'Arba Minch', depart: '13:00', arrive: '21:00', minutes: 480, price: 850,  rating: 4.6, type: 'VIP' },
        { id: 6, company: 'GreenLion Travel', from: 'Addis Ababa', to: 'Arba Minch', depart: '15:30', arrive: '23:45', minutes: 495, price: 1100, rating: 4.9, type: 'VIP' },
        { id: 7, company: 'Abay River Bus',   from: 'Addis Ababa', to: 'Arba Minch', depart: '18:00', arrive: '02:45', minutes: 525, price: 950,  rating: 4.3, type: 'Luxury' },
        { id: 8, company: 'Yeha Coaches',     from: 'Addis Ababa', to: 'Arba Minch', depart: '19:30', arrive: '04:00', minutes: 510, price: 1250, rating: 4.7, type: 'VIP' },

 /* ---------- company trips (see js/company.js) ---------- */
        { id: 1001, company: 'Selam Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '06:30', arrive: '15:30', minutes: 540, price: 900, rating: 4.8, type: 'Luxury', seats: 18, busType: 'Scania Touring', offsetDays: 2 },
        { id: 1002, company: 'Selam Bus', from: 'Addis Ababa', to: 'Mekelle', depart: '05:30', arrive: '18:00', minutes: 750, price: 1200, rating: 4.9, type: 'VIP', seats: 9, busType: 'MAN Lion\u2019s Coach', offsetDays: 4 },
        { id: 1011, company: 'Sky Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '07:00', arrive: '12:15', minutes: 315, price: 500, rating: 4.5, type: 'Standard', seats: 22, busType: 'Yutong ZK6107H', offsetDays: 1 },
        { id: 1012, company: 'Sky Bus', from: 'Addis Ababa', to: 'Arba Minch', depart: '08:00', arrive: '16:30', minutes: 510, price: 700, rating: 4.6, type: 'Luxury', seats: 12, busType: 'Higer A90', offsetDays: 5 },
        { id: 1021, company: 'Yegna Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '10:30', arrive: '19:30', minutes: 540, price: 850, rating: 4.4, type: 'Standard', seats: 25, busType: 'MAN Lion\u2019s Coach', offsetDays: 3 },
        { id: 1022, company: 'Yegna Bus', from: 'Addis Ababa', to: 'Gondar', depart: '06:00', arrive: '18:30', minutes: 750, price: 1050, rating: 4.5, type: 'Luxury', seats: 8, busType: 'Golden Dragon XML6125', offsetDays: 6 },
        { id: 1031, company: 'Golden Bus', from: 'Addis Ababa', to: 'Dessie', depart: '08:30', arrive: '15:00', minutes: 390, price: 600, rating: 4.3, type: 'Standard', seats: 20, busType: 'Yutong ZK6107H', offsetDays: 2 },
        { id: 1032, company: 'Golden Bus', from: 'Addis Ababa', to: 'Adama', depart: '09:00', arrive: '10:40', minutes: 100, price: 220, rating: 4.2, type: 'Standard', seats: 30, busType: 'King Long XMQ6898', offsetDays: 1 },
        { id: 1041, company: 'Zemen Bus', from: 'Addis Ababa', to: 'Dire Dawa', depart: '06:45', arrive: '15:15', minutes: 510, price: 820, rating: 4.6, type: 'Luxury', seats: 14, busType: 'Neoplan Skyliner', offsetDays: 3 },
        { id: 1042, company: 'Zemen Bus', from: 'Addis Ababa', to: 'Jijiga', depart: '05:45', arrive: '18:00', minutes: 735, price: 1100, rating: 4.7, type: 'VIP', seats: 6, busType: 'Mercedes-Benz Tourismo', offsetDays: 5 },
        { id: 1051, company: 'ODAA Bus', from: 'Addis Ababa', to: 'Jimma', depart: '07:30', arrive: '15:30', minutes: 480, price: 700, rating: 4.4, type: 'Luxury', seats: 11, busType: 'Yutong ZK6122H9', offsetDays: 2 },
        { id: 1052, company: 'ODAA Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '13:00', arrive: '18:10', minutes: 310, price: 480, rating: 4.3, type: 'Standard', seats: 27, busType: 'Foton AUV BJ6129', offsetDays: 4 },
        { id: 1061, company: 'Abay Bus', from: 'Addis Ababa', to: 'Bahir Dar', depart: '07:00', arrive: '16:00', minutes: 540, price: 880, rating: 4.2, type: 'Standard', seats: 19, busType: 'Yutong ZK6107H', offsetDays: 3 },
        { id: 1071, company: 'Ethio Bus', from: 'Addis Ababa', to: 'Hawassa', depart: '06:15', arrive: '11:20', minutes: 305, price: 480, rating: 4.1, type: 'Standard', seats: 31, busType: 'King Long XMQ6898', offsetDays: 2 },
        { id: 1081, company: 'Liyu Bus', from: 'Addis Ababa', to: 'Mekelle', depart: '20:00', arrive: '06:30', minutes: 630, price: 1350, rating: 4.6, type: 'VIP', seats: 7, busType: 'Neoplan Skyliner', offsetDays: 3 }
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

    /* A valid local Ethiopian mobile number: 9 + 8 digits (9XXXXXXXX) */
    function validLocal(digits) {
        return /^9[0-9]{8}$/.test(digits);
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
        var bookingState = {
            tripId: tripId,
            passengers: passengers,
            date: date,
            seats: seats.slice(),
            passengerDetails: details,
            refundAccount: {
                name: (document.getElementById('refund-account-name') || {}).value ? document.getElementById('refund-account-name').value.trim() : '',
                number: (document.getElementById('refund-account-number') || {}).value ? document.getElementById('refund-account-number').value.trim() : ''
            }
        };

        payMsg.hidden = true;
        try {
            sessionStorage.setItem('etTransportBooking', JSON.stringify(bookingState));
        } catch (e) { /* ignore storage errors in the prototype */ }
        window.location.href = 'payment.html';
    });

})();


