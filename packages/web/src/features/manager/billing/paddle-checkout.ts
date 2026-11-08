interface Paddle {
  Environment: { set: (environment: "sandbox") => void }
  Initialize: (options: {
    token: string
    eventCallback: (event: { name: string }) => void
  }) => void
  Checkout: {
    open: (options: {
      transactionId: string
      settings: { displayMode: "overlay" }
    }) => void
  }
}
let loading: Promise<Paddle> | undefined = undefined
let initialized = ""
let onEvent: ((completed: boolean) => void) | undefined = undefined
function load(): Promise<Paddle> {
  loading ??= new Promise<Paddle>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js"
    script.async = true
    const timer = window.setTimeout(() => {
      script.remove()
      reject(new Error("extensions:billing.errors.providerUnavailable"))
    }, 15000)
    script.onload = () => {
      window.clearTimeout(timer)
      const paddle = (window as unknown as { Paddle?: Paddle }).Paddle

      if (paddle) {
        resolve(paddle)
      } else {
        reject(new Error("extensions:billing.errors.providerUnavailable"))
      }
    }
    script.onerror = () => {
      window.clearTimeout(timer)
      script.remove()
      reject(new Error("extensions:billing.errors.providerUnavailable"))
    }
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    loading = undefined
    throw error
  })

  return loading
}

export async function openPaddleCheckout(
  options: {
    environment: "sandbox" | "live"
    clientToken: string
    transactionId: string
  },
  refresh: (completed: boolean) => void,
) {
  const paddle = await load()
  onEvent = refresh
  const key = `${options.environment}:${options.clientToken}`

  if (initialized && initialized !== key) {
    throw new Error("extensions:billing.errors.configuration")
  }

  if (!initialized) {
    if (options.environment === "sandbox") {
      paddle.Environment.set("sandbox")
    }

    // oxlint-disable-next-line eslint/new-cap -- Paddle's documented SDK method is named Initialize.
    paddle.Initialize({
      token: options.clientToken,
      eventCallback: (event) => {
        if (
          event.name === "checkout.completed" ||
          event.name === "checkout.closed"
        ) {
          onEvent?.(event.name === "checkout.completed")
        }
      },
    })
    initialized = key
  }

  paddle.Checkout.open({
    transactionId: options.transactionId,
    settings: { displayMode: "overlay" },
  })
}
