// Full-screen spinner shown while a route loads.
// Next.js uses it as the default loading state.
export default function LoadingComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div
          className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
          aria-label="Loading"
        />

        <h1 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
          Loading...
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Please wait while we load this page.
        </p>
      </div>
    </div>
  )
}
