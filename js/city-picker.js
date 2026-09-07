/* ============================================================
   ET Transport — city-picker.js
   Searchable city dropdown ("type to filter", like a search bar)
   used by every from/to city field across the site.

   Two modes, chosen from the element type:
     • <input type="text">  → the existing input stays the combobox
       field; typing filters the master city list (js/cities.js)
       and picking an item fills the input with the canonical name.
     • <select>             → the native select stays in the DOM as
       the name/value holder (visually hidden) and remains the list
       source (companies' live route data), while a visible search
       field + dropdown wrap it. Picking an item sets the select
       value and fires a bubbling "change" so existing listeners
       (applyBookingFilters / applyRevenueFilters / favorite route)
       keep working unchanged.

   Opt-in: add  data-city-picker  to the field.
   API:    window.ETCityPicker.refresh(idOrEl), .sync(idOrEl)
   ES5 + IIFE + var, no external libraries.
   ============================================================ */
(function () {
    'use strict';

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function norm(str) {
        return String(str == null ? '' : str).trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function masterCities() {
        var list = window.ETTransportCities;
        return (list && Object.prototype.toString.call(list) === '[object Array]') ? list : [];
    }

    /* Walks up from the click target to the list-item button. */
    function closestItem(node) {
        while (node && node !== document) {
            if (node.classList && node.classList.contains('city-picker-item')) { return node; }
            node = node.parentNode;
        }
        return null;
    }

    function dispatchChange(el) {
        var ev;
        try {
            ev = new window.Event('change', { bubbles: true });
        } catch (err) {
            ev = document.createEvent('Event');
            ev.initEvent('change', true, false);
        }
        el.dispatchEvent(ev);
    }

    /* ---------- City pairing: same-city guard + swap ----------
       Two from/to fields that share the same data-city-pair are treated as one
       route. The partner's currently-chosen city is kept out of this picker's
       list, and choosing/typing an identical city is rejected with a visible
       explanation. Mark each field with data-city-role="from"|"to". */

    function pairSibling(el) {
        var pair = el.getAttribute('data-city-pair');
        if (!pair) { return null; }
        var nodes = document.querySelectorAll('[data-city-pair="' + pair + '"]');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i] !== el && (nodes[i].nodeName === 'INPUT' || nodes[i].nodeName === 'SELECT')) {
                return nodes[i];
            }
        }
        return null;
    }

    function partnerDisplayValue(el) {
        if (!el) { return ''; }
        if (el.nodeName === 'SELECT') {
            var i = el.selectedIndex;
            return (i > -1 && el.options[i]) ? String(el.options[i].text) : '';
        }
        return String(el.value || '');
    }

    /* What the OTHER field represents, used to explain the same-city problem. */
    function otherRoleLabel(el) {
        return el.getAttribute('data-city-role') === 'to' ? 'the departure city' : 'the destination city';
    }

    function mount(el) {
        if (!el || el.getAttribute('data-city-picker') === 'done') { return; }
        el.setAttribute('data-city-picker', 'done');

        var isSelect = el.nodeName === 'SELECT';

        var wrap = document.createElement('div');
        wrap.className = 'city-picker';
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);

        /* Visible field — reuse the existing text input, or build one
           alongside the hidden select. */
        var field;
        if (isSelect) {
            el.classList.add('city-picker-native');
            field = document.createElement('input');
            field.type = 'text';
            field.id = el.id + '-search';
            field.setAttribute('autocomplete', 'off');
            wrap.appendChild(field);
            /* Keep the field's <label for="..."> pointing at the visible
               search input instead of the now-hidden select. */
            var labelFor = document.querySelector('label[for="' + el.id + '"]');
            if (labelFor) { labelFor.setAttribute('for', field.id); }
        } else {
            field = el;
            field.setAttribute('autocomplete', 'off');
        }
        field.setAttribute('role', 'combobox');
        field.setAttribute('aria-expanded', 'false');
        field.setAttribute('aria-autocomplete', 'list');
        field.setAttribute('aria-haspopup', 'listbox');
        field.classList.add('city-picker-field');

        var drop = document.createElement('div');
        drop.className = 'city-picker-drop';
        drop.setAttribute('role', 'listbox');
        wrap.appendChild(drop);

        var items = [];   /* currently rendered [{value, label}] */
        var active = -1;

        /* ---- Same-city guard (from/to pairs) ---- */
        var partner = pairSibling(el);
        var warn = document.createElement('p');
        warn.className = 'city-picker-warn';
        warn.setAttribute('role', 'alert');
        warn.hidden = true;
        wrap.appendChild(warn);

        var lastValid = '';
        function syncLastValid() {
            lastValid = isSelect ? String(el.value || '') : String(field.value || '');
        }
        function ownValue() {
            return isSelect ? String(el.selectedIndex > -1 && el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '') : String(field.value || '');
        }
        function matchesPartner() {
            var own = ownValue();
            if (!own || !partner) { return false; }
            var other = partnerDisplayValue(partner);
            return !!other && norm(own) === norm(other);
        }
        function revertToLastValid() {
            if (isSelect) {
                var keep = false;
                for (var oi = 0; oi < el.options.length; oi++) {
                    if (String(el.options[oi].value) === lastValid) { keep = true; break; }
                }
                if (keep) { el.value = lastValid; }
                syncField();
            } else {
                field.value = lastValid || '';
            }
        }
        function clearWarn() {
            warn.hidden = true;
            warn.textContent = '';
        }
        function showWarn() {
            var other = partner ? partnerDisplayValue(partner) : '';
            warn.textContent = '“' + other + '” is already chosen for ' + otherRoleLabel(el) + ' — the two cities must be different.';
            warn.hidden = false;
        }

        /* ---------- data (re-read on every render so live selects stay fresh) ---------- */

        function selectOptions() {
            var out = [];
            for (var i = 0; i < el.options.length; i++) {
                out.push({ value: String(el.options[i].value), label: String(el.options[i].text) });
            }
            return out;
        }

        function sourceItems() {
            if (isSelect && el.options.length) { return selectOptions(); }
            var cities = masterCities();
            var out = [];
            for (var j = 0; j < cities.length; j++) { out.push({ value: cities[j], label: cities[j] }); }
            return out;
        }

        /* ---------- DOM helpers ---------- */

        function selectedLabel() {
            var i = el.selectedIndex;
            var opt = (i > -1 && el.options[i]) ? el.options[i] : null;
            return opt ? String(opt.text) : '';
        }

        function syncField() {
            if (isSelect) { field.value = selectedLabel(); }
        }

        function openDrop() {
            drop.classList.add('open');
            field.setAttribute('aria-expanded', 'true');
        }

        function closeDrop() {
            drop.classList.remove('open');
            field.setAttribute('aria-expanded', 'false');
            active = -1;
        }

        function renderList(query) {
            var fieldValue = (query === undefined || query === null)
                ? (isSelect ? selectedLabel() : String(field.value || ''))
                : String(query);
            var q = norm(fieldValue);
            var all = sourceItems();
            var filtered = [];
            var blocked = partner ? norm(partnerDisplayValue(partner)) : '';
            for (var i = 0; i < all.length; i++) {
                var itemValue = norm(all[i].value);
                var itemLabel = norm(all[i].label);
                if (blocked && (itemValue === blocked || itemLabel === blocked)) { continue; }
                if (q && itemLabel.indexOf(q) === -1 && itemValue.indexOf(q) === -1) { continue; }
                filtered.push(all[i]);
            }
            items = filtered;
            active = -1;
            if (!filtered.length) {
                var emptyMsg = 'No matching cities';
                if (partner && partnerDisplayValue(partner)) {
                    emptyMsg = '“' + partnerDisplayValue(partner) + '” is already chosen for ' + otherRoleLabel(el) + ' — pick a different city.';
                }
                drop.innerHTML = '<div class="city-picker-empty">' + esc(emptyMsg) + '</div>';
                return;
            }
            var html = '';
            for (var j = 0; j < filtered.length; j++) {
                html += '<button type="button" role="option" tabindex="-1" class="city-picker-item" data-idx="' + j + '">' + esc(filtered[j].label) + '</button>';
            }
            drop.innerHTML = html;
        }

        function highlight(idx) {
            var nodes = drop.querySelectorAll('.city-picker-item');
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].classList.toggle('is-active', i === idx);
                if (i === idx) {
                    try { nodes[i].scrollIntoView({ block: 'nearest' }); } catch (e) { /* older engines */ }
                }
            }
        }

        function choose(idx) {
            var item = items[idx];
            if (!item) { return; }
            if (isSelect) {
                el.value = item.value;   /* safe no-op when the option is absent */
                syncField();
            } else {
                field.value = item.label;
            }
            if (matchesPartner()) {
                revertToLastValid();
                showWarn();
                renderList(isSelect ? '' : field.value);
                return;
            }
            clearWarn();
            syncLastValid();
            if (isSelect) {
                closeDrop();
                dispatchChange(el);      /* existing filter listeners respond */
            } else {
                closeDrop();
            }
        }

        function openAll() {
            renderList('');
            openDrop();
        }
/* ---------- events ---------- */

        field.addEventListener('focus', openAll);

        field.addEventListener('input', function () {
            renderList(field.value);
            openDrop();
            clearWarn();
        });

        field.addEventListener('click', function () {
            if (!drop.classList.contains('open')) { openAll(); }
        });

        field.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!drop.classList.contains('open')) { openAll(); }
                if (!items.length) { return; }
                active = e.key === 'ArrowDown'
                    ? (active < items.length - 1 ? active + 1 : 0)
                    : (active > 0 ? active - 1 : items.length - 1);
                highlight(active);
            } else if (e.key === 'Enter') {
                if (drop.classList.contains('open') && active > -1) {
                    e.preventDefault();
                    choose(active);
                }
            } else if (e.key === 'Escape') {
                if (drop.classList.contains('open')) {
                    e.preventDefault();
                    closeDrop();
                    syncField();
                }
            } else if (e.key === 'Tab') {
                closeDrop();
            }
        });

        /* On blur: snap an exact-typed city to its canonical spelling
           (text fields) and restore the current choice (selects). */
        field.addEventListener('blur', function () {
            if (isSelect) {
                syncField();
            } else {
                var q = norm(field.value);
                if (q) {
                    var cities = masterCities();
                    for (var i = 0; i < cities.length; i++) {
                        if (norm(cities[i]) === q) { field.value = cities[i]; break; }
                    }
                }
            }
            if (matchesPartner()) {
                revertToLastValid();
                showWarn();
            } else {
                clearWarn();
                syncLastValid();
            }
            closeDrop();
        });

        /* Keep focus while pressing a list item; pick it on mouseup. */
        drop.addEventListener('mousedown', function (e) {
            var node = closestItem(e.target);
            if (!node) { return; }
            e.preventDefault();
            var idx = parseInt(node.getAttribute('data-idx'), 10);
            if (idx > -1) { choose(idx); }
        });

        /* Close when clicking anywhere outside the picker. */
        document.addEventListener('mousedown', function (e) {
            if (!wrap.contains(e.target)) { closeDrop(); }
        });

        /* Initial display reflects the current choice. */
        syncField();

        el.__etCityPicker = {
            refresh: function () {
                clearWarn();
                syncLastValid();
                renderList(field.value);
                syncField();
            },
            sync: function () {
                clearWarn();
                syncLastValid();
                syncField();
            }
        };
    }

    /* Interchange the two fields sharing a data-city-pair value. */
    function swapPair(pair) {
        var els = [];
        var nodes = document.querySelectorAll('[data-city-pair="' + pair + '"]');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].nodeName === 'INPUT' || nodes[i].nodeName === 'SELECT') { els.push(nodes[i]); }
        }
        if (els.length !== 2) { return; }
        var a = els[0], b = els[1];

        var aValue = a.value, bValue = b.value;

        /* If both are selects with (possibly different) option sets, swap the
           whole option lists too — that keeps each select's chosen value valid
           after the interchange. Snapshot BOTH lists first: copying in-place
           would destroy the source before the second copy (which is exactly why
           the revenue swaps used to blank the destination side). */
        if (a.nodeName === 'SELECT' && b.nodeName === 'SELECT') {
            var aList = [], bList = [];
            for (var ai = 0; ai < a.options.length; ai++) {
                aList.push({ value: a.options[ai].value, text: a.options[ai].textContent, selected: a.options[ai].selected });
            }
            for (var bi = 0; bi < b.options.length; bi++) {
                bList.push({ value: b.options[bi].value, text: b.options[bi].textContent, selected: b.options[bi].selected });
            }

            a.innerHTML = '';
            for (var za = 0; za < bList.length; za++) {
                var optA = document.createElement('option');
                optA.value = bList[za].value;
                optA.textContent = bList[za].text;
                optA.selected = bList[za].selected;
                a.appendChild(optA);
            }
            b.innerHTML = '';
            for (var zb = 0; zb < aList.length; zb++) {
                var optB = document.createElement('option');
                optB.value = aList[zb].value;
                optB.textContent = aList[zb].text;
                optB.selected = aList[zb].selected;
                b.appendChild(optB);
            }
            a.value = bValue;
            b.value = aValue;
        } else {
            a.value = bValue;
            b.value = aValue;
        }

        for (var j = 0; j < els.length; j++) {
            if (els[j].__etCityPicker) { els[j].__etCityPicker.refresh(); }
            dispatchChange(els[j]);
        }
    }

    function mountAll() {
        var fields = document.querySelectorAll('[data-city-picker]');
        for (var i = 0; i < fields.length; i++) { mount(fields[i]); }

        /* Swap buttons — a .city-swap[data-city-pair] button anywhere in the
           page interchanges that from/to pair. */
        document.addEventListener('click', function (ev) {
            var t = ev.target;
            var btn = (t && t.closest) ? t.closest('.city-swap[data-city-pair]') : null;
            if (!btn) { return; }
            ev.preventDefault();
            window.ETCityPicker.swap(btn.getAttribute('data-city-pair'));
        });
    }

    window.ETCityPicker = {
        refresh: function (ref) {
            var el = typeof ref === 'string' ? document.getElementById(ref) : ref;
            if (el && el.__etCityPicker) { el.__etCityPicker.refresh(); }
        },
        sync: function (ref) {
            var el = typeof ref === 'string' ? document.getElementById(ref) : ref;
            if (el && el.__etCityPicker) { el.__etCityPicker.sync(); }
        },
        swap: swapPair
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountAll);
    } else {
        mountAll();
    }
})();