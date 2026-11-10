import type { KeyboardEvent, FocusEvent } from "react"
const searches = new WeakMap<HTMLElement, { text: string; time: number }>()

/** Radix 1.7 reads document.activeElement, which is the host in a ShadowRoot.
 * Keep its semantics/state; handle only focus traversal inside our own shadow UI.
 */
export function shadowRovingFocus(
  event: KeyboardEvent<HTMLElement>,
  role: "tab" | "menuitem",
  dir: "ltr" | "rtl" = "ltr",
) {
  const root = event.currentTarget.getRootNode()
  if (
    !(root instanceof ShadowRoot) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return
  const current = root.activeElement
  const selector = role === "tab" ? '[role="tab"]' : '[role^="menuitem"]'
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(selector),
  )
    .filter(
      (item) =>
        !item.matches(':disabled,[aria-disabled="true"],[data-disabled]'),
    )
    .filter(
      (item) =>
        role === "tab" || item.closest('[role="menu"]') === event.currentTarget,
    )
  const index = items.indexOf(current as HTMLElement)
  if (index < 0 || !items.length) return
  let target: HTMLElement | undefined
  const next =
    role === "tab" ? (dir === "rtl" ? "ArrowLeft" : "ArrowRight") : "ArrowDown"
  const previous =
    role === "tab" ? (dir === "rtl" ? "ArrowRight" : "ArrowLeft") : "ArrowUp"
  if (event.key === next) target = items[(index + 1) % items.length]
  else if (event.key === previous)
    target = items[(index + items.length - 1) % items.length]
  else if (["Home", "PageUp"].includes(event.key)) target = items[0]
  else if (["End", "PageDown"].includes(event.key)) target = items.at(-1)
  else if (role === "menuitem" && event.key.length === 1 && event.key !== " ") {
    const previousSearch = searches.get(event.currentTarget)
    const time = Date.now()
    const text = (
      (previousSearch && time - previousSearch.time < 1000
        ? previousSearch.text
        : "") + event.key
    ).toLocaleLowerCase()
    searches.set(event.currentTarget, { text, time })
    const query = [...text].every((letter) => letter === text[0])
      ? text[0]
      : text
    const start = query.length === 1 ? index + 1 : index
    target = items
      .map((_, offset) => items[(start + offset) % items.length])
      .find((item) =>
        (item.dataset.platformTextValue ?? item.textContent ?? "")
          .trim()
          .toLocaleLowerCase()
          .startsWith(query),
      )
    event.preventDefault()
    event.stopPropagation()
  }
  if (!target) return
  event.preventDefault()
  event.stopPropagation()
  target.focus({ preventScroll: true })
}

export function shadowMenuEntry(event: FocusEvent<HTMLElement>) {
  const element = event.currentTarget
  if (event.target !== element) return
  if (!(element?.getRootNode() instanceof ShadowRoot)) return
  event.preventDefault()
  // Finish after Radix's synchronous entry traversal; its document-level focus
  // comparison otherwise walks every candidate within the same shadow host.
  queueMicrotask(() => {
    if (!element.isConnected) return
    element
      .querySelector<HTMLElement>(
        '[role^="menuitem"]:not([data-disabled]):not([aria-disabled="true"])',
      )
      ?.focus({ preventScroll: true })
  })
}

/** Native dialog remains the inert/top-layer owner. Explicit traversal also
 * covers WebKit's Tab boundary across the site's ShadowRoot and nested portals.
 */
export function trapDialogTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey)
    return
  const dialog = event.currentTarget
  const items = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href],button,input,select,textarea,[tabindex],[contenteditable="true"]',
    ),
  ).filter(
    (node) =>
      node.tabIndex >= 0 &&
      !node.matches(":disabled,[inert]") &&
      node.getClientRects().length > 0,
  )
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement)
    active = active.shadowRoot.activeElement
  const current = items.indexOf(active as HTMLElement)
  const next = event.shiftKey
    ? current <= 0
      ? items.length - 1
      : current - 1
    : (current + 1) % items.length
  event.preventDefault()
  ;(items[next] ?? dialog).focus({ preventScroll: true })
}
