/** Le racer : une tête et une queue ondulée. Sert de logo et de pion dans la grille. */
export function Swimmer({ color = "currentColor", className = "swimmer" }: { color?: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M17.5 15.5c-2 1.2-2.4 3.4-4.4 4.4s-3.3-.6-5.2.7-1.2 3.6-3.1 4.9"
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <ellipse cx="22" cy="11.5" rx="6.2" ry="5" transform="rotate(-38 22 11.5)" fill={color} />
    </svg>
  );
}
