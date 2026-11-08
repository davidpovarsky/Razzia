import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@razzia/web/components/Select"
import type { BillingUi } from "@razzia/extensions/editor"
import { useId } from "react"

const BillingSelect: BillingUi["Select"] = ({
  label,
  value,
  onChange,
  options,
}) => {
  const id = useId()

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export const billingUi: BillingUi = { Button, Card, Select: BillingSelect }
