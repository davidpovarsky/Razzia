import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"

export interface StudioSelectItem {
  value: string
  label: string
}

interface StudioSelectProps {
  value: string
  onChange: (_val: string) => void
  items: StudioSelectItem[]
  ariaLabel?: string
  className?: string
}

export const StudioSelect = ({
  value,
  onChange,
  items,
  ariaLabel,
  className,
}: StudioSelectProps) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label={ariaLabel} className={className}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {items.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)
