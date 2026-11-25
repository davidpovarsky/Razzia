import path from "node:path"
import config from "./vitest.recovery.config.mts"
// Explicit immutable control: original tests/source at assignment base, never own fixes.
const reference = "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-design-system-20261110"
export default {
  ...config,
  root: path.join(reference, "extensions"),
  resolve: { alias: {
    ...config.resolve.alias,
    "@razzia/common": path.join(reference, "packages/common/src"),
    "@razzia/extensions": path.join(reference, "extensions/src"),
  } },
  test: { ...config.test, include: ["src/server/media-library.test.ts"] },
}
