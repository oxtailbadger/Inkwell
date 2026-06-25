export function QuillIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Ink drop at tip */}
      <ellipse cx="22" cy="98" rx="5" ry="7" fill="#1e293b" opacity="0.85" />
      <ellipse cx="22" cy="104" rx="3" ry="2" fill="#1e293b" opacity="0.4" />

      {/* Quill shaft */}
      <path
        d="M22 95 Q45 72 78 30"
        stroke="#92400e"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Main feather vane — right side */}
      <path
        d="M78 30 Q100 8 108 4 Q95 22 85 38 Q72 56 55 74 Q40 88 22 95 Q38 80 52 64 Q65 50 78 30Z"
        fill="#fef3c7"
        stroke="#d97706"
        strokeWidth="1"
      />

      {/* Main feather vane — left side */}
      <path
        d="M78 30 Q88 14 108 4 Q90 18 80 32 Q68 50 50 68 Q36 82 22 95 Q30 76 44 62 Q58 46 78 30Z"
        fill="#fde68a"
        stroke="#d97706"
        strokeWidth="0.8"
        opacity="0.7"
      />

      {/* Barb lines on right vane */}
      <path d="M78 30 Q68 44 55 58" stroke="#b45309" strokeWidth="0.7" opacity="0.5" />
      <path d="M85 22 Q74 36 60 50" stroke="#b45309" strokeWidth="0.7" opacity="0.5" />
      <path d="M92 14 Q80 28 66 42" stroke="#b45309" strokeWidth="0.7" opacity="0.5" />
      <path d="M100 8 Q87 20 73 35" stroke="#b45309" strokeWidth="0.7" opacity="0.4" />
      <path d="M70 38 Q60 52 46 66" stroke="#b45309" strokeWidth="0.7" opacity="0.5" />
      <path d="M62 48 Q52 62 38 76" stroke="#b45309" strokeWidth="0.7" opacity="0.5" />

      {/* Ink pool */}
      <ellipse cx="22" cy="98" rx="8" ry="3" fill="#0f172a" opacity="0.12" transform="rotate(-10 22 98)" />

      {/* Nib tip glint */}
      <circle cx="22" cy="94" r="1.2" fill="white" opacity="0.6" />
    </svg>
  );
}
