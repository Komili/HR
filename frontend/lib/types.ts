export type AuthUser = {
  email: string;
  sub: number;
  role: string;
  companyId: number | null;
  companyName: string | null;
  isHoldingAdmin: boolean;
  iat?: number;
  exp?: number;
};

export type Company = {
  id: number;
  name: string;
  shortName: string | null;
  inn?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  _count?: {
    employees: number;
    departments: number;
    positions: number;
    users: number;
  };
};

export type Department = {
  id: number;
  name: string;
  companyId?: number;
  company?: {
    id: number;
    name: string;
  };
};

export type Position = {
  id: number;
  name: string;
  companyId?: number;
  company?: {
    id: number;
    name: string;
  };
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
  companyId: number;
  company: { id: number; name: string } | null;
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
  company: { id: number; name: string } | null;
  companyId: number;
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
  companyId?: number;
  salary?: number;
  hireDate?: string;
  status?: string;
  notes?: string;
};

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

export type InventoryItem = {
  id: number;
  name: string;
  model: string | null;
  category: string | null;
  inventoryNumber: string | null;
  price: number | null;
  acquisitionDate: string | null;
  description: string | null;
  status: string;
  companyId: number;
  employeeId: number | null;
  company?: { id: number; name: string } | null;
  employee?: {
    id: number;
    firstName: string;
    lastName: string;
    patronymic: string | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateInventoryItemInput = {
  name: string;
  model?: string;
  category?: string;
  inventoryNumber?: string;
  price?: number;
  acquisitionDate?: string;
  description?: string;
  status?: string;
  companyId?: number;
  employeeId?: number;
};

export type UpdateInventoryItemInput = Partial<CreateInventoryItemInput>;

export type InventoryHistory = {
  id: number;
  action: string;
  details: string | null;
  employeeName: string | null;
  performedBy: string;
  createdAt: string;
};

export type HoldingStats = {
  totalCompanies: number;
  totalEmployees: number;
  totalDepartments: number;
  totalPositions: number;
  companiesStats: Array<{
    id: number;
    name: string;
    shortName: string | null;
    employeesCount: number;
    departmentsCount: number;
  }>;
};
