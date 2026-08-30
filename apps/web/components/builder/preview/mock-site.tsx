function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hairline rounded-sm p-3">
      <div className="text-mute">{label}</div>
      <div className="mt-1 font-bold text-lg">{value}</div>
    </div>
  )
}

export function MockSite({ device }: { device: string }) {
  const isMobile = device === "mobile"
  return (
    <div className="text-ink">
      <header className="px-5 py-3 hairline-b flex items-center gap-4">
        <div className="font-bold text-sm">
          ledger<span className="text-mute">.io</span>
        </div>
        {!isMobile && (
          <nav className="text-xs text-body flex gap-4">
            <span>Product</span>
            <span>Pricing</span>
            <span>Customers</span>
            <span>Docs</span>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-mute hidden sm:inline">Sign in</span>
          <span className="h-7 px-3 bg-ink text-on-primary text-xs rounded-sm grid place-items-center">Start free</span>
        </div>
      </header>
      <section className="px-5 md:px-10 py-10 md:py-16">
        <div className="text-[11px] text-mute mb-3">[+] Now — 13-week forecasting</div>
        <h1 className={`font-bold leading-tight ${isMobile ? "text-2xl" : "text-4xl md:text-5xl"}`}>
          Ledger-grade finance,
          <br /> built for modern teams.
        </h1>
        <p className="mt-4 text-body max-w-lg text-sm md:text-base">
          Reconcile in minutes. Forecast in hours. Close the books before lunch — without a
          single spreadsheet.
        </p>
        <div className="mt-6 flex gap-2">
          <span className="h-8 px-4 bg-ink text-on-primary text-xs rounded-sm grid place-items-center">Start free</span>
          <span className="h-8 px-4 border border-hairline-strong text-xs rounded-sm grid place-items-center">Book a demo</span>
        </div>
        <div className="mt-8 text-[11px] text-mute">Trusted by finance teams at Northwind · Acme · Foundry · Cobalt</div>
      </section>
      <section className="px-5 md:px-10 py-10 hairline-t">
        <div className="text-xs font-bold mb-4">What is Ledger?</div>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-3">
            <span className="text-mute">[+]</span>
            <span>
              <b>Auto-reconcile</b> — match bank lines to invoices in real time.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-mute">[+]</span>
            <span>
              <b>Forecasting</b> — 13-week cash forecast updated on every entry.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-mute">[+]</span>
            <span>
              <b>Audit trail</b> — every change attributable, exportable, signed.
            </span>
          </li>
        </ul>
      </section>
      <section className="px-5 md:px-10 py-10 hairline-t grid sm:grid-cols-3 gap-4 text-xs">
        <Stat label="Books closed in" value="3.2 days" />
        <Stat label="Reconciled lines" value="98.4%" />
        <Stat label="Avg. team size" value="2 people" />
      </section>
      <footer className="px-5 md:px-10 py-6 hairline-t text-[11px] text-mute">© 2026 Ledger · Privacy · Terms</footer>
    </div>
  )
}
