import { cn } from '@/lib/utils'

interface TableProps {
  children: React.ReactNode
  className?: string
}

export function Table({ children, className }: TableProps) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  )
}

export function TableHeader({ children, className }: TableProps) {
  return <thead className={cn('border-b border-g80 bg-g90/40', className)}>{children}</thead>
}

export function TableBody({ children, className }: TableProps) {
  return <tbody className={cn('divide-y divide-g80', className)}>{children}</tbody>
}

export function TableRow({ children, className, onClick }: TableProps & { onClick?: () => void }) {
  return (
    <tr onClick={onClick} className={cn('transition-colors', onClick && 'cursor-pointer hover:bg-g80/50', className)}>
      {children}
    </tr>
  )
}

export function TableHead({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-4 h-10 text-2xs font-mono font-medium text-g40 uppercase tracking-wider whitespace-nowrap', className)}>
      {children}
    </th>
  )
}

export function TableCell({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('px-4 py-3 text-sm text-g20', className)}>{children}</td>
}
