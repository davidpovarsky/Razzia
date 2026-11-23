/** Synthetic authoring fixture. No renderer, image rights or executable pin. */
import { parseBuilderDocument } from "./document"

export function builderDocumentFixture() {
  const ref = (id: string) => ({ id, version: "1.0.0" })
  const capabilities = {
    questionTypes: ["single"],
    playModes: ["quiz"],
    minAnswers: 2,
    maxAnswers: 5,
    roles: ["spectator"],
    phases: ["voting"],
  }
  const component = (id: string, port: string, bindings: string[]) => ({
    ...ref(id),
    adapterId: "unimplemented",
    availability: "candidate",
    propsProfile: "bounded-view-v1",
    capabilities,
    allowedPorts: [port],
    childPorts: [],
    bindings,
    motions: [],
    fallback: "safe-hold",
    reducedMotion: "same-theme-static",
    a11yLabelKey: `builder.${id}`,
    provenance: "Synthetic isolated authoring test",
  })
  const root = {
    ...component("root-view", "stage-root", ["choices", "clock"]),
    childPorts: [
      {
        id: "decoration",
        allowedComponents: [ref("decoration-view")],
        maxChildren: 4,
      },
    ],
  }
  const node = (id: string) => ({
    nodeId: id,
    component: ref("decoration-view"),
    port: "decoration",
    props: {},
    bindings: {},
    layout: {
      preset: "flow",
      alignment: "center",
      gap: "small",
      lane: "decoration",
    },
    motions: [],
    children: {},
  })

  return parseBuilderDocument({
    format: "tadazz-theme-builder-draft",
    formatVersion: 1,
    id: "test-draft",
    name: "Synthetic theme",
    registry: {
      schemaVersion: 1,
      ...ref("test-registry"),
      motions: [],
      components: [root, component("decoration-view", "decoration", [])],
      templates: [
        {
          ...ref("test-template"),
          availability: "candidate",
          phase: "voting",
          roles: ["spectator"],
          rootNodeId: "root",
          requiredSystemCapabilities: ["complete-answer-set", "server-clock"],
          layouts: ["stage-16-9", "safe-4-3", "narrow-player"],
          fallback: "safe-hold",
          nodes: [
            {
              ...node("root"),
              component: ref("root-view"),
              port: "stage-root",
              bindings: { choices: "choices", clock: "clock" },
              layout: {
                preset: "flow",
                alignment: "center",
                gap: "small",
                lane: "content",
              },
              children: { decoration: ["first", "second"] },
            },
            node("first"),
            node("second"),
          ],
        },
      ],
    },
    content: {
      format: "tadazz-show-composition",
      schemaVersion: 1,
      selection: { id: "razzia-original", version: "1.0.0", overrides: {} },
      scopes: [],
      composition: {
        schemaVersion: 1,
        ...ref("test-composition"),
        baseTheme: ref("razzia-original"),
        registry: ref("test-registry"),
        sections: { templates: { voting: ref("test-template") } },
        roles: {},
        scopes: [],
      },
    },
  })
}
