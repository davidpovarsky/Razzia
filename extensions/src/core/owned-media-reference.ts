/**
 * Parse a flat owner media reference without changing its authored fragment.
 * This is a syntax boundary; the caller must still authorize the owner and bytes.
 */
export function ownedMediaPath(reference: string): string | null {
  if (reference.length > 2048) {
    return null
  }

  // Fragments stay client-side. Admit RFC 3986 characters and complete escapes,
  // excluding raw quotes, markup delimiters, backslashes and whitespace.
  const match =
    /^(\/media\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp|gif|mp4|webm|mp3|ogg|wav|m4a|json|lottie))(?:#(?:[A-Za-z0-9._~!$&()*+,;=:@/?-]|%[A-Fa-f0-9]{2})*)?$/u.exec(
      reference,
    )

  if (!match || match[0] !== reference) {
    return null
  }

  return match[1]
}
