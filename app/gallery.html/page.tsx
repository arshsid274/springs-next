import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import GalleryBody from '@/app/_components/generated/GalleryBody';

export const generateMetadata = () => pageMetadata('gallery');

export default function Page() {
  return (
    <PageScaffold slug="gallery">
      <GalleryBody />
    </PageScaffold>
  );
}
