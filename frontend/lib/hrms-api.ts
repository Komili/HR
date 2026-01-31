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
  const payload = companyId ? { ...data, companyId } : data;
  return apiFetch("/employees", { method: "POST", body: payload });
}

export async function updateEmployee(id: number, data: UpdateEmployeeInput): Promise<Employee> {
  return apiFetch(`/employees/${id}`, { method: "PATCH", body: data });
}

export async function deleteEmployee(id: number): Promise<void> {
  await apiFetch(`/employees/${id}`, { method: "DELETE" });
}

// ============ DEPARTMENTS ============

export async function getDepartments(): Promise<Department[]> {
  const params = withCompanyId(new URLSearchParams());
  const query = params.toString();
  return apiFetch(`/departments${query ? `?${query}` : ""}`);
}

export async function createDepartment(name: string): Promise<Department> {
  const companyId = getCurrentCompanyId();
  const payload = companyId ? { name, companyId } : { name };
  return apiFetch("/departments", { method: "POST", body: payload });
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
  const payload = companyId ? { name, companyId } : { name };
  return apiFetch("/positions", { method: "POST", body: payload });
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
