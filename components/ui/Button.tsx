'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'default'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-ui font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-g95',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Variants
          variant === 'primary' && 'bg-white text-black hover:bg-g10 active:bg-g20',
          variant === 'default' && 'bg-g80 text-g20 border border-g70 hover:bg-g75 hover:text-white',
          variant === 'secondary' && 'bg-g80 text-g20 border border-g70 hover:bg-g75 hover:text-white',
          variant === 'ghost' && 'bg-transparent text-g30 hover:bg-g80 hover:text-white',
          variant === 'danger' && 'bg-red-900/50 text-red-400 border border-red-800 hover:bg-red-900',
          // Sizes
          size === 'sm' && 'h-8 px-3 text-sm rounded',
          size === 'md' && 'h-10 px-4 text-sm rounded-md',
          size === 'lg' && 'h-12 px-6 text-base rounded-md',
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
export { Button }
