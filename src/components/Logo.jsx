export function LogoIcon({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#085041"/>
      <path d="M18 26 Q40 14 62 26" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path d="M55 20 L62 26 L55 32" stroke="white" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M62 40 Q40 28 18 40" stroke="#5DCAA5" strokeWidth="5" strokeLinecap="round"/>
      <path d="M25 34 L18 40 L25 46" stroke="#5DCAA5" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M18 54 Q40 66 62 54" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path d="M55 48 L62 54 L55 60" stroke="white" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function LogoFull({ dark = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <LogoIcon size={36} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 700,
          fontSize: '20px',
          color: dark ? '#5DCAA5' : '#085041',
          letterSpacing: '-0.3px',
        }}>
          Biz<span style={{ color: dark ? '#9FE1CB' : '#0F6E56' }}>Flow</span>
        </span>
        <span style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 700,
          fontSize: '11px',
          color: 'white',
          background: '#0F6E56',
          padding: '1px 5px',
          borderRadius: '4px',
          letterSpacing: '0.5px',
        }}>MY</span>
      </div>
    </div>
  )
}

