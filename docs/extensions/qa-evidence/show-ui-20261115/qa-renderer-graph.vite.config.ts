// QA-only graph receipt; uses the unchanged production candidate build config.
import { writeFileSync } from "node:fs"
import base from "../../../../extensions/show-preview.vite.config"

const graph = {
  name: "qa-preview-module-graph",
  generateBundle(this: { getModuleIds(): IterableIterator<string>; getModuleInfo(id: string): { importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] } | null }) {
    const ids = [...this.getModuleIds()].sort()
    const modules = ids.map((id) => {
      const info = this.getModuleInfo(id)
      return { id, importedIds: [...(info?.importedIds ?? [])].sort(), dynamicallyImportedIds: [...(info?.dynamicallyImportedIds ?? [])].sort() }
    })
    writeFileSync("/out/renderer-module-graph.json", JSON.stringify({ modules }))
  },
}
export default { ...base, plugins: [graph] }
