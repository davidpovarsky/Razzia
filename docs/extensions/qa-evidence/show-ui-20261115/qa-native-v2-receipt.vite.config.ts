import base from "../../../../extensions/show-preview-v2.vite.config.ts"
import { graph } from "./qa-native-receipt.vite.config.ts"
export default { ...base, plugins: [...base.plugins, graph] }
