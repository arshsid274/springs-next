import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import AgreementBody from '@/app/_components/generated/AgreementBody';

export const generateMetadata = () => pageMetadata('agreement');

export default function Page() {
  return (
    <PageScaffold slug="agreement">
      <AgreementBody />
    </PageScaffold>
  );
}
