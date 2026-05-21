import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import AboutBody from '@/app/_components/generated/AboutBody';

export const generateMetadata = () => pageMetadata('about');

export default function Page() {
  return (
    <PageScaffold slug="about">
      <AboutBody />
    </PageScaffold>
  );
}
