'use client';

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
  showBadge = false,
  badgeText = 'Enterprise',
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
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Modern Geometric Intelligence Glyph */}
      <div className={`relative ${iconDimensions} flex items-center justify-center shrink-0 group`}>
        {/* Ambient Volumetric Backlight */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/30 via-indigo-500/25 to-teal-400/30 rounded-2xl blur-md group-hover:blur-xl transition-all duration-500 opacity-70 group-hover:opacity-100" />

        {/* SVG Monogram Mark */}
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative w-full h-full drop-shadow-xl transition-transform duration-300 group-hover:scale-105"
        >
          <defs>
            {/* Top Plane: Radiant Electric Cyan to Indigo */}
            <linearGradient id="dm-top-facet" x1="10" y1="14" x2="38" y2="14" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>

            {/* Left Plane: Deep Obsidian with Cyan Edge */}
            <linearGradient id="dm-left-facet" x1="10" y1="14" x2="24" y2="38" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="60%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#030712" />
            </linearGradient>

            {/* Right Plane: Emerald to Teal Luster */}
            <linearGradient id="dm-right-facet" x1="38" y1="14" x2="24" y2="38" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="50%" stopColor="#0d9488" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            {/* Neural Core Spark */}
            <linearGradient id="dm-core-glow" x1="18" y1="18" x2="30" y2="30" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#a5f3fc" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>

            {/* Subtle Outer Frame Gradient */}
            <linearGradient id="dm-border-glow" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Rounded Hexagonal Outer Shell */}
          <rect
            x="2"
            y="2"
            width="44"
            height="44"
            rx="13"
            fill="#050814"
            stroke="url(#dm-border-glow)"
            strokeWidth="1.2"
          />

          {/* Isometric Knowledge Crystal Facets */}
          {/* 1. Left Isometric Facet */}
          <path
            d="M11 15.5L24 23.5V37L11 29V15.5Z"
            fill="url(#dm-left-facet)"
            stroke="#0284c7"
            strokeWidth="0.8"
            strokeOpacity="0.4"
          />

          {/* 2. Right Isometric Facet */}
          <path
            d="M37 15.5L24 23.5V37L37 29V15.5Z"
            fill="url(#dm-right-facet)"
            stroke="#2dd4bf"
            strokeWidth="0.8"
            strokeOpacity="0.4"
          />

          {/* 3. Top Isometric Facet */}
          <path
            d="M24 10L37 15.5L24 23.5L11 15.5L24 10Z"
            fill="url(#dm-top-facet)"
            stroke="#38bdf8"
            strokeWidth="0.8"
            strokeOpacity="0.6"
          />

          {/* Neural Ground-Truth Central Prism (Inner Crystal) */}
          <path
            d="M24 16.5L30 20.2L24 24L18 20.2L24 16.5Z"
            fill="url(#dm-core-glow)"
            fillOpacity="0.95"
          />

          {/* Dynamic Laser Index Axis */}
          <line
            x1="24"
            y1="24"
            x2="24"
            y2="33"
            stroke="#a5f3fc"
            strokeWidth="1.8"
            strokeLinecap="round"
          />

          {/* Verifiable Anchor Pips */}
          <circle cx="24" cy="16.5" r="1.5" fill="#ffffff" />
          <circle cx="18" cy="20.2" r="1.2" fill="#38bdf8" />
          <circle cx="30" cy="20.2" r="1.2" fill="#2dd4bf" />
          <circle cx="24" cy="33" r="1.8" fill="#38bdf8" />
        </svg>
      </div>

      {/* Brand Wordmark */}
      {showText && (
        <div className="flex items-center gap-2.5">
          <div className={`font-bold tracking-tight text-white ${textSizes} leading-none flex items-center`}>
            Doc<span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-100 bg-clip-text text-transparent">Mind</span>
          </div>

          {showBadge && (
            <span
              className={`rounded-full font-medium tracking-wide bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 shadow-sm ${badgeSizes}`}
            >
              {badgeText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
