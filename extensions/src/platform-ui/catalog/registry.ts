import type * as Controls from "../index"

type Entry = {
  exports: readonly (keyof typeof Controls)[]
  modules: readonly string[]
  props: string
  rule: string
}
/** Names typecheck against production exports; modules are checked by ui:check. */
export const CATALOG_COMPONENTS = {
  buttons: {
    exports: ["Button", "IconButton"],
    modules: ["button.tsx"],
    props:
      "Native button props · variant · size · loading · required icon label",
    rule: "Use one primary action. Preserve disabled/pending semantics; label icons. Tab or hover to inspect real focus/hover states.",
  },
  fields: {
    exports: ["Input", "SearchInput", "Select", "Switch"],
    modules: ["fields.tsx"],
    props:
      "Native field props · label or aria-label · description · error · checked/onCheckedChange",
    rule: "Associate errors and labels. Keep real server validation/state at the consumer; never use placeholders as labels.",
  },
  surfaces: {
    exports: [
      "Card",
      "Badge",
      "Toast",
      "StatusState",
      "EmptyState",
      "LoadingState",
      "ErrorState",
    ],
    modules: ["surfaces.tsx"],
    props: "HTML attributes · tone · live · kind/title/description/action",
    rule: "Announce meaningful state changes. Toast is a surface, not a notification store. Never invent presence or success.",
  },
  navigation: {
    exports: ["Tabs", "Toolbar", "ToolbarGroup"],
    modules: ["surfaces.tsx"],
    props: "Tabs items/value/onValueChange · required group labels",
    rule: "Arrow keys select tabs, direction follows RTL. Toolbars retain normal Tab order and original command handlers.",
  },
  menus: {
    exports: [
      "Menu",
      "MenuItem",
      "SubMenu",
      "MenuLabel",
      "MenuSeparator",
      "Popover",
      "Tooltip",
    ],
    modules: ["menus.tsx"],
    props:
      "Trigger · open/onOpenChange · onSelect · disabled · popover label / tooltip content",
    rule: "Group secondary actions. Destructive actions require confirmation. Escape dismisses the active layer and restores focus.",
  },
  dialogs: {
    exports: ["Dialog"],
    modules: ["dialog.tsx"],
    props:
      "title · description · trigger · open/onOpenChange · onClose · closeLabel",
    rule: "Use a title and clear close action. Keep nested portals within their active modal/fullscreen owner. Never apply platform scope to editor/show stage.",
  },
  alerts: {
    exports: ["AlertDialog"],
    modules: ["alert-dialog.tsx"],
    props:
      "title · description · onConfirm · labels · errorLabel · controlled or trigger",
    rule: "Name the affected item and consequence. Await the original mutation, show genuine failure, allow cancel before sending, prevent duplicate confirmation.",
  },
  tables: {
    exports: [
      "Table",
      "TableHead",
      "TableBody",
      "TableRow",
      "TableHeader",
      "TableCell",
    ],
    modules: ["surfaces.tsx"],
    props: "Native table attributes · mandatory caption · header scope",
    rule: "Use real header/cell semantics, sticky bounded scroll and readable targets. Virtualize only after measured need.",
  },
  scopes: {
    exports: [
      "PlatformScope",
      "PlatformThemeProvider",
      "DialogPortal",
      "AlertPortal",
      "MenuPortal",
      "PopoverPortal",
      "TooltipPortal",
    ],
    modules: ["scope.tsx", "portal.tsx", "tokens.ts"],
    props:
      "context · appearance · dir · tokenOverrides · portal container / legacy",
    rule: "Marketing/Studio/host only. Editor and show.theme remain independent. Scope never changes transport, persisted IDs or cinematic timing.",
  },
} as const satisfies Record<string, Entry>
export type StoryId = keyof typeof CATALOG_COMPONENTS
