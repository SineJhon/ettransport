/* ============================================================
   ET Transport — company-nav.js
   Sidebar section menu for the public company profile
   (company.html). Works like tabs: clicking a menu item shows
   ONLY that item's section content; every other section stays
   hidden.
   ============================================================ */

(function () {
    'use strict';

    var nav = document.getElementById('cp-side-nav');
    var links = nav ? nav.querySelectorAll('a.cp-tab') : [];
    var panes = [];
    var i;

    function idFrom(link) {
        var href = (link && link.getAttribute ? link.getAttribute('href') : '') || '';
        return (href.charAt(0) === '#') ? href.slice(1) : '';
    }

    function collectPanes() {
        panes = [];
        for (i = 0; i < links.length; i++) {
            var el = document.getElementById(idFrom(links[i]));
            if (el) { panes.push(el); }
        }
    }
    collectPanes();

    function paneById(id) {
        for (i = 0; i < panes.length; i++) { if (panes[i].id === id) { return panes[i]; } }
        return null;
    }

    function setActive(id) {
        for (var j = 0; j < links.length; j++) {
            var isActive = (idFrom(links[j]) === id);
            links[j].classList.toggle('is-active', isActive);
            if (isActive) { links[j].setAttribute('aria-current', 'true'); }
            else { links[j].removeAttribute('aria-current'); }
        }
    }

    /* Show only the requested pane; hide every other one. */
    function show(id) {
        for (i = 0; i < panes.length; i++) {
            panes[i].hidden = (panes[i].id !== id);
        }
    }

    function select(id, noScroll) {
        if (!paneById(id)) { return; }
        show(id);
        setActive(id);
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', '#' + id);
        }
        if (!noScroll) {
            var main = document.getElementById('cp-main');
            if (main) {
                var top = main.getBoundingClientRect().top + window.pageYOffset - 90;
                window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
            }
        }
    }

    /* Side-menu clicks. */
    if (nav) {
        nav.addEventListener('click', function (event) {
            var link = event.target && event.target.closest ? event.target.closest('a.cp-tab') : null;
            if (!link) { return; }
            var id = idFrom(link);
            if (!paneById(id)) { return; }
            event.preventDefault();
            select(id);
        });
    }

    /* Also route links that point at a pane (e.g. the "View Available
       Trips" hero button) through the tab switch. */
    document.addEventListener('click', function (event) {
        var link = event.target && event.target.closest ? event.target.closest('a[href^="#"]') : null;
        if (!link || !nav || nav.contains(link)) { return; }
        var id = idFrom(link);
        if (!id || !paneById(id)) { return; }
        event.preventDefault();
        select(id);
    });

    /* Init: honour a hash deep-link if present, otherwise Overview. */
    var startId = window.location.hash ? window.location.hash.slice(1) : '';
    if (!paneById(startId)) { startId = links.length ? idFrom(links[0]) : 'cp-about'; }
    select(startId, true);
})();