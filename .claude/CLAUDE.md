# КАДРЫ - HR Management System (Multi-Tenant Holding)

## Project Overview
Multi-tenant HR management web application for a holding company with 8 companies. Russian language interface.

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
2. **Кадровик** - Full CRUD on employees, departments, positions, documents (own company only)
3. **Руководитель** - View employees list and profiles (own company only)
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
│   │   ├── companies/      # Company CRUD (NEW)
│   │   ├── employees/      # CRUD with companyId filter
│   │   ├── departments/    # CRUD with companyId filter
│   │   ├── positions/      # CRUD with companyId filter
│   │   ├── documents/      # File upload/download
│   │   ├── users/          # User management
│   │   └── prisma/         # Prisma service
│   └── prisma/
│       ├── schema.prisma   # DB schema with Company model
│       ├── seed.ts         # TypeScript seed
│       └── seed.js         # JavaScript seed (for Docker)
├── frontend/                # Next.js app
│   ├── app/
│   │   ├── (app)/          # Protected routes
│   │   │   ├── dashboard/
│   │   │   ├── employees/  # List + [id] profile
│   │   │   ├── departments/
│   │   │   ├── positions/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── (auth)/login/
│   │   └── contexts/       # Auth context with company switching
│   ├── components/         # UI components with CompanySelector
│   └── lib/               # API client, types
└── docker/nginx/          # Nginx config
```

## API Endpoints
All endpoints prefixed with `/api`:

### Auth
- POST /api/auth/login - Login (returns companyId, isHoldingAdmin in token)

### Companies (NEW)
- GET /api/companies - List companies (superadmin sees all, others see own)
- GET /api/companies/stats - Holding statistics (superadmin only)
- GET /api/companies/:id - Get company
- POST /api/companies - Create company (superadmin only)
- PATCH /api/companies/:id - Update company (superadmin only)
- DELETE /api/companies/:id - Delete company (superadmin only)

### Employees (with companyId filter)
- GET /api/employees?companyId=X - List (filtered by user's company or specified)
- POST /api/employees - Create (companyId from user or body)
- GET /api/employees/:id - Get (access check)
- PATCH /api/employees/:id - Update (access check)
- DELETE /api/employees/:id - Delete (access check)

### Departments & Positions (with companyId filter)
- GET /api/departments?companyId=X
- GET /api/positions?companyId=X
- POST/PATCH/DELETE with access checks

### Documents
- GET /api/documents/employee/:id
- POST /api/documents/upload/employee/:id
- GET /api/documents/:id/download
- GET /api/documents/:id/view

## Multi-Tenancy Implementation

### Database Schema
- `Company` model with id, name, shortName, inn, address, etc.
- All entities have `companyId` foreign key
- `User.isHoldingAdmin` flag for superadmins
- Unique constraints: `@@unique([name, companyId])` for departments/positions

### Backend
- `RequestUser` interface includes `companyId`, `isHoldingAdmin`
- All services have `getCompanyFilter()` method
- Superadmins can pass `?companyId=X` to filter
- Regular users always filtered by their `companyId`
- `ForbiddenException` for cross-company access

### Frontend
- `AuthContext` manages `currentCompanyId`, `currentCompanyName`
- `CompanySelector` component in sidebar for superadmins
- API calls automatically include companyId from localStorage
- Amber/orange theme for superadmin UI elements

## Docker Commands
```bash
# Start all services
docker-compose up -d --build

# Seed database (IMPORTANT: run after schema migration)
docker cp backend/prisma/seed.js hrms_backend:/app/prisma/seed.js
docker-compose exec backend npx prisma migrate reset --force

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Reset database with new schema
docker-compose down -v && docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build frontend
docker-compose up -d --build backend

# Access storage (employee documents by company)
ls storage/companies/
```

## Storage Structure (Updated)
Documents are now stored by company:
`storage/companies/{CompanyName}/employees/{FirstName}_{LastName}_{id}/docs/`

## Important Notes
- Next.js 15 uses Promise-based params - use `React.use(params)` in client components
- Frontend uses `output: "standalone"` for Docker
- Backend uses `/api` global prefix
- CORS configured for localhost ports
- Superadmin sees all data when no company selected (dropdown shows "Все компании")
- Regular users only see their company's data

## Files Modified for Multi-Tenancy
- backend/prisma/schema.prisma - Added Company model, companyId to all entities
- backend/prisma/seed.ts & seed.js - 8 companies, 5 superadmins
- backend/src/companies/* - New module for company management
- backend/src/auth/* - Updated JWT payload with companyId, isHoldingAdmin
- backend/src/employees/* - companyId filtering
- backend/src/departments/* - companyId filtering
- backend/src/positions/* - companyId filtering
- frontend/lib/types.ts - Company type, updated AuthUser
- frontend/app/contexts/AuthContext.tsx - Company switching
- frontend/components/dashboard-layout.tsx - CompanySelector component
- frontend/lib/hrms-api.ts - companyId in API calls
