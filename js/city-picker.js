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
            var q = norm(query);
            var all = sourceItems();
            var filtered = [];
            for (var i = 0; i < all.length; i++) {
                if (!q || norm(all[i].label).indexOf(q) !== -1 || norm(all[i].value).indexOf(q) !== -1) {
                    filtered.push(all[i]);
                }
            }
            items = filtered;
            active = -1;
            if (!filtered.length) {
                drop.innerHTML = '<div class="city-picker-empty">No matching cities</div>';
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
                closeDrop();
                dispatchChange(el);      /* existing filter listeners respond */
            } else {
                field.value = item.label;
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
                syncField();
                if (drop.classList.contains('open')) { renderList(field.value); }
            },
            sync: function () { syncField(); }
        };
    }

    function mountAll() {
        var fields = document.querySelectorAll('[data-city-picker]');
        for (var i = 0; i < fields.length; i++) { mount(fields[i]); }
    }

    window.ETCityPicker = {
        refresh: function (ref) {
            var el = typeof ref === 'string' ? document.getElementById(ref) : ref;
            if (el && el.__etCityPicker) { el.__etCityPicker.refresh(); }
        },
        sync: function (ref) {
            var el = typeof ref === 'string' ? document.getElementById(ref) : ref;
            if (el && el.__etCityPicker) { el.__etCityPicker.sync(); }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountAll);
    } else {
        mountAll();
    }
})();