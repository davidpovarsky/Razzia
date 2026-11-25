"""Keep synthetic storage adapters genuinely promise-returning, without async shims."""
from pathlib import Path

root = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115/extensions/src/core/show-library')
path = root / 'composition-repository.test.ts'
source = path.read_text()
start, end = source.index('class MemoryStorage'), source.index('\ndescribe(', source.index('class MemoryStorage'))
source = source[:start] + '''class MemoryStorage implements CompositionStorage {
  drafts = new Map<string, CompositionDraftRecord>()
  versions = new Map<string, CompositionPublication>()
  beforePublish: (() => void) | undefined
  id = (recordKey: CompositionDraftKey) => JSON.stringify([recordKey.tenantId, recordKey.draftId])
  readDraft(recordKey: CompositionDraftKey) { return Promise.resolve(this.drafts.get(this.id(recordKey)) ?? null) }
  compareAndSwapDraft(recordKey: CompositionDraftKey, expected: number | null, next: CompositionDraftRecord) {
    const id = this.id(recordKey), current = this.drafts.get(id)
    if ((current?.revision ?? null) !== expected) { return Promise.resolve(false) }
    this.drafts.set(id, structuredClone(next))
    return Promise.resolve(true)
  }
  readVersion(recordKey: CompositionDraftKey, version: string) { return Promise.resolve(this.versions.get(`${this.id(recordKey)}:${version}`) ?? null) }
  publishIfRevision(recordKey: CompositionDraftKey, expected: number, next: CompositionPublication) {
    this.beforePublish?.()
    if (this.drafts.get(this.id(recordKey))?.revision !== expected) { return Promise.resolve("revision-conflict" as const) }
    const id = `${this.id(recordKey)}:${next.version}`
    if (this.versions.has(id)) { return Promise.resolve("version-exists" as const) }
    this.versions.set(id, structuredClone(next))
    return Promise.resolve("stored" as const)
  }
}
''' + source[end:]
source = source.replace('const family = getNativeShowLibrary().families[0]', 'const [family] = getNativeShowLibrary().families')
path.write_text(source, newline='\n')
path = root / 'composition-preview-v2.test.ts'
source = path.read_text()
start, end = source.index('class SyntheticStorage'), source.index('\ndescribe(', source.index('class SyntheticStorage'))
source = source[:start] + '''class SyntheticStorage<Document> implements CompositionStorage<Document> {
  drafts = new Map<string, CompositionDraftRecord<Document>>()
  versions = new Map<string, CompositionPublication<Document>>()
  key = (recordKey: CompositionDraftKey) => JSON.stringify([recordKey.tenantId, recordKey.draftId])
  readDraft(recordKey: CompositionDraftKey) { return Promise.resolve(this.drafts.get(this.key(recordKey)) ?? null) }
  compareAndSwapDraft(recordKey: CompositionDraftKey, expected: number | null, next: CompositionDraftRecord<Document>) {
    if ((this.drafts.get(this.key(recordKey))?.revision ?? null) !== expected) { return Promise.resolve(false) }
    this.drafts.set(this.key(recordKey), structuredClone(next))
    return Promise.resolve(true)
  }
  readVersion(recordKey: CompositionDraftKey, version: string) { return Promise.resolve(this.versions.get(`${this.key(recordKey)}:${version}`) ?? null) }
  publishIfRevision(recordKey: CompositionDraftKey, expected: number, next: CompositionPublication<Document>) {
    if (this.drafts.get(this.key(recordKey))?.revision !== expected) { return Promise.resolve("revision-conflict" as const) }
    const id = `${this.key(recordKey)}:${next.version}`
    if (this.versions.has(id)) { return Promise.resolve("version-exists" as const) }
    this.versions.set(id, structuredClone(next))
    return Promise.resolve("stored" as const)
  }
}
''' + source[end:]
source = source.replace('const card = preview.draft.show.cards[2]', 'const [, , card] = preview.draft.show.cards')
source = source.replace('expect(JSON.parse(f.input.authoredShowJson).defaults).toBeUndefined()', 'expect(JSON.parse(f.input.authoredShowJson)).not.toHaveProperty("defaults")')
path.write_text(source, newline='\n')
path = root / 'native-preview-frame-schema.ts'
path.write_text(path.read_text().replace('.finite()', ''), newline='\n')
print('Updated only owned test adapters and removed deprecated no-op finite calls')
