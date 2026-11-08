/** English copy explicitly requested for the client's host. */
export function HostQuickGuide() {
  const shortcuts = [
    ["→ ×2", "Next / skip question"],
    ["← ×2", "Go back"],
    ["Space ×2", "Pause / resume"],
    ["Enter ×2", "End timer / reveal results"],
    ["R ×2", "Restart question / clear answers"],
    ["Esc", "Exit presentation (one tap)"],
  ]
  return (
    <section className="host-quick-guide" lang="en" dir="ltr" aria-label="Host quick guide" data-testid="tadazz-lobby-host-guide">
      <h2>HOST QUICK GUIDE</h2>
      <p>Click <strong>Present from Host</strong> for fullscreen. Click an empty area before using shortcuts.</p>
      <dl>
        {shortcuts.map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}
      </dl>
      <p className="guide-note">Tap twice within <strong>0.5 seconds</strong>; do not hold the key. The keyboard icon opens help.</p>
    </section>
  )
}
