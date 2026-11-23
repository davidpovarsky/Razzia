// Actual future-candidate graph/contribution receipt. Historical dd3 stays untouched.
import { writeFileSync } from "node:fs"
import base from "../../../../extensions/show-preview.vite.config.ts"
const graph = {
  name: "qa-native-build-receipt",
  generateBundle(
    this: {
      getModuleIds(): IterableIterator<string>
      getModuleInfo(id: string): {
        importedIds: readonly string[]
        dynamicallyImportedIds: readonly string[]
      } | null
    },
    _options: unknown,
    bundle: Record<
      string,
      {
        type: string
        fileName: string
        modules?: Record<string, Record<string, unknown>>
        imports?: string[]
        dynamicImports?: string[]
        facadeModuleId?: string | null
        isEntry?: boolean
      }
    >,
  ) {
    const modules = [...this.getModuleIds()].sort().map((id) => {
      const info = this.getModuleInfo(id)
      return {
        id,
        importedIds: [...(info?.importedIds ?? [])].sort(),
        dynamicallyImportedIds: [
          ...(info?.dynamicallyImportedIds ?? []),
        ].sort(),
      }
    })
    const outputs = Object.values(bundle).map((entry) => ({
      type: entry.type,
      fileName: entry.fileName,
      facadeModuleId: entry.facadeModuleId ?? null,
      isEntry: entry.isEntry ?? false,
      imports: entry.imports ?? [],
      dynamicImports: entry.dynamicImports ?? [],
      moduleContributions: Object.entries(entry.modules ?? {}).map(
        ([id, metadata]) => ({
          id,
          availableFields: Object.keys(metadata),
          renderedLength: metadata.renderedLength ?? null,
          originalLength: metadata.originalLength ?? null,
          renderedExports: metadata.renderedExports ?? null,
          removedExports: metadata.removedExports ?? null,
        }),
      ),
    }))
    writeFileSync(
      process.env.TADAZZ_NATIVE_RECEIPT_PATH ??
        "/out/native-module-receipt.json",
      JSON.stringify({ modules, outputs }, null, 2),
    )
  },
}
export { graph }
export default { ...base, plugins: [graph] }
