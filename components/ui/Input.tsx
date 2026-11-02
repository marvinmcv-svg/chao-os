import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const fieldClass = cn(
  'w-full bg-g95 border rounded-md text-sm text-g10 font-ui',
  'placeholder:text-g50 focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-transparent',
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
)

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-2xs font-mono text-g40 uppercase tracking-wider">
      {children}
    </label>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, label, error, hint, id, ...props }, ref) => {
  const inputId = id || (label ? `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined)
  return (
    <div className="space-y-1.5">
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        className={cn(fieldClass, 'h-10 px-3', error ? 'border-red-500/70' : 'border-g70 hover:border-g60', className)}
        {...props}
      />
      {error ? <p className="text-xs text-red-400">{error}</p> : hint ? <p className="text-xs text-g50">{hint}</p> : null}
    </div>
  )
})
Input.displayName = 'Input'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, label, error, id, ...props }, ref) => {
  const inputId = id || (label ? `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined)
  return (
    <div className="space-y-1.5">
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(fieldClass, 'px-3 py-2 resize-none', error ? 'border-red-500/70' : 'border-g70 hover:border-g60', className)}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
})
Textarea.displayName = 'Textarea'

export { Input }
