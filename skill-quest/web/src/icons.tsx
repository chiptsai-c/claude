export const Flame = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8.6 1c.3 2.2 2.9 3.6 2.9 6.7A3.6 3.6 0 0 1 8 11.4 3.5 3.5 0 0 1 4.5 8c0-1.3.6-2.3 1.3-3 .1 1.3.8 2 1.5 2.1C7.1 4.6 7.7 2.6 8.6 1ZM8 15a5 5 0 0 1-5-5c0-.7.1-1.3.4-1.9A4.9 4.9 0 0 0 8 12.6a4.9 4.9 0 0 0 4.6-4.5c.3.6.4 1.2.4 1.9a5 5 0 0 1-5 5Z" /></svg>
);
export const Star = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="m8 1 2.1 4.4 4.9.6-3.6 3.4.9 4.8L8 11.9l-4.3 2.3.9-4.8L1 6l4.9-.6L8 1Z" /></svg>
);
export const Speaker = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <path fill="currentColor" d="M2 6h2.5L8 3v10L4.5 10H2Z" />
    {on
      ? <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.3 6.3 0 0 1 0 9" />
      : <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="m10.5 6 4 4m0-4-4 4" />}
  </svg>
);
