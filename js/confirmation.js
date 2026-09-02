/* ============================================================
   ET Transport — confirmation.js
   Booking confirmation + digital ticket.

   Two sources:
   1. Real backend — when the page is opened with ?ref=ET-… the
      ticket is loaded from MySQL via api/booking.php?action=get
      (server-enforced ownership).
   2. Legacy demo — when a guest completes the in-browser flow,
      the confirmed state in sessionStorage renders exactly as
      before.
   ============================================================ */

(function () {
    'use strict';

    /* ---------- Shared session key ---------- */
    var STATE_KEY = 'etTransportBooking';

    /* ---------- URL helpers ---------- */
    function getParam(name, fallback) {
        var value = new URLSearchParams(window.location.search).get(name);
        return (value === null || value === '') ? fallback : value;
    }

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
/* ---------- Shared demo trip data (legacy fallback) ---------- */
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
var appEl = document.getElementById('confirmation-app');
    var errorEl = document.getElementById('app-error');
    var errorMsg = document.getElementById('app-error-msg');

    function showError(message) {
        appEl.hidden = true;
        errorMsg.textContent = message;
        errorEl.hidden = false;
    }

    /* ---- Current confirmed booking (set by either source) ---- */
    var tripId = NaN;
    var bookingRef = '';
    var date = '';
    var seats = [];
    var passengerDetails = [];
    var total = 0;
    var trip = null;
    var paymentMethod = '';
    var paymentPhone = '';
    var bookingStatusText = 'confirmed';

 /* the real (database) trip snapshot saved by the
       search / company pages is preferred when the booking was made from a
       real trip id that is missing from the legacy demo dataset. */
    function resolveTripById(id) {
        var resolved = null;

        if (id) {
            try {
                var raw = window.sessionStorage.getItem('etTransportSelectedTrip');
                if (raw) {
                    var obj = JSON.parse(raw);
                    if (obj && obj.v === 1 && obj.trip && Number(obj.trip.id) === Number(id)) {
                        resolved = {
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
            } catch (e) { /* snapshot unavailable — fall back to demo data */ }

            if (!resolved) {
                for (var t = 0; t < trips.length; t++) {
                    if (Number(trips[t].id) === Number(id)) { resolved = trips[t]; break; }
                }
            }
        }

        return resolved;
    }

    function applyState(state) {
        tripId = state ? parseInt(state.tripId, 10) : NaN;
        bookingRef = state ? (state.bookingRef || '') : '';
        date = state ? (state.date || '') : '';
        seats = state && Array.isArray(state.seats) ? state.seats.slice() : [];
        passengerDetails = state && Array.isArray(state.passengerDetails) ? state.passengerDetails : [];
        total = state ? (Number(state.total) || 0) : 0;
        paymentMethod = state ? (state.paymentMethod || '') : '';
        paymentPhone = state ? (state.paymentPhone || '') : '';
        bookingStatusText = 'confirmed';
        trip = resolveTripById(tripId);
    }

    /* The backend booking payload already contains everything the ticket
       needs — trip, seats, passengers, server-computed total. */
    function applyBookingFromApi(b) {
        bookingRef = b.reference || '';
        date = b.date || '';
        seats = (Array.isArray(b.seats) ? b.seats : []).slice();
        passengerDetails = (Array.isArray(b.passengers) ? b.passengers : []).map(function (p) {
            var g = String(p.gender || '');
            return {
                name: p.name || '',
                age: p.age,
                gender: g ? g.charAt(0).toUpperCase() + g.slice(1) : '',
                phone: p.phone || ''
            };
        });
        total = Number(b.total) || 0;
        paymentMethod = b.payment_method || '';
        paymentPhone = (passengerDetails.length && passengerDetails[0].phone) || '';
        bookingStatusText = b.status || 'confirmed';
        trip = {
            id: 0,
            company: b.company || '',
            from: b.from || '',
            to: b.to || '',
            depart: b.depart || '',
            arrive: b.arrive || '',
            minutes: Number(b.minutes) || 0,
            price: passengerDetails.length ? (Number(b.total) / passengerDetails.length) || 0 : 0,
            type: b.tripType || 'Standard',
            seats: (b.seats || []).length,
            busType: b.busType || ''
        };
    }
/* ============================================================
       Render the confirmed ticket (shared by demo + backend paths)
       ============================================================ */
    function renderTicket() {
        if (!trip || !bookingRef || total <= 0 || seats.length === 0) {
            showError('No confirmed booking was found for this ticket. Please start a new search.');
            return;
        }

        /* ---------- Passenger names for the ticket ---------- */
        var passengerNames = [];
        for (var p = 0; p < passengerDetails.length; p++) {
            passengerNames.push(passengerDetails[p].name || ('Passenger ' + (p + 1)));
        }

        /* ---------- Render success header + ticket ---------- */
        document.getElementById('ref-number').textContent = bookingRef;
        document.getElementById('ticket-ref').textContent = bookingRef;
        document.getElementById('t-ref').textContent = bookingRef;

        document.getElementById('t-departure-city').textContent = trip.from;
        document.getElementById('t-depart-time').textContent = trip.depart;
        document.getElementById('t-arrival-city').textContent = trip.to;
        document.getElementById('t-arrival-time').textContent = trip.arrive;
        document.getElementById('t-duration').textContent = formatDuration(trip.minutes);

        document.getElementById('t-passengers').textContent = passengerNames.join(', ');
        document.getElementById('t-company').textContent = trip.company;
        document.getElementById('t-date').textContent = formatDate(date);
        document.getElementById('t-depart').textContent = trip.depart;
        document.getElementById('t-arrive').textContent = trip.arrive;
        document.getElementById('t-seats').textContent = seats.join(', ');
        document.getElementById('t-type').textContent = trip.type;
        document.getElementById('t-total').textContent = formatPrice(total);

        document.title = 'Booking Confirmed ' + bookingRef + ' | ET Transport';

        /* --------------------------------------------------------
 add the completed booking to dashboard history
           --------------------------------------------------------
           Session key: etTransportBookings (array in sessionStorage).
           A booking reference may only appear once, so refreshing the
           confirmation page cannot store duplicate records. */
        function historyList() {
            return window.ETTransportStore ? window.ETTransportStore.list('etTransportBookings') : [];
        }
        function saveHistory(list) {
            if (window.ETTransportStore) { window.ETTransportStore.set('etTransportBookings', list); }
        }
        function notificationList() {
            return window.ETTransportStore ? window.ETTransportStore.list('etTransportNotifications') : [];
        }
        function saveNotifications(list) {
            if (window.ETTransportStore) { window.ETTransportStore.set('etTransportNotifications', list); }
        }
        function addNotification(icon, title, message) {
            if (!window.ETTransportStore) { return; }
            var list = notificationList();
            var id = 'booking-' + bookingRef;
            for (var n = 0; n < list.length; n++) {
                if (list[n].id === id) { return; }
            }
            list.unshift({ id: id, icon: icon, title: title, message: message, time: 'Just now', read: false });
            saveNotifications(list);
        }

        function two(n) { return ('0' + n).slice(-2); }
        var seatLabel = (seats.slice()).sort(function (a, b) { return a - b; }).map(two).join(', ');
        var record = {
            reference: bookingRef,
            company: trip.company,
            companyId: '',
            from: trip.from,
            to: trip.to,
            date: date || '',
            depart: trip.depart,
            arrive: trip.arrive,
            minutes: trip.minutes || 0,
            seats: seats,
            seatLabel: seatLabel,
            passengerCount: passengerNames.length,
            passengerNames: passengerNames,
            total: total,
            paymentMethod: paymentMethod || '',
            paymentPhone: paymentPhone || '',
            busType: trip.busType || trip.type || '',
            tripType: trip.type || '',
            status: bookingStatusText,
            real: true,
            bookedAt: new Date().toISOString()
        };

        var existing = historyList();
        var already = false;
        for (var h = 0; h < existing.length; h++) {
            if (existing[h].reference === bookingRef) { already = true; break; }
        }
        if (!already) {
            existing.unshift(record);
            saveHistory(existing);
            addNotification('&#128652;', 'Booking Confirmed', 'Your ' + trip.company + ' trip to ' + trip.to + ' is confirmed (ref ' + bookingRef + ').');
            addNotification('&#128179;', 'Payment Successful', 'Payment of ' + formatPrice(total) + ' was successfully processed for booking ' + bookingRef + '.');
            try { window.sessionStorage.setItem('etTransportLastBooking', bookingRef); } catch (e) { /* prototype only */ }
        }

        /* ---------- Download / Print ticket ---------- */
        var printBtn = document.getElementById('print-btn');
        if (printBtn) {
            printBtn.addEventListener('click', function () {
                window.print();
            });
        }

        /* ---------- Share ticket ---------- */
        var shareBtn = document.getElementById('share-btn');
        var shareMsg = document.getElementById('share-msg');
        if (shareBtn) {
            shareBtn.addEventListener('click', function () {
                var text = 'ET Transport booking ' + bookingRef + ': ' +
                    trip.from + ' \u2192 ' + trip.to + ', ' + formatDate(date) +
                    ' at ' + trip.depart + '. Total ' + formatPrice(total) + '.';

                if (navigator.share) {
                    navigator.share({ title: 'ET Transport Ticket', text: text })
                        .then(function () {
                            shareMsg.textContent = '';
                            shareMsg.hidden = true;
                        })
                        .catch(function () {
                            shareMsg.textContent = '';
                            shareMsg.hidden = true;
                        });
                } else if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text)
                        .then(function () {
                            showShare('Booking details copied to clipboard.');
                        })
                        .catch(function () {
                            showShare(text);
                        });
                } else {
                    showShare(text);
                }
            });
        }

        function showShare(message) {
            shareMsg.textContent = message;
            shareMsg.hidden = false;
        }

        appEl.hidden = false;
    }

    /* ============================================================
       Init
       ============================================================ */

    /* Legacy demo path — confirmed booking state from sessionStorage. */
    function initFromState() {
        var state = null;
        try {
            state = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
        } catch (e) {
            state = null;
        }

        applyState(state);

        if (!trip || !bookingRef || total <= 0 || seats.length === 0) {
            showError('No confirmed booking was found in this session. Please start a new search.');
            return;
        }

        renderTicket();
    }

    /* Real backend path — the ticket is loaded from MySQL and the server
       enforces that the logged-in passenger owns this booking. */
    function initFromBackend(ref) {
        window.fetch('api/booking.php?action=get&ref=' + encodeURIComponent(ref), {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (res) { return res.json(); })
            .then(function (json) {
                if (!json || !json.success || !json.booking) {
                    showError('Booking not found or you do not have access to it. Please sign in and try again.');
                    return;
                }

                applyBookingFromApi(json.booking);
                renderTicket();
            })
            .catch(function () {
                showError('Unable to load your booking. Please try again later.');
            });
    }

    var refParam = getParam('ref', '');

    if (refParam) {
        initFromBackend(refParam);
    } else {
        initFromState();
    }
})();