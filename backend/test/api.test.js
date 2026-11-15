const request = require("supertest");
const bcrypt = require("bcryptjs");
const { afterAll } = require("@jest/globals");
const { randomUUID } = require("node:crypto");
const app = require("../src/server");
const prisma = require("../src/config/prisma");
const registeredEmails = [];

afterAll(async () => {
  for (const email of registeredEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.student.updateMany({ where: { userId: user.id }, data: { userId: null } });
      await prisma.guardian.deleteMany({ where: { userId: user.id } });
      await prisma.teacher.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
  await prisma.$disconnect();
});

describe("API and documentation", () => {
  test("health endpoint returns a successful response", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test("Swagger UI serves the OpenAPI specification", async () => {
    const response = await request(app).get("/api-docs/");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text).toContain("swagger-ui");
  });

  test("every seeded student has attendance and a populated report card", async () => {
    const roster = await prisma.student.findMany({
      where: { admissionNo: { startsWith: "BPS-2026-" } },
      select: {
        id: true,
        admissionNo: true,
        _count: { select: { attendance: true, examResults: true, feeInvoices: true } }
      }
    });
    expect(roster).toHaveLength(27);
    expect(roster.every(student =>
      student._count.attendance > 0 &&
      student._count.examResults > 0 &&
      student._count.feeInvoices > 0
    )).toBe(true);
    const invoices = await prisma.feeInvoice.findMany({
      where: { studentId: { in: roster.map(student => student.id) } },
      include: { payments: true }
    });
    expect(invoices).toHaveLength(roster.length);
    expect(invoices.every(invoice =>
      invoice.paidCents === invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0)
    )).toBe(true);

    const mira = roster.find(student => student.admissionNo === "BPS-2026-0022");
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@demo.school", password: "Demo123!" });
    const reportCard = await request(app)
      .get(`/api/exams/students/${mira.id}/report-card`)
      .set("Authorization", `Bearer ${adminLogin.body.token}`);
    expect(reportCard.status).toBe(200);
    expect(reportCard.body.data.results.length).toBeGreaterThan(0);
    expect(reportCard.body.data.totalMaximum).toBeGreaterThan(0);
  });

  test("malformed JSON receives a predictable client error", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: "Request body must be valid JSON." });
  });

  test("any visitor can create and use a guardian account without gaining staff access", async () => {
    const email = `guardian-${randomUUID()}@example.test`;
    registeredEmails.push(email);
    const registration = await request(app)
      .post("/api/auth/register")
      .send({
        fullName: "New Guardian",
        email,
        password: "StrongPass123",
        role: "GUARDIAN"
      });

    expect(registration.status).toBe(201);
    expect(registration.body.user).toMatchObject({ email, role: "GUARDIAN" });
    expect(registration.body.token).toEqual(expect.any(String));

    const activeAccount = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${registration.body.token}`);
    expect(activeAccount.status).toBe(200);
    expect(activeAccount.body.data.role).toBe("GUARDIAN");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "StrongPass123" });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("GUARDIAN");

    const unlinkedStudents = await request(app)
      .get("/api/students")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(unlinkedStudents.status).toBe(200);
    expect(unlinkedStudents.body.data).toEqual([]);

    const forbiddenLink = await request(app)
      .post("/api/guardians/unknown/students")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ studentId: "unknown", relation: "Parent" });
    expect(forbiddenLink.status).toBe(403);

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@demo.school", password: "Demo123!" });
    const guardian = await prisma.guardian.findUnique({ where: { userId: registration.body.user.id } });
    const demoStudent = await prisma.student.findUnique({ where: { admissionNo: "BPS-2026-0001" } });
    expect(guardian).toBeTruthy();
    expect(demoStudent).toBeTruthy();
    const link = await request(app)
      .post(`/api/guardians/${guardian.id}/students`)
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ studentId: demoStudent.id, relation: "Parent" });
    expect(link.status).toBe(200);

    const linkedStudents = await request(app)
      .get("/api/students")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(linkedStudents.body.data.map(student => student.id)).toEqual([demoStudent.id]);

    const duplicate = await request(app)
      .post("/api/auth/register")
      .send({ fullName: "Another Guardian", email, password: "StrongPass123", role: "GUARDIAN" });
    expect(duplicate.status).toBe(409);
  });

  test("administrator accounts can sign in directly in local development", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const email = `local-admin-${randomUUID()}@example.test`;
    const pendingEmail = `pending-admin-${randomUUID()}@example.test`;
    registeredEmails.push(email, pendingEmail);
    process.env.NODE_ENV = "development";

    try {
      const registration = await request(app)
        .post("/api/auth/register")
        .send({ fullName: "Local Administrator", email, password: "StrongPass123", role: "ADMIN" });
      expect(registration.status).toBe(201);
      expect(registration.body.user.role).toBe("ADMIN");
      expect(registration.body.token).toEqual(expect.any(String));

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "StrongPass123" });
      expect(login.status).toBe(200);
      expect(login.body.user.role).toBe("ADMIN");

      await prisma.user.create({
        data: {
          fullName: "Previously Pending Administrator",
          email: pendingEmail,
          passwordHash: await bcrypt.hash("StrongPass123", 12),
          role: "ADMIN",
          isActive: false,
          isApproved: false
        }
      });
      const pendingLogin = await request(app)
        .post("/api/auth/login")
        .send({ email: pendingEmail, password: "StrongPass123" });
      expect(pendingLogin.status).toBe(200);
      expect((await prisma.user.findUnique({ where: { email: pendingEmail } })).isApproved).toBe(true);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test("student and teacher sign in directly; production administrator accounts require approval", async () => {
    const studentEmail = `student-${randomUUID()}@example.test`;
    const teacherEmail = `teacher-${randomUUID()}@example.test`;
    const pendingTeacherEmail = `pending-teacher-${randomUUID()}@example.test`;
    const adminEmail = `admin-${randomUUID()}@example.test`;
    registeredEmails.push(studentEmail, teacherEmail, pendingTeacherEmail, adminEmail);

    const studentRegistration = await request(app)
      .post("/api/auth/register")
      .send({ fullName: "New Student", email: studentEmail, password: "StrongPass123", role: "STUDENT" });
    expect(studentRegistration.status).toBe(201);
    expect(studentRegistration.body.user.role).toBe("STUDENT");

    const studentLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: studentEmail, password: "StrongPass123" });
    const noStudentRecord = await request(app)
      .get("/api/students")
      .set("Authorization", `Bearer ${studentLogin.body.token}`);
    expect(noStudentRecord.body.data).toEqual([]);

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@demo.school", password: "Demo123!" });
    const unlinkedAccounts = await request(app)
      .get("/api/auth/unlinked-students")
      .set("Authorization", `Bearer ${adminLogin.body.token}`);
    expect(unlinkedAccounts.body.data.map(account => account.id)).toContain(studentRegistration.body.user.id);
    const demoStudent = await prisma.student.findUnique({ where: { admissionNo: "BPS-2026-0002" } });
    const studentLink = await request(app)
      .post(`/api/students/${demoStudent.id}/account`)
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ userId: studentRegistration.body.user.id });
    expect(studentLink.status).toBe(200);
    const remainingUnlinked = await request(app)
      .get("/api/auth/unlinked-students")
      .set("Authorization", `Bearer ${adminLogin.body.token}`);
    expect(remainingUnlinked.body.data.map(account => account.id)).not.toContain(studentRegistration.body.user.id);
    const linkedRecord = await request(app)
      .get("/api/students")
      .set("Authorization", `Bearer ${studentLogin.body.token}`);
    expect(linkedRecord.body.data.map(student => student.id)).toEqual([demoStudent.id]);

    const teacherRegistration = await request(app)
      .post("/api/auth/register")
      .send({ fullName: "New Teacher", email: teacherEmail, password: "StrongPass123", role: "TEACHER" });
    expect(teacherRegistration.status).toBe(201);
    expect(teacherRegistration.body.user.role).toBe("TEACHER");
    const teacherLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: teacherEmail, password: "StrongPass123" });
    expect(teacherLogin.status).toBe(200);
    const unassignedClasses = await request(app)
      .get("/api/classes")
      .set("Authorization", `Bearer ${teacherLogin.body.token}`);
    expect(unassignedClasses.body.data).toEqual([]);

    const teacherProfile = await prisma.teacher.findUnique({ where: { userId: teacherRegistration.body.user.id } });
    const demoClass = await prisma.schoolClass.findUnique({
      where: { name: "Grade 8" },
      include: { sections: true }
    });
    const teacherAssignment = await request(app)
      .post(`/api/classes/${demoClass.id}/sections/${demoClass.sections[0].id}/teachers`)
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ teacherId: teacherProfile.id });
    expect(teacherAssignment.status).toBe(201);
    const assignedClasses = await request(app)
      .get("/api/classes")
      .set("Authorization", `Bearer ${teacherLogin.body.token}`);
    expect(assignedClasses.body.data.map(item => item.name)).toContain("Grade 8");

    await prisma.user.create({
      data: {
        fullName: "Previously Pending Teacher",
        email: pendingTeacherEmail,
        passwordHash: await bcrypt.hash("StrongPass123", 12),
        role: "TEACHER",
        isActive: false,
        isApproved: false
      }
    });
    const incorrectPendingLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: pendingTeacherEmail, password: "WrongPass123" });
    expect(incorrectPendingLogin.status).toBe(401);
    expect((await prisma.user.findUnique({ where: { email: pendingTeacherEmail } })).isApproved).toBe(false);

    const pendingTeacherLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: pendingTeacherEmail, password: "StrongPass123" });
    expect(pendingTeacherLogin.status).toBe(200);
    expect(await prisma.teacher.findUnique({ where: { userId: pendingTeacherLogin.body.user.id } })).toBeTruthy();

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const adminRegistration = await request(app)
        .post("/api/auth/register")
        .send({ fullName: "Requested Administrator", email: adminEmail, password: "StrongPass123", role: "ADMIN" });
      expect(adminRegistration.status).toBe(202);
      const pendingAdminLogin = await request(app)
        .post("/api/auth/login")
        .send({ email: adminEmail, password: "StrongPass123" });
      expect(pendingAdminLogin.status).toBe(403);
      const requestList = await request(app)
        .get("/api/auth/requests")
        .set("Authorization", `Bearer ${adminLogin.body.token}`);
      expect(requestList.body.data.map(account => account.email)).toContain(adminEmail);
      expect(requestList.body.data.map(account => account.email)).not.toContain(teacherEmail);

      const adminRequest = requestList.body.data.find(account => account.email === adminEmail);
      const approval = await request(app)
        .post(`/api/auth/requests/${adminRequest.id}/approve`)
        .set("Authorization", `Bearer ${adminLogin.body.token}`)
        .send({});
      expect(approval.status).toBe(200);
      const approvedAdminLogin = await request(app)
        .post("/api/auth/login")
        .send({ email: adminEmail, password: "StrongPass123" });
      expect(approvedAdminLogin.status).toBe(200);
      expect(approvedAdminLogin.body.user.role).toBe("ADMIN");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test("public registration rejects invalid fields", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ fullName: "A", email: "not-an-email", password: "short" });
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});
