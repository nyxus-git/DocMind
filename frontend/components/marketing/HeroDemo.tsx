'use client';

import React, { useState } from 'react';

interface Source {
  file: string;
  page: number;
  heading: string;
  before: string;
  quote: string;
  after: string;
}

// Sample content only. The contract below is fictional.
const SOURCES: Source[] = [
  {
    file: 'Master_Services_Agreement.pdf',
    page: 14,
    heading: '11. Limitation of liability',
    before:
      '11.1 Nothing in this Agreement limits liability for fraud or for death or personal injury caused by negligence.',
    quote:
      '11.2 Supplier’s total aggregate liability arising out of or in connection with this Agreement shall not exceed the fees paid or payable by Customer in the twelve (12) months preceding the event giving rise to the claim.',
    after: '11.3 Neither party is liable for loss of profit or indirect loss, whether or not foreseeable.',
  },
  {
    file: 'Master_Services_Agreement.pdf',
    page: 14,
    heading: '11. Limitation of liability',
    before: '11.3 Neither party is liable for loss of profit or indirect loss, whether or not foreseeable.',
    quote:
      '11.4 The limitations in Section 11.2 shall not apply to liability arising from a breach of Section 9 (Confidentiality) or Section 10 (Data Protection).',
    after: '11.5 Each party shall take reasonable steps to mitigate any loss for which it claims against the other.',
  },
  {
    file: 'SLA_Schedule.pdf',
    page: 3,
    heading: '2. Service levels',
    before: '2.1 Supplier shall make the Service available to Customer in accordance with the Monthly Uptime target.',
    quote:
      'Where Monthly Uptime falls below 99.9%, Service Credits are Customer’s sole and exclusive remedy for such failure.',
    after: '2.2 Service Credits are calculated as set out in Table 1 and applied to the next invoice.',
  },
];

function Marker({ n, active, onSelect }: { n: number; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onSelect}
      aria-label={`Source ${n}: ${SOURCES[n - 1].file}, page ${SOURCES[n - 1].page}`}
      aria-pressed={active}
      className={`mx-0.5 inline-flex size-[1.2rem] translate-y-[-0.1em] items-center justify-center rounded-[5px] text-[11px] font-semibold leading-none transition-colors ${
        active ? 'bg-mark text-[#1a1400]' : 'bg-brand text-brand-fg hover:bg-brand-hover'
      }`}
    >
      {n}
    </button>
  );
}

export function HeroDemo() {
  const [active, setActive] = useState(0);
  const src = SOURCES[active];

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        {/* Question */}
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted">
            You
          </span>
          <p className="text-[15px] font-medium leading-6 text-fg">
            What is the liability cap, and when does it not apply?
          </p>
        </div>

        {/* Answer */}
        <div className="px-5 py-4">
          <p className="text-[15px] leading-7 text-fg">
            The vendor&rsquo;s total liability is capped at the fees paid in the 12 months before the claim
            <Marker n={1} active={active === 0} onSelect={() => setActive(0)} />. The cap does not apply to breaches
            of confidentiality or data protection
            <Marker n={2} active={active === 1} onSelect={() => setActive(1)} />. If uptime falls below 99.9%,
            service credits are the only remedy
            <Marker n={3} active={active === 2} onSelect={() => setActive(2)} />.
          </p>
        </div>

        {/* Source page on the desk */}
        <div className="bg-surface-2 px-4 pb-5 pt-4 sm:px-6">
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span className="truncate font-medium text-fg">{src.file}</span>
            <span className="tabular shrink-0 pl-3">Page {src.page}</span>
          </div>
          <div className="rounded-[3px] bg-paper px-6 pb-6 pt-5 text-paper-fg shadow-page sm:px-9 sm:pt-7">
            <p className="mb-3 text-[13px] font-semibold text-paper-fg/80">{src.heading}</p>
            <div className="font-serif text-[15px] leading-[1.75]">
              <p className="text-paper-fg/55">{src.before}</p>
              <p className="mt-2" key={active}>
                <span className="mark-sweep">{src.quote}</span>
              </p>
              <p className="mt-2 text-paper-fg/55">{src.after}</p>
            </div>
            <p className="tabular mt-5 text-center text-[11px] text-paper-fg/45">{src.page}</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-faint">Sample contract. Select a number to see the page it cites.</p>
    </div>
  );
}
