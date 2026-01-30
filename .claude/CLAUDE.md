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
- GET /api/documents/:id/download

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

# Reset database
docker-compose down -v && docker-compose up -d --build
```

## Files Modified Recently
- frontend/app/(app)/employees/page.tsx - Full CRUD with edit/delete
- frontend/app/(app)/employees/[id]/page.tsx - Fixed async params for Next.js 15 using `use(params)`
- frontend/lib/types.ts - Added latinFirstName, latinLastName, departmentId, positionId to Employee type
- backend/src/main.ts - CORS + API prefix
- backend/src/auth/constants.ts - JWT from env
- backend/prisma/seed.js - JavaScript seed for production

## Next.js 15 Notes
- Dynamic route params are now Promises
- In client components, use `const { id } = use(params)` to unwrap
- Import `use` from React
