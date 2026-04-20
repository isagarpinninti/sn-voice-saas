import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Minimal styled table primitive. Vercel-flavored: tight rows, subtle borders,
 * monospace numbers, no zebra striping.
 *
 * Usage:
 *   <DataTable
 *     columns={[
 *       { key: 'date', label: 'Date' },
 *       { key: 'calls', label: 'Calls', align: 'right' },
 *     ]}
 *     rows={[{ date: 'Apr 1', calls: 12 }, ...]}
 *   />
 */
export type DataTableColumn<T> = {
  key: keyof T & string
  label: string
  align?: 'left' | 'right' | 'center'
  className?: string
  /** Custom renderer for the cell. Receives the row + value. */
  render?: (row: T) => React.ReactNode
  /** Width hint (CSS string, e.g., "120px") */
  width?: string
}

type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  rows: T[]
  emptyState?: React.ReactNode
  className?: string
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyState,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>

  return (
    <div className={cn('w-full overflow-x-auto rounded-xl border border-border bg-card', className)}>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'px-4 py-2.5 text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.align !== 'right' && col.align !== 'center' && 'text-left',
                  col.className
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border last:border-b-0 transition-colors hover:bg-muted/20"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 text-foreground',
                    col.align === 'right' && 'text-right tabular-nums',
                    col.align === 'center' && 'text-center',
                    col.align !== 'right' && col.align !== 'center' && 'text-left',
                    col.className
                  )}
                >
                  {col.render ? col.render(row) : (row[col.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
