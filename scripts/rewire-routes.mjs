#!/usr/bin/env node
// Rewires every page.tsx under app/ to consume the new generated body
// components via lib/page-scaffold instead of the legacy
// dangerouslySetInnerHTML approach in lib/springs-page.
//
// Static routes (one page.tsx → one slug):
//   app/about.html/page.tsx           → AboutBody
//   app/agreement.html/page.tsx       → AgreementBody
//   app/design.html/page.tsx          → DesignBody
//   app/flats.html/page.tsx           → FlatsBody
//   app/flats-types-flat.html/page.tsx → FlatsTypesFlatBody
//   app/gallery.html/page.tsx         → GalleryBody
//   app/infrastructure.html/page.tsx  → InfrastructureBody
//   app/location.html/page.tsx        → LocationBody
//   app/privacy-policy.html/page.tsx  → PrivacyPolicyBody
//   app/visual-search.html/page.tsx   → VisualSearchBody
//
// Dynamic routes (one page.tsx → many slugs via pageManifest):
//   app/flat/[slug]/page.tsx          → flat-* slugs
//   app/gallery/[slug]/page.tsx       → gallery-* slugs

import fs from 'node:fs';
import path from 'node:path';

const STATIC_ROUTES = [
  { dir: 'app/about.html',           slug: 'about',           component: 'AboutBody' },
  { dir: 'app/agreement.html',       slug: 'agreement',       component: 'AgreementBody' },
  { dir: 'app/design.html',          slug: 'design',          component: 'DesignBody' },
  { dir: 'app/flats.html',           slug: 'flats',           component: 'FlatsBody' },
  { dir: 'app/flats-types-flat.html',slug: 'flats-types-flat',component: 'FlatsTypesFlatBody' },
  { dir: 'app/gallery.html',         slug: 'gallery',         component: 'GalleryBody' },
  { dir: 'app/infrastructure.html',  slug: 'infrastructure',  component: 'InfrastructureBody' },
  { dir: 'app/location.html',        slug: 'location',        component: 'LocationBody' },
  { dir: 'app/privacy-policy.html',  slug: 'privacy-policy',  component: 'PrivacyPolicyBody' },
  { dir: 'app/visual-search.html',   slug: 'visual-search',   component: 'VisualSearchBody' },
];

function staticPageTsx(slug, component) {
  return `import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import ${component} from '@/app/_components/generated/${component}';

export const generateMetadata = () => pageMetadata('${slug}');

export default function Page() {
  return (
    <PageScaffold slug="${slug}">
      <${component} />
    </PageScaffold>
  );
}
`;
}

function flatDynamicTsx() {
  return `import { notFound } from 'next/navigation';
import fs from 'node:fs';
import path from 'node:path';
import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import { pageManifest } from '@/app/_components/generated/page-manifest';

// /flat/<n>.html → internal slug "flat-<n>". The manifest holds a body
// component per slug; we look it up at request time.
function resolveSlug(routeSlug: string): string | null {
  const m = routeSlug.match(/^([\\w-]+)\\.html$/);
  if (!m) return null;
  const internal = \`flat-\${m[1]}\`;
  return internal in pageManifest ? internal : null;
}

export async function generateStaticParams() {
  return Object.keys(pageManifest)
    .filter((k) => k.startsWith('flat-'))
    .map((k) => ({ slug: \`\${k.replace(/^flat-/, '')}.html\` }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const internal = resolveSlug(slug);
  if (!internal) return {};
  return pageMetadata(internal);
}

export default async function FlatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const internal = resolveSlug(slug);
  if (!internal) notFound();
  const Body = pageManifest[internal];
  return (
    <PageScaffold slug={internal}>
      <Body />
    </PageScaffold>
  );
}
`;
}

function galleryDynamicTsx() {
  return `import { notFound } from 'next/navigation';
import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import { pageManifest } from '@/app/_components/generated/page-manifest';

function resolveSlug(routeSlug: string): string | null {
  const m = routeSlug.match(/^([\\w-]+)\\.html$/);
  if (!m) return null;
  const internal = \`gallery-\${m[1]}\`;
  return internal in pageManifest ? internal : null;
}

export async function generateStaticParams() {
  return Object.keys(pageManifest)
    .filter((k) => k.startsWith('gallery-'))
    .map((k) => ({ slug: \`\${k.replace(/^gallery-/, '')}.html\` }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const internal = resolveSlug(slug);
  if (!internal) return {};
  return pageMetadata(internal);
}

export default async function GallerySubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const internal = resolveSlug(slug);
  if (!internal) notFound();
  const Body = pageManifest[internal];
  return (
    <PageScaffold slug={internal}>
      <Body />
    </PageScaffold>
  );
}
`;
}

function main() {
  let written = 0;
  for (const { dir, slug, component } of STATIC_ROUTES) {
    const out = path.join(dir, 'page.tsx');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(out, staticPageTsx(slug, component), 'utf8');
    console.log(`  static  ${out}`);
    written++;
  }
  fs.writeFileSync('app/flat/[slug]/page.tsx', flatDynamicTsx(), 'utf8');
  console.log('  dynamic app/flat/[slug]/page.tsx');
  written++;
  fs.writeFileSync('app/gallery/[slug]/page.tsx', galleryDynamicTsx(), 'utf8');
  console.log('  dynamic app/gallery/[slug]/page.tsx');
  written++;
  console.log(`\nrewired ${written} route files`);
}

main();
