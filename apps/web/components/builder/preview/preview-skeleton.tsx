// Pulsing placeholder shown over the preview while the iframe loads.
// Removed once the iframe fires onLoad.
export function PreviewSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-8">
      <div className="bg-surface-card h-3 w-24 rounded-sm" />
      <div className="bg-surface-card h-8 w-2/3 rounded-sm" />
      <div className="bg-surface-card h-3 w-1/2 rounded-sm" />
      <div className="bg-surface-card h-3 w-2/5 rounded-sm" />
      <div className="mt-8 grid grid-cols-3 gap-3">
        <div className="bg-surface-card h-24 rounded-sm" />
        <div className="bg-surface-card h-24 rounded-sm" />
        <div className="bg-surface-card h-24 rounded-sm" />
      </div>
      <div className="text-mute pt-4 text-[11px]">[ booting preview… ]</div>
    </div>
  )
}
