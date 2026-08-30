export function PreviewSkeleton() {
  return (
    <div className="p-8 space-y-4 animate-pulse">
      <div className="h-3 w-24 bg-surface-card rounded-sm" />
      <div className="h-8 w-2/3 bg-surface-card rounded-sm" />
      <div className="h-3 w-1/2 bg-surface-card rounded-sm" />
      <div className="h-3 w-2/5 bg-surface-card rounded-sm" />
      <div className="grid grid-cols-3 gap-3 mt-8">
        <div className="h-24 bg-surface-card rounded-sm" />
        <div className="h-24 bg-surface-card rounded-sm" />
        <div className="h-24 bg-surface-card rounded-sm" />
      </div>
      <div className="text-[11px] text-mute pt-4">[ booting preview… ]</div>
    </div>
  )
}
