import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import FlatsTypesFlatBody from '@/app/_components/generated/FlatsTypesFlatBody';

export const generateMetadata = () => pageMetadata('flats-types-flat');

export default function Page() {
  return (
    <PageScaffold slug="flats-types-flat">
      <FlatsTypesFlatBody />
    </PageScaffold>
  );
}
