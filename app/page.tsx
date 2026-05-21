import PageScaffold, { pageMetadata } from '@/lib/page-scaffold';
import IndexBody from './_components/IndexBodyComposed';

// Static-route entry for /. The home page is the one fully decomposed page
// (37 named section components under app/_components/index/). Other routes
// import their corresponding monolithic body from app/_components/generated/
// via the page manifest.
export const generateMetadata = () => pageMetadata('index');

export default function Home() {
  return (
    <PageScaffold slug="index">
      <IndexBody />
    </PageScaffold>
  );
}
