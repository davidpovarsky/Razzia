import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Copy, Ellipsis, Plus, Search, Trash2 } from "lucide-react"
import {
  Button,
  IconButton,
  Input,
  SearchInput,
  Select,
  Switch,
  Badge,
  Toast,
  EmptyState,
  LoadingState,
  ErrorState,
  StatusState,
  Tabs,
  Toolbar,
  ToolbarGroup,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "../index"
import { Story } from "./story"
import { InteractionStories } from "./interaction-stories"

export function ExampleTable({ count = 12 }: { count?: number }) {
  return (
    <Table caption="Synthetic participant example — no personal data">
      <TableHead>
        <TableRow>
          <TableHeader>Name</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Points</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: count }, (_, index) => (
          <TableRow key={index}>
            <TableCell>Example {index + 1}</TableCell>
            <TableCell>Not joined</TableCell>
            <TableCell>0</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
export function ComponentStories({
  changeSurface,
}: {
  changeSurface: () => void
}) {
  const { t } = useTranslation()
  const [count, setCount] = useState(0),
    [checked, setChecked] = useState(false)
  const [message, setMessage] = useState("Ready")
  return (
    <section id="components" aria-labelledby="components-title">
      <h2 id="components-title">Production components</h2>
      <p>
        Every example imports the production library. Actions change synthetic
        local state only.
      </p>
      <div className="catalog-stories">
        <Story id="buttons">
          <div className="catalog-row">
            <Button
              variant="primary"
              data-testid="catalog-primary"
              onClick={() => setCount(count + 1)}
            >
              {t("confirm")}
            </Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <IconButton label="Add example" onClick={() => setCount(count + 1)}>
              <Plus aria-hidden="true" />
            </IconButton>
            <output aria-live="polite" data-testid="catalog-count">
              {count}
            </output>
          </div>
        </Story>
        <Story id="fields">
          <SearchInput
            label="Search example"
            placeholder="Try a synthetic name"
          />
          <Input
            label="Default field"
            description="Associated supporting text"
          />
          <Input
            label="Invalid field"
            defaultValue="Example"
            error="Example validation error"
          />
          <Input
            label="Disabled field"
            disabled
            defaultValue="Read only example"
          />
          <Select label="Example choice">
            <option value="one">One</option>
            <option value="two">Two</option>
          </Select>
          <Select label="Disabled choice" disabled>
            <option>Unavailable</option>
          </Select>
          <Switch
            label="Example setting"
            checked={checked}
            onCheckedChange={setChecked}
          />
          <Switch label="Disabled setting" disabled checked />
        </Story>
        <Story id="surfaces">
          <div className="catalog-row">
            {(["neutral", "success", "warning", "danger", "info"] as const).map(
              (tone) => (
                <Badge key={tone} tone={tone}>
                  {tone}
                </Badge>
              ),
            )}
          </div>
          <Toast>{message}</Toast>
          <EmptyState
            title="No example games"
            action={
              <Button onClick={() => setMessage("Create requested")}>
                Create example
              </Button>
            }
          />
          <LoadingState title="Loading example" />
          <ErrorState
            title="Example network error"
            action={
              <Button onClick={() => setMessage("Retry requested")}>
                Retry example
              </Button>
            }
          />
          <StatusState kind="success" title="Example saved" />
        </Story>
        <Story id="navigation">
          <Tabs
            label="Example views"
            items={[
              {
                value: "gallery",
                label: "Gallery",
                content: "Gallery example content",
              },
              { value: "list", label: "List", content: "List example content" },
              {
                value: "later",
                label: "Disabled",
                content: "Unavailable",
                disabled: true,
              },
            ]}
          />
          <Toolbar label="Example commands">
            <ToolbarGroup label="Navigation">
              <Button disabled>Previous</Button>
              <Button onClick={() => setMessage("Next requested")}>Next</Button>
            </ToolbarGroup>
            <ToolbarGroup label="Tools">
              <IconButton
                label="Copy example"
                onClick={() => setMessage("Copy requested")}
              >
                <Copy aria-hidden="true" />
              </IconButton>
            </ToolbarGroup>
          </Toolbar>
        </Story>
        <InteractionStories
          changeSurface={changeSurface}
          setMessage={setMessage}
        />
        <Story id="tables">
          <ExampleTable />
        </Story>
        <Story id="scopes">
          <p>
            Context, light/dark, locale, direction and token controls above
            affect this live catalog. Try a dialog after changing tokens.
          </p>
          <div className="catalog-row" aria-label="Shared icon vocabulary">
            {[Check, Copy, Ellipsis, Plus, Search, Trash2].map(
              (Icon, index) => (
                <Icon key={index} aria-hidden="true" />
              ),
            )}
          </div>
          <p>
            Use Lucide for platform controls and preserve separately owned show
            artwork.
          </p>
        </Story>
      </div>
    </section>
  )
}
