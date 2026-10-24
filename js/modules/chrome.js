/**
 * chrome.js — the site "chrome": navigation bar, mobile menu and footer.
 * Two modules live here because they share config + logo:
 *   chrome-nav     <header data-module="chrome-nav">
 *   chrome-footer  <footer data-module="chrome-footer">
 * All text comes from js/config/site.config.js, so non-developers only edit that file.
 */
import { siteConfig as cfg } from '../config/site.config.js?v=mvlusce4';
import { logoSVG } from '../brand/logotype.js?v=mvlusce4';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INK = '#f5f5f2';   // the studio-black edition draws the logo in light ink

/* ------------------------------ NAV ------------------------------ */
export const chromeNav = {
  name: 'chrome-nav',
  init(el) {
    el.innerHTML = `
      <a class="nav__brand" href="#top" aria-label="${esc(cfg.company.name)} — home">${logoSVG({ ink: INK })}</a>
      <nav class="nav__links" aria-label="Sections">
        ${cfg.nav.map(n => `<a href="${esc(n.href)}">${esc(n.label)}</a>`).join('')}
      </nav>
      <div class="nav__actions">
        <a class="nav__cta" href="${esc(cfg.navCta.href)}">${esc(cfg.navCta.label)}<span aria-hidden="true">→</span></a>
        <button class="nav__burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="menu"><i></i><i></i></button>
      </div>`;

    // Full-screen mobile menu (placed right after the header so `.nav.is-open ~ .menu` works)
    const menu = document.createElement('div');
    menu.className = 'menu'; menu.id = 'menu';
    menu.innerHTML = `
      <div class="menu__logo">${logoSVG({ ink: INK })}</div>
      <nav aria-label="Mobile">
        ${cfg.nav.map(n => `<a class="menu__link" href="${esc(n.href)}">${esc(n.label)}</a>`).join('')}
      </nav>
      <div class="menu__foot">${esc(cfg.contact.email)}</div>`;
    el.after(menu);

    const burger = el.querySelector('.nav__burger');
    const focusables = () => [...menu.querySelectorAll('a[href]')];
    let returnTo = null;
    const setOpen = open => {
      el.classList.toggle('is-open', open);
      menu.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open);
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.style.overflow = open ? 'hidden' : '';
      // the overlay is full-screen: keep the page behind it out of the tab order and the a11y tree
      document.querySelectorAll('main, footer').forEach(n => n.toggleAttribute('inert', open));
      if (open) {
        returnTo = document.activeElement;
        (focusables()[0] || burger).focus();
      } else if (returnTo) {
        returnTo.focus();
        returnTo = null;
      }
    };
    burger.addEventListener('click', () => setOpen(!el.classList.contains('is-open')));
    menu.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key !== 'Tab' || !el.classList.contains('is-open')) return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // Hide the bar only while the user is actively scrolling down with a wheel or finger. Anchor jumps,
    // page-down keys and scrollbar drags move the page too — hiding the nav during those made the links
    // look broken (the page jumped and the bar vanished with it).
    let lastY = scrollY, userScrolling = false, idleTimer = 0;
    const markUserScroll = () => {
      userScrolling = true;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { userScrolling = false; }, 420);
    };
    window.addEventListener('wheel', markUserScroll, { passive: true });
    window.addEventListener('touchmove', markUserScroll, { passive: true });
    window.addEventListener('scroll', () => {
      const y = scrollY;
      if (userScrolling && !el.classList.contains('is-open')) {
        el.classList.toggle('is-hidden', y > lastY && y > 240);
      }
      lastY = y;
    }, { passive: true });
    // any deliberate click on a link always brings the bar back
    el.addEventListener('click', e => { if (e.target.closest('a')) el.classList.remove('is-hidden'); });

    // Highlight the link of the section currently in view
    const links = [...el.querySelectorAll('.nav__links a')];
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    cfg.nav.forEach(n => { const s = document.querySelector(n.href); if (s) io.observe(s); });
  },
};

/* ------------------------------ FOOTER ------------------------------ */
export const chromeFooter = {
  name: 'chrome-footer',
  init(el) {
    const c = cfg.contact;
    const rows = [
      c.email    && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`,
      c.phone    && `<a href="tel:${esc(c.phone.replace(/\s+/g, ''))}">${esc(c.phone)}</a>`,
      c.location && `<span>${esc(c.location)}</span>`,
      c.linkedin && `<a href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`,
    ].filter(Boolean).join('');

    el.innerHTML = `
      <div class="container">
        <div class="footer__cols">
          <div class="footer__col footer__brand">
            <div class="footer__mark">${logoSVG({ layout: 'mark', ink: INK })}</div>
            <p>${esc(cfg.company.blurb)}</p>
          </div>
          <div class="footer__col"><h4>Explore</h4>${cfg.nav.map(n => `<a href="${esc(n.href)}">${esc(n.label)}</a>`).join('')}</div>
          <div class="footer__col"><h4>Get in touch</h4>${rows}</div>
          <div class="footer__col"><h4>Studio</h4><span>${esc(cfg.company.tagline)}</span><span>Design · Engineering · Strategy</span></div>
        </div>
        <div class="footer__word">${logoSVG({ layout: 'word', ink: INK })}</div>
        <div class="footer__legal">
          <span>© ${cfg.company.year} ${esc(cfg.company.name)}</span>
          <span>All rights reserved.</span>
        </div>
      </div>`;

    // Any element with data-logo="lockup|mark|word" gets the logo drawn into it (optional data-accent="#hex")
    document.querySelectorAll('[data-logo]').forEach(n => { n.innerHTML = logoSVG({ layout: n.dataset.logo || 'lockup', ...(n.dataset.accent && { accent: n.dataset.accent }) }); });

    // Any element with data-contact="email-cta" becomes a mailto link
    document.querySelectorAll('[data-contact="email-cta"]').forEach(a => {
      a.href = `mailto:${c.email}?subject=${encodeURIComponent('New project enquiry')}`;
    });
  },
};
