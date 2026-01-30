export type AuthUser = {
  email: string;
  sub: number;
  role: string;
  iat?: number;
  exp?: number;
};

export type Department = {
  id: number;
  name: string;
};

export type Position = {
  id: number;
  name: string;
};

export type EmployeeProfile = {
  id: number;
  firstName: string;
  lastName: string;
  patronymic?: string | null;
  latinFirstName?: string | null;
  latinLastName?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  department: { name: string } | null;
  position: { name: string } | null;
};

export type Employee = {
  id: number;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  latinFirstName: string;
  latinLastName: string;
  position: { name: string } | null;
  department: { name: string } | null;
  departmentId: number | null;
  positionId: number | null;
  email: string | null;
  phone: string | null;
};

export type EmployeeDocument = {
  id: number;
  type: string;
  fileName: string;
  filePath?: string;
};

export type CreateEmployeeInput = {
  firstName: string;
  lastName: string;
  patronymic?: string;
  latinFirstName: string;
  latinLastName: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  address?: string;
  departmentId?: number;
  positionId?: number;
  salary?: number;
  hireDate?: string;
  status?: string;
  notes?: string;
};

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;
