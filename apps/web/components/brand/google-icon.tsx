// Google's multi-color mark.
// Used on the Google sign-in button.
export function GoogleIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed multi-color brand mark, must keep its real colors rather than next/image's optimizer output
    <img
      src="/google.svg"
      alt=""
      width={16}
      height={16}
      className={className}
    />
  )
}
