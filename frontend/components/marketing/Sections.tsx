import React from 'react';
import Link from 'next/link';
import { Icon, IconName } from '../ui/Icon';
import { Logo } from '../ui/Logo';
import { LinkButton, btn } from '../ui/Button';
import { HeroDemo } from './HeroDemo';
import { FAQ, LIMIT_ROWS, PLANS, SECURITY_POINTS, SUPPORT_EMAIL } from '../../lib/site';

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[5fr_6fr] lg:gap-14 lg:pb-28 lg:pt-16">
      <div>
        <h1 className="text-[clamp(2.5rem,5.4vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-fg">
          Answers that show their work.
        </h1>
        <p className="mt-6 max-w-[34rem] text-lg leading-8 text-muted">
          Upload contracts, filings and reports, then ask questions in plain language. Every answer links to the exact
          page and passage it came from. If your documents don&rsquo;t say, DocMind says so instead of guessing.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <LinkButton href="/signup" size="lg">
            Start free
          </LinkButton>
          <LinkButton href="/login?demo=1" variant="secondary" size="lg">
            Try the demo workspace
          </LinkButton>
        </div>
        <p className="mt-4 text-sm text-faint">Free plan includes 20 documents and 100 questions a month. No card needed.</p>
      </div>
      <HeroDemo />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Audience                                                            */
/* ------------------------------------------------------------------ */
export function Audience() {
  const items: { icon: IconName; label: string }[] = [
    { icon: 'file', label: 'Contract review' },
    { icon: 'shield', label: 'Compliance and audit' },
    { icon: 'table', label: 'Financial filings' },
    { icon: 'building', label: 'Vendor due diligence' },
    { icon: 'book', label: 'Regulatory research' },
  ];
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 sm:px-8 md:flex-row md:items-center md:gap-10">
        <p className="shrink-0 text-sm text-muted md:max-w-[13rem]">For work where a wrong answer is expensive</p>
        <ul className="flex flex-wrap gap-x-8 gap-y-3">
          {items.map(i => (
            <li key={i.label} className="flex items-center gap-2 text-sm font-medium text-fg">
              <Icon name={i.icon} className="size-4 text-faint" />
              {i.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Contrast                                                            */
/* ------------------------------------------------------------------ */
const CONTRAST: { topic: string; chat: string; docmind: string }[] = [
  {
    topic: 'Where an answer comes from',
    chat: 'Usually not stated, or a link you have to check yourself',
    docmind: 'A page number and the exact passage, one click away',
  },
  {
    topic: 'When the document is silent',
    chat: 'May fill the gap from general knowledge',
    docmind: 'Says it cannot find evidence in your documents',
  },
  {
    topic: 'Tables in PDFs and Word files',
    chat: 'Often flattened into running text',
    docmind: 'Rebuilt as tables, so figures stay next to their labels',
  },
  {
    topic: 'Comparing several documents',
    chat: 'Copy, paste and repeat',
    docmind: 'Pick two to five documents and get one table with sources',
  },
  {
    topic: 'Who can see your files',
    chat: 'Depends on the tool and the plan',
    docmind: 'Filtered by workspace on every query, with roles for your team',
  },
];

export function Contrast() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <h2 className="max-w-2xl text-3xl font-semibold leading-[1.1] tracking-[-0.025em] text-fg sm:text-4xl">
        A chat tool gives you an answer. DocMind also gives you the page.
      </h2>
      <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
        General-purpose assistants are good at fluent text. Reviewing a contract or an audit needs something else: proof
        for each claim.
      </p>

      <div className="mt-10 overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Typical chat tool compared with DocMind</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2/60 text-fg">
              <th scope="col" className="hidden w-[26%] px-5 py-3.5 font-medium sm:table-cell">
                <span className="sr-only">Topic</span>
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium text-muted">
                Typical chat tool
              </th>
              <th scope="col" className="px-5 py-3.5 font-semibold">
                DocMind
              </th>
            </tr>
          </thead>
          <tbody>
            {CONTRAST.map(row => (
              <tr key={row.topic} className="border-b border-line last:border-b-0 align-top">
                <th scope="row" className="hidden px-5 py-4 text-left font-semibold text-fg sm:table-cell">
                  {row.topic}
                </th>
                <td className="px-5 py-4 leading-6 text-muted">
                  <span className="mb-1 block font-semibold text-fg sm:hidden">{row.topic}</span>
                  {row.chat}
                </td>
                <td className="px-5 py-4 leading-6 text-fg">
                  <span className="mb-1 block text-xs font-semibold text-faint sm:hidden">DocMind</span>
                  {row.docmind}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works (a real sequence, so numbered)                         */
/* ------------------------------------------------------------------ */
const STEPS = [
  {
    title: 'Upload',
    body: 'Drop in PDFs, Word files or text. Files go straight to private storage and are checked against a SHA-256 hash.',
  },
  {
    title: 'Process',
    body: 'Scanned pages are read with OCR and tables stay tables. Text is split into passages that keep their headings and page numbers.',
  },
  {
    title: 'Ask',
    body: 'Search matches meaning and exact words together, so both "termination for convenience" and "clause 14.2" find the right passage.',
  },
  {
    title: 'Verify',
    body: 'Each claim carries a numbered marker. Open it to see the source page and the passage word for word.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <h2 className="max-w-2xl text-3xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-4xl">
          From file to checked answer in four steps
        </h2>
        <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="tabular inline-flex size-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-fg">
                  {i + 1}
                </span>
                {i < STEPS.length - 1 && <span className="hidden h-px flex-1 bg-line-strong lg:block" aria-hidden="true" />}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-7 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Features                                                            */
/* ------------------------------------------------------------------ */
function CompareVisual() {
  const cols = ['Vendor A', 'Vendor B', 'Vendor C'];
  const rows: { label: string; cells: [string, number][]; note?: boolean }[] = [
    { label: 'Liability cap', cells: [['12 months of fees', 1], ['Fees paid in 6 months', 2], ['Unlimited', 3]] },
    { label: 'Uptime promise', cells: [['99.9%', 4], ['99.5%', 5], ['99.95%', 6]] },
    { label: 'Notice to terminate', cells: [['90 days', 7], ['30 days', 8], ['60 days', 9]] },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-page">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-surface-2/60">
            <th className="px-4 py-3 font-medium text-faint">Limitation of liability and SLA</th>
            {cols.map(c => (
              <th key={c} className="px-4 py-3 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-b border-line last:border-b-0">
              <th scope="row" className="px-4 py-3.5 text-left font-medium text-muted">
                {r.label}
              </th>
              {r.cells.map(([v, n]) => (
                <td key={n} className="px-4 py-3.5">
                  <span className={r.label === 'Liability cap' && v === 'Unlimited' ? 'mark' : ''}>{v}</span>
                  <span className="ml-1 inline-flex size-4 translate-y-[-0.1em] items-center justify-center rounded-[4px] bg-brand text-[10px] font-semibold text-brand-fg">
                    {n}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line bg-surface-2/40 px-4 py-3 text-[13px] leading-6 text-muted">
        Vendor C is the only one with no liability cap. Check clause 11 before signing.
      </p>
    </div>
  );
}

function TablesVisual() {
  return (
    <div className="relative">
      <div className="rounded-[3px] bg-paper p-6 text-paper-fg shadow-page">
        <div className="mb-3 flex items-center justify-between text-[11px] text-paper-fg/55">
          <span>Annual_Report_2025.pdf</span>
          <span className="rounded bg-[#e2f3ea] px-1.5 py-0.5 font-medium text-[#17794f]">Scanned page, read with OCR</span>
        </div>
        <p className="mb-2 font-serif text-sm font-semibold">Consolidated balance sheet (in thousands)</p>
        <table className="w-full border-collapse font-serif text-[13px]">
          <thead>
            <tr className="border-b border-paper-fg/25 text-left">
              <th className="py-1.5 font-semibold">Item</th>
              <th className="py-1.5 text-right font-semibold">2025</th>
              <th className="py-1.5 text-right font-semibold">2024</th>
            </tr>
          </thead>
          <tbody className="tabular">
            <tr className="border-b border-paper-fg/10">
              <td className="py-1.5">Cash and equivalents</td>
              <td className="py-1.5 text-right">
                <span className="mark-strong">48,210</span>
              </td>
              <td className="py-1.5 text-right">39,874</td>
            </tr>
            <tr className="border-b border-paper-fg/10">
              <td className="py-1.5">Trade receivables</td>
              <td className="py-1.5 text-right">22,905</td>
              <td className="py-1.5 text-right">21,330</td>
            </tr>
            <tr>
              <td className="py-1.5">Total current liabilities</td>
              <td className="py-1.5 text-right">31,442</td>
              <td className="py-1.5 text-right">29,118</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="relative -mt-3 ml-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-page sm:ml-14">
        <p className="text-muted">How much cash did we hold at year end?</p>
        <p className="mt-1.5 leading-6">
          Cash and equivalents were 48,210 thousand in 2025, up from 39,874 thousand.
          <span className="ml-1 inline-flex size-4 translate-y-[-0.1em] items-center justify-center rounded-[4px] bg-brand text-[10px] font-semibold text-brand-fg">
            1
          </span>
        </p>
      </div>
    </div>
  );
}

function RolesVisual() {
  const cols = ['Read', 'Ask', 'Upload', 'Members', 'Plan'];
  const rows: { role: string; can: boolean[] }[] = [
    { role: 'Owner', can: [true, true, true, true, true] },
    { role: 'Admin', can: [true, true, true, true, false] },
    { role: 'Member', can: [true, true, true, false, false] },
    { role: 'Viewer', can: [true, false, false, false, false] },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-page">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-surface-2/60">
            <th className="px-4 py-3 font-medium text-faint">Role</th>
            {cols.map(c => (
              <th key={c} className="px-2 py-3 text-center font-medium text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.role} className="border-b border-line last:border-b-0">
              <th scope="row" className="px-4 py-3 text-left font-semibold">
                {r.role}
              </th>
              {r.can.map((c, i) => (
                <td key={i} className="px-2 py-3 text-center">
                  {c ? (
                    <Icon name="check" className="mx-auto size-4 text-ok" strokeWidth={2.2} />
                  ) : (
                    <span className="text-line-strong" aria-label="Not allowed">
                      &ndash;
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line bg-surface-2/40 px-4 py-3 text-xs text-muted">
        Ask includes questions and comparisons. Members covers invitations and roles. Plan covers billing and upgrades.
      </p>
    </div>
  );
}

function Showcase({
  id,
  title,
  body,
  points,
  visual,
  flip,
}: {
  id?: string;
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div id={id} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={`min-w-0 ${flip ? 'lg:order-2' : ''}`}>
        <h3 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-[1.75rem]">{title}</h3>
        <p className="mt-4 max-w-lg text-[17px] leading-8 text-muted">{body}</p>
        <ul className="mt-5 space-y-2.5">
          {points.map(p => (
            <li key={p} className="flex items-start gap-2.5 text-[15px] leading-6">
              <Icon name="check" className="mt-1 size-4 text-ok" strokeWidth={2.2} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`scroll-thin min-w-0 overflow-x-auto p-1 ${flip ? 'lg:order-1' : ''}`}>{visual}</div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <h2 className="max-w-2xl text-3xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-4xl">
        Built for real documents and real teams
      </h2>
      <div className="mt-14 space-y-20 lg:space-y-28">
        <Showcase
          title="Compare up to five documents at once"
          body="Pick a topic such as limitation of liability or uptime guarantees. DocMind pulls the relevant passages from each document and lays them out in one table, with the differences called out and each cell linked to its source."
          points={['Spot the outlier across vendor contracts in seconds', 'Copy the table as Markdown for reports and tickets']}
          visual={<CompareVisual />}
        />
        <Showcase
          title="Scans and tables stay usable"
          body="Scanned PDFs are read with OCR automatically. Tables from PDFs and Word files are rebuilt as real tables, so a figure never loses its row and column label."
          points={['Pages with little selectable text trigger OCR on their own', 'Answers about numbers cite the table they came from']}
          visual={<TablesVisual />}
          flip
        />
        <Showcase
          title="Workspaces your whole team can use"
          body="Invite colleagues as Admin, Member or Viewer. Every query is scoped to the workspace, usage is metered against your plan, and an audit log records who uploaded, invited and deleted."
          points={['Personal and company workspaces under one login', 'Quotas for documents, storage and monthly questions']}
          visual={<RolesVisual />}
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */
export function Security() {
  return (
    <section id="security" className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[4fr_7fr] lg:gap-16 lg:py-28">
        <div>
          <h2 className="text-3xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-4xl">
            Your documents stay yours
          </h2>
          <p className="mt-4 text-[17px] leading-8 text-muted">
            DocMind does not use your documents to train models. Here is how access and storage are handled.
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=DocMind%20security%20review`} className={btn('secondary', 'md', 'mt-6')}>
            Request a security review
          </a>
        </div>
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {SECURITY_POINTS.map(p => (
            <div key={p.title}>
              <dt className="flex items-center gap-2.5 text-base font-semibold">
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Icon name={p.icon} className="size-[17px]" />
                </span>
                {p.title}
              </dt>
              <dd className="mt-2.5 text-[15px] leading-7 text-muted">{p.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */
export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <h2 className="max-w-2xl text-3xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-4xl">
        Start free. Upgrade when your team needs more room.
      </h2>
      <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
        Prices are per workspace, per month. Change plans in Settings whenever you like.
      </p>

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-2xl border bg-surface p-7 ${
              plan.recommended ? 'border-brand shadow-page ring-1 ring-brand' : 'border-line'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              {plan.recommended && (
                <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-fg">Most teams pick this</span>
              )}
            </div>
            <p className="mt-1 min-h-[3rem] text-[15px] leading-6 text-muted">{plan.blurb}</p>
            <p className="mt-5 flex items-baseline gap-1.5">
              <span className="tabular text-5xl font-semibold tracking-tight">${plan.price}</span>
              <span className="text-sm text-muted">per month</span>
            </p>
            <Link href={plan.href} className={btn(plan.recommended ? 'primary' : 'secondary', 'lg', 'mt-6 w-full')}>
              {plan.cta}
            </Link>
            <ul className="mt-6 space-y-2.5 border-t border-line pt-6 text-[15px]">
              {plan.highlights.map(h => (
                <li key={h} className="flex items-start gap-2.5">
                  <Icon name="check" className="mt-1 size-4 text-ok" strokeWidth={2.2} />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption className="sr-only">Plan limits</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              <th scope="col" className="px-5 py-3.5 font-medium text-faint">
                Limits
              </th>
              {PLANS.map(p => (
                <th key={p.id} scope="col" className="px-5 py-3.5 font-semibold">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LIMIT_ROWS.map(row => (
              <tr key={row.key} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-5 py-3.5 text-left font-medium text-muted">
                  {row.label}
                </th>
                {PLANS.map(p => (
                  <td key={p.id} className="tabular px-5 py-3.5">
                    {row.format(p.limits[row.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */
export function Faq() {
  return (
    <section id="faq" className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[4fr_7fr] lg:gap-16 lg:py-28">
        <h2 className="text-3xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-4xl">Questions people ask first</h2>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map(item => (
            <details key={item.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 text-left text-[17px] font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                {item.q}
                <Icon name="chevronDown" className="size-5 text-faint transition-transform group-open:rotate-180" />
              </summary>
              <p className="max-w-2xl pb-5 pr-8 text-[15px] leading-7 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Closing call to action + footer                                     */
/* ------------------------------------------------------------------ */
export function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
      <div className="rounded-3xl bg-brand px-7 py-14 text-brand-fg sm:px-14 sm:py-16">
        <h2 className="max-w-2xl text-3xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-4xl">
          Upload one document and ask it something.
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-8 opacity-80">
          You will see the answer, the page and the passage in under a minute.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-mark px-6 text-base font-semibold text-[#1a1400] transition-opacity hover:opacity-90"
          >
            Start free
          </Link>
          <Link
            href="/login?demo=1"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-current/40 px-6 text-base font-medium transition-colors hover:bg-white/10"
          >
            Try the demo workspace
          </Link>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted">Cited answers from your own documents.</p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { href: '#how-it-works', label: 'How it works' },
            { href: '#features', label: 'Features' },
            { href: '#security', label: 'Security' },
            { href: '#pricing', label: 'Pricing' },
          ]}
        />
        <FooterCol
          title="Account"
          links={[
            { href: '/login', label: 'Sign in' },
            { href: '/signup', label: 'Create account' },
            { href: '/login?demo=1', label: 'Demo workspace' },
          ]}
        />
        <FooterCol title="Contact" links={[{ href: `mailto:${SUPPORT_EMAIL}`, label: SUPPORT_EMAIL }]} />
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-5 py-5 text-sm text-faint sm:px-8">&copy; {year} DocMind</p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map(l => (
          <li key={l.label}>
            <a href={l.href} className="break-all text-sm text-muted transition-colors hover:text-fg">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
