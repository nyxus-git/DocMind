import React from 'react';

/** A page with one highlighted line: the product in one mark. */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="5" y="3" width="22" height="26" rx="3.5" fill="var(--fg)" />
      <rect x="9" y="9" width="14" height="2.4" rx="1.2" fill="var(--bg)" opacity=".55" />
      <rect x="9" y="14.4" width="14" height="4.4" rx="1" fill="var(--mark)" />
      <rect x="9" y="22" width="9" height="2.4" rx="1.2" fill="var(--bg)" opacity=".55" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[1.15rem] font-semibold tracking-tight text-fg">DocMind</span>
    </span>
  );
}
