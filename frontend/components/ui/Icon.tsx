import React from 'react';

const PATHS = {
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  plus: ['M12 5v14', 'M5 12h14'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M5 20h14'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M5 20h14'],
  file: ['M7 3h7l5 5v13H7z', 'M14 3v5h5'],
  chat: ['M4 5h16v11H9l-5 4z'],
  compare: ['M4 5h7v14H4z', 'M13 5h7v14h-7z'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  sliders: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M15 5v4', 'M9 15v4'],
  shield: ['M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z', 'M9 12l2 2 4-4'],
  search: ['M11 4a7 7 0 100 14 7 7 0 000-14z', 'M20 20l-4-4'],
  table: ['M4 5h16v14H4z', 'M4 10h16', 'M10 5v14'],
  users: ['M9 11a3 3 0 100-6 3 3 0 000 6z', 'M3 19c0-3 2.7-5 6-5s6 2 6 5', 'M16 5.5a3 3 0 010 5.5', 'M18 14c2 .5 3 2 3 4'],
  user: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 20c0-4 3.5-6 8-6s8 2 8 6'],
  building: ['M5 21V4h9v17', 'M14 9h5v12', 'M8 8h3', 'M8 12h3', 'M8 16h3'],
  lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 018 0v3'],
  trash: ['M5 7h14', 'M10 7V4h4v3', 'M7 7l1 13h8l1-13'],
  retry: ['M20 11a8 8 0 10-2.3 5.7', 'M20 5v6h-6'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  sun: ['M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 2v2', 'M12 20v2', 'M2 12h2', 'M20 12h2', 'M5 5l1.5 1.5', 'M17.5 17.5L19 19', 'M5 19l1.5-1.5', 'M17.5 6.5L19 5'],
  moon: ['M20 14A8 8 0 019.5 4a8 8 0 1010.5 10z'],
  scan: ['M4 8V5h3', 'M17 5h3v3', 'M20 16v3h-3', 'M7 19H4v-3', 'M4 12h16'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  logout: ['M10 5H5v14h5', 'M15 8l4 4-4 4', 'M19 12H9'],
  alert: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17v.01'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  history: ['M4 12a8 8 0 108-8', 'M4 4v5h5', 'M12 8v4l3 2'],
  copy: ['M9 9h11v11H9z', 'M5 15V4h11'],
  send: ['M21 3L10 14', 'M21 3l-7 18-4-7-7-4z'],
  clock: ['M12 4a8 8 0 100 16 8 8 0 000-16z', 'M12 8v4l3 2'],
  book: ['M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z', 'M5 17a3 3 0 013-3h11'],
  quote: ['M6 17c0-4 1-7 4-9', 'M14 17c0-4 1-7 4-9', 'M4 17h6v-4', 'M12 17h6v-4'],
  key: ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'],
  edit: ['M12 20h9', 'M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z'],
  thumbUp: ['M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3', 'M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z'],
  thumbDown: ['M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17', 'M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z'],
  folder: ['M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z'],
  globe: ['M12 2a10 10 0 100 20 10 10 0 000-20z', 'M2 12h20', 'M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z'],
  userCheck: ['M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M8.5 11a4 4 0 100-8 4 4 0 000 8z', 'M17 11l2 2 4-4'],
  info: ['M12 2a10 10 0 100 20 10 10 0 000-20z', 'M12 16v-4', 'M12 8h.01'],
  mail: ['M4 6h16v12H4z', 'M4 7l8 6 8-6'],
  eye: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z', 'M12 9a3 3 0 100 6 3 3 0 000-6z'],
  eyeOff: [
    'M3 3l18 18',
    'M10.6 10.6a3 3 0 004.2 4.2',
    'M9.9 5.2A10.4 10.4 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-3.3 4.3',
    'M6.6 6.6C4 8.4 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.2-1',
  ],
  sparkles: [
    'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z',
    'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  ],
  bookmark: ['M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z'],
  help: [
    'M12 2a10 10 0 100 20 10 10 0 000-20z',
    'M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3',
    'M12 17h.01',
  ],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = 'size-4',
  strokeWidth = 1.7,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {PATHS[name].map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
