import type { BillingService } from "./service"

export function startBillingMaintenance(service: BillingService) {
  let stopped = false,
    running = false,
    cursor = ""
  const inbox = setInterval(() => {
    try {
      service.inbox.drain()
    } catch {
      console.error("Billing inbox retry failed")
    }
  }, 10000)
  inbox.unref()
  // Bounded round-robin reconciliation. No provider requests in the game loop.
  const reconcile = setInterval(() => {
    if (stopped || running || !service.config.apiKey) {
      return
    }

    const row = service.database.sql
      .prepare(
        `SELECT tenant_id FROM billing_customers
      WHERE tenant_id>? ORDER BY tenant_id LIMIT 1`,
      )
      .get(cursor) as { tenant_id: string } | undefined

    if (!row) {
      cursor = ""

      return
    }

    cursor = row.tenant_id
    running = true
    void service
      .reconcile(row.tenant_id)
      .catch(() => console.error("Billing reconciliation failed"))
      .finally(() => {
        running = false
      })
  }, 60000)
  reconcile.unref()

  return () => {
    stopped = true
    clearInterval(inbox)
    clearInterval(reconcile)
  }
}
