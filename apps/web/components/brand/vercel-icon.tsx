// Vercel triangle as an inline SVG that inherits text color.
// Used on the Vercel connection card.
export function VercelIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -17 256 256"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <polygon points="128 0 256 221.705007 0 221.705007" />
    </svg>
  )
}
