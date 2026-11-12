export function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#0F172A" />
      <circle cx="15" cy="13" r="2.6" fill="#2F5BEA" />
      <circle cx="23" cy="13" r="2.6" fill="#2F5BEA" />
      <circle cx="31" cy="13" r="2.6" fill="#2F5BEA" />
      <path d="M21 22 V51" stroke="#FFFFFF" strokeWidth="6.5" strokeLinecap="round" fill="none" />
      <circle cx="34" cy="40" r="11" stroke="#FFFFFF" strokeWidth="6.5" fill="none" />
      <path d="M47 49 L53 49" stroke="#2F5BEA" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
