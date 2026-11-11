import React from 'react';

/** A page with one highlighted line: the product in one mark. */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="dm-logo-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8.5" fill="url(#dm-logo-g)" />
      <rect x="8" y="8.5" width="16" height="2.6" rx="1.3" fill="#fff" opacity=".55" />
      <rect x="8" y="14" width="16" height="5" rx="1.4" fill="#ffe14d" />
      <rect x="8" y="21.6" width="10" height="2.6" rx="1.3" fill="#fff" opacity=".55" />
    </svg>
  );
}

export function Logo({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-8" />
      <span className={`text-[1.1rem] font-semibold tracking-[-0.02em] ${light ? 'text-white' : 'text-fg'}`}>DocMind</span>
    </span>
  );
}
