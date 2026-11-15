# Pending pre-save identity contract

Source task `1219882508725158` stays OPEN. Current scope establishes quiz-save rollback intent **after** `StorageInjections.saveQuizz` returns its newly allocated ID. It attempts base and sidecar cleanup independently, surfaces cleanup errors, preserves rollback intent on uncertainty, and safely replays after restart. It cannot identify a base written by an interrupted `saveQuizz` before its return. No directory scan or guessed orphan deletion is introduced.

The real adapter is `packages/socket/src/services/config.ts:saveQuizz`: it validates input, mints a `nanoid`, derives a filename from subject, writes `{id, ...validatedData}` and then returns `{id}`. Its filename need not equal its ID. Existing same-title filename behavior is another reason never to infer ownership from a directory delta or title/digest alone.

Proposed additive adapter (NOT IMPLEMENTED / requires separate protected-path approval):

```ts
interface ReservedQuizCreation {
  id: string
  reservationToken: string // opaque, private, bound to exact tenant + new path
}
interface JournalCapableCreation {
  reserveQuizCreation(): ReservedQuizCreation // no base write
  writeReservedQuiz(reservation: ReservedQuizCreation, data: unknown): { id: string }
  abandonReservedQuiz(reservation: ReservedQuizCreation): void
}
```

The service reserves an ID/new noncolliding storage path first, persists a journal bound to tenant/reservation before any base write, writes only that reservation, then sidecar, then removes the journal. Retrying uses the same reservation; it must never overwrite a previously existing show, accept another tenant's token, follow a symlink, or delete a subsequently modified show. Keep existing `saveQuizz` callable unchanged for legacy callers. Public REST payloads/IDs and eight locales stay unchanged. The reservation is an internal server contract, never a public caller-selected storage path.

Required tests before adoption:

1. Terminate between reservation, journal rename, partial base write, base rename, sidecar write and journal removal; restart twice. Only the reserved base/sidecar are rolled back; unrelated same-title files stay byte-identical.
2. Fail reservation, journal creation, ENOSPC/EACCES base/sidecar writes and both cleanup operations. Retain journal + reservation on uncertainty and block startup; preserve actionable errors.
3. Reject foreign-tenant/replayed/forged reservations, ID/path traversal and changed reserved contents; never guess ownership or scan/delete candidates.
4. Verify original legacy `saveQuizz`, authenticated import/create, new question IDs and feature-off behavior remain compatible; independently review exact final SHA before closing acceptance.

No protected adapter source, startup caller or public API has been changed by this proposal.
