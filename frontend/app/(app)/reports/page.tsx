"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  FileText,
  BarChart3,
  PieChart,
  TrendingUp,
  Download,
  Calendar,
  Users,
  Building2,
  Clock,
  Sparkles,
  CheckCircle2,
  CalendarRange,
  Loader2,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEmployees, getDepartments, getPositions, getAttendance, getAttendanceReport, getAttendanceRange } from "@/lib/hrms-api";
import type { Employee, Department, Position, AttendanceSummary } from "@/lib/types";
import type { AttendanceReportRow } from "@/lib/hrms-api";
import { RuDateInput, toRuDate } from "@/components/ru-date-input";

export default function ReportsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Табель за период
  const monthStart = new Date();
  monthStart.setDate(1);
  const [reportFrom, setReportFrom] = useState(monthStart.toISOString().split("T")[0]);
  const [reportTo, setReportTo] = useState(new Date().toISOString().split("T")[0]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    Promise.all([
      getEmployees(1, 1000, ""),
      getDepartments(),
      getPositions(),
      getAttendance(today).catch(() => []),
    ]).then(([empRes, deps, pos, att]) => {
      setEmployees(empRes.data);
      setDepartments(deps);
      setPositions(pos);
      setTodayAttendance(att);
    }).catch(() => {});
  }, []);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const getDate = () => new Date().toISOString().split("T")[0];

  const writeXlsx = (wsData: (string | number)[][], filename: string, sheetName: string, cols?: { wch: number }[]) => {
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    if (cols) ws["!cols"] = cols;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const generateEmployeeReport = () => {
    const headers = ["ID", "Фамилия", "Имя", "Отчество", "Email", "Телефон", "Отдел", "Должность"];
    const rows = employees.map(emp => [
      emp.id, emp.lastName, emp.firstName, emp.patronymic || "",
      emp.email || "", emp.phone || "", emp.department?.name || "", emp.position?.name || ""
    ]);
    writeXlsx([headers, ...rows], `Сотрудники_${getDate()}.xlsx`, "Сотрудники", [
      { wch: 5 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 25 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
    ]);
    showSuccess("Отчёт по сотрудникам сформирован");
  };

  const generateDepartmentReport = () => {
    const headers = ["ID", "Название отдела", "Кол-во сотрудников"];
    const rows = departments.map(dep => [
      dep.id, dep.name, employees.filter(e => e.departmentId === dep.id).length
    ]);
    writeXlsx([headers, ...rows], `Отделы_${getDate()}.xlsx`, "Отделы", [
      { wch: 5 }, { wch: 30 }, { wch: 20 },
    ]);
    showSuccess("Аналитика отделов сформирована");
  };

  const generateAttendanceReport = () => {
    const headers = ["Сотрудник", "Отдел", "Должность", "Вход", "Выход", "Часы", "Статус"];
    const statusLabels: Record<string, string> = {
      present: "На месте", left: "Ушёл", absent: "Отсутствует", excused: "Уважит.",
    };
    const rows = todayAttendance.map(att => {
      const totalH = Math.floor(att.totalMinutes / 60);
      const totalM = att.totalMinutes % 60;
      return [
        att.employeeName,
        att.departmentName || "—",
        att.positionName || "—",
        att.firstEntry ? new Date(att.firstEntry).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—",
        att.lastExit ? new Date(att.lastExit).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—",
        att.totalMinutes > 0 ? `${totalH}ч ${totalM}м` : "—",
        statusLabels[att.status] || att.status,
      ];
    });
    writeXlsx([headers, ...rows], `Посещаемость_${getDate()}.xlsx`, "Посещаемость", [
      { wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 },
    ]);
    showSuccess("Сводка посещаемости сформирована");
  };

  const generateMonthlyReport = () => {
    const headers = ["Показатель", "Значение"];
    const presentCount = todayAttendance.filter(a => a.status === "present").length;
    const rows: (string | number)[][] = [
      ["Всего сотрудников", employees.length],
      ["Всего отделов", departments.length],
      ["Всего должностей", positions.length],
      ["На месте сегодня", presentCount],
      ["Дата отчёта", new Date().toLocaleDateString("ru-RU")],
    ];
    writeXlsx([headers, ...rows], `Месячный_обзор_${getDate()}.xlsx`, "Обзор", [
      { wch: 25 }, { wch: 20 },
    ]);
    showSuccess("Месячный обзор сформирован");
  };

  // ───────── Табель за период (красивый цветной Excel через ExcelJS) ─────────
  const fmtHM = (min: number) => {
    if (!min || min <= 0) return "—";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h && m) return `${h}ч ${m}м`;
    if (h) return `${h}ч`;
    return `${m}м`;
  };

  const generateTimesheetReport = async () => {
    if (reportFrom > reportTo) {
      setReportError("Дата начала не может быть позже даты конца");
      return;
    }
    setReportError(null);
    setReportLoading(true);
    try {
      const [report, rangeRows] = await Promise.all([
        getAttendanceReport(reportFrom, reportTo),
        getAttendanceRange(reportFrom, reportTo).catch(() => [] as AttendanceSummary[]),
      ]);
      const rows = report.rows;
      if (rows.length === 0) {
        setReportError("За выбранный период нет данных");
        return;
      }

      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "КАДРЫ";
      wb.created = new Date();

      const companyName =
        (typeof window !== "undefined" && localStorage.getItem("currentCompanyName")) || "Холдинг";

      const ws = wb.addWorksheet("Табель", {
        views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });

      // Палитра
      const C = {
        title: "FF1E293B",
        emp: "FF334155",
        worked: "FF0F766E",
        days: "FF1D4ED8",
        absent: "FFB91C1C",
        late: "FFB45309",
        marks: "FFA16207",
        early: "FFC2410C",
        over: "FF15803D",
        white: "FFFFFFFF",
        border: "FFE2E8F0",
        zebra: "FFF8FAFC",
        totals: "FFE2E8F0",
        // светлые заливки ячеек-предупреждений
        lAbsent: "FFFEE2E2",
        lLate: "FFFEF3C7",
        lMarks: "FFFEF9C3",
        lEarly: "FFFFEDD5",
        lOver: "FFDCFCE7",
      };

      // 17 колонок
      ws.columns = [
        { width: 5 },   // 1 №
        { width: 30 },  // 2 ФИО
        { width: 20 },  // 3 Отдел
        { width: 22 },  // 4 Должность
        { width: 12 },  // 5 Отработано
        { width: 9 },   // 6 Рабочих дней
        { width: 10 },  // 7 Присутств.
        { width: 9 },   // 8 Прогулы
        { width: 8 },   // 9 Опозд. дней
        { width: 9 },   // 10 Опозд. минут
        { width: 11 },  // 11 Опозд. время
        { width: 10 },  // 12 Без входа
        { width: 10 },  // 13 Без выхода
        { width: 8 },   // 14 Ранний дней
        { width: 11 },  // 15 Ранний время
        { width: 9 },   // 16 Переработка дней
        { width: 12 },  // 17 Переработка время
      ];

      const lastCol = "Q";
      const setFill = (cell: any, argb: string) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      };
      const allBorder = (cell: any) => {
        cell.border = {
          top: { style: "thin", color: { argb: C.border } },
          left: { style: "thin", color: { argb: C.border } },
          bottom: { style: "thin", color: { argb: C.border } },
          right: { style: "thin", color: { argb: C.border } },
        };
      };

      // Строка 1 — заголовок
      ws.mergeCells(`A1:${lastCol}1`);
      const titleCell = ws.getCell("A1");
      titleCell.value = `Табель посещаемости — ${companyName}   (${toRuDate(reportFrom)} — ${toRuDate(reportTo)})`;
      titleCell.font = { bold: true, size: 14, color: { argb: C.white } };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      setFill(titleCell, C.title);
      ws.getRow(1).height = 28;

      // Строки 2-3 — двухуровневая шапка
      const groupHeader = (range: string, text: string, argb: string) => {
        ws.mergeCells(range);
        const c = ws.getCell(range.split(":")[0]);
        c.value = text;
        c.font = { bold: true, size: 11, color: { argb: C.white } };
        c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        setFill(c, argb);
        // рамки на всём диапазоне
        const [a, b] = range.split(":");
        const colA = a.replace(/\d/g, ""), rowA = +a.replace(/\D/g, "");
        const colB = b.replace(/\d/g, ""), rowB = +b.replace(/\D/g, "");
        for (let r = rowA; r <= rowB; r++) {
          for (let cc = colA.charCodeAt(0); cc <= colB.charCodeAt(0); cc++) {
            const cell = ws.getCell(`${String.fromCharCode(cc)}${r}`);
            setFill(cell, argb);
            allBorder(cell);
          }
        }
      };
      const colHeader = (addr: string, text: string, argb: string) => {
        const c = ws.getCell(addr);
        c.value = text;
        c.font = { bold: true, size: 10, color: { argb: C.white } };
        c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        setFill(c, argb);
        allBorder(c);
      };

      // Группы (row2) + одиночные колонки (merge 2:3 по вертикали)
      groupHeader("A2:D2", "Сотрудник", C.emp);
      groupHeader("E2:E3", "Отработано\n(ч:м)", C.worked);
      groupHeader("F2:F3", "Рабочих\nдней", C.days);
      groupHeader("G2:G3", "Был\nдней", C.days);
      groupHeader("H2:H3", "Прогулы\nдней", C.absent);
      groupHeader("I2:K2", "Опоздания", C.late);
      groupHeader("L2:L3", "Без\nвхода", C.marks);
      groupHeader("M2:M3", "Без\nвыхода", C.marks);
      groupHeader("N2:O2", "Ранний уход", C.early);
      groupHeader("P2:Q2", "Переработка", C.over);

      // Подзаголовки (row3) под группами «Сотрудник», «Опоздания», «Ранний уход», «Переработка»
      colHeader("A3", "№", C.emp);
      colHeader("B3", "ФИО", C.emp);
      colHeader("C3", "Отдел", C.emp);
      colHeader("D3", "Должность", C.emp);
      colHeader("I3", "дней", C.late);
      colHeader("J3", "минут", C.late);
      colHeader("K3", "время", C.late);
      colHeader("N3", "дней", C.early);
      colHeader("O3", "время", C.early);
      colHeader("P3", "дней", C.over);
      colHeader("Q3", "время", C.over);
      ws.getRow(2).height = 22;
      ws.getRow(3).height = 20;

      // Аккумулятор показателей (для итогов по отделам и общего ИТОГО)
      type Acc = { worked: number; absent: number; lateDays: number; lateMin: number; missIn: number; missOut: number; earlyDays: number; earlyMin: number; overDays: number; overMin: number };
      const newAcc = (): Acc => ({ worked: 0, absent: 0, lateDays: 0, lateMin: 0, missIn: 0, missOut: 0, earlyDays: 0, earlyMin: 0, overDays: 0, overMin: 0 });
      const addAcc = (a: Acc, r: AttendanceReportRow) => {
        a.worked += r.workedMinutes; a.absent += r.absentDays;
        a.lateDays += r.lateDays; a.lateMin += r.lateMinutes;
        a.missIn += r.missingInDays; a.missOut += r.missingOutDays;
        a.earlyDays += r.earlyLeaveDays; a.earlyMin += r.earlyLeaveMinutes;
        a.overDays += r.overworkDays; a.overMin += r.overworkMinutes;
      };
      const accValues = (a: Acc) => [
        fmtHM(a.worked), "", "",
        a.absent || "",
        a.lateDays || "", a.lateMin || "", a.lateMin ? fmtHM(a.lateMin) : "",
        a.missIn || "", a.missOut || "",
        a.earlyDays || "", a.earlyMin ? fmtHM(a.earlyMin) : "",
        a.overDays || "", a.overMin ? fmtHM(a.overMin) : "",
      ];

      const showDeptSubtotals = new Set(rows.map((r) => r.departmentName || "—")).size > 1;

      // Данные + итоги по отделам
      let rowIdx = 4;
      const grand = newAcc();
      let groupName: string | null = null;
      let groupAcc = newAcc();

      const writeDeptSubtotal = () => {
        if (!showDeptSubtotals || groupName === null) return;
        const sr = ws.getRow(rowIdx);
        sr.values = ["", `Итог: ${groupName}`, "", "", ...accValues(groupAcc)];
        ws.mergeCells(`B${rowIdx}:D${rowIdx}`);
        for (let c = 1; c <= 17; c++) {
          const cell = sr.getCell(c);
          allBorder(cell);
          setFill(cell, "FFEEF2F7");
          cell.font = { bold: true, italic: true, size: 10, color: { argb: "FF334155" } };
          cell.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center" };
        }
        sr.height = 18;
        rowIdx++;
      };

      rows.forEach((r: AttendanceReportRow, i) => {
        const curDept = r.departmentName || "—";
        if (groupName !== null && curDept !== groupName) {
          writeDeptSubtotal();
          groupAcc = newAcc();
        }
        groupName = curDept;

        const row = ws.getRow(rowIdx);
        row.values = [
          i + 1,
          r.employeeName,
          r.departmentName || "—",
          r.positionName || "—",
          fmtHM(r.workedMinutes),
          r.workingDays,
          r.presentDays,
          r.absentDays || "",
          r.lateDays || "",
          r.lateMinutes || "",
          r.lateMinutes ? fmtHM(r.lateMinutes) : "",
          r.missingInDays || "",
          r.missingOutDays || "",
          r.earlyLeaveDays || "",
          r.earlyLeaveMinutes ? fmtHM(r.earlyLeaveMinutes) : "",
          r.overworkDays || "",
          r.overworkMinutes ? fmtHM(r.overworkMinutes) : "",
        ];

        const zebra = i % 2 === 1;
        for (let c = 1; c <= 17; c++) {
          const cell = row.getCell(c);
          allBorder(cell);
          cell.font = { size: 10, color: { argb: "FF1E293B" } };
          cell.alignment = {
            vertical: "middle",
            horizontal: c === 2 || c === 3 || c === 4 ? "left" : "center",
            wrapText: false,
          };
          if (zebra) setFill(cell, C.zebra);
        }
        row.getCell(2).font = { size: 10, bold: true, color: { argb: "FF0F172A" } };

        // Условные заливки-предупреждения
        if (r.absentDays > 0) {
          setFill(row.getCell(8), C.lAbsent);
          row.getCell(8).font = { size: 10, bold: true, color: { argb: "FF991B1B" } };
        }
        if (r.lateDays > 0) {
          [9, 10, 11].forEach((c) => setFill(row.getCell(c), C.lLate));
          row.getCell(11).font = { size: 10, bold: true, color: { argb: "FF92400E" } };
        }
        if (r.missingInDays > 0) setFill(row.getCell(12), C.lMarks);
        if (r.missingOutDays > 0) setFill(row.getCell(13), C.lMarks);
        if (r.earlyLeaveDays > 0) {
          [14, 15].forEach((c) => setFill(row.getCell(c), C.lEarly));
        }
        if (r.overworkDays > 0) {
          [16, 17].forEach((c) => setFill(row.getCell(c), C.lOver));
          row.getCell(17).font = { size: 10, bold: true, color: { argb: "FF166534" } };
        }
        row.height = 18;
        rowIdx++;

        addAcc(groupAcc, r);
        addAcc(grand, r);
      });
      writeDeptSubtotal(); // итог последнего отдела

      // Итоговая строка
      const tRow = ws.getRow(rowIdx);
      tRow.values = ["", "ИТОГО", "", "", ...accValues(grand)];
      ws.mergeCells(`B${rowIdx}:D${rowIdx}`);
      for (let c = 1; c <= 17; c++) {
        const cell = tRow.getCell(c);
        allBorder(cell);
        setFill(cell, C.totals);
        cell.font = { bold: true, size: 10, color: { argb: "FF0F172A" } };
        cell.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center" };
      }
      tRow.height = 22;

      // ───────── Лист 2: «По дням» (детализация по фактическим отметкам) ─────────
      if (rangeRows.length > 0) {
        const wdNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
        const fmtTime = (iso: string | null) =>
          iso
            ? new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dushanbe" })
            : "—";

        const ds = wb.addWorksheet("По дням", {
          views: [{ state: "frozen", xSplit: 3, ySplit: 2 }],
          pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        });
        ds.columns = [
          { width: 12 }, { width: 6 }, { width: 30 }, { width: 20 },
          { width: 9 }, { width: 9 }, { width: 12 }, { width: 30 },
        ];

        ds.mergeCells("A1:H1");
        const dTitle = ds.getCell("A1");
        dTitle.value = `Детализация по дням — ${companyName}   (${toRuDate(reportFrom)} — ${toRuDate(reportTo)})`;
        dTitle.font = { bold: true, size: 13, color: { argb: C.white } };
        dTitle.alignment = { vertical: "middle", horizontal: "center" };
        setFill(dTitle, C.title);
        ds.getRow(1).height = 26;

        const dHeads = ["Дата", "День", "ФИО", "Отдел", "Вход", "Выход", "Отработано", "Пометки"];
        const hRow = ds.getRow(2);
        dHeads.forEach((h, i) => {
          const cell = hRow.getCell(i + 1);
          cell.value = h;
          cell.font = { bold: true, size: 10, color: { argb: C.white } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          setFill(cell, C.emp);
          allBorder(cell);
        });
        hRow.height = 20;

        let dIdx = 3;
        (rangeRows as AttendanceSummary[]).forEach((a, i) => {
          const dt = new Date(a.date + "T00:00:00Z");
          const iso = dt.getUTCDay();
          const isWeekend = iso === 0 || iso === 6;

          const marks: string[] = [];
          if (a.isLate) marks.push("Опоздание");
          if (a.isEarlyLeave) marks.push("Ранний уход");
          if (!a.firstEntry) marks.push("Без входа");
          if (!a.lastExit) marks.push("Без выхода");

          const row = ds.getRow(dIdx);
          row.values = [
            toRuDate(a.date),
            wdNames[iso],
            a.employeeName,
            a.departmentName || "—",
            fmtTime(a.firstEntry),
            fmtTime(a.lastExit),
            fmtHM(a.totalMinutes),
            marks.join(", "),
          ];

          const zebra = i % 2 === 1;
          for (let c = 1; c <= 8; c++) {
            const cell = row.getCell(c);
            allBorder(cell);
            cell.font = { size: 10, color: { argb: "FF1E293B" } };
            cell.alignment = { vertical: "middle", horizontal: c === 3 || c === 4 || c === 8 ? "left" : "center" };
            if (isWeekend) setFill(cell, "FFF1F5F9");
            else if (zebra) setFill(cell, C.zebra);
          }
          // подсветка пометок
          if (a.isLate || !a.firstEntry || !a.lastExit) {
            setFill(row.getCell(8), a.isLate ? C.lLate : C.lMarks);
            row.getCell(8).font = { size: 10, bold: true, color: { argb: "FF92400E" } };
          } else if (a.isEarlyLeave) {
            setFill(row.getCell(8), C.lEarly);
            row.getCell(8).font = { size: 10, bold: true, color: { argb: "FFC2410C" } };
          }
          row.height = 17;
          dIdx++;
        });

        ds.autoFilter = { from: "A2", to: `H${dIdx - 1}` };
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Табель_${toRuDate(reportFrom)}_${toRuDate(reportTo)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess("Табель сформирован (листы «Табель» и «По дням»)");
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Ошибка формирования отчёта");
    } finally {
      setReportLoading(false);
    }
  };

  const exportAll = () => {
    // Build a single workbook with all sheets
    const wb = XLSX.utils.book_new();

    // Sheet 1: Employees
    const empHeaders = ["ID", "Фамилия", "Имя", "Отчество", "Email", "Телефон", "Отдел", "Должность"];
    const empRows = employees.map(emp => [
      emp.id, emp.lastName, emp.firstName, emp.patronymic || "",
      emp.email || "", emp.phone || "", emp.department?.name || "", emp.position?.name || ""
    ]);
    const ws1 = XLSX.utils.aoa_to_sheet([empHeaders, ...empRows]);
    ws1["!cols"] = [{ wch: 5 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 25 }, { wch: 16 }, { wch: 22 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Сотрудники");

    // Sheet 2: Departments
    const depHeaders = ["ID", "Название отдела", "Кол-во сотрудников"];
    const depRows = departments.map(dep => [dep.id, dep.name, employees.filter(e => e.departmentId === dep.id).length]);
    const ws2 = XLSX.utils.aoa_to_sheet([depHeaders, ...depRows]);
    ws2["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Отделы");

    // Sheet 3: Attendance
    const attHeaders = ["Сотрудник", "Отдел", "Должность", "Вход", "Выход", "Часы", "Статус"];
    const statusLabels: Record<string, string> = { present: "На месте", left: "Ушёл", absent: "Отсутствует", excused: "Уважит." };
    const attRows = todayAttendance.map(att => {
      const h = Math.floor(att.totalMinutes / 60), m = att.totalMinutes % 60;
      return [
        att.employeeName, att.departmentName || "—", att.positionName || "—",
        att.firstEntry ? new Date(att.firstEntry).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—",
        att.lastExit ? new Date(att.lastExit).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—",
        att.totalMinutes > 0 ? `${h}ч ${m}м` : "—", statusLabels[att.status] || att.status,
      ];
    });
    const ws3 = XLSX.utils.aoa_to_sheet([attHeaders, ...attRows]);
    ws3["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Посещаемость");

    // Sheet 4: Monthly overview
    const presentCount = todayAttendance.filter(a => a.status === "present").length;
    const overviewData = [
      ["Показатель", "Значение"],
      ["Всего сотрудников", employees.length],
      ["Всего отделов", departments.length],
      ["Всего должностей", positions.length],
      ["На месте сегодня", presentCount],
      ["Дата отчёта", new Date().toLocaleDateString("ru-RU")],
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(overviewData);
    ws4["!cols"] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws4, "Обзор");

    XLSX.writeFile(wb, `HR_Отчёты_${getDate()}.xlsx`);
    showSuccess("Все отчёты экспортированы в один файл");
  };

  const presentToday = todayAttendance.filter(a => a.status === "present").length;
  const currentMonth = new Date().toLocaleString("ru-RU", { month: "short" }).replace(".", "");
  const currentMonthCap = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);

  const reportTypes = [
    {
      title: "Отчёт по сотрудникам",
      description: "Полный экспорт данных сотрудников",
      icon: Users,
      color: "from-emerald-500 to-teal-500",
      bg: "from-emerald-50 to-teal-50",
      action: generateEmployeeReport,
    },
    {
      title: "Аналитика отделов",
      description: "Распределение команд и структура",
      icon: Building2,
      color: "from-blue-500 to-cyan-500",
      bg: "from-blue-50 to-cyan-50",
      action: generateDepartmentReport,
    },
    {
      title: "Сводка посещаемости",
      description: "Рабочие часы и статусы за сегодня",
      icon: Clock,
      color: "from-purple-500 to-pink-500",
      bg: "from-purple-50 to-pink-50",
      action: generateAttendanceReport,
    },
    {
      title: "Месячный обзор",
      description: "Комплексная месячная статистика",
      icon: Calendar,
      color: "from-amber-500 to-orange-500",
      bg: "from-amber-50 to-orange-50",
      action: generateMonthlyReport,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {successMessage && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 sm:px-5 sm:py-4 text-white shadow-2xl shadow-emerald-500/30">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="font-medium text-sm sm:text-base">{successMessage}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Отчёты</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Генерация и экспорт HR-аналитики в Excel
              </p>
            </div>
          </div>
        </div>
        <Button
          className="h-9 sm:h-10 px-3 sm:px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:scale-105 text-xs sm:text-sm"
          onClick={exportAll}
        >
          <Download className="mr-1 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Экспортировать всё</span>
          <span className="sm:hidden">Все отчёты</span>
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-4">
        <div className="flex items-center gap-2 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-indigo-100">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{employees.length}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Сотрудников</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-100">
            <PieChart className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">4</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Типов отчётов</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-amber-100">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{presentToday}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">На месте сегодня</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 p-3 sm:p-4 shadow-sm">
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-purple-100">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
          </div>
          <div>
            <div className="text-lg sm:text-2xl font-bold">{currentMonthCap}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Текущий период</div>
          </div>
        </div>
      </div>

      {/* Табель за период — главный отчёт */}
      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader className="border-b border-teal-100/50 bg-gradient-to-r from-teal-50/60 to-emerald-50/60 p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-500 shadow-md shadow-teal-500/25">
              <Table2 className="h-4 w-4 text-white" />
            </div>
            Табель за период
          </CardTitle>
          <p className="text-xs sm:text-sm text-muted-foreground pl-10">
            Опоздания, прогулы, отметки и переработка по сотрудникам + итоги по отделам и лист «По дням» — цветной Excel
          </p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5 text-teal-600" /> Дата с
              </label>
              <RuDateInput
                value={reportFrom}
                max={reportTo}
                onChange={setReportFrom}
                className="w-40"
                inputClassName="border-slate-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5 text-teal-600" /> Дата по
              </label>
              <RuDateInput
                value={reportTo}
                min={reportFrom}
                onChange={setReportTo}
                className="w-40"
                inputClassName="border-slate-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              />
            </div>
            <Button
              onClick={generateTimesheetReport}
              disabled={reportLoading}
              className="h-10 px-5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 shadow-lg shadow-teal-500/25 text-white"
            >
              {reportLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Формирование...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" /> Сформировать табель
                </>
              )}
            </Button>
          </div>
          {reportError && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
              {reportError}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-200" /> Прогулы</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-200" /> Опоздания</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-yellow-200" /> Без отметки</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-orange-200" /> Ранний уход</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-green-200" /> Переработка</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader className="border-b border-emerald-100/50 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
            Доступные отчёты
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
            {reportTypes.map((report) => (
              <div
                key={report.title}
                className={`group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br ${report.bg} p-4 sm:p-6 border border-white/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer`}
              >
                <div
                  className={`mb-3 sm:mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${report.color} shadow-lg transition-transform group-hover:scale-110`}
                >
                  <report.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">{report.title}</h3>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{report.description}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 sm:mt-4 h-8 sm:h-9 rounded-lg border-white/50 bg-white/50 hover:bg-white text-xs sm:text-sm"
                  onClick={report.action}
                >
                  <Download className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Сформировать
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-200/50 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-indigo-100 flex-shrink-0">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-indigo-900">Скоро появится</h3>
            <p className="text-xs sm:text-sm text-indigo-700/70">
              Расширенная аналитика и конструктор отчётов находятся в разработке.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
