require("dotenv").config();
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const prisma = require("../src/config/prisma");
const { calculateFeeBalance, calculateGrade } = require("../src/utils/businessRules");

const app = require("../src/server");
let server;
let baseUrl;
let testStudentId;
let testExamId;
let testInvoiceId;
const testAttendanceIds = [];

async function api(path, options = {}, token) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (testAttendanceIds.length) {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: testAttendanceIds } } });
    await prisma.attendance.deleteMany({ where: { id: { in: testAttendanceIds } } });
  }
  if (testInvoiceId) {
    await prisma.auditLog.deleteMany({ where: { entityId: testInvoiceId } });
    await prisma.feeInvoice.deleteMany({ where: { id: testInvoiceId } });
  }
  if (testExamId) {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ entityId: testExamId }, { details: { contains: testExamId } }] }
    });
    await prisma.exam.deleteMany({ where: { id: testExamId } });
  }
  if (testStudentId) {
    await prisma.attendance.deleteMany({ where: { studentId: testStudentId } });
    await prisma.examResult.deleteMany({ where: { studentId: testStudentId } });
    await prisma.student.deleteMany({ where: { id: testStudentId } });
  }
  if (server) await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
});

test("core workflows enforce access, rules, and ledger integrity", async () => {
  const [classRecord, teacherUser, guardianUser, demoStudent] = await Promise.all([
    prisma.schoolClass.findUnique({ where: { name: "Grade 8" }, include: { sections: true } }),
    prisma.user.findUnique({ where: { email: "teacher@demo.school" } }),
    prisma.user.findUnique({ where: { email: "guardian@demo.school" }, include: { guardian: true } }),
    prisma.student.findUnique({ where: { admissionNo: "BPS-2026-0001" } })
  ]);
  assert.ok(classRecord?.sections[0], "the demo class and section must be seeded");
  assert.ok(teacherUser && guardianUser?.guardian && demoStudent, "demo users and linked student must be seeded");

  const unauthorized = await api("/students");
  assert.equal(unauthorized.status, 401);

  const [adminLogin, teacherLogin, guardianLogin, studentLogin] = await Promise.all([
    api("/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@demo.school", password: "Demo123!" }) }),
    api("/auth/login", { method: "POST", body: JSON.stringify({ email: "teacher@demo.school", password: "Demo123!" }) }),
    api("/auth/login", { method: "POST", body: JSON.stringify({ email: "guardian@demo.school", password: "Demo123!" }) }),
    api("/auth/login", { method: "POST", body: JSON.stringify({ email: "student@demo.school", password: "Demo123!" }) })
  ]);
  assert.equal(adminLogin.status, 200);
  assert.equal(teacherLogin.status, 200);
  assert.equal(guardianLogin.status, 200);
  assert.equal(studentLogin.status, 200);
  const adminToken = adminLogin.body.token;
  const teacherToken = teacherLogin.body.token;
  const guardianToken = guardianLogin.body.token;
  const studentToken = studentLogin.body.token;

  const outsider = await prisma.student.create({
    data: { admissionNo: `TEST-${randomUUID()}`, firstName: "Outside", lastName: "Section" }
  });
  testStudentId = outsider.id;
  const teacherStudents = await api("/students", {}, teacherToken);
  assert.equal(teacherStudents.status, 200);
  assert.ok(teacherStudents.body.data.some(student => student.id === demoStudent.id));
  assert.ok(!teacherStudents.body.data.some(student => student.id === outsider.id));

  const attendanceDate = new Date().toISOString().slice(0, 10);
  const attendanceRequest = {
    studentId: demoStudent.id,
    date: attendanceDate,
    session: "AFTERNOON",
    status: "PRESENT"
  };
  const dashboardBefore = await api("/reports/summary", {}, adminToken);
  assert.equal(dashboardBefore.status, 200);
  const firstAttendance = await api("/attendance", { method: "POST", body: JSON.stringify(attendanceRequest) }, teacherToken);
  assert.equal(firstAttendance.status, 201);
  testAttendanceIds.push(firstAttendance.body.data.id);
  const dashboardSummary = await api("/reports/summary", {}, adminToken);
  assert.equal(dashboardSummary.status, 200);
  assert.equal(dashboardSummary.body.data.attendance.today.present, dashboardBefore.body.data.attendance.today.present + 1);
  assert.equal(dashboardSummary.body.data.attendance.byDay.length, 7);
  const todayBefore = dashboardBefore.body.data.attendance.byDay.find(day => day.date === attendanceDate);
  const todayAfter = dashboardSummary.body.data.attendance.byDay.find(day => day.date === attendanceDate);
  assert.equal(todayAfter.present, todayBefore.present + 1);
  const attendanceSummary = await api(`/attendance/summary?studentId=${demoStudent.id}&date=${attendanceDate}&session=AFTERNOON`, {}, teacherToken);
  assert.deepEqual(attendanceSummary.body.data, { total: 1, present: 1, absent: 0, late: 0, ratePercent: 100 });
  const duplicateAttendance = await api("/attendance", { method: "POST", body: JSON.stringify(attendanceRequest) }, teacherToken);
  assert.equal(duplicateAttendance.status, 409);

  const outsiderAttendance = await api("/attendance", {
    method: "POST",
    body: JSON.stringify({ studentId: outsider.id, date: attendanceDate, session: "MORNING", status: "ABSENT" })
  }, adminToken);
  assert.equal(outsiderAttendance.status, 201);
  testAttendanceIds.push(outsiderAttendance.body.data.id);

  const guardianStudents = await api("/students", {}, guardianToken);
  assert.deepEqual(guardianStudents.body.data.map(student => student.id), [demoStudent.id]);
  const privateAttendance = await api(`/attendance?studentId=${outsider.id}`, {}, guardianToken);
  assert.deepEqual(privateAttendance.body.data, []);
  const privateSummary = await api(`/attendance/summary?studentId=${outsider.id}&date=${attendanceDate}`, {}, guardianToken);
  assert.equal(privateSummary.body.data.total, 0);
  const studentRecords = await api("/students", {}, studentToken);
  assert.deepEqual(studentRecords.body.data.map(student => student.id), [demoStudent.id]);
  const unauthorizedTeacherAttendance = await api("/attendance", {
    method: "POST",
    body: JSON.stringify({ studentId: outsider.id, date: attendanceDate, session: "AFTERNOON", status: "PRESENT" })
  }, teacherToken);
  assert.equal(unauthorizedTeacherAttendance.status, 403);
  const forbiddenReport = await api(`/exams/students/${outsider.id}/report-card`, {}, guardianToken);
  assert.equal(forbiddenReport.status, 403);

  const examResponse = await api("/exams", {
    method: "POST",
    body: JSON.stringify({
      title: `API test ${randomUUID()}`,
      classId: classRecord.id,
      sectionId: classRecord.sections[0].id,
      subjectId: (await prisma.subject.findUnique({ where: { code: "MATH" } })).id,
      examDate: "2026-11-20",
      maxMarks: 50,
      passMarks: 20,
      gradeRules: [{ grade: "A", minPercent: 80 }, { grade: "B", minPercent: 60 }, { grade: "F", minPercent: 0 }]
    })
  }, teacherToken);
  assert.equal(examResponse.status, 201);
  testExamId = examResponse.body.data.id;
  const resultResponse = await api(`/exams/${testExamId}/results`, {
    method: "POST",
    body: JSON.stringify({ studentId: demoStudent.id, marks: 40 })
  }, teacherToken);
  assert.equal(resultResponse.status, 200);
  assert.equal(resultResponse.body.data.grade, "A");
  assert.throws(() => calculateGrade(51, 50, [{ grade: "A", minPercent: 0 }]), RangeError);
  assert.deepEqual(calculateFeeBalance(10000, [{ amountCents: 4000 }, { amountCents: 1000 }]), {
    amountCents: 10000, paidCents: 5000, dueCents: 5000
  });

  const invoiceResponse = await api("/fees", {
    method: "POST",
    body: JSON.stringify({
      studentId: demoStudent.id,
      description: "API test invoice",
      amountCents: 10000,
      dueDate: "2026-12-10"
    })
  }, adminToken);
  assert.equal(invoiceResponse.status, 201);
  testInvoiceId = invoiceResponse.body.data.id;
  const idempotencyKey = randomUUID();
  const paymentRequest = {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ amountCents: 6000 })
  };
  assert.equal((await api(`/fees/${testInvoiceId}/payments`, paymentRequest, guardianToken)).status, 201);
  assert.equal((await api(`/fees/${testInvoiceId}/payments`, paymentRequest, guardianToken)).status, 201);
  const overpayment = await api(`/fees/${testInvoiceId}/payments`, {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ amountCents: 5000 })
  }, guardianToken);
  assert.equal(overpayment.status, 409);
  const feeLedger = await api("/fees", {}, guardianToken);
  const testInvoice = feeLedger.body.data.find(invoice => invoice.id === testInvoiceId);
  assert.equal(testInvoice.paidCents, 6000);
  assert.equal(testInvoice.dueCents, 4000);
});
