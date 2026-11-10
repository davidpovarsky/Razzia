import "@fontsource-variable/rubik/wght.css"
import "@razzia/web/i18n"
import "@razzia/web/index.css"
import { createRoot } from "react-dom/client"
import { useRef, useState } from "react"
import { Plus } from "lucide-react"
import { ReferenceCanvas } from "../src/site/web/shared/ReferenceCanvas"
import {
  PlatformScope,
  Button,
  IconButton,
  Dialog,
  AlertDialog,
  Menu,
  MenuItem,
  MenuSeparator,
  SubMenu,
  Popover,
  Tooltip,
  Input,
  SearchInput,
  Select,
  Switch,
  Tabs,
  Card,
  Badge,
  Toast,
  EmptyState,
  LoadingState,
  ErrorState,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  type PlatformContext,
} from "../src/platform-ui"

function Panel({ name, context }: { name: string; context: PlatformContext }) {
  const [count, setCount] = useState(0),
    [checked, setChecked] = useState(false),
    [message, setMessage] = useState("")
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr")
  const [removed, setRemoved] = useState(0)
  return (
    <PlatformScope
      context={context}
      dir={direction}
      data-testid={`${name}-panel`}
      style={{
        display: "grid",
        gap: "var(--tds-space-4)",
        padding: "var(--tds-space-6)",
      }}
    >
      <h1>{name} production components</h1>
      <Button onClick={() => setDirection(direction === "ltr" ? "rtl" : "ltr")}>
        {name} toggle RTL
      </Button>
      <div style={{ display: "flex", gap: "var(--tds-space-2)" }}>
        <Button variant="primary" onClick={() => setCount(count + 1)}>
          {name} action
        </Button>
        <Button disabled onClick={() => setCount(count + 1)}>
          {name} disabled
        </Button>
        <Button loading onClick={() => setCount(count + 1)}>
          {name} pending
        </Button>
        <IconButton
          label={`${name} icon action`}
          onClick={() => setCount(count + 1)}
        >
          <Plus aria-hidden="true" />
        </IconButton>
      </div>
      <output data-testid={`${name}-count`}>{count}</output>
      <SearchInput label={`${name} search`} placeholder="Fixture search" />
      <Input
        label={`${name} invalid field`}
        error="Fixture validation error"
        description="Fixture field description"
      />
      <Select label={`${name} choice`} defaultValue="first">
        <option value="first">First</option>
        <option value="second">Second</option>
      </Select>
      <Switch
        label={`${name} setting`}
        checked={checked}
        onCheckedChange={setChecked}
      />
      <Tabs
        label={`${name} views`}
        items={[
          {
            value: "first",
            label: `${name} first tab`,
            content: "First content",
          },
          {
            value: "second",
            label: `${name} second tab`,
            content: "Second content",
          },
          {
            value: "third",
            label: `${name} third tab`,
            content: "Third content",
          },
        ]}
      />
      <Menu trigger={<Button>{name} actions</Button>}>
        <MenuItem onSelect={() => setMessage("First action")}>
          {name} first action
        </MenuItem>
        <MenuItem disabled>{name} disabled action</MenuItem>
        <MenuSeparator />
        <SubMenu label={`${name} export`}>
          <MenuItem onSelect={() => setMessage("Exported fixture")}>
            {name} export fixture
          </MenuItem>
        </SubMenu>
      </Menu>
      <Popover
        label={`${name} popover`}
        trigger={<Button>{name} open popover</Button>}
      >
        <Input label={`${name} popover field`} />
      </Popover>
      <Tooltip content={`${name} contextual hint`}>
        <IconButton label={`${name} hint`}>
          <Plus aria-hidden="true" />
        </IconButton>
      </Tooltip>
      <Dialog
        title={`${name} dialog`}
        description={`${name} dialog description`}
        trigger={<Button>{name} open dialog</Button>}
      >
        <Input label={`${name} dialog field`} />
        <Menu trigger={<Button>{name} nested menu</Button>}>
          <MenuItem onSelect={() => setMessage("Nested action")}>
            {name} nested action
          </MenuItem>
        </Menu>
        <Toast>{message || "Fixture dialog ready"}</Toast>
      </Dialog>
      <AlertDialog
        title={`${name} remove fixture?`}
        description="This only increments a synthetic fixture counter."
        trigger={<Button variant="destructive">{name} remove</Button>}
        confirmLabel={`${name} confirm removal`}
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 80))
          setRemoved((value) => value + 1)
        }}
      />
      <AlertDialog
        title={`${name} failed fixture?`}
        description="Synthetic rejection, not a server call."
        trigger={<Button>{name} failed removal</Button>}
        confirmLabel={`${name} confirm failure`}
        errorLabel="Fixture removal rejected"
        onConfirm={() =>
          Promise.reject(new Error("Synthetic fixture rejection"))
        }
      />
      <output data-testid={`${name}-removed`}>{removed}</output>
      <Toast data-testid={`${name}-message`}>
        {message || "Fixture ready"}
      </Toast>
      <Card>
        <Badge tone="success">Fixture success</Badge>{" "}
        <Badge tone="warning">Fixture warning</Badge>{" "}
        <Badge tone="danger">Fixture error</Badge>
      </Card>
      <EmptyState title="Fixture empty" />
      <LoadingState title="Fixture loading" />
      <ErrorState
        title="Fixture network error"
        action={
          <Button onClick={() => setMessage("Retry requested")}>
            Retry fixture
          </Button>
        }
      />
      <Table caption={`${name} fixture table`}>
        <TableHead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {[1, 2, 3].map((number) => (
            <TableRow key={number}>
              <TableCell>Fixture {number}</TableCell>
              <TableCell>Not joined</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PlatformScope>
  )
}
function Fixture() {
  const fullscreen = useRef<HTMLDivElement>(null)
  const [unsupported, setUnsupported] = useState(false)
  return (
    <>
      <div
        ref={fullscreen}
        data-testid="fixture-fullscreen-root"
        style={{ maxHeight: "100dvh", overflow: "auto" }}
      >
        <PlatformScope context="platform.host">
          <Button
            onClick={() => {
              void fullscreen.current
                ?.requestFullscreen()
                .catch(() => setUnsupported(true))
            }}
          >
            Enter fixture fullscreen
          </Button>
          {unsupported && <p>Fullscreen unsupported</p>}
        </PlatformScope>
        <Panel name="host" context="platform.host" />
      </div>
      <ReferenceCanvas variant="studio">
        <Panel name="site" context="platform.studio" />
      </ReferenceCanvas>
    </>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
