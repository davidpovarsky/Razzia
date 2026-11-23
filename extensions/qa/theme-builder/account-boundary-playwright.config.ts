import base from "./playwright.config.ts"

export default {
  ...base,
  testMatch: "account-boundary.spec.ts",
  outputDir:
    process.env.TADAZZ_BOUNDARY_BASELINE === "1"
      ? "/out/boundary-baseline-results"
      : "/out/boundary-fixed-results",
}
