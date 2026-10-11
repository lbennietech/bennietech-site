/**
 * site.config.js — EDIT THIS FILE to change company details, nav links and footer.
 * ---------------------------------------------------------------------------
 * Anything left as an empty string "" is simply not rendered on the page.
 * Only the email address was supplied, so phone/location/social are blank:
 * fill them in and they appear in the footer automatically.
 */
export const siteConfig = {
  company: {
    name: 'BennieTech',
    tagline: 'Software solution design',
    blurb: 'Forward-thinking software solutions, designed to evolve.',
    year: new Date().getFullYear(),
  },

  /** Contact details shown in the footer and used by the call-to-action buttons. */
  contact: {
    email: 'bennie.luke@outlook.com',
    phone: '',        // e.g. '+61 400 000 000'
    location: '',     // e.g. 'Brisbane, Australia'
    linkedin: '',     // full URL, e.g. 'https://www.linkedin.com/company/...'
  },

  /** Primary navigation (also used by the mobile menu). `href` must match a section id in index.html. */
  nav: [
    { label: 'Capabilities', href: '#capabilities' },
    { label: 'Approach',     href: '#approach' },
    { label: 'Solutions',    href: '#solutions' },
    { label: 'Future',       href: '#future' },
    { label: 'Contact',      href: '#contact' },
  ],
  navCta: { label: 'Start a project', href: '#contact' },
};
