import {
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
  type ComponentProps,
  type Ref,
} from "react"
import { Switch as RadixSwitch } from "radix-ui"

type Name =
  | { label: string; "aria-label"?: string }
  | { label?: never; "aria-label": string }
type Details = { error?: string; description?: string }
export type InputProps = InputHTMLAttributes<HTMLInputElement> &
  Name &
  Details & { ref?: Ref<HTMLInputElement> }
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  Name &
  Details

function FieldFrame({
  id,
  label,
  description,
  error,
  children,
}: Details & { id: string; label?: string; children: ReactNode }) {
  return (
    <div className="tds-field">
      {label && (
        <label className="tds-field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {description && (
        <p className="tds-description" id={`${id}-description`}>
          {description}
        </p>
      )}
      {error && (
        <p className="tds-field-error" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}
export function Input({
  label,
  description,
  error,
  id: provided,
  className = "",
  "aria-describedby": described,
  ...props
}: InputProps) {
  const generated = useId(),
    id = provided ?? generated
  const ids =
    [described, description && `${id}-description`, error && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined
  return (
    <FieldFrame {...{ id, label, description, error }}>
      <input
        {...props}
        id={id}
        className={`tds-input ${className}`}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={ids}
      />
    </FieldFrame>
  )
}
export function SearchInput(props: InputProps) {
  return <Input {...props} type="search" />
}
export function Select({
  label,
  description,
  error,
  id: provided,
  className = "",
  children,
  "aria-describedby": described,
  ...props
}: SelectProps) {
  const generated = useId(),
    id = provided ?? generated
  const ids =
    [described, description && `${id}-description`, error && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined
  return (
    <FieldFrame {...{ id, label, description, error }}>
      <select
        {...props}
        id={id}
        className={`tds-select ${className}`}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={ids}
      >
        {children}
      </select>
    </FieldFrame>
  )
}
export function Switch({
  label,
  id: provided,
  ...props
}: ComponentProps<typeof RadixSwitch.Root> & { label: string }) {
  const generated = useId(),
    id = provided ?? generated
  return (
    <label className="tds-switch-row" htmlFor={id}>
      <RadixSwitch.Root
        {...props}
        id={id}
        className={`tds-switch ${props.className ?? ""}`}
      >
        <RadixSwitch.Thumb className="tds-switch-thumb" />
      </RadixSwitch.Root>
      <span>{label}</span>
    </label>
  )
}
