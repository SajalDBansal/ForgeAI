export function SupabaseIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed multi-color gradient brand mark, must keep its real colors rather than next/image's optimizer output
    <img src="/supabase.svg" alt="" width={24} height={24} className={className} />
  )
}
