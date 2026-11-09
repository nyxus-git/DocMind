import { SiteHeader } from '../components/marketing/SiteHeader';
import {
  Audience,
  Contrast,
  CtaBand,
  Faq,
  Features,
  Hero,
  HowItWorks,
  Pricing,
  Security,
  SiteFooter,
} from '../components/marketing/Sections';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Audience />
        <Contrast />
        <HowItWorks />
        <Features />
        <Security />
        <Pricing />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
