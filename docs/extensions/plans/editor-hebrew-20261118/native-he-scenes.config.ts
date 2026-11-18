import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import base from "../../../../extensions/vitest.config.ts"
export default defineConfig({
  ...base,
  resolve: {alias: {...base.resolve?.alias, react: fileURLToPath(new URL("../../../../extensions/node_modules/react", import.meta.url)), "react-dom": fileURLToPath(new URL("../../../../extensions/node_modules/react-dom", import.meta.url)), "react-i18next": fileURLToPath(new URL("../../../../extensions/node_modules/react-i18next", import.meta.url))}},
  root: fileURLToPath(new URL("../../../../", import.meta.url)),
  test: { include: ["docs/extensions/plans/editor-hebrew-20261118/native-he-scenes.fixture.test.ts"], testTimeout: 30000 },
})
