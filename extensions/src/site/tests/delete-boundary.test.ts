import { describe, expect, it, vi } from "vitest"
import { CompositeStorageService } from "../../server/storage/service"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("site composite delete ownership boundary", () => {
  it("returns the existing not-found contract before touching absent/foreign data", () => {
    const remove = vi.fn()
    const service = new CompositeStorageService({
      getPath: (path) =>
        join(tmpdir(), "site-delete-test-never-created", path ?? ""),
      getQuizzById: () => {
        throw new Error("foreign or missing account quiz")
      },
      deleteQuizz: remove,
      updateQuizz: vi.fn(),
      saveQuizz: vi.fn(),
    })
    expect(() => service.deleteCompositeQuiz("foreign-quiz")).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    )
    expect(remove).not.toHaveBeenCalled()
  })
})
