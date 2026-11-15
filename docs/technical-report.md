# Technical report

## Design decisions

The project is a modular monolith: React handles the role-aware UI, Express owns validation and authorization, and Prisma/SQLite persists the business state. This keeps local setup simple while retaining a clear boundary between routes, shared rules and persistence. The local demo uses the existing SQLite database and migration history. Public sign-up supports all four account types; guardian/student accounts cannot access student data until linked by an administrator, and teacher accounts need class assignments before school data is available. Administrator signup is immediate in local development; production deployments require approval to protect school-wide access.

The schema models students, guardians, teachers, classes, sections, teacher/subject assignments, exams/results, invoices/payments and audit events. Unique constraints protect logins, attendance sessions, class/subject assignments, exam results and payment idempotency. Fees use integer paise; each payment is recorded in a ledger and increments an invoice balance only when a conditional database update proves the balance can cover it.

## Authorization and privacy

Every protected API request verifies a signed JWT and reloads the account's active status and role from the database. Teachers are limited to assigned sections for student lists and attendance, guardians are limited to explicitly linked students, and report-card ownership is checked server-side. UI navigation is only a usability layer; API authorization is authoritative.

## Validation and reliability

Route handlers validate required fields, enum values, dates and score/amount bounds. Database uniqueness makes duplicate attendance a `409 Conflict`; result entry is an upsert; fee requests require an idempotency key and use a transaction plus conditional balance update. Material changes create audit records in the same transaction.

## Test evidence

Jest/Supertest checks the API health response, Swagger UI, malformed JSON handling and core grade/fee business rules. `backend/test/core.test.js` runs against the migrated, seeded SQLite database and exercises authorization denial, teacher assignment scope, duplicate attendance, guardian privacy, fee ledger reconciliation, safe retries and an overpayment conflict. Frontend ESLint and production build validate the responsive UI.

## Known gaps

This assessment MVP does not include a live deployment, production identity lifecycle, password recovery, a payment provider, bulk tools, a formal school-term model or video recording. Configure secrets locally and replace the demo users before any non-demo use.
