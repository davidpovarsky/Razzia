// Sole producer entry point for the new pure preview foundation.
// No presentation runtime, socket, transport, filesystem or audio owner is exported.
export * from "./primitives"
export * from "./preview-schemas"
export * from "./identity"
export * from "./manifest"
export * from "./preview-resolve"
export * from "./projection-schema"
export { projectShowBindings } from "./projection"
export { canonicalJson, sha256 } from "./digest"

export * from "./identity-rule"
export type { PreviewProjectionBinding } from "./projection"

export * from "./stage-metadata-schema"
export * from "./stage-metadata"
