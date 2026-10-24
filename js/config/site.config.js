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
  // `n` is the chapter number printed beside the link: it must match the chapter's own index in index.html.
  nav: [
    { n: '01', label: 'Capabilities', href: '#capabilities' },
    { n: '02', label: 'Approach',     href: '#approach' },
    { n: '03', label: 'Lab',          href: '#lab' },
    { n: '04', label: 'Engagement',   href: '#engagement' },
    { n: '05', label: 'Solutions',    href: '#solutions' },
    { n: '06', label: 'Horizon',      href: '#future' },
    { n: '07', label: 'Contact',      href: '#contact' },
  ],
  navCta: { label: 'Start a project', href: '#contact' },
};
