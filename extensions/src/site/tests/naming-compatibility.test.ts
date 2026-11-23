import { expect, expectTypeOf, it } from "vitest"
import {
  ShowStage,
  StageRendererAdapter,
  TadazzV4Stage,
  TadazzV4StageAdapter,
  type StageData,
  type TadazzV4Data,
} from "../../presentation"

it("semantic presentation exports preserve the exact historical component identities", () => {
  expect(ShowStage).toBe(TadazzV4Stage)
  expect(StageRendererAdapter).toBe(TadazzV4StageAdapter)
  expectTypeOf<StageData>().toEqualTypeOf<TadazzV4Data>()
})
