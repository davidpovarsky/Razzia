import NativeToggleGroup from "@razzia/web/components/ToggleGroup"
import type { LucideIcon } from "lucide-react"

interface Item<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  group?: string
}
interface Props<T extends string> {
  items: Array<Item<T>>
  value: T
  onChange: (value: T) => void
  iconOnly?: boolean
  className?: string
}

/** Add group metadata/decorations while the original Razzia component owns every radio and key. */
export default function GroupedToggleGroup<T extends string>({
  items,
  ...props
}: Props<T>) {
  return (
    <NativeToggleGroup
      {...props}
      items={items}
      className={`[&_[role=radio]]:shrink-0 ${props.className ?? ""}`}
      itemMetadata={(value, index) => ({
        "data-testid": `toggle-kind-${value}`,
        "data-group": items[index]?.group,
      })}
      beforeItem={(_, index) => {
        const group = items[index]?.group
        const previous = index > 0 ? items[index - 1]?.group : undefined

        return group && previous && group !== previous ? (
          <span
            data-testid={`toggle-group-divider-${group}`}
            aria-hidden="true"
            className="bg-border/70 mx-1 h-5 w-px shrink-0"
          />
        ) : null
      }}
    />
  )
}
