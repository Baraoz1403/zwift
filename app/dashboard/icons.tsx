/**
 * Small hand-rolled SVG icon set - no icon library dependency, same
 * reasoning as the hand-rolled chart/FIT parser: avoids adding an npm
 * package whose bundle behavior we can't verify without a real
 * `npm install` in this environment.
 */
type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconDistance({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 17c2-4 4-6 6-2s4 2 6-2 4-4 6 0" />
    </svg>
  );
}

export function IconClock({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export function IconMountain({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 18l6-10 4 6 2-3 6 7" />
      <path d="M3 18h18" />
    </svg>
  );
}

export function IconBolt({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" stroke="none">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  );
}

export function IconTrophy({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4a3 3 0 0 0 3 5" />
      <path d="M17 5h3a3 3 0 0 1-3 5" />
      <path d="M12 13v3" />
      <path d="M8 20h8" />
      <path d="M9.5 16.5h5l.5 3.5h-6l.5-3.5Z" />
    </svg>
  );
}

export function IconFlame({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3c1 3-3 4-3 8a3 3 0 1 0 6 0c0-1-1-2-1-2 1 0 2 2 2 4a5 5 0 1 1-10 0c0-5 6-6 6-10Z" />
    </svg>
  );
}

export function IconCalendar({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

export function IconHeart({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 20s-7-4.35-9.5-8.8C.7 7.9 2.4 4.5 6 4.5c2.1 0 3.6 1.2 6 3.6 2.4-2.4 3.9-3.6 6-3.6 3.6 0 5.3 3.4 3.5 6.7C19 15.65 12 20 12 20Z" />
      <path d="M5 11h3l1.5-2.5L11 13l1.5-3 1 1.5H18" />
    </svg>
  );
}

export function IconUser({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

export function IconScale({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="9" width="18" height="12" rx="3" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
      <path d="M12 12.5 9.5 16h5L12 12.5Z" />
    </svg>
  );
}

export function IconBike({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="5.5" cy="17.5" r="3.2" />
      <circle cx="18.5" cy="17.5" r="3.2" />
      <path d="M5.5 17.5 10 9h4l4.5 8.5" />
      <path d="M8 9h4" />
      <path d="M10 9l3 4.5h-7.5" />
    </svg>
  );
}

export function IconRun({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="14.2" cy="4.3" r="1.6" fill="currentColor" stroke="none" />
      <path d="M9.5 9 13 7.3l2 3 3.5 1.2" />
      <path d="M13 10.3l-1.5 3.2 3 2.5-.7 4.3" />
      <path d="M9.5 14.5 7 17l-1.3 3" />
      <path d="M11.5 13.5 8 15" />
    </svg>
  );
}

export function IconArrowUp({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}

export function IconArrowDown({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14" />
      <path d="M18 13l-6 6-6-6" />
    </svg>
  );
}

export function IconTrend({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

export function IconList({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
