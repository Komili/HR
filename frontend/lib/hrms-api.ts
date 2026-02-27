import { apiFetch, apiFetchRaw } from "./api";
import type {
  Department,
  Position,
  EmployeeProfile,
  EmployeeDocument,
  Employee,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  Company,
  HoldingStats,
  InventoryItem,
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  InventoryHistory,
  Office,
  AttendanceSummary,
  SalaryRecord,
  RegistrationToken,
  PendingEmployee,
} from "./types";

// Helper to get current company ID from localStorage
function getCurrentCompanyId(): number | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("currentCompanyId");
  return stored ? parseInt(stored, 10) : null;
}

// Helper to add companyId to query params
function withCompanyId(params: URLSearchParams): URLSearchParams {
  const companyId = getCurrentCompanyId();
  if (companyId) {
    params.set("companyId", String(companyId));
  }
  return params;
}

// ============ COMPANIES ============

export async function getCompanies(): Promise<Company[]> {
  return apiFetch("/companies");
}

export async function getCompany(id: number): Promise<Company> {
  return apiFetch(`/companies/${id}`);
}

export async function getHoldingStats(): Promise<HoldingStats> {
  return apiFetch("/companies/stats");
}

export async function createCompany(data: Partial<Company>): Promise<Company> {
  return apiFetch("/companies", { method: "POST", body: data });
}

export async function updateCompany(id: number, data: Partial<Company>): Promise<Company> {
  return apiFetch(`/companies/${id}`, { method: "PATCH", body: data });
}

export async function deleteCompany(id: number): Promise<void> {
  await apiFetch(`/companies/${id}`, { method: "DELETE" });
}

// ============ EMPLOYEES ============

export async function getEmployees(
  page: number,
  limit: number,
  search: string,
): Promise<{ data: Employee[]; total: number }> {
  const params = withCompanyId(new URLSearchParams({
    page: String(page),
    limit: String(limit),
  }));
  if (search) params.set("search", search);
  return apiFetch(`/employees?${params.toString()}`);
}

export async function getEmployee(id: number): Promise<EmployeeProfile> {
  return apiFetch(`/employees/${id}`);
}

export async function createEmployee(data: CreateEmployeeInput): Promise<Employee> {
  const companyId = getCurrentCompanyId();
  if (!companyId) {
    throw new Error("Пожалуйста, выберите компанию в боковом меню");
  }
  return apiFetch("/employees", { method: "POST", body: { ...data, companyId } });
}

export async function updateEmployee(id: number, data: UpdateEmployeeInput): Promise<Employee> {
  return apiFetch(`/employees/${id}`, { method: "PATCH", body: data });
}

export async function deleteEmployee(id: number): Promise<void> {
  await apiFetch(`/employees/${id}`, { method: "DELETE" });
}

export async function uploadEmployeePhoto(employeeId: number, file: File): Promise<Employee> {
  const formData = new FormData();
  formData.append("photo", file);
  return apiFetch(`/employees/${employeeId}/photo`, { method: "POST", body: formData });
}

export function getEmployeePhotoUrl(employeeId: number, thumb?: boolean): string {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  return `${API_URL}/employees/${employeeId}/photo${thumb ? '?thumb=1' : ''}`;
}

// ============ DEPARTMENTS ============

export async function getDepartments(): Promise<Department[]> {
  const params = withCompanyId(new URLSearchParams());
  const query = params.toString();
  return apiFetch(`/departments${query ? `?${query}` : ""}`);
}

export async function createDepartment(name: string): Promise<Department> {
  const companyId = getCurrentCompanyId();
  if (!companyId) {
    throw new Error("Пожалуйста, выберите компанию в боковом меню");
  }
  return apiFetch("/departments", { method: "POST", body: { name, companyId } });
}

export async function updateDepartment(id: number, name: string): Promise<Department> {
  return apiFetch(`/departments/${id}`, { method: "PATCH", body: { name } });
}

export async function deleteDepartment(id: number): Promise<void> {
  await apiFetch(`/departments/${id}`, { method: "DELETE" });
}

// ============ POSITIONS ============

export async function getPositions(): Promise<Position[]> {
  const params = withCompanyId(new URLSearchParams());
  const query = params.toString();
  return apiFetch(`/positions${query ? `?${query}` : ""}`);
}

export async function createPosition(name: string): Promise<Position> {
  const companyId = getCurrentCompanyId();
  if (!companyId) {
    throw new Error("Пожалуйста, выберите компанию в боковом меню");
  }
  return apiFetch("/positions", { method: "POST", body: { name, companyId } });
}

export async function updatePosition(id: number, name: string): Promise<Position> {
  return apiFetch(`/positions/${id}`, { method: "PATCH", body: { name } });
}

export async function deletePosition(id: number): Promise<void> {
  await apiFetch(`/positions/${id}`, { method: "DELETE" });
}

// ============ DOCUMENTS ============

export async function getEmployeeDocuments(employeeId: number): Promise<EmployeeDocument[]> {
  return apiFetch(`/documents/employee/${employeeId}`);
}

export async function uploadEmployeeDocument(
  employeeId: number,
  documentType: string,
  file: File,
): Promise<EmployeeDocument> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("documentType", documentType);

  const response = await apiFetchRaw(`/documents/upload/employee/${employeeId}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to upload document");
  }

  return response.json();
}

export async function downloadDocument(documentId: number): Promise<Blob> {
  const response = await apiFetchRaw(`/documents/${documentId}/download`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to download document");
  }
  return response.blob();
}

export async function viewDocument(documentId: number): Promise<Blob> {
  const response = await apiFetchRaw(`/documents/${documentId}/view`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to view document");
  }
  return response.blob();
}

// ============ INVENTORY ============

export async function getInventoryItems(
  page: number,
  limit: number,
  search: string,
): Promise<{ data: InventoryItem[]; total: number }> {
  const params = withCompanyId(new URLSearchParams({
    page: String(page),
    limit: String(limit),
  }));
  if (search) params.set("search", search);
  return apiFetch(`/inventory?${params.toString()}`);
}

export async function getInventoryItem(id: number): Promise<InventoryItem> {
  return apiFetch(`/inventory/${id}`);
}

export async function createInventoryItem(data: CreateInventoryItemInput): Promise<InventoryItem> {
  const companyId = getCurrentCompanyId();
  if (!companyId) {
    throw new Error("Пожалуйста, выберите компанию в боковом меню");
  }
  return apiFetch("/inventory", { method: "POST", body: { ...data, companyId } });
}

export async function updateInventoryItem(id: number, data: UpdateInventoryItemInput): Promise<InventoryItem> {
  return apiFetch(`/inventory/${id}`, { method: "PATCH", body: data });
}

export async function deleteInventoryItem(id: number): Promise<void> {
  await apiFetch(`/inventory/${id}`, { method: "DELETE" });
}

export async function getEmployeeInventory(employeeId: number): Promise<InventoryItem[]> {
  return apiFetch(`/inventory/employee/${employeeId}`);
}

export async function assignInventoryToEmployee(itemId: number, employeeId: number): Promise<InventoryItem> {
  return apiFetch(`/inventory/${itemId}/assign/${employeeId}`, { method: "PATCH" });
}

export async function unassignInventoryFromEmployee(itemId: number): Promise<InventoryItem> {
  return apiFetch(`/inventory/${itemId}/unassign`, { method: "PATCH" });
}

export async function getInventoryHistory(itemId: number): Promise<InventoryHistory[]> {
  return apiFetch(`/inventory/${itemId}/history`);
}

// ============ OFFICES ============

export async function getOffices(): Promise<Office[]> {
  const params = withCompanyId(new URLSearchParams());
  const query = params.toString();
  return apiFetch(`/offices${query ? `?${query}` : ""}`);
}

export async function createOffice(name: string, address?: string): Promise<Office> {
  const companyId = getCurrentCompanyId();
  const payload: any = { name };
  if (address) payload.address = address;
  if (companyId) payload.companyId = companyId;
  return apiFetch("/offices", { method: "POST", body: payload });
}

export async function updateOffice(id: number, name: string, address?: string): Promise<Office> {
  const payload: any = { name };
  if (address !== undefined) payload.address = address;
  return apiFetch(`/offices/${id}`, { method: "PATCH", body: payload });
}

export async function deleteOffice(id: number): Promise<void> {
  await apiFetch(`/offices/${id}`, { method: "DELETE" });
}

// ============ ATTENDANCE ============

export async function getAttendance(date: string): Promise<AttendanceSummary[]> {
  const params = withCompanyId(new URLSearchParams({ date }));
  return apiFetch(`/attendance?${params.toString()}`);
}

export async function getAttendanceRange(
  dateFrom: string,
  dateTo: string,
): Promise<AttendanceSummary[]> {
  const params = withCompanyId(new URLSearchParams({ dateFrom, dateTo }));
  return apiFetch(`/attendance/range?${params.toString()}`);
}

export async function getEmployeeAttendance(
  employeeId: number,
  month: number,
  year: number,
): Promise<AttendanceSummary[]> {
  return apiFetch(`/attendance/employee/${employeeId}?month=${month}&year=${year}`);
}

export async function correctAttendance(
  id: number,
  correctionMinutes: number,
  note: string,
): Promise<AttendanceSummary> {
  return apiFetch(`/attendance/${id}/correct`, {
    method: "PATCH",
    body: { correctionMinutes, note },
  });
}

export async function registerAttendanceEvent(
  employeeId: number,
  direction: "IN" | "OUT",
  officeId?: number,
): Promise<any> {
  const payload: any = { employeeId, direction };
  if (officeId) payload.officeId = officeId;
  return apiFetch("/attendance/event", { method: "POST", body: payload });
}

// ============ SALARY ============

export async function getSalaries(month: number, year: number): Promise<SalaryRecord[]> {
  const params = withCompanyId(new URLSearchParams({ month: String(month), year: String(year) }));
  return apiFetch(`/salary?${params.toString()}`);
}

export async function getEmployeeSalaries(employeeId: number, year: number): Promise<SalaryRecord[]> {
  return apiFetch(`/salary/employee/${employeeId}?year=${year}`);
}

export async function calculateSalaries(month: number, year: number): Promise<{ calculated: number }> {
  const params = withCompanyId(new URLSearchParams({ month: String(month), year: String(year) }));
  return apiFetch(`/salary/calculate?${params.toString()}`, { method: "POST" });
}

export async function updateSalary(id: number, data: { bonus?: number; deduction?: number; note?: string }): Promise<SalaryRecord> {
  return apiFetch(`/salary/${id}`, { method: "PATCH", body: data });
}

// ============ REGISTRATION ============

export async function getPendingRegistrations(companyId?: number): Promise<PendingEmployee[]> {
  const params = companyId
    ? new URLSearchParams({ companyId: String(companyId) })
    : withCompanyId(new URLSearchParams());
  const query = params.toString();
  return apiFetch(`/employees/pending${query ? `?${query}` : ""}`);
}

export async function approveRegistration(
  id: number,
  updates?: { departmentId?: number; positionId?: number },
): Promise<Employee> {
  return apiFetch(`/employees/${id}/approve`, { method: "PATCH", body: updates || {} });
}

export async function rejectRegistration(id: number): Promise<Employee> {
  return apiFetch(`/employees/${id}/reject`, { method: "PATCH" });
}

export async function getRegistrationTokens(companyId?: number): Promise<RegistrationToken[]> {
  const params = companyId
    ? new URLSearchParams({ companyId: String(companyId) })
    : withCompanyId(new URLSearchParams());
  const query = params.toString();
  return apiFetch(`/registration/tokens${query ? `?${query}` : ""}`);
}

export async function createRegistrationToken(companyId: number): Promise<RegistrationToken> {
  return apiFetch("/registration/tokens", { method: "POST", body: { companyId } });
}

export async function deleteRegistrationToken(id: number): Promise<void> {
  await apiFetch(`/registration/tokens/${id}`, { method: "DELETE" });
}

// ============ USERS (Admin) ============

export async function getUsers(): Promise<import("./types").SystemUser[]> {
  return apiFetch("/users");
}

export async function getRoles(): Promise<import("./types").Role[]> {
  return apiFetch("/users/roles");
}

export async function createUser(data: {
  email: string; password: string; firstName?: string; lastName?: string; roleId: number; companyId?: number;
}): Promise<import("./types").SystemUser> {
  return apiFetch("/users", { method: "POST", body: data });
}

export async function updateUser(id: number, data: {
  email?: string; firstName?: string; lastName?: string; roleId?: number; companyId?: number | null; isActive?: boolean;
}): Promise<import("./types").SystemUser> {
  return apiFetch(`/users/${id}`, { method: "PATCH", body: data });
}

export async function changeUserPassword(id: number, newPassword: string): Promise<void> {
  await apiFetch(`/users/${id}/password`, { method: "PATCH", body: { newPassword } });
}

export async function deleteUser(id: number): Promise<void> {
  await apiFetch(`/users/${id}`, { method: "DELETE" });
}
