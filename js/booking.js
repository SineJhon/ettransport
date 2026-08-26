/* ============================================================
   ET Transport — booking.js
   Seat selection (frontend-only, mock data).
   Demo only — seat availability is NOT real.
   ============================================================ */

(function () {
    'use strict';

    /* ---------- URL & formatting helpers ---------- */
    function getParam(name, fallback) {
        var value = new URLSearchParams(window.location.search).get(name);
        return (value === null || value === '') ? fallback : value;
    }

    function pad(n) {
        return ('0' + n).slice(-2);
    }

    function formatDuration(minutes) {
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        return h + 'h ' + ('0' + m).slice(-2) + 'm';
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

    /* ---------- Read URL context ---------- */
    var tripId = parseInt(getParam('trip', '3'), 10) || 3;
    var passengers = Math.max(1, parseInt(getParam('passengers', '2'), 10) || 2);
    var date = getParam('date', new Date().toISOString().slice(0, 10));

    var trip = null;

 /* a real (database) trip id may not exist in the shared demo
       dataset. search.js and company.js persist the selected trip into
       sessionStorage BEFORE navigating here, so the whole flow can render
       the correct departure (company, times, price, date). */
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

    var picked = snapshotTrip(tripId);
    if (picked) {
        trip = {
            id: Number(picked.id),
            company: picked.company || '',
            from: picked.from || '',
            to: picked.to || '',
            depart: picked.depart || '',
            arrive: picked.arrive || '',
            minutes: Number(picked.minutes) || 0,
            price: Number(picked.price) || 0,
            rating: Number(picked.rating) || 0,
            type: picked.type || 'Standard',
            seats: Number(picked.seats) || 0,
            busType: picked.busType || '',
            amenities: []
        };
    } else {
        for (var i = 0; i < trips.length; i++) {
            if (trips[i].id === tripId) { trip = trips[i]; break; }
        }
        if (!trip) { trip = trips[2]; }
    }

    /* ---------- Render trip summary ---------- */
    document.getElementById('trip-company').textContent = trip.company;
    document.getElementById('trip-route').textContent = trip.from + ' \u2192 ' + trip.to;
    document.getElementById('trip-depart').textContent = trip.depart;
    document.getElementById('trip-arrive').textContent = trip.arrive;
    document.getElementById('trip-duration').textContent = formatDuration(trip.minutes);
    document.getElementById('booking-date').textContent = formatDate(date);
    document.getElementById('passenger-count').textContent = passengers;
    document.title = 'Choose Your Seats | ' + trip.company + ' | ET Transport';

    /* Booking summary panel */
    document.getElementById('sum-trip').textContent = trip.company;
    document.getElementById('sum-route').textContent = trip.from + ' \u2192 ' + trip.to;
    document.getElementById('sum-date').textContent = formatDate(date);
    document.getElementById('sum-passengers').textContent = passengers;

    /* ---------- Generate the 51-seat Ethiopian coach map ----------
       Each layout row is one of:
         standard -> left[2 seats] | aisle | right[2 seats]
         door     -> left[2 seats] | aisle | right-side entrance (no right seats)
         rear     -> 5-seat rear bench across the width, no aisle
       Seat numbering follows the real 1-51 intercity coach pattern. */
    var layout = [
        { type: 'standard', left: [ 1,  2], right: [ 4,  3] },
        { type: 'standard', left: [ 5,  6], right: [ 8,  7] },
        { type: 'standard', left: [ 9, 10], right: [12, 11] },
        { type: 'standard', left: [13, 14], right: [16, 15] },
        { type: 'standard', left: [17, 18], right: [20, 19] },
        { type: 'standard', left: [21, 22], right: [24, 23] },
        { type: 'standard', left: [25, 26], right: [28, 27] },
        { type: 'door',    left: [29, 30], right: [] },
        { type: 'standard', left: [33, 34], right: [32, 31] },
        { type: 'standard', left: [37, 38], right: [36, 35] },
        { type: 'standard', left: [41, 42], right: [40, 39] },
        { type: 'standard', left: [45, 46], right: [44, 43] },
        { type: 'rear', seats: [49, 50, 51, 48, 47] }
    ];

    var occupied = [3, 4, 11, 12, 19, 20, 27];
    var unavailable = [1, 32];
    var seatLabel = { available: 'Available', occupied: 'Occupied', unavailable: 'Unavailable' };

    function seatState(num) {
        if (unavailable.indexOf(num) !== -1) { return 'unavailable'; }
        if (occupied.indexOf(num) !== -1) { return 'occupied'; }
        return 'available';
    }

    function seatButton(num) {
        var state = seatState(num);
        var disabled = state !== 'available' ? ' disabled' : '';
        return '<button type="button" class="seat ' + state + '" data-seat="' + num +
            '" aria-label="Seat ' + pad(num) + ', ' + seatLabel[state] +
            '" title="Seat ' + pad(num) + ' (' + seatLabel[state] + ')"' + disabled + '>' +
            '<svg class="seat-svg" viewBox="0 0 40 52" aria-hidden="true">' +
                '<g fill="currentColor">' +
                    '<rect x="8" y="5" width="24" height="30" rx="7"/>' +
                    '<rect x="2.5" y="9" width="5" height="27" rx="2.5"/>' +
                    '<rect x="32.5" y="9" width="5" height="27" rx="2.5"/>' +
                    '<rect x="4" y="39" width="32" height="11" rx="5"/>' +
                '</g>' +
                '<g fill="rgba(255,255,255,0.22)">' +
                    '<rect x="10" y="7" width="20" height="3" rx="1.5"/>' +
                '</g>' +
            '</svg>' +
            '<span class="seat-num">' + pad(num) + '</span>' +
            '</button>';
    }

    function renderRow(row) {
        var html = '<div class="seat-row seat-row-' + row.type + '">';
        if (row.type === 'rear') {
            for (var i = 0; i < row.seats.length; i++) { html += seatButton(row.seats[i]); }
        } else {
            for (var l = 0; l < row.left.length; l++) { html += seatButton(row.left[l]); }
            html += '<span class="seat-aisle" aria-hidden="true"></span>';
            if (row.type === 'door') {
                html += '<span class="bus-door" role="img" aria-label="Passenger entrance"></span>';
            } else {
                for (var r = 0; r < row.right.length; r++) { html += seatButton(row.right[r]); }
            }
        }
        html += '</div>';
        return html;
    }

    var seatMap = document.getElementById('seat-map');
    var html = '';
    for (var i = 0; i < layout.length; i++) { html += renderRow(layout[i]); }
    seatMap.innerHTML = html;

    /* ---- Dev validation: seats 1-51 present exactly once ---- */
    var present = [];
    for (var v = 0; v < layout.length; v++) {
        if (layout[v].type === 'rear') { present = present.concat(layout[v].seats); }
        else { present = present.concat(layout[v].left, layout[v].right); }
    }
    present.sort(function (a, b) { return a - b; });
    var layoutOk = present.length === 51 &&
        present.every(function (n, idx) { return n === idx + 1; });
    if (!layoutOk) {
        console.error('Seat layout validation failed. Count=' + present.length);
    }

    var seatButtons = seatMap.querySelectorAll('.seat');

 /* ---------- real seat availability from MySQL ----------
       The demo occupancy below is replaced as soon as the real availability
       for this trip resolves; if the API is unreachable the demo map is
       kept so the page still works. */
    function redrawSeats() {
        var htmlOut = '';
        for (var i = 0; i < layout.length; i++) { htmlOut += renderRow(layout[i]); }
        seatMap.innerHTML = htmlOut;
        seatButtons = seatMap.querySelectorAll('.seat');
    }

    function refreshRealAvailability() {
        var url = 'api/booking.php?action=availability&trip_id=' +
            encodeURIComponent(tripId) + '&date=' + encodeURIComponent(date);
        window.fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
            .then(function (res) { return res.json(); })
            .then(function (json) {
                if (!json || !json.success) { return; }

                var realSeatCount = parseInt(json.seat_count, 10) || 51;
                var realOccupied = Array.isArray(json.occupied) ? json.occupied.map(Number) : [];

                occupied = realOccupied.slice();
                unavailable = [];
                for (var s = 1; s <= 51; s++) {
                    if (s > realSeatCount) { unavailable.push(s); }
                }

                // Drop any selected seat that is no longer selectable, then redraw.
                selected = selected.filter(function (n) {
                    return occupied.indexOf(n) === -1 && unavailable.indexOf(n) === -1;
                });

                redrawSeats();
                updateSummary();
            })
            .catch(function () { /* keep demo seat data when the API is unavailable */ });
    }
    refreshRealAvailability();

    /* ---------- Selection state ---------- */
    var selected = []; // array of selected seat numbers
    var selectedSeatsEl = document.getElementById('selected-seats');
    var selectedCountEl = document.getElementById('selected-count');
    var limitMsg = document.getElementById('limit-msg');
    var continueBtn = document.getElementById('continue-btn');
    var continueMsg = document.getElementById('continue-msg');
    var sumSeatsEl = document.getElementById('sum-seats');
    var sumPriceEl = document.getElementById('sum-price');

    function updateSummary() {
        selected.sort(function (a, b) { return a - b; });
        var list = selected.map(pad).join(', ');

        selectedCountEl.textContent = 'Selected: ' + selected.length + ' / ' + passengers;
        selectedSeatsEl.textContent = 'Selected Seats: ' + (list || '\u2014');
        sumSeatsEl.textContent = list || '\u2014';
        sumPriceEl.textContent = formatPrice(trip.price * selected.length);
        continueBtn.disabled = selected.length !== passengers;
    }

    /* ---------- Seat interaction ---------- */
    seatMap.addEventListener('click', function (event) {
        var btn = event.target.closest ? event.target.closest('.seat') : null;
        if (!btn || btn.hasAttribute('disabled')) { return; }

        var num = parseInt(btn.dataset.seat, 10);

        if (btn.classList.contains('selected')) {
            // Deselect: Selected → Available
            selected = selected.filter(function (n) { return n !== num; });
            btn.classList.remove('selected');
            limitMsg.hidden = true;
        } else if (selected.length < passengers) {
            // Select: Available → Selected
            selected.push(num);
            btn.classList.add('selected');
            limitMsg.hidden = true;
        } else {
            // At passenger limit
            limitMsg.textContent = 'You can only select ' + passengers +
                ' seat' + (passengers === 1 ? '' : 's') + '.';
            limitMsg.hidden = false;
        }
        updateSummary();
    });

 /* ---------- Continue → passenger information ---------- */
    continueBtn.addEventListener('click', function () {
        var seatsParam = selected.map(pad).join(',');
        window.location.href = 'passenger.html?trip=' + tripId +
            '&passengers=' + passengers +
            '&date=' + encodeURIComponent(date) +
            '&seats=' + encodeURIComponent(seatsParam);
    });

    // Seed initial summary
    updateSummary();
})();

