export function QuillIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M20.5 3.5c-4 .5-8.7 2.6-11.8 5.7C5.8 12 4.3 15.6 3.5 20.5c4.9-.8 8.5-2.3 11.3-5.2C17.9 12.2 20 7.5 20.5 3.5z"
        fill="var(--accent)"
      />
      <path
        d="M9.5 14.5L4 20"
        stroke="var(--accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
