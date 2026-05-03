import { cn } from '@/lib/utils'

interface TableProps {
  children: React.ReactNode
  className?: string
}

export function Table({ children, className }: TableProps) {
  return (
    <div className={cn('w-full overflow-auto', className)}>
      <table className="w-full border-collapse">{children}</table>
    </div>
  )
}

export function TableHeader({ children, className }: TableProps) {
  return <thead className={cn('border-b border-g70', className)}>{children}</thead>
}

export function TableBody({ children, className }: TableProps) {
  return <tbody className={cn('divide-y divide-g80', className)}>{children}</tbody>
}

export function TableRow({ children, className, onClick }: TableProps & { onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cn('border-b border-g80/50 hover:bg-g80/50 transition-colors', onClick && 'cursor-pointer')}
    >
      {children}
    </tr>
  )
}

export function TableHead({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs font-mono font-medium text-g40 uppercase tracking-wider',
        className
      )}
    >
      {children}
    </th>
  )
}

export function TableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-sm text-g20', className)}>{children}</td>
}
