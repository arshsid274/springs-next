import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import FlatsBody from '@/app/_components/generated/FlatsBody';

export const generateMetadata = () => pageMetadata('flats');

export default function Page() {
  return (
    <PageScaffold slug="flats">
      <FlatsBody />
    </PageScaffold>
  );
}
