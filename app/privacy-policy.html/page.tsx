import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import PrivacyPolicyBody from '@/app/_components/generated/PrivacyPolicyBody';

export const generateMetadata = () => pageMetadata('privacy-policy');

export default function Page() {
  return (
    <PageScaffold slug="privacy-policy">
      <PrivacyPolicyBody />
    </PageScaffold>
  );
}
