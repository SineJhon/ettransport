/* ============================================================
   ET Transport — payment.js
   Checkout (frontend-only, mock data).
   Reads the temporary booking state from sessionStorage,
   lets the user pick a mobile-money method and enter a phone,
   then simulates payment and moves on to confirmation.
   ============================================================ */

(function () {
    'use strict';

    /* ---------- Shared session key ---------- */
    var STATE_KEY = 'etTransportBooking';

    /* ---------- Formatting helpers ---------- */
    function formatPrice(n) {
        return 'ETB ' + n.toLocaleString();
    }

    function formatDuration(minutes) {
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        return h + 'h ' + ('0' + m).slice(-2) + 'm';
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

    /* ---------- Load the temporary booking state ---------- */
    var state = null;
    try {
        state = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    } catch (e) {
        state = null;
    }

    var appEl = document.getElementById('payment-app');
    var errorEl = document.getElementById('app-error');
    var errorMsg = document.getElementById('app-error-msg');

    function showError(message) {
        appEl.hidden = true;
        errorMsg.textContent = message;
        errorEl.hidden = false;
    }

    /* ---- Validate the booking state ---- */
    var tripId = state ? parseInt(state.tripId, 10) : NaN;
    var passengers = state ? parseInt(state.passengers, 10) : NaN;
    var date = state ? (state.date || '') : '';
    var seats = state && Array.isArray(state.seats) ? state.seats : [];
    var passengerDetails = state && Array.isArray(state.passengerDetails) ? state.passengerDetails : [];

    var trip = null;
    if (tripId) {
 /* prefer the real (database) trip snapshot saved by the
           search / company pages when the demo dataset has no matching id. */
        try {
            var raw = window.sessionStorage.getItem('etTransportSelectedTrip');
            if (raw) {
                var obj = JSON.parse(raw);
                if (obj && obj.v === 1 && obj.trip && Number(obj.trip.id) === Number(tripId)) {
                    trip = {
                        id: Number(obj.trip.id),
                        company: obj.trip.company || '',
                        from: obj.trip.from || '',
                        to: obj.trip.to || '',
                        depart: obj.trip.depart || '',
                        arrive: obj.trip.arrive || '',
                        minutes: Number(obj.trip.minutes) || 0,
                        price: Number(obj.trip.price) || 0,
                        type: obj.trip.type || 'Standard',
                        seats: Number(obj.trip.seats) || 0,
                        busType: obj.trip.busType || ''
                    };
                }
            }
        } catch (e) { /* ignore */ }

        if (!trip) {
            for (var t = 0; t < trips.length; t++) {
                if (trips[t].id === tripId) { trip = trips[t]; break; }
            }
        }
    }

    // Guard: we need a known trip, a passenger count, matching seat count and
    // matching collected passenger details — otherwise we cannot render a checkout.
    if (!trip || !passengers || passengers < 1 ||
        seats.length !== passengers || passengerDetails.length !== passengers) {
        showError('Booking information unavailable. Please start a new search.');
        return;
    }

    var total = trip.price * passengers;
    var totalText = formatPrice(total);

    /* ---------- Render booking summary ---------- */
    document.getElementById('trip-company').textContent = trip.company;
    document.getElementById('trip-route').textContent = trip.from + ' \u2192 ' + trip.to;
    document.getElementById('trip-date').textContent = formatDate(date);
    document.getElementById('trip-depart').textContent = trip.depart;
    document.getElementById('trip-arrive').textContent = trip.arrive;
    document.getElementById('trip-duration').textContent = formatDuration(trip.minutes);
    document.getElementById('trip-type').textContent = trip.type;
    document.getElementById('trip-seats').textContent = seats.join(', ');
    document.getElementById('trip-passengers').textContent = passengers;
    document.title = 'Payment | ' + trip.company + ' | ET Transport';

    /* ---------- Render order summary ---------- */
    document.getElementById('order-price').textContent = formatPrice(trip.price);
    document.getElementById('order-passengers').textContent = passengers;
    document.getElementById('order-seats').textContent = seats.join(', ');
    document.getElementById('order-total').textContent = totalText;

    /* ---------- Back navigation (Payment → Passenger) ---------- */
    var backLink = document.getElementById('back-link');
    backLink.href = 'passenger.html?trip=' + tripId +
        '&passengers=' + passengers +
        '&date=' + encodeURIComponent(date) +
        '&seats=' + encodeURIComponent(seats.join(','));

    /* ---------- Phone helpers (same convention as passenger.js) ---------- */
    function normalizeLocal(raw) {
        var digits = raw.replace(/\D/g, '');
        if (digits.length === 10 && digits.charAt(0) === '0') {
            digits = digits.slice(1);
        } else if (digits.length > 10) {
            digits = digits.slice(0, 10);
        }
        return digits;
    }

    function validLocal(digits) {
        return /^9[0-9]{8}$/.test(digits);
    }

    /* ---------- Payment method selection ---------- */
    var methodInputs = document.querySelectorAll('input[name="pay-method"]');
    var methodErrorEl = document.getElementById('method-error');
    var detailsCard = document.getElementById('payment-details');
    var phoneInput = document.getElementById('pay-phone');
    var phoneInfoEl = document.getElementById('pay-phone-info');
    var phoneErrEl = document.getElementById('pay-phone-err');

    var selectedMethod = '';
    var validPhone = false;

    methodInputs.forEach(function (input) {
        input.addEventListener('change', function () {
            selectedMethod = input.value;
            methodErrorEl.textContent = '';
            methodInputs.forEach(function (other) {
                other.closest('.pay-option').classList.toggle('selected', other === input);
            });
            detailsCard.hidden = false;
            updatePayButton();
        });
    });

    /* Validate the payment phone; keep screen value normalised (same as passenger page). */
    function validatePaymentPhone() {
        var digits = normalizeLocal(phoneInput.value);
        phoneInput.value = digits;
        if (validLocal(digits)) {
            phoneInfoEl.textContent = 'Stored as +251' + digits;
            phoneInfoEl.classList.add('show');
            phoneErrEl.textContent = '';
            phoneInput.classList.remove('field-invalid');
            validPhone = true;
        } else {
            validPhone = false;
            phoneInfoEl.textContent = '';
            phoneInfoEl.classList.remove('show');
            phoneErrEl.textContent = 'Please enter a valid Ethiopian phone number.';
            phoneInput.classList.add('field-invalid');
        }
        // Store the full number for the confirmation ticket
        phoneInput.dataset.full = validPhone ? ('+251' + digits) : '';
        updatePayButton();
    }

    phoneInput.addEventListener('input', validatePaymentPhone);

    /* ---------- Pay button ---------- */
    var payBtn = document.getElementById('pay-btn');
    var payMsg = document.getElementById('pay-msg');
    var payError = document.getElementById('pay-error');
    var failToggle = document.getElementById('fail-toggle');
    var processing = false;

    function updatePayButton() {
        if (processing) { return; }
        var ready = selectedMethod !== '' && validPhone;
        payBtn.disabled = !ready;
        payBtn.textContent = 'Pay ' + totalText;
    }

    /* ---------- Mock payment processing ---------- */
    function generateBookingRef() {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var out = 'ET-';
        for (var i = 0; i < 6; i++) {
            out += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return out;
    }

 /* ---------- Backend helpers (real checkout) ---------- */
    function postJSON(url, payload) {
        return window.fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (res) {
            return res.json().catch(function () {
                return { success: false, message: 'Invalid server response.' };
            }).then(function (json) {
                return { status: res.status, data: json };
            });
        });
    }

    function paymentMethodCode(label) {
        var m = String(label || '').toLowerCase().replace(/[\s\-_]/g, '');
        if (m === 'telebirr') { return 'telebirr'; }
        if (m === 'cbebirr') { return 'cbe_birr'; }
        if (m === 'mpesa') { return 'mpesa'; }
        return m;
    }

    /* Booking already persisted by the backend on a previous attempt — a
       failed payment can retry without re-creating/re-selecting seats. */
    var createdBookingId = 0;
    var createdBookingRef = '';

    function runRealCheckout() {
        var methodCode = paymentMethodCode(selectedMethod);
        var phoneFull = phoneInput.dataset.full || '';

        function payStep() {
            return postJSON('api/payment.php?action=pay', {
                booking_id: createdBookingId,
                method: methodCode,
                phone: phoneFull
            }).then(function (resp) {
                if (!resp.data || !resp.data.success) {
                    throw new Error((resp.data && resp.data.message) || 'Payment could not be completed.');
                }
                if (resp.data.booking && resp.data.booking.reference) {
                    createdBookingRef = resp.data.booking.reference;
                    state.bookingRef = createdBookingRef;
                }
                if (resp.data.booking) { state.total = resp.data.booking.total; }
                saveAndContinue(createdBookingRef, true);
            });
        }

        var firstStep;
        if (createdBookingId > 0) {
            firstStep = Promise.resolve();
        } else {
            firstStep = postJSON('api/booking.php?action=create', {
                trip_id: state.tripId,
                date: state.date || '',
                seats: state.seats ? state.seats.slice() : [],
                passengers: (state.passengerDetails || []).map(function (p) {
                    return { name: p.name, age: p.age, gender: p.gender, phone: p.phone || '' };
                }),
                payment_method: methodCode,
                refund_account_name: (state.refundAccount && state.refundAccount.name) || '',
                refund_account_number: (state.refundAccount && state.refundAccount.number) || ''
            }).then(function (resp) {
                if (!resp.data || !resp.data.success) {
                    throw new Error((resp.data && resp.data.message) || 'Booking could not be completed.');
                }
                var b = resp.data.booking;
                createdBookingId = b.id;
                createdBookingRef = b.reference;
                state.bookingRef = b.reference;
                state.total = b.total;
            });
        }

        firstStep
            .then(payStep)
            .catch(function (err) {
                payError.textContent = (err && err.message) ? err.message : 'Payment failed. Please try again.';
                payError.hidden = false;
                processing = false;
                payBtn.disabled = false;
                payBtn.textContent = 'Try Again \u2014 Pay ' + totalText;
            });
    }

    /* Hide previous payment result as soon as the user edits the form again. */
    [failToggle, phoneInput].forEach(function (el) {
        el.addEventListener('input', function () {
            payMsg.hidden = true;
            payError.hidden = true;
            if (!processing) { updatePayButton(); }
        });
    });
    methodInputs.forEach(function (input) {
        input.addEventListener('change', function () {
            payMsg.hidden = true;
            payError.hidden = true;
            if (!processing) { updatePayButton(); }
        });
    });

    function saveAndContinue(bookingRef, real) {
        // Fold the payment result back into the temporary booking state.
        state.bookingRef = bookingRef;
        state.paymentMethod = selectedMethod;
        state.paymentPhone = phoneInput.dataset.full || '';
        // The server already computed the authoritative total for the real path.
        if (!state.total || state.total <= 0) { state.total = total; }
        try {
            sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
        } catch (e) { /* ignore storage errors in the prototype */ }
        var url = 'confirmation.html';
        if (real) { url += '?ref=' + encodeURIComponent(bookingRef); }
        window.location.href = url;
    }

    payBtn.addEventListener('click', function () {
        if (processing) { return; }
        if (!selectedMethod || !validPhone) {
            if (!selectedMethod) {
                methodErrorEl.textContent = 'Please select a payment method.';
            }
            return;
        }

        processing = true;
        payBtn.disabled = true;
        payBtn.textContent = 'Processing payment...';
        payMsg.hidden = true;
        payError.hidden = true;

        var simulateFailure = failToggle.checked;

        if (simulateFailure) {
            // ---- Simulated failure state: show reason + Try Again ----
            setTimeout(function () {
                payError.textContent =
                    'Payment failed: ' + selectedMethod +
                    ' declined the transaction (simulated). Please check the number and try again.';
                payError.hidden = false;
                processing = false;
                payBtn.disabled = false;
                payBtn.textContent = 'Try Again \u2014 Pay ' + totalText;
            }, 1600);
            return;
        }

        // Real database flow for authenticated passengers; the legacy demo
        // flow is kept for guests so the prototype keeps working offline.
        window.ETAuth.getCurrentUser().then(function (user) {
            if (user && user.role === 'passenger') {
                runRealCheckout();
            } else {
                setTimeout(function () {
                    // ---- Success: generate reference + go to confirmation ----
                    saveAndContinue(generateBookingRef(), false);
                }, 1600);
            }
        }).catch(function () {
            setTimeout(function () {
                saveAndContinue(generateBookingRef(), false);
            }, 1600);
        });
    });

    /* ---------- Init ---------- */
    updatePayButton();
    appEl.hidden = false;

})();

