"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getEmployees,
  getDepartments,
  getOrgChart,
} from "@/lib/hrms-api"
import type { Employee, Department, OrgChartNode } from "@/lib/types"
import { StatusBadge } from "@/components/status-badge"
import { EmployeeAvatar } from "@/components/employee-avatar"
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
  Info,
} from "lucide-react"
import Link from "next/link"

type DeptNode = Department & {
  employees: Employee[]
  expanded: boolean
}

// ---- Рекурсивная карточка узла дерева ----
function OrgNode({ node, depth = 0, searchQuery }: { node: OrgChartNode; depth?: number; searchQuery: string }) {
  const [collapsed, setCollapsed] = React.useState(false)
  const fullName = `${node.lastName} ${node.firstName} ${node.patronymic || ""}`.trim()
  const hasSubordinates = node.subordinates.length > 0

  const matchesSearch = !searchQuery || fullName.toLowerCase().includes(searchQuery.toLowerCase())
    || (node.position?.name || "").toLowerCase().includes(searchQuery.toLowerCase())
    || (node.department?.name || "").toLowerCase().includes(searchQuery.toLowerCase())

  const anyChildMatches = (n: OrgChartNode, q: string): boolean => {
    if (!q) return true
    const name = `${n.lastName} ${n.firstName}`.toLowerCase()
    if (name.includes(q) || (n.position?.name || "").toLowerCase().includes(q)) return true
    return n.subordinates.some(c => anyChildMatches(c, q))
  }

  if (!matchesSearch && !node.subordinates.some(c => anyChildMatches(c, searchQuery.toLowerCase()))) {
    return null
  }

  return (
    <div className={`relative ${depth > 0 ? "ml-6 sm:ml-10" : ""}`}>
      {/* Коннектор-линия */}
      {depth > 0 && (
        <div className="absolute -left-4 sm:-left-6 top-0 bottom-0 w-px bg-violet-200" />
      )}
      {depth > 0 && (
        <div className="absolute -left-4 sm:-left-6 top-7 h-px w-4 sm:w-6 bg-violet-200" />
      )}

      <div className={`relative mb-3 rounded-xl border bg-white/90 shadow-sm transition-all hover:shadow-md ${
        matchesSearch && searchQuery ? "border-violet-400 ring-1 ring-violet-300" : "border-white/50"
      }`}>
        <div className="flex items-center gap-3 p-3 sm:p-4">
          {/* Кнопка collapse если есть дочерние */}
          {hasSubordinates && (
            <button
              onClick={() => setCollapsed(v => !v)}
              className="flex-shrink-0 h-6 w-6 rounded-md hover:bg-violet-100 flex items-center justify-center transition-colors"
            >
              {collapsed
                ? <ChevronRight className="h-4 w-4 text-violet-500" />
                : <ChevronDown className="h-4 w-4 text-violet-500" />
              }
            </button>
          )}
          {!hasSubordinates && <div className="w-6 flex-shrink-0" />}

          <EmployeeAvatar
            employeeId={node.id}
            firstName={node.firstName}
            lastName={node.lastName}
            photoPath={node.photoPath}
            className="h-9 w-9 sm:h-11 sm:w-11 flex-shrink-0"
          />

          <div className="flex-1 min-w-0">
            <Link
              href={`/employees/${node.id}`}
              className="text-sm sm:text-base font-semibold hover:text-violet-600 transition-colors truncate block"
            >
              {fullName}
            </Link>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
              {node.position?.name && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                  <Briefcase className="h-3 w-3 flex-shrink-0" />
                  {node.position.name}
                </span>
              )}
              {node.department?.name && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                  <Building2 className="h-3 w-3 flex-shrink-0" />
                  {node.department.name}
                </span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0">
            <StatusBadge status={node.status} size="sm" />
          </div>

          {hasSubordinates && (
            <div className="flex-shrink-0 hidden sm:flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
              <Users className="h-3 w-3" />
              {node.subordinates.length}
            </div>
          )}
        </div>
      </div>

      {/* Подчинённые */}
      {hasSubordinates && !collapsed && (
        <div>
          {node.subordinates.map(child => (
            <OrgNode key={child.id} node={child} depth={depth + 1} searchQuery={searchQuery} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function OrgStructurePage() {
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [orgChart, setOrgChart] = React.useState<OrgChartNode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [expandedDepts, setExpandedDepts] = React.useState<Set<number>>(new Set())
  const [activeView, setActiveView] = React.useState<"departments" | "hierarchy">("hierarchy")

  React.useEffect(() => {
    Promise.all([
      getDepartments(),
      getEmployees(1, 1000, ""),
      getOrgChart().catch(() => []),
    ]).then(([deps, empRes, chart]) => {
      setDepartments(deps)
      setEmployees(empRes.data)
      setOrgChart(chart)
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

  // Данные для вида "По отделам"
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
      return { ...dept, employees: deptEmployees, expanded: expandedDepts.has(dept.id) }
    }).filter(dept => {
      if (!q) return true
      return dept.name.toLowerCase().includes(q) || dept.employees.length > 0
    }).sort((a, b) => b.employees.length - a.employees.length)
  }, [departments, employees, search, expandedDepts])

  const unassigned = React.useMemo(() => {
    let list = employees.filter(e => !e.departmentId)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(e => `${e.lastName} ${e.firstName}`.toLowerCase().includes(q))
    }
    return list
  }, [employees, search])

  // Проверяем — есть ли хоть у кого-то managerId
  const hasHierarchy = React.useMemo(() =>
    employees.some(e => e.managerId != null),
  [employees])

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
                {activeView === "departments" ? "Структура компании по отделам" : "Иерархия подчинения"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeView === "departments" && (
            <>
              <Button variant="outline" size="sm" onClick={expandAll} className="h-9 rounded-xl text-xs sm:text-sm">
                Развернуть
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll} className="h-9 rounded-xl text-xs sm:text-sm">
                Свернуть
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* View switcher */}
        <div className="flex rounded-xl border border-violet-200 bg-violet-50 p-1 gap-1">
          <button
            onClick={() => setActiveView("hierarchy")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              activeView === "hierarchy"
                ? "bg-white shadow-sm text-violet-700"
                : "text-violet-500 hover:text-violet-700"
            }`}
          >
            <Network className="h-4 w-4" />
            Иерархия
          </button>
          <button
            onClick={() => setActiveView("departments")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              activeView === "departments"
                ? "bg-white shadow-sm text-violet-700"
                : "text-violet-500 hover:text-violet-700"
            }`}
          >
            <Building2 className="h-4 w-4" />
            По отделам
          </button>
        </div>

        <div className="flex items-center gap-3">
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="h-5 w-5 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
            <span>Загрузка...</span>
          </div>
        </div>
      ) : activeView === "hierarchy" ? (
        /* ---- ВКЛАДКА: ИЕРАРХИЯ ---- */
        <div>
          {!hasHierarchy ? (
            /* Подсказка если нет иерархии */
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-violet-200 shadow-sm p-8 sm:p-12 text-center space-y-4">
              <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100">
                <Network className="h-8 w-8 text-violet-400" />
              </div>
              <h3 className="text-lg font-semibold">Иерархия не настроена</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Чтобы видеть дерево подчинения, назначьте руководителей сотрудникам.
                Откройте профиль сотрудника → нажмите «Редактировать» → выберите поле <strong>«Руководитель»</strong>.
              </p>
              <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 max-w-sm mx-auto">
                <Info className="h-4 w-4 flex-shrink-0" />
                <span>Пока отображаются все сотрудники без иерархии</span>
              </div>
            </div>
          ) : null}

          {/* Дерево */}
          <div className="space-y-1">
            {orgChart.length === 0 && !loading ? (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p>Нет сотрудников для отображения</p>
              </div>
            ) : (
              orgChart.map(root => (
                <OrgNode key={root.id} node={root} depth={0} searchQuery={search} />
              ))
            )}
          </div>
        </div>
      ) : (
        /* ---- ВКЛАДКА: ПО ОТДЕЛАМ ---- */
        <div className="space-y-3">
          {deptNodes.map((dept) => (
            <div key={dept.id} className="rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-sm overflow-hidden">
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
                  {dept.expanded
                    ? <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    : <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  }
                </div>
              </button>

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
                        <EmployeeAvatar
                          employeeId={emp.id}
                          firstName={emp.firstName}
                          lastName={emp.lastName}
                          photoPath={emp.photoPath}
                          className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0"
                        />
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
                        <StatusBadge status={emp.status} size="sm" />
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
                      <EmployeeAvatar
                        employeeId={emp.id}
                        firstName={emp.firstName}
                        lastName={emp.lastName}
                        photoPath={emp.photoPath}
                        className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{fullName}</div>
                        {emp.position?.name && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Briefcase className="h-3 w-3 flex-shrink-0" />
                            {emp.position.name}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={emp.status} size="sm" />
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {deptNodes.length === 0 && unassigned.length === 0 && (
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
