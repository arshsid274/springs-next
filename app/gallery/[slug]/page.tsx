import { notFound } from 'next/navigation';
import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import { pageManifest } from '@/app/_components/generated/page-manifest';

function resolveSlug(routeSlug: string): string | null {
  const m = routeSlug.match(/^([\w-]+)\.html$/);
  if (!m) return null;
  const internal = `gallery-${m[1]}`;
  return internal in pageManifest ? internal : null;
}

export async function generateStaticParams() {
  return Object.keys(pageManifest)
    .filter((k) => k.startsWith('gallery-'))
    .map((k) => ({ slug: `${k.replace(/^gallery-/, '')}.html` }));
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
