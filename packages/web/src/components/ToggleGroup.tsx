import clsx from "clsx"
import type { LucideIcon } from "lucide-react"
import { ToggleGroup as RadixToggleGroup } from "radix-ui"
import { Fragment } from "react"
import { twMerge } from "tailwind-merge"

interface Item<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  group?: string
}

interface Props<T extends string> {
  items: Array<Item<T>>
  value: T
  onChange: (_value: T) => void
  iconOnly?: boolean
  className?: string
}

const ToggleGroup = <T extends string>({
  items,
  value,
  onChange,
  iconOnly,
  className,
}: Props<T>) => (
  <RadixToggleGroup.Root
    type="single"
    value={value}
    onValueChange={(next) => {
      if (next) {
        onChange(next as T)
      }
    }}
    className={twMerge(
      clsx(
        "bg-accent flex h-10 items-center gap-0.5 rounded-lg p-0.5",
        className,
      ),
    )}
  >
    {items.map(({ value: itemValue, label, icon: Icon, group }, index) => {
      const prevGroup = index > 0 ? items[index - 1]?.group : undefined
      const showGroupSeparator = Boolean(
        group && prevGroup && group !== prevGroup,
      )

      return (
        <Fragment key={itemValue}>
          {showGroupSeparator && (
            <span
              data-testid={`toggle-group-divider-${group}`}
              aria-hidden="true"
              className="bg-border/70 mx-1 h-5 w-px shrink-0"
            />
          )}
          <RadixToggleGroup.Item
            value={itemValue}
            data-testid={`toggle-kind-${itemValue}`}
            data-group={group}
            aria-label={iconOnly ? label : undefined}
            className={clsx(
              "text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground focus-visible:outline-primary flex h-full shrink-0 cursor-pointer items-center gap-1.5 rounded-md text-sm font-semibold focus-visible:outline-2",
              iconOnly ? "px-2.5" : "px-3",
            )}
          >
            {Icon && <Icon className="size-4" />}
            {!iconOnly && label}
          </RadixToggleGroup.Item>
        </Fragment>
      )
    })}
  </RadixToggleGroup.Root>
)

export default ToggleGroup
