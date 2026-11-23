import { z } from "zod"
import { inputs, outputs } from "../../src/mcp-app/contracts/tools.ts"
import { previewCandidateV2Schema } from "../../src/mcp-app/contracts/preview-candidate-v2.ts"

export const retainedSelection = z.object({
  selection: inputs.preview_game,
  result: z.object({
    isError: z.literal(true),
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    structuredContent: outputs.preview_game,
    _meta: z.object({
      "tadazz/preview-candidate-v2": previewCandidateV2Schema,
    }),
  }),
})

export const retainedPacket = z.object({
  results: z.array(retainedSelection).min(1),
})
