import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import VisualSearchBody from '@/app/_components/generated/VisualSearchBody';

export const generateMetadata = () => pageMetadata('visual-search');

export default function Page() {
  return (
    <PageScaffold slug="visual-search">
      <VisualSearchBody />
    </PageScaffold>
  );
}
