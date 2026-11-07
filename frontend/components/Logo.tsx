import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  showBadge?: boolean;
  badgeText?: string;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showText = true,
  showBadge = true,
  badgeText = 'AI RAG',
  className = '',
}) => {
  const iconDimensions = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  }[size];

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl',
  }[size];

  const badgeSizes = {
    sm: 'text-[9px] px-1.5 py-0.5',
    md: 'text-[10px] px-2 py-0.5',
    lg: 'text-xs px-2.5 py-0.5',
    xl: 'text-xs px-3 py-1',
  }[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Dynamic Animated Vector Glyph */}
      <div className={`relative ${iconDimensions} flex items-center justify-center group`}>
        {/* Ambient Glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/40 via-teal-400/30 to-indigo-500/30 rounded-xl blur-md group-hover:blur-lg transition-all opacity-80 group-hover:opacity-100" />

        {/* SVG Container */}
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative w-full h-full drop-shadow-md transition-transform duration-300 group-hover:scale-105"
        >
          <defs>
            <linearGradient id="docmind-grad-primary" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
            <linearGradient id="docmind-grad-accent" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="docmind-sheet-top" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>

          {/* Background Rounded Shield */}
          <rect
            x="3"
            y="3"
            width="42"
            height="42"
            rx="12"
            fill="#090d16"
            stroke="url(#docmind-grad-primary)"
            strokeWidth="1.5"
            strokeOpacity="0.6"
          />

          {/* Layer 1: Bottom Document Sheet */}
          <path
            d="M13 15C13 13.8954 13.8954 13 15 13H27L33 19V33C33 34.1046 32.1046 35 31 35H15C13.8954 35 13 34.1046 13 33V15Z"
            fill="url(#docmind-grad-accent)"
            fillOpacity="0.25"
          />

          {/* Layer 2: Main Document Sheet with Fold */}
          <path
            d="M16 11C16 9.89543 16.8954 9 18 9H29.5L36 15.5V31C36 32.1046 35.1046 33 34 33H18C16.8954 33 16 32.1046 16 31V11Z"
            fill="#0f172a"
            stroke="url(#docmind-grad-primary)"
            strokeWidth="1.8"
          />

          {/* Folded Corner Accent */}
          <path
            d="M29.5 9V15.5H36"
            stroke="url(#docmind-grad-primary)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />

          {/* Neural Grounding Lines / Document Data */}
          <path
            d="M20 18H28"
            stroke="#38bdf8"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M20 22H31"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeOpacity="0.8"
          />
          <path
            d="M20 26H26"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeOpacity="0.8"
          />

          {/* Neural Node Citation Dot with Glow */}
          <circle cx="31" cy="26" r="2.5" fill="#06b6d4" />
          <circle cx="31" cy="26" r="4.5" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.5" />
        </svg>
      </div>

      {/* Brand Wordmark & Enterprise Badge */}
      {showText && (
        <div className="flex items-center gap-2">
          <div className={`font-extrabold tracking-tight text-white ${textSizes} leading-none flex items-center`}>
            Doc<span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-200 bg-clip-text text-transparent">Mind</span>
          </div>

          {showBadge && (
            <span
              className={`rounded-full font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/10 ${badgeSizes}`}
            >
              {badgeText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
