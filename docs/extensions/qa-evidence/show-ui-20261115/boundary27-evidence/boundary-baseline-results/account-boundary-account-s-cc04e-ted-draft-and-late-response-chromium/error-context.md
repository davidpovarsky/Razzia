# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: account-boundary.spec.ts >> account switch isolates edited draft and late response
- Location: qa/theme-builder/account-boundary.spec.ts:14:62

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - link "Back to Studio" [ref=e5] [cursor=pointer]:
      - /url: /studio
    - status [ref=e6]: Loading themes…
  - main [ref=e8]:
    - generic [ref=e9]:
      - heading "Tadazz · Theme Builder" [level=1] [ref=e10]
      - button "Create blank" [ref=e11] [cursor=pointer]
      - button "Duplicate" [ref=e13] [cursor=pointer]
      - button "Save draft" [ref=e15] [cursor=pointer]
      - button "Undo" [ref=e17] [cursor=pointer]
      - button "Redo" [disabled] [ref=e19]
      - button "Revert to saved" [ref=e21] [cursor=pointer]
      - button "Validate" [ref=e23] [cursor=pointer]
      - button "Publish" [disabled] [ref=e25]
      - button "Rollback" [disabled] [ref=e27]
    - status [ref=e29]: Unsaved changes
    - generic [ref=e30]:
      - generic [ref=e31]: Theme name
      - textbox "Theme name" [active] [ref=e32]: Private tenant-a edited
    - generic [ref=e33]:
      - generic [ref=e34]:
        - generic [ref=e35]: Role scope
        - combobox "Role scope" [ref=e36]:
          - option "All roles" [selected]
          - option "Manager"
          - option "Player"
          - option "Spectator"
      - generic [ref=e37]:
        - generic [ref=e38]: Layout plan
        - combobox "Layout plan" [ref=e39]:
          - option "16:9" [selected]
          - option "4:3"
          - option "Small"
    - generic [ref=e40]:
      - generic [ref=e41]:
        - heading "Library" [level=2] [ref=e42]
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: Screens
            - combobox "Screens" [ref=e46]:
              - option "Select"
              - option "test-template" [selected]
          - group [ref=e47]:
            - generic "Components" [ref=e48]
          - group [ref=e49]:
            - generic "Effects" [ref=e50]
          - group [ref=e51]:
            - generic "Assets" [ref=e52]
        - heading "Component tree" [level=2] [ref=e53]
        - tree "Component tree" [ref=e54]:
          - treeitem "root-view" [expanded] [level=1] [selected] [ref=e55] [cursor=pointer]
          - group [ref=e56]:
            - treeitem "decoration-view" [level=2] [ref=e57] [cursor=pointer]
            - treeitem "decoration-view" [level=2] [ref=e58] [cursor=pointer]
      - generic [ref=e59]:
        - heading "Layout plan" [level=2] [ref=e60]
        - generic [ref=e62]:
          - text: root-view
          - generic [ref=e63]:
            - generic [ref=e64]: decoration-view
            - generic [ref=e65]: decoration-view
        - paragraph [ref=e66]: Publishing and live preview require an approved renderer and package.
        - region "Show preview" [ref=e68]:
          - heading "Show preview" [level=2] [ref=e69]
          - paragraph [ref=e70]: Demonstration only. No audience or votes.
          - status [ref=e72]: Preview is unavailable until the renderer is verified.
          - generic [ref=e73]:
            - generic [ref=e74]:
              - generic [ref=e75]: View
              - combobox "View" [disabled] [ref=e76]:
                - option "Spectator" [selected]
                - option "Manager"
            - generic [ref=e77]:
              - generic [ref=e78]: Stage
              - combobox "Stage" [disabled] [ref=e79]:
                - option "Question" [selected]
                - option "Answer choices"
                - option "Voting"
                - option "Voting closed"
                - option "Results"
            - button "Play" [disabled] [ref=e80]
            - button "Pause" [disabled] [ref=e82]
            - button "Replay" [disabled] [ref=e84]
      - generic [ref=e86]:
        - heading "Properties" [level=2] [ref=e87]
        - generic [ref=e88]:
          - paragraph [ref=e89]: root-view
          - generic [ref=e90]:
            - generic [ref=e91]: Layout plan
            - combobox "Layout plan" [ref=e92]:
              - option "Flow" [selected]
              - option "Grid"
              - option "Safe overlay"
          - generic [ref=e93]:
            - generic [ref=e94]: Alignment
            - combobox "Alignment" [ref=e95]:
              - option "Start"
              - option "Centre" [selected]
              - option "End"
          - generic [ref=e96]:
            - generic [ref=e97]: Spacing
            - combobox "Spacing" [ref=e98]:
              - option "None"
              - option "Small" [selected]
              - option "Medium"
              - option "Large"
          - generic [ref=e99]:
            - generic [ref=e100]: Image fit
            - combobox "Image fit" [ref=e101]:
              - option "Inherited" [selected]
              - option "Contain"
              - option "Cover"
          - button "Reset to inherited" [ref=e102] [cursor=pointer]
          - button "Remove" [disabled] [ref=e104]
    - group [ref=e107]:
      - generic "Screens · 15 / Audio · 16" [ref=e108]
      - group "Screens" [ref=e109]:
        - generic [ref=e111]:
          - generic [ref=e112]:
            - generic [ref=e113]: Loading
            - combobox "Loading" [ref=e114]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e115]:
            - generic [ref=e116]: Opening
            - combobox "Opening" [ref=e117]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e118]:
            - generic [ref=e119]: Joining and lobby
            - combobox "Joining and lobby" [ref=e120]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e121]:
            - generic [ref=e122]: Question
            - combobox "Question" [ref=e123]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e124]:
            - generic [ref=e125]: Answer cards
            - combobox "Answer cards" [ref=e126]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e127]:
            - generic [ref=e128]: Voting
            - combobox "Voting" [ref=e129]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e130]:
            - generic [ref=e131]: Timer
            - combobox "Timer" [ref=e132]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e133]:
            - generic [ref=e134]: Vote lock
            - combobox "Vote lock" [ref=e135]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e136]:
            - generic [ref=e137]: Results
            - combobox "Results" [ref=e138]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e139]:
            - generic [ref=e140]: Leaderboard
            - combobox "Leaderboard" [ref=e141]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e142]:
            - generic [ref=e143]: Rank change
            - combobox "Rank change" [ref=e144]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e145]:
            - generic [ref=e146]: ZZ transition
            - combobox "ZZ transition" [ref=e147]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e148]:
            - generic [ref=e149]: Interlude
            - combobox "Interlude" [ref=e150]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e151]:
            - generic [ref=e152]: Closing
            - combobox "Closing" [ref=e153]:
              - option "Inherited" [selected]
              - option "Theme default"
          - generic [ref=e154]:
            - generic [ref=e155]: Personal result
            - combobox "Personal result" [ref=e156]:
              - option "Inherited" [selected]
              - option "Theme default"
      - group "Audio" [ref=e157]:
        - generic [ref=e159]:
          - generic [ref=e160]:
            - generic [ref=e161]: Opening
            - combobox "Opening" [ref=e162]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
          - generic [ref=e163]:
            - generic [ref=e164]: Lobby
            - combobox "Lobby" [ref=e165]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Theme default"
          - generic [ref=e166]:
            - generic [ref=e167]: Question entrance
            - combobox "Question entrance" [ref=e168]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e169]:
            - generic [ref=e170]: Voting music
            - combobox "Voting music" [ref=e171]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e172]:
            - generic [ref=e173]: Answer selection
            - combobox "Answer selection" [ref=e174]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
          - generic [ref=e175]:
            - generic [ref=e176]: Answer submission
            - combobox "Answer submission" [ref=e177]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e178]:
            - generic [ref=e179]: Timer warning
            - combobox "Timer warning" [ref=e180]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
              - option "Theme default"
              - option "Theme default"
          - generic [ref=e181]:
            - generic [ref=e182]: Timer expired
            - combobox "Timer expired" [ref=e183]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e184]:
            - generic [ref=e185]: Voting locked
            - combobox "Voting locked" [ref=e186]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e187]:
            - generic [ref=e188]: Result reveal
            - combobox "Result reveal" [ref=e189]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
              - option "Theme default"
              - option "Theme default"
              - option "Theme default"
              - option "Theme default"
              - option "Theme default"
          - generic [ref=e190]:
            - generic [ref=e191]: Leaderboard
            - combobox "Leaderboard" [ref=e192]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e193]:
            - generic [ref=e194]: ZZ transition
            - combobox "ZZ transition" [ref=e195]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e196]:
            - generic [ref=e197]: First place
            - combobox "First place" [ref=e198]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e199]:
            - generic [ref=e200]: Second place
            - combobox "Second place" [ref=e201]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e202]:
            - generic [ref=e203]: Third place
            - combobox "Third place" [ref=e204]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
          - generic [ref=e205]:
            - generic [ref=e206]: Closing
            - combobox "Closing" [ref=e207]:
              - option "Inherited" [selected]
              - option "Mute"
              - option "Theme default"
              - option "Silent"
      - button "Reset to inherited" [ref=e208] [cursor=pointer]
```

# Test source

```ts
  1  | import playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
  2  | import type * as Playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
  3  | import { writeFile } from "node:fs/promises"
  4  | import { builderDocumentFixture } from "../../src/components/theme-builder/document.fixture"
  5  | import { builderDigest } from "../../src/components/theme-builder/document"
  6  | const { test, expect } = playwright as unknown as typeof Playwright
  7  | const receipt = (tenant: string) => {
  8  |   const document = builderDocumentFixture()
  9  |   document.id = `private-${tenant}`; document.name = `Private ${tenant}`
  10 |   return { document, revision: 1, digest: builderDigest(document) }
  11 | }
  12 | const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
  13 | 
  14 | for (const mode of ["edited", "reading", "saving"] as const) test(`account switch isolates ${mode} draft and late response`, async ({ page }, info) => {
  15 |   const errors: string[] = [], requests: Array<{ method: string; path: string; body: unknown }> = []
  16 |   const gate = deferred(), entered = deferred()
  17 |   let blockWorkspace = false
  18 |   const workspace = deferred()
  19 |   page.on("pageerror", error => errors.push(error.message))
  20 |   await page.route("**/api/themes/workspaces", async route => {
  21 |     if (blockWorkspace) await workspace.promise
  22 |     await route.fulfill({ json: { workspaces: { "tenant-a": ["author"], "tenant-b": ["author"] } } }).catch(() => {})
  23 |   })
  24 |   await page.route("**/api/themes/builder/**", async route => {
  25 |     const request = route.request(), path = new URL(request.url()).pathname
  26 |     requests.push({ method: request.method(), path, body: request.postDataJSON() })
  27 |     const tenant = path.includes("/tenant-a/") ? "tenant-a" : "tenant-b"
  28 |     if (path.endsWith("/documents")) {
  29 |       await route.fulfill({ json: { documents: [{ id: `private-${tenant}`, name: `Private ${tenant}`, revision: 1 }] } }); return
  30 |     }
  31 |     const blocked = tenant === "tenant-a" && (mode === "reading" || (mode === "saving" && request.method() === "PUT"))
  32 |     if (blocked) { entered.resolve(); await gate.promise }
  33 |     const value = request.method() === "PUT" ? { document: request.postDataJSON().document, revision: 2, digest: builderDigest(request.postDataJSON().document) } : receipt(tenant)
  34 |     await route.fulfill({ json: value }).catch(() => {})
  35 |   })
  36 |   await page.goto("/")
  37 |   const select = page.getByRole("combobox", { name: "Screens", exact: true })
  38 |   await expect(select).toBeEnabled()
  39 |   await select.selectOption("private-tenant-a")
  40 |   const name = page.getByRole("textbox", { name: "Theme name", exact: true }).last()
  41 |   if (mode !== "reading") {
  42 |     await expect(name).toHaveValue("Private tenant-a")
  43 |     await name.fill("Private tenant-a edited")
  44 |     if (mode === "saving") await page.getByRole("button", { name: "Save draft", exact: true }).click()
  45 |   }
  46 |   if (mode !== "edited") await entered.promise
  47 |   blockWorkspace = true
  48 |   await page.evaluate(() => (window as any).__qaBoundary.account("tenant-b"))
  49 |   // This must hold while the new workspace authority request is still blocked.
> 50 |   await expect.poll(() => page.locator("input").evaluateAll(inputs => inputs.map(input => input.value).some(value => value.includes("Private tenant-a")))).toBe(false)
     |                                                                                                                                                            ^ Error: expect(received).toBe(expected) // Object.is equality
  51 |   await expect(select).toHaveCount(0)
  52 |   await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled()
  53 |   workspace.resolve()
  54 |   await expect(select).toBeEnabled()
  55 |   await select.selectOption("private-tenant-b")
  56 |   await expect(name).toHaveValue("Private tenant-b")
  57 |   gate.resolve()
  58 |   await expect(name).toHaveValue("Private tenant-b")
  59 |   await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled()
  60 |   expect(requests.some(request => request.method === "PUT" && request.path.includes("/tenant-b/") && JSON.stringify(request.body).includes("private-tenant-a"))).toBe(false)
  61 |   expect(errors).toEqual([])
  62 |   const path = info.outputPath("account-boundary.json")
  63 |   await writeFile(path, JSON.stringify({ mode, requests, errors, limits: "Actual E component, synthetic native token and intercepted API; root login/RBAC/persistence/StrictMode development replay not established." }, null, 2))
  64 |   await info.attach("account-boundary.json", { path, contentType: "application/json" })
  65 | })
  66 | 
```