"use client"

import * as React from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DataTablePaginationProps {
  pageIndex: number
  pageSize: number
  pageCount: number
  canPreviousPage: boolean
  canNextPage: boolean
  previousPage: () => void
  nextPage: () => void
  setPageIndex: (index: number) => void;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  pagination?: DataTablePaginationProps
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pagination,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: !!pagination,
    pageCount: pagination?.pageCount,
    state: {
      pagination: pagination ? {
        pageIndex: pagination.pageIndex,
        pageSize: pagination.pageSize,
      } : undefined,
    },
  })

  return (
    <div className="w-full space-y-4">
      <div className="overflow-hidden rounded-xl border border-emerald-100/50 bg-white/50">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-gradient-to-r from-emerald-50/80 to-teal-50/80 border-b border-emerald-100/50 hover:bg-emerald-50/80">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="text-emerald-700 text-xs font-semibold uppercase tracking-wider py-4">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-b border-emerald-50 transition-colors hover:bg-emerald-50/50 data-[state=selected]:bg-emerald-100/50"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center"
                >
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <div className="h-12 w-12 rounded-xl bg-emerald-100/50 flex items-center justify-center mb-3">
                      <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                    <span className="text-sm">Нет данных</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {pagination && pagination.pageCount > 0 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Страница <span className="font-medium text-foreground">{pagination.pageIndex + 1}</span> из{" "}
            <span className="font-medium text-foreground">{pagination.pageCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40"
              onClick={() => pagination.setPageIndex(0)}
              disabled={!pagination.canPreviousPage}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40"
              onClick={pagination.previousPage}
              disabled={!pagination.canPreviousPage}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1 px-2">
              {Array.from({ length: Math.min(5, pagination.pageCount) }, (_, i) => {
                const pageNum = Math.max(0, Math.min(pagination.pageIndex - 2, pagination.pageCount - 5)) + i
                if (pageNum >= pagination.pageCount) return null
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === pagination.pageIndex ? "default" : "outline"}
                    size="icon"
                    className={`h-8 w-8 rounded-lg text-xs font-medium ${
                      pageNum === pagination.pageIndex
                        ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 shadow-lg shadow-emerald-500/25"
                        : "border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                    }`}
                    onClick={() => pagination.setPageIndex(pageNum)}
                  >
                    {pageNum + 1}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40"
              onClick={pagination.nextPage}
              disabled={!pagination.canNextPage}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40"
              onClick={() => pagination.setPageIndex(pagination.pageCount - 1)}
              disabled={!pagination.canNextPage}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
