/**
 * chrome.js — the site "chrome": navigation bar, mobile menu and footer.
 * Two modules live here because they share config + logo:
 *   chrome-nav     <header data-module="chrome-nav">
 *   chrome-footer  <footer data-module="chrome-footer">
 * All text comes from js/config/site.config.js, so non-developers only edit that file.
 */
import { siteConfig as cfg } from '../config/site.config.js?v=mvm2gv08';
import { logoSVG } from '../brand/logotype.js?v=mvm2gv08';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INK = '#f3f3ef';   // the logo is drawn in light ink on the dark room
const ARROW = '<span class="btn__icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M2 8h11M8.5 3.5 13 8l-4.5 4.5"/></svg><svg viewBox="0 0 16 16"><path d="M2 8h11M8.5 3.5 13 8l-4.5 4.5"/></svg></span>';

/* ------------------------------ NAV ------------------------------ */
export const chromeNav = {
  name: 'chrome-nav',
  init(el) {
    const n2 = (i, n) => n.n || String(i + 1).padStart(2, '0');
    el.innerHTML = `<div class="nav__in container">
      <a class="nav__brand" href="#top" aria-label="${esc(cfg.company.name)} — home">${logoSVG({ ink: 'currentColor' })}</a>
      <nav class="nav__links" aria-label="Sections">
        ${cfg.nav.map((n, i) => `<a href="${esc(n.href)}"><i aria-hidden="true">${esc(n2(i, n))}</i>${esc(n.label)}</a>`).join('')}
      </nav>
      <div class="nav__actions">
        <a class="btn btn--lime btn--sm nav__cta" href="${esc(cfg.navCta.href)}">${esc(cfg.navCta.label)}${ARROW}</a>
        <button class="nav__burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="menu"><i></i><i></i></button>
      </div></div>
      <i class="nav__progress" aria-hidden="true"></i>`;

    // Full-screen mobile menu (placed right after the header)
    const menu = document.createElement('div');
    menu.className = 'menu'; menu.id = 'menu';
    menu.innerHTML = `
      <nav class="menu__links" aria-label="Mobile">
        ${cfg.nav.map((n, i) => `<a class="menu__link" href="${esc(n.href)}" style="--i:${i}">${esc(n.label)}<i aria-hidden="true">${esc(n2(i, n))}</i></a>`).join('')}
      </nav>
      <div class="menu__foot">
        <a class="tlink" href="mailto:${esc(cfg.contact.email)}">${esc(cfg.contact.email)}</a>
        <span class="mono dim">${esc(cfg.company.tagline)}</span>
      </div>`;
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
    // Theme the bar for whatever surface is under it: the .25s crossfade to paper + ink starts as a light sheet
    // reaches the bar's bottom edge, so it has finished by the time the sheet is under the bar's midline
    const sheets = [...document.querySelectorAll('.sheet')];
    const themeBar = () => {
      const h = el.offsetHeight;
      el.classList.toggle('is-on-sheet', sheets.some(s => { const r = s.getBoundingClientRect(); return r.top <= h && r.bottom >= h; }));
    };

    let lastY = scrollY, userScrolling = false, idleTimer = 0;
    const markUserScroll = () => {
      userScrolling = true;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { userScrolling = false; }, 420);
    };
    window.addEventListener('wheel', markUserScroll, { passive: true });
    window.addEventListener('touchmove', markUserScroll, { passive: true });
    const onScroll = () => {
      const y = scrollY;
      if (userScrolling && !el.classList.contains('is-open')) {
        el.classList.toggle('is-hidden', y > lastY && y > 240);
      }
      el.classList.toggle('is-scrolled', y > 24);
      if (sheets.length) themeBar();
      // reading progress along the bar's bottom edge
      const max = document.documentElement.scrollHeight - innerHeight;
      el.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    // any deliberate click on a link always brings the bar back
    el.addEventListener('click', e => { if (e.target.closest('a')) el.classList.remove('is-hidden'); });


    // One lime call to action per view: while the hero's or the contact panel's lime button is on screen, the nav's is drawn in line
    const ctas = [...document.querySelectorAll('.hero__actions, .cta__actions')], showing = new Set();
    const quiet = new IntersectionObserver(entries => {
      entries.forEach(e => (e.isIntersecting ? showing.add(e.target) : showing.delete(e.target)));
      el.classList.toggle('is-quiet', showing.size > 0);
    });
    ctas.forEach(c => quiet.observe(c));

    // Highlight the chapter you are in: the last nav target whose top has passed mid-screen. Bands without a nav
    // entry (the interlude) therefore keep the chapter before them lit, so the nav is never blank mid-page.
    const links = [...el.querySelectorAll('.nav__links a')];
    const targets = links.map(a => document.querySelector(a.getAttribute('href')));
    const markActive = () => {
      let cur = -1;
      targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= innerHeight * .5) cur = i; });
      links.forEach((a, i) => a.classList.toggle('is-active', i === cur));
    };
    window.addEventListener('scroll', markActive, { passive: true });
    window.addEventListener('resize', markActive);
    markActive();
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
        <div class="footer__top grid">
          <div class="footer__brand">
            <h4 class="mono">${esc(cfg.company.name)}</h4>
            <p>${esc(cfg.company.blurb)}</p>
          </div>
          <nav class="footer__col" aria-label="Chapters">
            <h4 class="mono">Chapters</h4>
            ${cfg.nav.map((n, i) => `<a href="${esc(n.href)}"><i class="mono">${esc(n.n || String(i + 1).padStart(2, '0'))}</i>${esc(n.label)}</a>`).join('')}
          </nav>
          <div class="footer__col"><h4 class="mono">Contact</h4>${rows}
            <button class="footer__copy mono" type="button" data-module="copy-email"><span data-copy-label>Copy address</span></button>
            <span class="sr-only" aria-live="polite" data-copy-status></span></div>
          <div class="footer__col"><h4 class="mono">Studio</h4><span>${esc(cfg.company.tagline).replace(/ /g, '&nbsp;')}</span>
            <span class="footer__disc">Strategy</span><span class="footer__disc">Design</span><span class="footer__disc">Engineering</span>
            <a class="footer__top-link mono" href="#top">Back to top <span aria-hidden="true">↑</span></a></div>
        </div>
        <div class="footer__word" aria-hidden="true">${logoSVG({ layout: 'word', ink: INK })}</div>
        <p class="footer__cap mono" aria-hidden="true"><span>Fig. 08.1 · Wordmark, constructed</span><span>Units: x-height</span></p>
        <div class="footer__legal mono">
          <span>© ${cfg.company.year} ${esc(cfg.company.name)}</span>
          <span>No cookies. No trackers.</span>
          <span>Built in-house, in code</span>
        </div>
      </div>`;

    // The wordmark's glyphs span exactly 0..width in its own units; logoSVG pads the viewBox (.09 left, .03 right) for
    // general use. Here it is trimmed to the construction edges, so the b's stem and the h's last stem sit on the grid.
    const word = el.querySelector('.footer__word svg');
    if (word) { const [x, y, w, h] = word.getAttribute('viewBox').split(' ').map(Number); word.setAttribute('viewBox', `0 ${y} ${(w + x - .03).toFixed(3)} ${h}`); }

    // Any element with data-logo="lockup|mark|word" gets the logo drawn into it (optional data-accent="#hex")
    document.querySelectorAll('[data-logo]').forEach(n => { n.innerHTML = logoSVG({ layout: n.dataset.logo || 'lockup', ...(n.dataset.accent && { accent: n.dataset.accent }) }); });

    // Any element with data-contact="email-link" shows the address and mails it
    document.querySelectorAll('[data-contact="email-link"]').forEach(a => { a.href = `mailto:${c.email}`; a.textContent = c.email; });

    // Any element with data-contact="email-cta" becomes a mailto link
    document.querySelectorAll('[data-contact="email-cta"]').forEach(a => {
      a.href = `mailto:${c.email}?subject=${encodeURIComponent('New project enquiry')}`;
    });
  },
};
