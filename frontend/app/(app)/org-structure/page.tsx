"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getEmployees,
  getDepartments,
} from "@/lib/hrms-api"
import type { Employee, Department } from "@/lib/types"
import {
  Network,
  Building2,
  Users,
  User,
  Search,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Mail,
  Phone,
} from "lucide-react"
import Link from "next/link"

type DeptNode = Department & {
  employees: Employee[]
  expanded: boolean
}

export default function OrgStructurePage() {
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [expandedDepts, setExpandedDepts] = React.useState<Set<number>>(new Set())

  React.useEffect(() => {
    Promise.all([
      getDepartments(),
      getEmployees(1, 1000, ""),
    ]).then(([deps, empRes]) => {
      setDepartments(deps)
      setEmployees(empRes.data)
      // Expand all departments initially
      setExpandedDepts(new Set(deps.map(d => d.id)))
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleDept = (id: number) => {
    setExpandedDepts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedDepts(new Set(departments.map(d => d.id)))
  const collapseAll = () => setExpandedDepts(new Set())

  // Build tree data
  const deptNodes: DeptNode[] = React.useMemo(() => {
    const q = search.toLowerCase()
    return departments.map(dept => {
      let deptEmployees = employees.filter(e => e.departmentId === dept.id)
      if (q) {
        deptEmployees = deptEmployees.filter(e => {
          const fullName = `${e.lastName} ${e.firstName} ${e.patronymic || ""}`.toLowerCase()
          return fullName.includes(q) || (e.position?.name || "").toLowerCase().includes(q)
        })
      }
      return {
        ...dept,
        employees: deptEmployees,
        expanded: expandedDepts.has(dept.id),
      }
    }).filter(dept => {
      if (!q) return true
      // Show department if its name matches or has matching employees
      return dept.name.toLowerCase().includes(q) || dept.employees.length > 0
    }).sort((a, b) => b.employees.length - a.employees.length)
  }, [departments, employees, search, expandedDepts])

  // Unassigned employees (no department)
  const unassigned = React.useMemo(() => {
    let list = employees.filter(e => !e.departmentId)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e => {
        const fullName = `${e.lastName} ${e.firstName} ${e.patronymic || ""}`.toLowerCase()
        return fullName.includes(q)
      })
    }
    return list
  }, [employees, search])

  const totalInDepts = deptNodes.reduce((s, d) => s + d.employees.length, 0)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg shadow-violet-500/25">
              <Network className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Оргструктура</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Структура компании по отделам
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={expandAll} className="h-9 rounded-xl text-xs sm:text-sm">
            Развернуть все
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll} className="h-9 rounded-xl text-xs sm:text-sm">
            Свернуть все
          </Button>
        </div>
      </div>

      {/* Stats + Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-xl bg-violet-50 border border-violet-200 px-3 py-2">
            <Building2 className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-medium">{departments.length} отделов</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
            <Users className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium">{employees.length} сотрудников</span>
          </div>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по ФИО или отделу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 rounded-xl bg-white/80 border-violet-100 focus:border-violet-300 focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
      </div>

      {/* Tree */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="h-5 w-5 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
            <span>Загрузка...</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {deptNodes.map((dept) => (
            <div key={dept.id} className="rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm overflow-hidden">
              {/* Department header */}
              <button
                onClick={() => toggleDept(dept.id)}
                className="w-full flex items-center gap-3 p-4 sm:p-5 hover:bg-violet-50/50 transition-colors text-left"
              >
                <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-md flex-shrink-0">
                  <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base sm:text-lg font-semibold truncate">{dept.name}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">{dept.employees.length} сотрудников</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1">
                    <Users className="h-3.5 w-3.5 text-violet-600" />
                    <span className="text-xs font-medium text-violet-700">{dept.employees.length}</span>
                  </div>
                  {dept.expanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Employees list */}
              {dept.expanded && dept.employees.length > 0 && (
                <div className="border-t border-violet-100/50">
                  {dept.employees.map((emp, i) => {
                    const fullName = `${emp.lastName} ${emp.firstName} ${emp.patronymic || ""}`.trim()
                    return (
                      <Link
                        key={emp.id}
                        href={`/employees/${emp.id}`}
                        className={`flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5 hover:bg-violet-50/70 transition-colors ${
                          i < dept.employees.length - 1 ? "border-b border-violet-50" : ""
                        }`}
                      >
                        <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-400 text-white text-xs sm:text-sm font-bold flex-shrink-0">
                          {emp.lastName.charAt(0)}{emp.firstName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{fullName}</div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {emp.position?.name && (
                              <span className="flex items-center gap-1 truncate">
                                <Briefcase className="h-3 w-3 flex-shrink-0" />
                                {emp.position.name}
                              </span>
                            )}
                            {emp.email && (
                              <span className="hidden sm:flex items-center gap-1 truncate">
                                <Mail className="h-3 w-3 flex-shrink-0" />
                                {emp.email}
                              </span>
                            )}
                            {emp.phone && (
                              <span className="hidden md:flex items-center gap-1">
                                <Phone className="h-3 w-3 flex-shrink-0" />
                                {emp.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}

              {dept.expanded && dept.employees.length === 0 && (
                <div className="border-t border-violet-100/50 px-6 py-6 text-center text-sm text-muted-foreground">
                  <User className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                  Нет сотрудников в отделе
                </div>
              )}
            </div>
          ))}

          {/* Unassigned employees */}
          {unassigned.length > 0 && (
            <div className="rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-amber-200/50 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 p-4 sm:p-5 bg-amber-50/50">
                <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-400 shadow-md flex-shrink-0">
                  <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-semibold">Без отдела</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">{unassigned.length} сотрудников</div>
                </div>
              </div>
              <div className="border-t border-amber-100/50">
                {unassigned.map((emp, i) => {
                  const fullName = `${emp.lastName} ${emp.firstName} ${emp.patronymic || ""}`.trim()
                  return (
                    <Link
                      key={emp.id}
                      href={`/employees/${emp.id}`}
                      className={`flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5 hover:bg-amber-50/70 transition-colors ${
                        i < unassigned.length - 1 ? "border-b border-amber-50" : ""
                      }`}
                    >
                      <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-400 text-white text-xs sm:text-sm font-bold flex-shrink-0">
                        {emp.lastName.charAt(0)}{emp.firstName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{fullName}</div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {emp.position?.name && (
                            <span className="flex items-center gap-1 truncate">
                              <Briefcase className="h-3 w-3 flex-shrink-0" />
                              {emp.position.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {deptNodes.length === 0 && unassigned.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              <Network className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <p className="text-lg font-medium">Нет данных</p>
              <p className="text-sm">Создайте отделы и добавьте сотрудников</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
