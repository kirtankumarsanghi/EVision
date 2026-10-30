import React from 'react';

/**
 * Hero illustration: an electric car plugged into a public charger, with a
 * transmission pylon and power lines behind it. Drawn in the product palette
 * so it works in both themes without a dark panel.
 */
export const HeroScene: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 640 400"
    className={`w-full ${className}`}
    role="img"
    aria-label="An electric car charging at a public charging station"
  >
    <defs>
      <pattern id="hero-dots" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="var(--border-strong)" opacity="0.55" />
      </pattern>
      <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
      </radialGradient>
    </defs>

    <rect width="640" height="400" fill="url(#hero-dots)" opacity="0.45" />
    <circle cx="474" cy="250" r="150" fill="url(#hero-glow)" />

    {/* transmission lines */}
    <g stroke="var(--border-strong)" strokeWidth="1" fill="none" opacity="0.75">
      <path d="M24 112 Q170 84 320 110 T636 88" />
      <path d="M24 132 Q170 104 320 130 T636 108" />
      <path d="M24 152 Q170 124 320 150 T636 128" />
    </g>

    {/* pylon */}
    <g stroke="var(--text)" strokeWidth="1.5" fill="none" opacity="0.5">
      <path d="M78 336 L100 146 L122 336" />
      <path d="M84 296 L116 296" />
      <path d="M88 246 L112 246" />
      <path d="M92 201 L108 201" />
      <path d="M100 146 L74 186 M100 146 L126 186" />
    </g>

    {/* ground */}
    <line x1="30" y1="336" x2="610" y2="336" stroke="var(--border-strong)" strokeWidth="1.5" />
    <ellipse cx="276" cy="338" rx="152" ry="8" fill="var(--text)" opacity="0.05" />
    <ellipse cx="467" cy="338" rx="46" ry="6" fill="var(--text)" opacity="0.06" />

    {/* car */}
    <g>
      <path
        d="M148 326 L148 302 Q148 287 163 284 L196 282 L222 246 Q230 236 249 234 L318 234 Q338 236 349 251 L371 281 L394 285 Q404 289 404 303 L404 326 Z"
        fill="var(--surface)"
        stroke="var(--text)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M236 246 L300 246 Q316 248 326 262 L338 276 L228 276 Z"
        fill="var(--accent-soft)"
        stroke="var(--text)"
        strokeWidth="1.2"
      />
      <path d="M300 276 L300 326" stroke="var(--text)" strokeWidth="1" opacity="0.3" />
      <rect x="287" y="284" width="14" height="3" rx="1.5" fill="var(--text)" opacity="0.35" />
      <rect x="386" y="288" width="14" height="10" rx="2" fill="var(--accent)" />

      <circle cx="196" cy="316" r="24" fill="var(--surface)" stroke="var(--text)" strokeWidth="1.8" />
      <circle cx="196" cy="316" r="10" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="352" cy="316" r="24" fill="var(--surface)" stroke="var(--text)" strokeWidth="1.8" />
      <circle cx="352" cy="316" r="10" fill="none" stroke="var(--accent)" strokeWidth="2" />

      <path d="M396 296 L404 298" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
    </g>

    {/* charger */}
    <g>
      <rect x="438" y="192" width="58" height="144" rx="6" fill="var(--surface)" stroke="var(--text)" strokeWidth="1.8" />
      <rect x="448" y="204" width="38" height="30" rx="3" fill="var(--accent-soft)" stroke="var(--text)" strokeWidth="1" />
      <path d="M466 210 L460 220 h5 l-1 8 7-10 h-5 l1-8Z" fill="var(--accent)" />
      <circle cx="467" cy="316" r="3.5" fill="var(--accent)" className="animate-pulse-soft" />
      <rect x="448" y="254" width="38" height="8" rx="4" fill="var(--text)" opacity="0.12" />
      <rect x="448" y="254" width="24" height="8" rx="4" fill="var(--accent)" opacity="0.7" />
    </g>

    {/* charging cable */}
    <path
      d="M438 246 C 420 258, 410 282, 400 294"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeDasharray="5 6"
      className="animate-dash"
    />

    {/* ambient particles */}
    <g className="animate-float">
      <circle cx="520" cy="176" r="3" fill="var(--accent)" opacity="0.7" />
      <circle cx="548" cy="208" r="2" fill="var(--text)" opacity="0.3" />
      <circle cx="408" cy="166" r="2.5" fill="var(--accent)" opacity="0.5" />
      <circle cx="176" cy="196" r="2" fill="var(--text)" opacity="0.25" />
    </g>
  </svg>
);
