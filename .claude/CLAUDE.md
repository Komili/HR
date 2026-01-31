# КАДРЫ - HR Management System

## Project Overview
HR management web application for internal company use. Russian language interface.

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
- hr@example.com / password (Кадровик - full access)
- manager@example.com / password (Руководитель - view employees)
- accountant@example.com / password (Бухгалтер - view employees)

## User Roles (RBAC)
1. **Кадровик** - Full CRUD on employees, departments, positions, documents
2. **Руководитель** - View employees list and profiles
3. **Бухгалтер** - View employee profiles only
4. **Сотрудник** - No access to employee data

## Project Structure
```
HR/
├── backend/                 # NestJS API
│   ├── src/
│   │   ├── auth/           # JWT, Passport, Guards
│   │   ├── employees/      # CRUD
│   │   ├── departments/    # CRUD
│   │   ├── positions/      # CRUD
│   │   ├── documents/      # File upload/download
│   │   ├── users/          # User management
│   │   └── prisma/         # Prisma service
│   └── prisma/
│       ├── schema.prisma   # DB schema
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
│   │   └── contexts/       # Auth context
│   ├── components/         # UI components
│   └── lib/               # API client, types
└── docker/nginx/          # Nginx config
```

## API Endpoints
All endpoints prefixed with `/api`:
- POST /api/auth/login - Login
- GET/POST /api/employees - List/Create
- GET/PATCH/DELETE /api/employees/:id
- GET/POST/PATCH/DELETE /api/departments/:id
- GET/POST/PATCH/DELETE /api/positions/:id
- GET /api/documents/employee/:id
- POST /api/documents/upload/employee/:id
- GET /api/documents/:id/download - Download file (Content-Disposition: attachment)
- GET /api/documents/:id/view - View file inline (Content-Disposition: inline)

## Important Notes
- Next.js 15 uses Promise-based params - use `React.use(params)` in client components
- Frontend uses `output: "standalone"` for Docker
- Backend uses `/api` global prefix
- CORS configured for localhost ports
- Seed data: 5 departments, 8 positions, 5 employees, 3 users

## Docker Commands
```bash
# Start all services
docker-compose up -d --build

# Seed database
docker cp backend/prisma/seed.js hrms_backend:/app/prisma/seed.js
docker-compose exec backend node prisma/seed.js

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Reset database
docker-compose down -v && docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build frontend
docker-compose up -d --build backend

# Access storage (employee documents)
ls storage/employees/
```

## Files Modified Recently
- frontend/app/(app)/dashboard/page.tsx - Quick actions dropdown, report/analytics navigation
- frontend/app/(app)/employees/page.tsx - Export CSV, auto-open modal via query params
- frontend/app/(app)/employees/[id]/page.tsx - Edit button navigation, documents management
- frontend/app/(app)/reports/page.tsx - Report generation and CSV export
- frontend/app/(app)/departments/page.tsx - Auto-open modal via ?action=create
- frontend/app/(app)/positions/page.tsx - Auto-open modal via ?action=create
- frontend/components/dashboard-layout.tsx - Create dropdown menu in header
- frontend/lib/hrms-api.ts - Added `viewDocument()` function
- backend/src/employees/employees.service.ts - Auto-creates employee folder on create
- backend/src/documents/documents.service.ts - Added `getMimeType()` helper
- backend/src/documents/documents.controller.ts - Added `/view` endpoint
- docker-compose.yml - Added storage volume mount
- README.md - Updated with storage documentation

## Next.js 15 Notes
- Dynamic route params are now Promises
- In client components, use `const { id } = use(params)` to unwrap
- Import `use` from React

## Document Management System

### Storage Structure
Documents are stored in `storage/employees/{FirstName}_{LastName}_{id}/docs/`
- Storage folder is mounted to host via Docker volume: `./storage:/app/storage`
- Employee folder is created automatically when a new employee is added (see `employees.service.ts`)
- Files accessible from host machine at `HR/storage/employees/`

### Document Types (predefined in frontend)
```typescript
const DOCUMENT_TYPES = [
  { id: "passport", name: "Паспорт", required: true },
  { id: "snils", name: "СНИЛС", required: true },
  { id: "inn", name: "ИНН", required: true },
  { id: "employment_contract", name: "Трудовой договор", required: true },
  { id: "employment_order", name: "Приказ о приёме", required: true },
  { id: "diploma", name: "Диплом / Аттестат", required: false },
  { id: "photo", name: "Фотография 3x4", required: false },
  { id: "medical", name: "Медицинская справка", required: false },
  { id: "military_id", name: "Военный билет", required: false },
  { id: "other", name: "Прочие документы", required: false },
];
```

### Document Features
- **Upload**: Multipart form-data, accepts PDF, JPG, PNG, DOC, DOCX
- **Preview**: Uses `/view` endpoint with `Content-Disposition: inline` for PDF/images
- **Download**: Uses `/download` endpoint with `Content-Disposition: attachment`
- **Status indicators**: Checkmark (✓) for uploaded, X for missing
- **Success notification**: Toast appears after successful upload
- **No page refresh**: `loadDocuments()` function updates only documents state, keeps current tab active

### Key Implementation Details
- `documents.service.ts`: `getMimeType()` helper returns correct Content-Type
- `documents.controller.ts`: Separate `/view` and `/download` endpoints
- `employees/[id]/page.tsx`: `loadDocuments()` prevents full page re-render on upload

## Button Functionality

### Dashboard (dashboard/page.tsx)
- **Отчёт** → navigates to `/reports`
- **Быстрые действия** → dropdown menu with quick create options
- **Открыть аналитику** → navigates to `/reports`

### Header (dashboard-layout.tsx)
- **Создать** → dropdown menu with options: Сотрудник, Отдел, Должность, Отчёт
- Uses `?action=create` query param to auto-open create modal on target page

### Employees (employees/page.tsx)
- **Экспорт** → downloads CSV file with employee list (UTF-8 BOM for Cyrillic)
- **Действия dropdown**: Просмотр профиля, Редактировать, Копировать ID, Удалить
- Handles `?action=create` and `?action=edit&id=X` query params

### Employee Profile (employees/[id]/page.tsx)
- **Редактировать** → navigates to `/employees?action=edit&id={employeeId}`

### Reports (reports/page.tsx)
- **Экспортировать всё** → downloads all reports (employees, departments, monthly)
- **Сформировать** → generates and downloads specific report type as CSV
- Report types: Отчёт по сотрудникам, Аналитика отделов, Сводка посещаемости, Месячный обзор

### Departments & Positions
- Handle `?action=create` query param to auto-open create modal
- Full CRUD with edit/delete in dropdown menus
