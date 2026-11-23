/** Internal preview identity successor. Authored keys are never migrated. */
export const SHOW_PREVIEW_PORT_VERSION = 3 as const

export const SHOW_PREVIEW_IDENTITY_RULE_VERSION = 2 as const

export const SHOW_PREVIEW_IDENTITY_ENCODING = "utf16-hex-v2" as const

export function encodeIdentityKey(key: string): string {
  let encoded = ""
  for (let i = 0; i < key.length; i += 1) {
    encoded += key.charCodeAt(i).toString(16).padStart(4, "0")
  }

  return encoded
}

export function compareIdentityKeys(left: string, right: string): number {
  const a = encodeIdentityKey(left),
    b = encodeIdentityKey(right)

  if (a < b) {
    return -1
  }

  if (a > b) {
    return 1
  }

  return 0
}

export function identityPreimage(
  kind: "card" | "question" | "scene",
  key: string,
): string {
  return `${kind}\0${SHOW_PREVIEW_IDENTITY_ENCODING}\0${encodeIdentityKey(key)}`
}
