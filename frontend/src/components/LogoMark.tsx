/** PDFLock mark: a shield with a padlock. Uses currentColor so it follows the theme. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <rect width="32" height="32" rx="9" className="fill-accent-soft" />
      <path
        d="M16 5.5 7.5 8.8v6.6c0 5.3 3.6 9.2 8.5 11.1 4.9-1.9 8.5-5.8 8.5-11.1V8.8z"
        className="stroke-accent"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <rect x="12" y="14.2" width="8" height="6.3" rx="1.4" className="fill-accent" />
      <path d="M13.7 14.2v-1.7a2.3 2.3 0 0 1 4.6 0v1.7" className="stroke-accent" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
