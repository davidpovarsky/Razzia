import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import ManagerAuthBackground from "@razzia/web/features/manager/components/ManagerAuthBackground"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { billingRequest } from "./api"
import { openPaddleCheckout } from "./paddle-checkout"

export function AccountCheckoutPage({
  transactionId,
}: {
  transactionId: string
}) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    void billingRequest<{
      transactionId: string
      completed: boolean
      environment: "sandbox" | "live"
      clientToken: string
    }>(
      `/checkout/${encodeURIComponent(transactionId)}`,
      undefined,
      abort.signal,
    )
      .then(async (checkout) => {
        if (abort.signal.aborted) {
          return
        }

        setReady(true)

        if (!checkout.completed) {
          await openPaddleCheckout(checkout, () => {
            window.location.assign("/manager/config")
          })
        }
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : "extensions:billing.errors.unavailable",
          )
        }
      })

    return () => abort.abort()
  }, [transactionId])

  return (
    <ManagerAuthBackground>
      <Card className="gap-4">
        <h1 className="text-lg font-semibold">
          {t("extensions:billing.title")}
        </h1>
        {error ? (
          <p role="alert">{t(error)}</p>
        ) : (
          !ready && <p role="status">{t("extensions:billing.loading")}</p>
        )}
        <Button onClick={() => window.location.assign("/manager/config")}>
          {t("manager:configurationsTitle")}
        </Button>
      </Card>
    </ManagerAuthBackground>
  )
}
