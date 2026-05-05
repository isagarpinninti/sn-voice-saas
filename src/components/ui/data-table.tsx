import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Minimal styled table primitive. Linear/Vercel-flavored: tight rows, hairline
 * borders, monospace numbers, no zebra striping.
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
  /** Click handler invoked with the row when a row is clicked. Adds cursor + hover affordance. */
  onRowClick?: (row: T) => void
  /** Sticky header that stays pinned while the body scrolls. */
  stickyHeader?: boolean
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyState,
  className,
  onRowClick,
  stickyHeader,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>

  return (
    <div className={cn('w-full overflow-x-auto rounded-lg border border-border bg-card', className)}>
      <table className="w-full text-[12px]">
        <thead className={cn(stickyHeader && 'sticky top-0 z-10 bg-card')}>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'px-4 py-2 text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/80',
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
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-border last:border-b-0 transition-colors hover:bg-muted/30',
                onRowClick && 'cursor-pointer',
              )}
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
