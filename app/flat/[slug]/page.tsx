import { notFound } from 'next/navigation';
import fs from 'node:fs';
import path from 'node:path';
import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import { pageManifest } from '@/app/_components/generated/page-manifest';

// /flat/<n>.html → internal slug "flat-<n>". The manifest holds a body
// component per slug; we look it up at request time.
function resolveSlug(routeSlug: string): string | null {
  const m = routeSlug.match(/^([\w-]+)\.html$/);
  if (!m) return null;
  const internal = `flat-${m[1]}`;
  return internal in pageManifest ? internal : null;
}

export async function generateStaticParams() {
  return Object.keys(pageManifest)
    .filter((k) => k.startsWith('flat-'))
    .map((k) => ({ slug: `${k.replace(/^flat-/, '')}.html` }));
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
