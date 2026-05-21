import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import DesignBody from '@/app/_components/generated/DesignBody';

export const generateMetadata = () => pageMetadata('design');

export default function Page() {
  return (
    <PageScaffold slug="design">
      <DesignBody />
    </PageScaffold>
  );
}
