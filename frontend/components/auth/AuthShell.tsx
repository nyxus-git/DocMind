import React from 'react';
import Link from 'next/link';
import { Logo } from '../ui/Logo';
import { Icon } from '../ui/Icon';
import { ThemeToggle } from '../ui/ThemeToggle';

const POINTS = [
  'Every answer cited to the page and passage',
  'Workspaces with roles for your whole team',
  'Your documents are never used to train models',
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel */}
      <aside className="brand-gradient relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-30 [--fg:#fff]" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <Link href="/" className="relative inline-flex w-fit" aria-label="DocMind home">
          <Logo light />
        </Link>

        <div className="relative">
          <p className="max-w-md text-[2.3rem] font-semibold leading-[1.08] tracking-[-0.035em]">
            Every answer comes with the page to prove it.
          </p>
          <ul className="mt-6 space-y-3 text-[15px] text-white/85">
            {POINTS.map(p => (
              <li key={p} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Icon name="check" className="size-3.5" strokeWidth={2.6} />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <figure className="mt-9 max-w-md rounded-xl bg-paper p-6 text-paper-fg shadow-pop ring-1 ring-white/20">
            <figcaption className="mb-3 flex justify-between text-[11px] text-paper-fg/55">
              <span>Master_Services_Agreement.pdf</span>
              <span>Page 14</span>
            </figcaption>
            <blockquote className="font-serif text-[15px] leading-[1.75]">
              <span className="text-paper-fg/55">11.2 </span>
              <span className="mark-strong">
                Supplier&rsquo;s total aggregate liability shall not exceed the fees paid in the twelve (12) months
                preceding the claim.
              </span>
            </blockquote>
          </figure>
        </div>

        <p className="relative text-sm text-white/60">Sample contract text, shown for illustration.</p>
      </aside>

      {/* Form side */}
      <div className="flex flex-col bg-bg">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="lg:invisible" aria-label="DocMind home">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center justify-center px-5 pb-16 pt-4 sm:px-8">
          <div className="w-full max-w-[26rem] rounded-2xl border border-line bg-surface p-7 shadow-card sm:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
