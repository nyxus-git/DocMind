import React from 'react';
import Link from 'next/link';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-brand-fg lg:flex">
        <Link href="/" className="inline-flex w-fit items-center gap-2" aria-label="DocMind home">
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-brand-fg">
            <span className="block h-2.5 w-3.5 rounded-[2px] bg-mark" />
          </span>
          <span className="text-[1.15rem] font-semibold tracking-tight">DocMind</span>
        </Link>

        <div>
          <p className="max-w-md text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.03em]">
            Every answer comes with the page to prove it.
          </p>
          <figure className="mt-10 max-w-md rounded-[3px] bg-paper p-6 text-paper-fg shadow-page">
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

        <p className="text-sm opacity-70">Sample contract text, shown for illustration.</p>
      </aside>

      {/* Form side */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="lg:invisible" aria-label="DocMind home">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center justify-center px-5 pb-16 pt-4 sm:px-8">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
