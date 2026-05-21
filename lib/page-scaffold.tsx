import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import PageBoot from '@/app/_components/PageBoot';

// Shared scaffold every page route renders. Reads the per-page metadata,
// stylesheets, and script list from the JSON sidecars extracted alongside
// each app/_html/<slug>.body.html, then emits:
//   - <link rel="stylesheet"> for every per-page stylesheet
//   - <Script> for every per-page src + inline script (preserving original
//     order so shared.js runs before landing.js etc.)
//   - <PageBoot> around the page body (which is supplied by the route as
//     `children` — the already-converted JSX component for that slug)
//
// Global CSS (assets/stylesheets/global.css) and the inline noJsBoot script
// stay in app/layout.tsx since they're identical across every route.

type PageMeta = {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogUrl: string;
  stylesheets: string[];
};

type ExtractedScript =
  | { kind: 'src'; src: string; attrs: Record<string, string> }
  | { kind: 'inline'; code: string; attrs: Record<string, string> };

const HTML_DIR = path.join(process.cwd(), 'app', '_html');

function readSidecar<T>(slug: string, suffix: string): T {
  const file = path.join(HTML_DIR, `${slug}.${suffix}`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function pageMetadata(slug: string): Metadata {
  const meta = readSidecar<PageMeta>(slug, 'meta.json');
  return {
    title: meta.title || undefined,
    description: meta.description || undefined,
    keywords: meta.keywords ? meta.keywords.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    alternates: meta.canonical ? { canonical: meta.canonical } : undefined,
    openGraph:
      meta.ogTitle || meta.ogDescription || meta.ogImage || meta.ogUrl
        ? {
            title: meta.ogTitle || undefined,
            description: meta.ogDescription || undefined,
            url: meta.ogUrl || undefined,
            images: meta.ogImage ? [meta.ogImage] : undefined,
          }
        : undefined,
    twitter:
      meta.ogTitle || meta.ogDescription || meta.ogImage
        ? {
            card: 'summary_large_image',
            title: meta.ogTitle || undefined,
            description: meta.ogDescription || undefined,
            images: meta.ogImage ? [meta.ogImage] : undefined,
          }
        : undefined,
  };
}

function normalizeSrc(src: string): string {
  if (/^(?:https?:)?\/\//i.test(src)) return src;
  if (src.startsWith('/')) return src;
  return `/${src.replace(/^\.\//, '')}`;
}

// Inline scripts whose only purpose was to mutate the DOM before any other
// JS ran (e.g. the cookie-consent gate). PageBoot now runs the equivalent
// logic after hydration, so we drop these to avoid hydration mismatches.
function shouldSkipInlineScript(code: string): boolean {
  return (
    code.includes("cookieConsentStatus=1") &&
    code.includes("classList.add('is-hidden')")
  );
}

export default function PageScaffold({ slug, children }: { slug: string; children: ReactNode }) {
  const meta = readSidecar<PageMeta>(slug, 'meta.json');
  const scripts = readSidecar<ExtractedScript[]>(slug, 'scripts.json');

  return (
    <>
      {meta.stylesheets.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}

      <PageBoot>{children}</PageBoot>

      {scripts.map((s, i) => {
        if (s.kind === 'inline' && shouldSkipInlineScript(s.code)) return null;
        const id = `page-script-${slug}-${i}`;
        // afterInteractive matches original semantics — scripts run after
        // hydration finishes, in document order. async scripts get
        // lazyOnload so they don't block. We never use beforeInteractive
        // because anything that mutates the DOM pre-hydration breaks
        // React reconciliation (see PageBoot for the cookie-consent
        // gate moved post-hydration).
        const strategy = s.attrs.async !== undefined ? 'lazyOnload' : 'afterInteractive';
        if (s.kind === 'src') {
          return (
            <Script
              key={id}
              id={id}
              src={normalizeSrc(s.src)}
              strategy={strategy}
            />
          );
        }
        return (
          <Script key={id} id={id} strategy={strategy}>
            {s.code}
          </Script>
        );
      })}
    </>
  );
}
