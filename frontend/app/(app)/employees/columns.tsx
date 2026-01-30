"use client"

import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import {
  MoreHorizontal,
  User,
  Mail,
  Phone,
  Eye,
  Edit,
  Trash2,
  Copy,
  Building2,
  Briefcase,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Employee } from "@/lib/types"

export const columns: ColumnDef<Employee>[] = [
  {
    accessorKey: "lastName",
    header: "Сотрудник",
    cell: ({ row }) => {
      const { lastName, firstName, patronymic, id } = row.original
      const fullName = `${lastName} ${firstName} ${patronymic || ""}`.trim()
      const initials = `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase()

      return (
        <Link href={`/employees/${id}`} className="group flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-bold text-white shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all">
            {initials}
          </div>
          <div>
            <div className="font-medium text-foreground group-hover:text-emerald-600 transition-colors">
              {fullName}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>ID: {id}</span>
            </div>
          </div>
        </Link>
      )
    },
  },
  {
    accessorKey: "position.name",
    header: "Должность",
    cell: ({ row }) =>
      row.original.position?.name ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 px-3 py-1.5 text-xs font-medium text-purple-700">
          <Briefcase className="h-3 w-3" />
          {row.original.position?.name}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "department.name",
    header: "Отдел",
    cell: ({ row }) =>
      row.original.department?.name ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-100 to-cyan-100 px-3 py-1.5 text-xs font-medium text-blue-700">
          <Building2 className="h-3 w-3" />
          {row.original.department?.name}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "email",
    header: "Контакты",
    cell: ({ row }) => (
      <div className="space-y-1">
        {row.original.email ? (
          <div className="flex items-center gap-1.5 text-sm">
            <Mail className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-emerald-700 hover:underline cursor-pointer">
              {row.original.email}
            </span>
          </div>
        ) : null}
        {row.original.phone ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span>{row.original.phone}</span>
          </div>
        ) : null}
        {!row.original.email && !row.original.phone && (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      const employee = row.original

      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0 hover:bg-emerald-50 data-[state=open]:bg-emerald-50"
              >
                <span className="sr-only">Открыть меню</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href={`/employees/${employee.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Просмотр профиля
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <Edit className="mr-2 h-4 w-4" />
                Редактировать
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(String(employee.id))}
                className="cursor-pointer"
              >
                <Copy className="mr-2 h-4 w-4" />
                Копировать ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 cursor-pointer focus:text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
  },
]
