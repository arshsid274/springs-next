'use client';

import { useEffect, type ReactNode } from 'react';

// Replaces the side-effects RawHtml.tsx used to handle when this page was
// being injected via dangerouslySetInnerHTML. Now that the page DOM is real
// React, we still need to:
//   1. Stamp every <a> inside the page with data-barba-prevent="all" so the
//      Barba.js instance (loaded by shared.js) does not intercept clicks.
//      Barba reads this at click time, so post-mount stamping is fine.
//   2. Remove the `not-ready` class from <html> so the shared.js initial
//      scan treats the document as live (this previously sat in RawHtml's
//      useEffect with a 0ms timeout).
export default function PageBoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.querySelectorAll('a[href]').forEach((a) => {
      if (!a.hasAttribute('data-barba-prevent')) {
        a.setAttribute('data-barba-prevent', 'all');
      }
    });
    // Apply the `selected` flag on <option>s that the converter stashed as
    // data-default-selected. See html-to-jsx.mjs for why we route around
    // React's <select>/<option> rules here.
    document
      .querySelectorAll<HTMLOptionElement>('option[data-default-selected]')
      .forEach((o) => {
        o.selected = true;
      });

    // Cookie-consent gate. In the original site this ran as an inline script
    // before any other JS, but with React it must run AFTER hydration — the
    // pre-hydration version mutated #cookie-consent's className and caused a
    // hydration mismatch (server-rendered HTML lacks `is-hidden`, the inline
    // script added it, hydration tripped). Running it here is a single tick
    // later but visually indistinguishable to returning visitors.
    const hasConsentChoice =
      document.cookie.indexOf('cookieConsentStatus=1') !== -1 ||
      document.cookie.indexOf('cookieConsentStatus=0') !== -1;
    const banner = document.querySelector('#cookie-consent');
    if (hasConsentChoice && banner) {
      banner.classList.add('is-hidden');
    } else {
      document.documentElement.classList.add('with-cookie-consent');
    }
    const t = window.setTimeout(() => {
      document.documentElement.classList.remove('not-ready');
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  return <>{children}</>;
}
