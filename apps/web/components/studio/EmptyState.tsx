export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      {/* Inline SVG anvil/ember illustration */}
      <svg
        width="96"
        height="96"
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mb-6 opacity-80"
      >
        <defs>
          <linearGradient id="molten-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffc24b" />
            <stop offset="55%" stopColor="#ff7a1a" />
            <stop offset="100%" stopColor="#e5331b" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Anvil base */}
        <rect
          x="18" y="64" width="60" height="14"
          rx="3"
          fill="url(#molten-grad)"
          opacity="0.25"
        />
        {/* Anvil body */}
        <path
          d="M28 64 L28 52 Q28 46 34 46 L62 46 Q68 46 68 52 L68 64 Z"
          fill="url(#molten-grad)"
          opacity="0.35"
          filter="url(#glow)"
        />
        {/* Anvil horn */}
        <path
          d="M28 52 Q22 52 18 56 Q22 60 28 60 Z"
          fill="url(#molten-grad)"
          opacity="0.3"
        />
        {/* Anvil face highlight */}
        <rect
          x="28" y="44" width="40" height="10"
          rx="2"
          fill="url(#molten-grad)"
          opacity="0.55"
          filter="url(#glow)"
        />
        {/* Hot surface glow */}
        <rect
          x="30" y="44" width="36" height="4"
          rx="1"
          fill="url(#molten-grad)"
          opacity="0.9"
        />

        {/* Ember sparks */}
        <circle cx="48" cy="28" r="2.5" fill="url(#molten-grad)" filter="url(#glow)" opacity="0.9" />
        <circle cx="58" cy="20" r="1.5" fill="#ffc24b" opacity="0.7" />
        <circle cx="38" cy="22" r="1.8" fill="#ff7a1a" filter="url(#glow)" opacity="0.8" />
        <circle cx="52" cy="14" r="1.2" fill="#ffc24b" opacity="0.5" />
        <circle cx="44" cy="34" r="1" fill="#ff7a1a" opacity="0.6" />
        <circle cx="62" cy="30" r="1.3" fill="#e5331b" opacity="0.5" />

        {/* Rising embers lines */}
        <line x1="48" y1="42" x2="48" y2="30" stroke="url(#molten-grad)" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
        <line x1="40" y1="42" x2="38" y2="24" stroke="#ff7a1a" strokeWidth="1" opacity="0.2" strokeLinecap="round" />
        <line x1="56" y1="42" x2="58" y2="22" stroke="#ffc24b" strokeWidth="1" opacity="0.2" strokeLinecap="round" />
      </svg>

      <h3 className="font-display text-2xl font-semibold text-[var(--forge-text)] mb-2 tracking-tight">
        Nothing forged yet
      </h3>
      <p className="font-mono text-sm text-[var(--forge-muted)] max-w-xs leading-relaxed">
        Describe something and forge it.
      </p>
    </div>
  );
}
