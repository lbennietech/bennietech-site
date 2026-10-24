/**
 * copy-email.js — a "Copy email" button. <button data-module="copy-email"><span data-copy-label>Copy email</span></button>
 * Copies the contact address from site.config.js; the label confirms for two seconds and a polite live region
 * ([data-copy-status], anywhere in the same parent) announces it to screen readers.
 */
import { siteConfig as cfg } from '../config/site.config.js?v=mvm2gv08';

export default {
  name: 'copy-email',
  init(btn) {
    const label = btn.querySelector('[data-copy-label]') || btn;
    const status = btn.parentElement?.querySelector('[data-copy-status]');
    const original = label.textContent;
    let timer = 0;
    btn.addEventListener('click', async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(cfg.contact.email); ok = true; } catch { /* clipboard blocked */ }
      label.textContent = ok ? 'Copied' : cfg.contact.email;          // if copying is blocked, show the address to select
      if (status) status.textContent = ok ? `Email address ${cfg.contact.email} copied` : '';
      btn.classList.toggle('is-done', ok);
      clearTimeout(timer);
      timer = setTimeout(() => { label.textContent = original; btn.classList.remove('is-done'); }, 2200);
    });
  },
};
