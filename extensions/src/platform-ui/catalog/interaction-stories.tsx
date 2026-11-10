import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Ellipsis, Search, Trash2 } from "lucide-react"
import {
  Button,
  IconButton,
  Input,
  Switch,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  SubMenu,
  Popover,
  Tooltip,
  Dialog,
  AlertDialog,
} from "../index"
import { Story } from "./story"
export function InteractionStories({
  changeSurface,
  setMessage,
}: {
  changeSurface: () => void
  setMessage: (value: string) => void
}) {
  const { t } = useTranslation()
  const [failure, setFailure] = useState(false)
  return (
    <>
      <Story id="menus">
        <Menu
          trigger={
            <Button>
              <Ellipsis aria-hidden="true" />
              Example actions
            </Button>
          }
        >
          <MenuLabel>Secondary actions</MenuLabel>
          <MenuItem onSelect={() => setMessage("Duplicate requested")}>
            Duplicate example
          </MenuItem>
          <MenuItem disabled>Unavailable action</MenuItem>
          <MenuSeparator />
          <SubMenu label="Export example">
            <MenuItem onSelect={() => setMessage("JSON requested")}>
              Authored JSON
            </MenuItem>
            <MenuItem onSelect={() => setMessage("XLSX requested")}>
              XLSX
            </MenuItem>
          </SubMenu>
        </Menu>
        <Popover
          label="Example information"
          trigger={<Button>Open popover</Button>}
        >
          <Input label="Popover field" />
        </Popover>
        <Tooltip content="A keyboard-accessible explanation">
          <IconButton label="Example hint">
            <Search aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </Story>
      <Story id="dialogs">
        <Dialog
          title="Example dialog"
          description="Actual production dialog and portal; no server operation."
          trigger={<Button>Open example dialog</Button>}
        >
          <Input label="Dialog example field" />
          <Button variant="primary" data-testid="catalog-dialog-action">
            {t("confirm")}
          </Button>
          <Button onClick={changeSurface}>Change surface token</Button>
          <Menu trigger={<Button>Nested actions</Button>}>
            <MenuItem onSelect={() => setMessage("Nested action requested")}>
              Nested action
            </MenuItem>
          </Menu>
        </Dialog>
      </Story>
      <Story id="alerts">
        <Switch
          label="Simulate genuine callback rejection"
          checked={failure}
          onCheckedChange={setFailure}
        />
        <AlertDialog
          title="Remove synthetic example?"
          description="Removes only a local example count. No participant or server record is affected."
          trigger={
            <Button variant="destructive">
              <Trash2 aria-hidden="true" />
              Remove example
            </Button>
          }
          errorLabel="The synthetic callback rejected. Cancel or retry."
          onConfirm={async () => {
            await new Promise((resolve) => setTimeout(resolve, 350))
            if (failure) throw new Error("Synthetic rejection")
            setMessage("Example removal confirmed")
          }}
        />
      </Story>
    </>
  )
}
