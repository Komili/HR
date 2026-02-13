# КАДРЫ - HR Management System (Multi-Tenant Holding)

## Project Overview
Multi-tenant HR management web application for a holding company with 8 companies. Russian language interface. Full mobile responsiveness.

## Architecture
```
                    ┌─────────────────┐
                    │    ХОЛДИНГ      │
                    │  (Суперадмин)   │
                    └────────┬────────┘
                             │ видит ВСЁ
    ┌────────┬───────┬───────┼───────┬────────┬────────┬────────┐
    ▼        ▼       ▼       ▼       ▼        ▼        ▼        ▼
┌───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┐
│Бунёд  │Дезин- │Макон  │Макон  │Роҳҳои │ Фавз  │Фавз   │Фавз   │
│Интер. │фекция │       │(Маг.) │ Фавз  │       │Кемик. │Климат │
└───────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘
        Каждая компания изолирована друг от друга
```

## Tech Stack
- **Backend**: NestJS 11 + TypeScript + Prisma ORM
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS + shadcn/ui
- **Database**: MySQL 8.0
- **Auth**: JWT + Passport.js + bcrypt
- **Containerization**: Docker + docker-compose + Nginx
- **Tables**: TanStack React Table
- **Export**: XLSX (SheetJS)

## Key Ports
- MySQL: 7171 (external) / 3306 (internal)
- Backend: 7272 (external) / 7070 (internal)
- Frontend: 7373 (external) / 7070 (internal)
- Nginx (main): **7474**

## Test Credentials

### Суперадмины холдинга (доступ ко ВСЕМ компаниям)
- admin1@holding.tj / password
- admin2@holding.tj / password
- admin3@holding.tj / password
- admin4@holding.tj / password
- admin5@holding.tj / password

### Бунёд Интернешнл
- hr@bunyod.tj / password (Кадровик)
- manager@bunyod.tj / password (Руководитель)
- accountant@bunyod.tj / password (Бухгалтер)

### Фавз
- hr@favz.tj / password (Кадровик)
- manager@favz.tj / password (Руководитель)

## User Roles (RBAC)
1. **Суперадмин** - Full access to ALL companies, can switch between companies
2. **Кадровик** - Full CRUD on employees, departments, positions, documents, inventory, attendance (own company only)
3. **Руководитель** - View employees, correct attendance (own company only)
4. **Бухгалтер** - View employee profiles only (own company only)
5. **Сотрудник** - No access to employee data

## Companies (8)
1. Бунёд Интернешнл
2. Дезинфекция
3. Макон
4. Макон (Магазин)
5. Роҳҳои Фавз
6. Фавз
7. Фавз Кемикал
8. Фавз Климат

## Project Structure
```
HR/
├── backend/                 # NestJS API
│   ├── src/
│   │   ├── auth/           # JWT, Passport, Guards
│   │   ├── companies/      # Company CRUD
│   │   ├── employees/      # CRUD with companyId filter
│   │   ├── departments/    # CRUD with companyId filter
│   │   ├── positions/      # CRUD with companyId filter
│   │   ├── documents/      # File upload/download
│   │   ├── inventory/      # Inventory management + history
│   │   ├── offices/        # Office locations per company
│   │   ├── attendance/     # Attendance tracking + correction
│   │   ├── users/          # User management
│   │   └── prisma/         # Prisma service
│   └── prisma/
│       ├── schema.prisma   # DB schema
│       ├── seed.ts         # TypeScript seed
│       └── seed.js         # JavaScript seed (for Docker)
├── frontend/                # Next.js app
│   ├── app/
│   │   ├── (app)/          # Protected routes
│   │   │   ├── dashboard/  # Main dashboard with stats
│   │   │   ├── employees/  # List + [id] profile with tabs
│   │   │   ├── departments/
│   │   │   ├── positions/
│   │   │   ├── inventory/  # Inventory management (TanStack Table)
│   │   │   ├── attendance/ # Attendance tracking with color coding
│   │   │   ├── reports/    # Report generation (CSV export)
│   │   │   └── settings/   # Company & office settings
│   │   ├── (auth)/login/
│   │   └── contexts/       # Auth context with company switching
│   ├── components/         # UI components with CompanySelector
│   └── lib/               # API client, types
└── docker/nginx/          # Nginx config
```

## Database Models (Prisma)
- **Company** — holding companies (8)
- **User** — system users with roles
- **Role** — RBAC roles (5)
- **Employee** — company employees
- **Department** — company departments (unique per company)
- **Position** — job positions (unique per company)
- **EmployeeDocument** — uploaded files per employee
- **InventoryItem** — company inventory with assignment
- **InventoryHistory** — audit trail for inventory changes
- **Office** — office locations per company
- **AttendanceEvent** — raw IN/OUT scan events
- **Attendance** — daily attendance summary per employee
- **AuditLog** — system audit log

## API Endpoints
All endpoints prefixed with `/api`:

### Auth
- POST /api/auth/login — Login (returns companyId, isHoldingAdmin in token)

### Companies
- GET /api/companies — List companies (superadmin sees all, others see own)
- GET /api/companies/stats — Holding statistics (superadmin only)
- GET /api/companies/:id — Get company
- POST /api/companies — Create (superadmin only)
- PATCH /api/companies/:id — Update (superadmin only)
- DELETE /api/companies/:id — Delete (superadmin only)

### Employees (with companyId filter)
- GET /api/employees?companyId=X&page=N&limit=N&search=S — List
- POST /api/employees — Create
- GET /api/employees/:id — Get profile
- PATCH /api/employees/:id — Update
- DELETE /api/employees/:id — Delete

### Departments & Positions (with companyId filter)
- GET /api/departments?companyId=X
- GET /api/positions?companyId=X
- POST/PATCH/DELETE with access checks

### Documents
- GET /api/documents/employee/:id — List documents
- POST /api/documents/upload/employee/:id — Upload
- GET /api/documents/:id/download — Download
- GET /api/documents/:id/view — Inline view

### Inventory
- GET /api/inventory?companyId=X&page=N&limit=N&search=S — List
- GET /api/inventory/:id — Get item
- POST /api/inventory — Create
- PATCH /api/inventory/:id — Update
- DELETE /api/inventory/:id — Delete
- GET /api/inventory/employee/:id — Employee's inventory
- PATCH /api/inventory/:id/assign/:employeeId — Assign to employee
- PATCH /api/inventory/:id/unassign — Unassign
- GET /api/inventory/:id/history — Item history

### Offices
- GET /api/offices?companyId=X — List offices
- POST /api/offices — Create
- PATCH /api/offices/:id — Update
- DELETE /api/offices/:id — Delete

### Attendance
- GET /api/attendance?date=YYYY-MM-DD&companyId=X — Daily summary
- GET /api/attendance/range?dateFrom=&dateTo=&companyId=X — Date range
- GET /api/attendance/employee/:id?month=M&year=Y — Employee monthly
- PATCH /api/attendance/:id/correct — Correct time (±minutes)
- POST /api/attendance/event — Register IN/OUT event

## Multi-Tenancy Implementation

### Database Schema
- `Company` model with id, name, shortName, inn, address, etc.
- All entities have `companyId` foreign key
- `User.isHoldingAdmin` flag for superadmins
- Unique constraints: `@@unique([name, companyId])` for departments/positions/offices/inventory

### Backend Pattern
- `RequestUser` interface includes `companyId`, `isHoldingAdmin`
- All services have `getCompanyFilter(user, requestedCompanyId?)` method
- Superadmins can pass `?companyId=X` to filter by company
- Regular users always filtered by their `companyId`
- `ForbiddenException` for cross-company access

### Frontend Pattern
- `AuthContext` manages `currentCompanyId`, `currentCompanyName`
- `CompanySelector` component in sidebar for superadmins
- API calls use `withCompanyId()` helper to include companyId from localStorage
- Amber/orange theme for superadmin UI elements

## Docker Commands
```bash
# Start all services
docker-compose up -d --build

# Seed database
docker-compose exec backend npx prisma migrate reset --force

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Reset database with new schema
docker-compose down -v && docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build frontend
docker-compose up -d --build backend
```

## Storage Structure
Documents stored by company:
`storage/companies/{CompanyName}/employees/{FirstName}_{LastName}_{id}/docs/`

## Important Notes
- Next.js 15 uses Promise-based params — use `React.use(params)` in client components
- Frontend uses `output: "standalone"` for Docker
- Backend uses `/api` global prefix
- CORS configured for localhost ports
- Superadmin sees all data when no company selected (dropdown shows "Все компании")
- Regular users only see their company's data
- Dynamic Tailwind classes don't work (JIT purge) — use explicit class names
- All pages are mobile responsive with `sm:` breakpoints
- TanStack React Table used for inventory and attendance tables
