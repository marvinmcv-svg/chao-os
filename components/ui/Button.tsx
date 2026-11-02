'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'default' | 'success'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 font-ui font-semibold transition-colors whitespace-nowrap select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-g95',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variant === 'primary' && 'bg-g05 text-black hover:bg-white active:bg-g10',
          (variant === 'default' || variant === 'secondary') && 'bg-g80 text-g10 border border-g70 hover:bg-g75 hover:border-g60 hover:text-white',
          variant === 'ghost' && 'bg-transparent text-g30 hover:bg-g80 hover:text-white',
          variant === 'danger' && 'bg-red-950/50 text-red-300 border border-red-900 hover:bg-red-900/60',
          variant === 'success' && 'bg-green-500/15 text-green-300 border border-green-700/60 hover:bg-green-500/25',
          size === 'sm' && 'h-8 px-3 text-xs rounded-md',
          size === 'md' && 'h-9 px-4 text-sm rounded-md',
          size === 'lg' && 'h-11 px-6 text-sm rounded-md',
          size === 'icon' && 'h-9 w-9 rounded-md',
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
export { Button }
