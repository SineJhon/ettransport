/* ============================================================
   ET Transport — company-nav.js
   Sidebar section menu for the public company profile
   (company.html). Scroll-spy + active-link highlighting so the
   rail behaves like a real social-media profile navigation.
   ============================================================ */

(function () {
    'use strict';

    var nav = document.getElementById('cp-side-nav');
    if (!nav) { return; }

    var links = nav.querySelectorAll('a.cp-tab');
    var sections = [];
    var i;

    function idFrom(link) {
        var href = link.getAttribute('href') || '';
        return (href.charAt(0) === '#') ? href.slice(1) : '';
    }

    function collectSections() {
        sections = [];
        for (i = 0; i < links.length; i++) {
            var el = document.getElementById(idFrom(links[i]));
            if (el) { sections.push(el); }
        }
    }
    collectSections();

    function setActive(id) {
        for (var j = 0; j < links.length; j++) {
            var isActive = (idFrom(links[j]) === id);
            links[j].classList.toggle('is-active', isActive);
            if (isActive) { links[j].setAttribute('aria-current', 'true'); }
            else { links[j].removeAttribute('aria-current'); }
        }
    }

    /* Click: highlight immediately; the default anchor navigation
       (smooth scroll from the global html rule) carries on. */
    nav.addEventListener('click', function (event) {
        var link = event.target && event.target.closest ? event.target.closest('a.cp-tab') : null;
        if (!link) { return; }
        setActive(idFrom(link));
    });

    /* Scroll-spy: keep the menu in sync with the on-screen section. */
    if ('IntersectionObserver' in window && sections.length) {
        var spy = new IntersectionObserver(function (entries) {
            for (var k = 0; k < entries.length; k++) {
                if (entries[k].isIntersecting) { setActive(entries[k].target.id); }
            }
        }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 });
        for (i = 0; i < sections.length; i++) { spy.observe(sections[i]); }
    } else {
        function onScroll() {
            var current = sections.length ? sections[0].id : '';
            for (i = 0; i < sections.length; i++) {
                if (sections[i].getBoundingClientRect().top <= 140) { current = sections[i].id; }
            }
            setActive(current);
        }
        window.addEventListener('scroll', onScroll);
        onScroll();
    }
})();