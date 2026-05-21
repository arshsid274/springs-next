import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import LocationBody from '@/app/_components/generated/LocationBody';

export const generateMetadata = () => pageMetadata('location');

export default function Page() {
  return (
    <PageScaffold slug="location">
      <LocationBody />
    </PageScaffold>
  );
}
