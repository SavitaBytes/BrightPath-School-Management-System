# BrightPath – School Management System

A modern, full-stack School Management System designed to simplify school administration, streamline academic operations, and provide an organized digital experience for administrators, teachers, students, and guardians.

## Key Features

- **Authentication & Role-Based Access Control:** Secure JWT authentication with role-specific permissions and account management.
- **Student Management:** Manage student profiles, admissions, class assignments, and academic records.
- **Teacher Management:** Organize teacher profiles, subject assignments, and class responsibilities.
- **Academic Management:** Manage classes, sections, subjects, examinations, and academic activities.
- **Attendance Management:** Record and monitor daily student attendance with filtering and summary reports.
- **Examination & Results:** Manage assessments, grading rules, marks, and student report cards.
- **Fee Management:** Generate invoices, track payments, and monitor outstanding balances.
- **Reports & Analytics:** Access attendance summaries, fee reports, and administrative activity records.
- **Responsive Interface:** User-friendly dashboard with role-specific navigation, search, pagination, and responsive layouts.

## Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React 19, Vite, JavaScript |
| Backend | Node.js, Express.js |
| Database | SQLite |
| ORM | Prisma |
| Authentication | JWT |
| API | REST API |
| Testing | Jest, Supertest |
| Version Control | Git, GitHub |

## Project Architecture

```text
BrightPath-School-Management-System/
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── backend/
│   ├── prisma/
│   ├── src/
│   ├── test/
│   └── package.json
│
├── docs/
│   ├── openapi.yaml
│   ├── technical-report.md
│   └── demo-walkthrough.md
│
├── README.md
└── package.json
```

## Installation & Setup

### Prerequisites

- Node.js
- npm

### 1. Clone the Repository

```bash
git clone https://github.com/SavitaBytes/BrightPath-School-Management-System.git
cd BrightPath-School-Management-System
```

### 2. Set Up the Backend

```bash
cd backend
npm install
```

Create a local `.env` file using `.env.example` and configure the required environment variables, including a secure JWT secret.

```bash
npm run db:setup
npm run dev
```

The backend API runs at:

`http://localhost:5000`

### 3. Set Up the Frontend

Open another terminal:

```bash
cd frontend
npm install
```

Create a local `.env` file using `.env.example` and configure the API URL if required.

```bash
npm run dev
```

The frontend normally runs at:

`http://localhost:5173`

## Testing

Backend tests:

```bash
cd backend
npm test
```

Frontend linting and production build:

```bash
cd frontend
npm run lint
npm run build
```

## API Documentation

The project includes REST API documentation using OpenAPI.

- API Base URL: `http://localhost:5000/api`
- API Documentation: `http://localhost:5000/api-docs`

Additional technical documentation is available in the `docs/` directory.

## Security & Data Management

- JWT-based authentication.
- Role-based authorization.
- Server-side access control.
- Guardian-to-student privacy restrictions.
- Secure fee transaction handling with idempotency protection.
- Synthetic demonstration records for development and testing.

## Future Enhancements

- Cloud deployment and hosting.
- Online payment gateway integration.
- Automated notifications and communication.
- Advanced analytics and reporting.
- Additional administrative features.

## Developer:- SavitaBytes
GitHub: https://github.com/SavitaBytes
