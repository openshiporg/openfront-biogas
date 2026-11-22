/* Hand-drawn-style marks and step pictures, in the Terracotta palette. Pure SVG, no text inside. */

type P = { className?: string }

export function LogoMark({ className = 'h-10 w-14' }: P) {
  return (
    <svg viewBox="0 0 64 44" className={className} aria-hidden="true">
      <path d="M6 38c0-14 11.6-24 26-24s26 10 26 24z" fill="#c95a2b" />
      <path d="M10 38c1-10 9.5-18 22-18" stroke="#e98a5b" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="2" y="37" width="60" height="5" rx="2.5" fill="#123316" />
      <path d="M32 15V5" stroke="#123316" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 9c0-5 4-8 10-8-1 6-4 9-10 8z" fill="#3c6e1f" />
      <path d="M32 11c0-4-3-6-8-6 1 5 3 7 8 6z" fill="#5f901c" />
    </svg>
  )
}

export function Check({ className = 'h-5 w-5' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#d4df8a" />
      <path d="M7 12.5l3.2 3.2L17 9" stroke="#123316" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Arrow({ className = 'h-5 w-5' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  )
}

const Blob = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 200 140" className="h-auto w-full max-w-[200px]" aria-hidden="true">
    <path d="M22 70c-4-38 28-62 78-62s86 18 86 56-22 70-88 70S26 108 22 70z" fill="#e9eddb" />
    {children}
  </svg>
)

export function StepSurvey() {
  return (
    <Blob>
      <path d="M30 118c30-10 110-12 150 0" stroke="#7aa23a" strokeWidth="10" strokeLinecap="round" fill="none" />
      <rect x="44" y="20" width="58" height="84" rx="8" fill="#fffdf8" stroke="#123316" strokeWidth="4" />
      <rect x="60" y="13" width="26" height="14" rx="4" fill="#5f901c" stroke="#123316" strokeWidth="3" />
      {[40, 58, 76].map(y => (
        <g key={y}>
          <path d={`M54 ${y}l5 5 8-9`} stroke="#5f901c" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M74 ${y + 2}h20`} stroke="#123316" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      ))}
      <path d="M116 78l22-18 22 18v28h-44z" fill="#f3d9a6" stroke="#123316" strokeWidth="4" strokeLinejoin="round" />
      <path d="M110 80l28-24 28 24" stroke="#b04418" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="132" y="86" width="12" height="20" fill="#b04418" />
      <circle cx="176" cy="74" r="16" fill="#5f901c" />
      <rect x="173" y="86" width="6" height="22" fill="#745a46" />
    </Blob>
  )
}

export function StepInstall() {
  return (
    <Blob>
      <path d="M26 112c40-8 108-8 150 0v10H26z" fill="#c98a5b" />
      <path d="M58 112c0-26 19-44 43-44s43 18 43 44z" fill="#c95a2b" stroke="#123316" strokeWidth="4" />
      <path d="M68 104c2-16 14-28 30-30" stroke="#e98a5b" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="44" cy="44" r="9" fill="#8a5a3c" />
      <path d="M36 37c2-7 14-7 16 0z" fill="#1f4a23" />
      <path d="M44 54l-6 32M44 54l14 22M38 86l-4 22M38 86l12 20" stroke="#123316" strokeWidth="5" strokeLinecap="round" />
      <path d="M44 58l-10 18" stroke="#3b6aa0" strokeWidth="10" strokeLinecap="round" />
      <circle cx="160" cy="44" r="9" fill="#8a5a3c" />
      <path d="M152 37c2-7 14-7 16 0z" fill="#1f4a23" />
      <path d="M160 58l10 18" stroke="#3b6aa0" strokeWidth="10" strokeLinecap="round" />
      <path d="M160 54l4 32M160 54l-14 22M164 86l4 22M164 86l-12 20" stroke="#123316" strokeWidth="5" strokeLinecap="round" />
    </Blob>
  )
}

export function StepTeach() {
  return (
    <Blob>
      {[
        { x: 52, skin: '#8a5a3c', shirt: '#5f901c', hair: '#1c1c1c' },
        { x: 92, skin: '#a66a45', shirt: '#c95a2b', hair: '#2a1a12' },
      ].map(p => (
        <g key={p.x}>
          <circle cx={p.x} cy="56" r="15" fill={p.skin} />
          <path d={`M${p.x - 16} 52c0-14 32-14 32 0-6-6-26-6-32 0z`} fill={p.hair} />
          <path d={`M${p.x - 24} 122c0-28 10-42 24-42s24 14 24 42z`} fill={p.shirt} stroke="#123316" strokeWidth="3" />
        </g>
      ))}
      <circle cx="150" cy="50" r="16" fill="#8a5a3c" />
      <path d="M132 44c2-14 34-14 36 0z" fill="#123316" />
      <path d="M124 122c0-30 12-46 26-46s26 16 26 46z" fill="#fffdf8" stroke="#123316" strokeWidth="3" />
      <path d="M128 100c-8-6-14-10-22-8" stroke="#8a5a3c" strokeWidth="8" strokeLinecap="round" fill="none" />
      <circle cx="160" cy="96" r="4" fill="#b04418" />
    </Blob>
  )
}

export function StepService() {
  return (
    <Blob>
      <rect x="48" y="22" width="96" height="92" rx="12" fill="#fffdf8" stroke="#123316" strokeWidth="4" />
      <path d="M48 46h96v-12a12 12 0 0 0-12-12H60a12 12 0 0 0-12 12z" fill="#5f901c" stroke="#123316" strokeWidth="4" />
      <path d="M70 14v18M122 14v18" stroke="#123316" strokeWidth="6" strokeLinecap="round" />
      {[62, 82, 102, 122].map(x => [62, 80, 98].map(y => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="8" rx="2" fill={x === 102 && y === 80 ? '#b04418' : '#dfe6cc'} />))}
      <path d="M136 120l30-30" stroke="#5f901c" strokeWidth="10" strokeLinecap="round" />
      <path d="M160 82a12 12 0 1 0 14 14l-8-2-4-4z" fill="#5f901c" stroke="#123316" strokeWidth="3" />
      <path d="M176 64l4-8M184 74l8-3M168 60l-1-9" stroke="#e8a33a" strokeWidth="3" strokeLinecap="round" />
    </Blob>
  )
}

export function IconFlame({ className = 'h-10 w-10' }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M24 4c3 9 14 14 14 27a14 14 0 0 1-28 0c0-7 4-11 6-14 1 5 3 7 5 8-1-9 1-15 3-21z" fill="#e8742a" />
      <path d="M24 24c2 5 7 7 7 13a7 7 0 0 1-14 0c0-4 3-6 4-8 1 2 2 3 3 3 0-3 0-5 0-8z" fill="#f6c14a" />
    </svg>
  )
}
export function IconSprout({ className = 'h-10 w-10' }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M6 44c4-8 32-8 36 0z" fill="#745a46" />
      <path d="M24 40V20" stroke="#3c6e1f" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M24 24c0-10 8-16 18-16-1 10-8 16-18 16z" fill="#5f901c" />
      <path d="M24 28c0-8-6-13-15-13 1 8 6 13 15 13z" fill="#7aa23a" />
    </svg>
  )
}
export function IconBin({ className = 'h-10 w-10' }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="8" y="9" width="32" height="6" rx="2" fill="#3c6e1f" />
      <rect x="19" y="4" width="10" height="6" rx="2" fill="#3c6e1f" />
      <path d="M11 16h26l-3 28H14z" fill="#5f901c" />
      <path d="M18 21v18M24 21v18M30 21v18" stroke="#e9eddb" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
export function IconLeaf({ className = 'h-10 w-10' }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M8 40C8 18 22 6 44 6c0 22-12 36-34 36z" fill="#5f901c" />
      <path d="M8 40L32 16" stroke="#e9eddb" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function IconPeople({ className = 'h-7 w-7' }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="#d0622f">
      <circle cx="16" cy="9" r="4.5" /><circle cx="7" cy="11" r="3.5" /><circle cx="25" cy="11" r="3.5" />
      <path d="M8 26c0-6 3.5-10 8-10s8 4 8 10z" /><path d="M1 26c0-5 2.5-8 6-8 1.5 0 2.5.4 3.5 1-2 2-3 4.5-3 7z" /><path d="M31 26c0-5-2.5-8-6-8-1.5 0-2.5.4-3.5 1 2 2 3 4.5 3 7z" />
    </svg>
  )
}
export function IconMedal({ className = 'h-7 w-7' }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="13" r="10" fill="none" stroke="#d0622f" strokeWidth="3" />
      <path d="M10 22l-3 8 5-2 3 3 1-8M22 22l3 8-5-2-3 3-1-8" fill="#d0622f" />
      <path d="M12 13l3 3 5-6" stroke="#d0622f" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}
export function IconHands({ className = 'h-7 w-7' }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none" stroke="#d0622f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14l6-6 6 3 4-2 6 1 6 5" /><path d="M8 8l-4 10 8 8 3-3 3 3 3-3 3 3 4-5-6-6" /><path d="M14 11l-3 4 3 2 4-4" />
    </svg>
  )
}
export function IconLeafSmall({ className = 'h-7 w-7' }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M4 28C4 14 14 4 30 4c0 15-9 24-26 24z" fill="#e8742a" />
      <path d="M4 28L20 12" stroke="#fff3ea" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconPhone({ className = 'h-4 w-4' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" />
    </svg>
  )
}
export function IconMail({ className = 'h-4 w-4' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4.4 7H4v.6l8 5.4 8-5.4V7h-.4z" />
    </svg>
  )
}
export function IconPin({ className = 'h-4 w-4' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  )
}
export function IconChat({ className = 'h-4 w-4' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5 13.6c-.2.6-1.2 1.1-1.7 1.2-.5.1-1 .1-3.2-.8-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.6-.3.3c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.3z" />
    </svg>
  )
}
export function IconCart({ className = 'h-6 w-6' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21.5 8H6" />
    </svg>
  )
}
export function IconUser({ className = 'h-6 w-6' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  )
}
export function IconMenu({ className = 'h-6 w-6' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}
export function IconClose({ className = 'h-6 w-6' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
