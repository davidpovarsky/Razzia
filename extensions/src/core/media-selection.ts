import { ACCEPTED_MEDIA_TYPES } from "@razzia/common/constants"

export const getMediaUploadAccept = (
  acceptType?: "image" | "video" | "audio" | "all",
): string => {
  if (!acceptType || acceptType === "all") {
    return Object.entries(ACCEPTED_MEDIA_TYPES)
      .flatMap(([mime, { ext }]) => [mime, ext])
      .join(",")
  }

  return Object.entries(ACCEPTED_MEDIA_TYPES)
    .filter(([, { type }]) => type === acceptType)
    .flatMap(([mime, { ext }]) => [mime, ext])
    .join(",")
}

/** Same MIME/extension selection as the editor; the server validates file contents. */
export function matchesMediaUploadType(
  file: { type: string; name: string },
  acceptType?: "image" | "video" | "audio" | "all",
): boolean {
  if (!acceptType || acceptType === "all") {
    return true
  }

  const matchedEntry = Object.entries(ACCEPTED_MEDIA_TYPES).find(
    ([mime, { ext }]) =>
      file.type === mime || file.name.toLowerCase().endsWith(ext.toLowerCase()),
  )

  return matchedEntry?.[1].type === acceptType
}
