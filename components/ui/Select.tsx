import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldLabel, fieldClass } from './Input'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, label, error, id, options, ...props }, ref) => {
  const selectId = id || (label ? `s-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined)
  return (
    <div className="space-y-1.5">
      {label && <FieldLabel htmlFor={selectId}>{label}</FieldLabel>}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error}
          className={cn(fieldClass, 'h-10 pl-3 pr-9 appearance-none cursor-pointer', error ? 'border-red-500/70' : 'border-g70 hover:border-g60', className)}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g40" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
})
Select.displayName = 'Select'
export { Select }
