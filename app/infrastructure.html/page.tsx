import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import InfrastructureBody from '@/app/_components/generated/InfrastructureBody';

export const generateMetadata = () => pageMetadata('infrastructure');

export default function Page() {
  return (
    <PageScaffold slug="infrastructure">
      <InfrastructureBody />
    </PageScaffold>
  );
}
