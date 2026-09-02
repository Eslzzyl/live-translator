export function AppLogo({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3.5 10v4" />
      <path d="M7.5 5v14" />
      <path d="M11.5 7.5v9" />
      <path d="M16 7.5h5" />
      <path d="M16 12h3.5" />
      <path d="M16 16.5h5" />
    </svg>
  );
}
