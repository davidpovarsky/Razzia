import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps"
import { mountCompositionPreviewCandidateV2 } from "../../presentation/show-library-preview/renderer-entry-v2"
import { createWidgetBridgeCore } from "./bridge-core.ts"

export function createWidgetBridge(
  onContext: (context: McpUiHostContext) => void,
) {
  return createWidgetBridgeCore(onContext, mountCompositionPreviewCandidateV2)
}
