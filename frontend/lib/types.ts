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

export type SystemUser = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roleId: number;
  role: { name: string };
  companyId: number | null;
  company: { id: number; name: string; shortName: string | null } | null;
  isHoldingAdmin: boolean;
  isActive: boolean;
  createdAt: string;
};

export type Role = {
  id: number;
  name: string;
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
  photoPath?: string | null;
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

export type Office = {
  id: number;
  name: string;
  address: string | null;
  companyId: number;
  company?: { id: number; name: string };
};

export type AttendanceEvent = {
  id: number;
  employeeId: number;
  timestamp: string;
  direction: "IN" | "OUT";
  deviceName: string | null;
  officeId: number | null;
  officeName?: string;
};

export type AttendanceSummary = {
  id: number;
  employeeId: number;
  employeeName: string;
  departmentName: string | null;
  positionName: string | null;
  date: string;
  firstEntry: string | null;
  lastExit: string | null;
  status: "present" | "left" | "absent" | "excused";
  totalMinutes: number;
  correctionMinutes: number;
  correctedBy: string | null;
  correctionNote: string | null;
  officeName: string | null;
};

export type SalaryRecord = {
  id: number;
  employeeId: number;
  companyId: number;
  month: number;
  year: number;
  baseSalary: number;
  workedDays: number;
  totalDays: number;
  workedHours: number;
  bonus: number;
  deduction: number;
  note: string | null;
  totalAmount: number;
  calculatedBy: string | null;
  employee?: {
    id: number;
    firstName: string;
    lastName: string;
    patronymic: string | null;
    salary: number | null;
    department: { name: string } | null;
    position: { name: string } | null;
  };
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
