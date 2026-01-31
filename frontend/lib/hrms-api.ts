import { apiFetch, apiFetchRaw } from "./api";
import type {
  Department,
  Position,
  EmployeeProfile,
  EmployeeDocument,
  Employee,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "./types";

export async function getEmployees(
  page: number,
  limit: number,
  search: string,
): Promise<{ data: Employee[]; total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) params.set("search", search);
  return apiFetch(`/employees?${params.toString()}`);
}

export async function getEmployee(id: number): Promise<EmployeeProfile> {
  return apiFetch(`/employees/${id}`);
}

export async function createEmployee(data: CreateEmployeeInput): Promise<Employee> {
  return apiFetch("/employees", { method: "POST", body: data });
}

export async function updateEmployee(id: number, data: UpdateEmployeeInput): Promise<Employee> {
  return apiFetch(`/employees/${id}`, { method: "PATCH", body: data });
}

export async function deleteEmployee(id: number): Promise<void> {
  await apiFetch(`/employees/${id}`, { method: "DELETE" });
}

export async function getDepartments(): Promise<Department[]> {
  return apiFetch("/departments");
}

export async function createDepartment(name: string): Promise<Department> {
  return apiFetch("/departments", { method: "POST", body: { name } });
}

export async function updateDepartment(id: number, name: string): Promise<Department> {
  return apiFetch(`/departments/${id}`, { method: "PATCH", body: { name } });
}

export async function deleteDepartment(id: number): Promise<void> {
  await apiFetch(`/departments/${id}`, { method: "DELETE" });
}

export async function getPositions(): Promise<Position[]> {
  return apiFetch("/positions");
}

export async function createPosition(name: string): Promise<Position> {
  return apiFetch("/positions", { method: "POST", body: { name } });
}

export async function updatePosition(id: number, name: string): Promise<Position> {
  return apiFetch(`/positions/${id}`, { method: "PATCH", body: { name } });
}

export async function deletePosition(id: number): Promise<void> {
  await apiFetch(`/positions/${id}`, { method: "DELETE" });
}

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
