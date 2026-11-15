require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");
const { calculateGrade } = require("../src/utils/businessRules");

async function upsertStudent(record) {
  const { admissionNo, legacyAdmissionNo, ...studentData } = record;
  const existing = await prisma.student.findUnique({ where: { admissionNo } }) ||
    (legacyAdmissionNo ? await prisma.student.findUnique({ where: { admissionNo: legacyAdmissionNo } }) : null);
  if (existing) {
    return prisma.student.update({
      where: { id: existing.id },
      data: { ...studentData, admissionNo }
    });
  }
  return prisma.student.create({ data: { ...studentData, admissionNo } });
}

async function upsertExamResult(exam, student, marks) {
  const grade = calculateGrade(marks, exam.maxMarks, exam.gradeRules);
  return prisma.examResult.upsert({
    where: { examId_studentId: { examId: exam.id, studentId: student.id } },
    update: { marks, grade, subjectId: exam.subjectId, createdAt: new Date() },
    create: { examId: exam.id, studentId: student.id, subjectId: exam.subjectId, marks, grade }
  });
}

async function upsertExam({ title, classId, sectionId, subjectId, examDate, gradeRules }) {
  const existing = await prisma.exam.findFirst({ where: { title, classId, sectionId } });
  const data = {
    title,
    classId,
    sectionId,
    subjectId,
    examDate,
    maxMarks: 100,
    passMarks: 35,
    gradeRules: JSON.stringify(gradeRules)
  };
  return existing
    ? prisma.exam.update({ where: { id: existing.id }, data })
    : prisma.exam.create({ data });
}

async function seed() {
  const passwordHash = await bcrypt.hash("Demo123!", 12);
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@demo.school" },
    update: { fullName: "Avery Morgan", passwordHash, role: "ADMIN", isActive: true },
    create: { fullName: "Avery Morgan", email: "admin@demo.school", passwordHash, role: "ADMIN" }
  });
  const teacherUser = await prisma.user.upsert({
    where: { email: "teacher@demo.school" },
    update: { fullName: "Jordan Lee", passwordHash, role: "TEACHER", isActive: true },
    create: { fullName: "Jordan Lee", email: "teacher@demo.school", passwordHash, role: "TEACHER" }
  });
  const guardianUser = await prisma.user.upsert({
    where: { email: "guardian@demo.school" },
    update: { fullName: "Taylor Rivera", passwordHash, role: "GUARDIAN", isActive: true },
    create: { fullName: "Taylor Rivera", email: "guardian@demo.school", passwordHash, role: "GUARDIAN" }
  });
  const studentUser = await prisma.user.upsert({
    where: { email: "student@demo.school" },
    update: { fullName: "Sam Rivera", passwordHash, role: "STUDENT", isActive: true },
    create: { fullName: "Sam Rivera", email: "student@demo.school", passwordHash, role: "STUDENT" }
  });

  const teacher = await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: { employeeNo: "TCH-2026-001", phone: null },
    create: { userId: teacherUser.id, employeeNo: "TCH-2026-001" }
  });
  const schoolClass = await prisma.schoolClass.upsert({
    where: { name: "Grade 8" },
    update: {},
    create: { name: "Grade 8" }
  });
  const section = await prisma.section.upsert({
    where: { name_classId: { name: "A", classId: schoolClass.id } },
    update: {},
    create: { name: "A", classId: schoolClass.id }
  });
  const secondClass = await prisma.schoolClass.upsert({
    where: { name: "Grade 7" },
    update: {},
    create: { name: "Grade 7" }
  });
  const secondSection = await prisma.section.upsert({
    where: { name_classId: { name: "B", classId: secondClass.id } },
    update: {},
    create: { name: "B", classId: secondClass.id }
  });
  const student = await upsertStudent({
    admissionNo: "BPS-2026-0001",
    legacyAdmissionNo: "STU-DEMO-001",
    firstName: "Sam",
    lastName: "Rivera",
    gender: "Other",
    userId: studentUser.id,
    classId: schoolClass.id,
    sectionId: section.id
  });
  const sampleStudents = [
    { admissionNo: "BPS-2026-0002", legacyAdmissionNo: "STU-DEMO-002", firstName: "Riya", lastName: "Mehta", classId: schoolClass.id, sectionId: section.id },
    { admissionNo: "BPS-2026-0003", legacyAdmissionNo: "STU-DEMO-003", firstName: "Dev", lastName: "Patel", classId: schoolClass.id, sectionId: section.id },
    { admissionNo: "BPS-2026-0004", legacyAdmissionNo: "STU-DEMO-004", firstName: "Mira", lastName: "Shah", classId: schoolClass.id, sectionId: section.id },
    { admissionNo: "BPS-2026-0005", legacyAdmissionNo: "STU-DEMO-005", firstName: "Kabir", lastName: "Rao", classId: schoolClass.id, sectionId: section.id },
    { admissionNo: "BPS-2026-0006", legacyAdmissionNo: "STU-DEMO-006", firstName: "Aanya", lastName: "Das", classId: schoolClass.id, sectionId: section.id },
    { admissionNo: "BPS-2026-0007", legacyAdmissionNo: "STU-DEMO-007", firstName: "Ishaan", lastName: "Nair", classId: schoolClass.id, sectionId: section.id },
    { admissionNo: "BPS-2026-0008", legacyAdmissionNo: "STU-DEMO-008", firstName: "Anika", lastName: "Kapoor", classId: schoolClass.id, sectionId: section.id },
    { admissionNo: "BPS-2026-0009", legacyAdmissionNo: "STU-DEMO-009", firstName: "Arjun", lastName: "Sen", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0010", legacyAdmissionNo: "STU-DEMO-010", firstName: "Diya", lastName: "Joshi", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0011", legacyAdmissionNo: "STU-DEMO-011", firstName: "Rehan", lastName: "Khan", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0012", legacyAdmissionNo: "STU-DEMO-012", firstName: "Tara", lastName: "Menon", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0013", legacyAdmissionNo: "DEMO-G7B-001", firstName: "Isha", lastName: "Mahi", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0014", legacyAdmissionNo: "DEMO-G7B-002", firstName: "Anita", lastName: "Rani", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0015", legacyAdmissionNo: "DEMO-G7B-003", firstName: "Ankita", lastName: "Sharma", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0016", legacyAdmissionNo: "DEMO-G7B-004", firstName: "Palvi", lastName: "Patel", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0017", legacyAdmissionNo: "DEMO-G7B-005", firstName: "Rohan", lastName: "Mehta", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0018", legacyAdmissionNo: "DEMO-G7B-006", firstName: "Aarav", lastName: "Joshi", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0019", legacyAdmissionNo: "DEMO-G7B-007", firstName: "Neha", lastName: "Kapoor", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0020", legacyAdmissionNo: "DEMO-G7B-008", firstName: "Aditi", lastName: "Rao", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0021", legacyAdmissionNo: "DEMO-G7B-009", firstName: "Kabir", lastName: "Nair", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0022", legacyAdmissionNo: "DEMO-G7B-010", firstName: "Mira", lastName: "Das", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0023", legacyAdmissionNo: "DEMO-G7B-011", firstName: "Vivaan", lastName: "Sen", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0024", legacyAdmissionNo: "DEMO-G7B-012", firstName: "Diya", lastName: "Shah", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0025", legacyAdmissionNo: "DEMO-G7B-013", firstName: "Reyansh", lastName: "Verma", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0026", legacyAdmissionNo: "DEMO-G7B-014", firstName: "Sana", lastName: "Khan", classId: secondClass.id, sectionId: secondSection.id },
    { admissionNo: "BPS-2026-0027", legacyAdmissionNo: "DEMO-G7B-015", firstName: "Ishaan", lastName: "Menon", classId: secondClass.id, sectionId: secondSection.id }
  ];
  const classEightStudents = [student];
  const classSevenStudents = [];
  for (const sample of sampleStudents) {
    const saved = await upsertStudent(sample);
    if (sample.classId === schoolClass.id) classEightStudents.push(saved);
    if (sample.classId === secondClass.id) classSevenStudents.push(saved);
  }
  const guardian = await prisma.guardian.upsert({
    where: { userId: guardianUser.id },
    update: { phone: null },
    create: { userId: guardianUser.id }
  });

  await prisma.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
    update: { relation: "Parent" },
    create: { studentId: student.id, guardianId: guardian.id, relation: "Parent" }
  });
  await prisma.teacherClass.upsert({
    where: { teacherId_sectionId: { teacherId: teacher.id, sectionId: section.id } },
    update: { classId: schoolClass.id },
    create: { teacherId: teacher.id, classId: schoolClass.id, sectionId: section.id }
  });
  await prisma.teacherClass.upsert({
    where: { teacherId_sectionId: { teacherId: teacher.id, sectionId: secondSection.id } },
    update: { classId: secondClass.id },
    create: { teacherId: teacher.id, classId: secondClass.id, sectionId: secondSection.id }
  });
  const attendancePattern = ["PRESENT", "PRESENT", "ABSENT", "PRESENT", "LATE", "PRESENT", "PRESENT"];
  const attendanceRoster = [...classEightStudents, ...classSevenStudents];
  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - dayOffset);
    for (const [index, enrolledStudent] of attendanceRoster.entries()) {
      const shift = (index + dayOffset * 2) % attendancePattern.length;
      const status = attendancePattern[shift];
      await prisma.attendance.upsert({
        where: {
          studentId_date_session: {
            studentId: enrolledStudent.id,
            date,
            session: "MORNING"
          }
        },
        update: { status, teacherId: teacher.id },
        create: {
          studentId: enrolledStudent.id,
          date,
          session: "MORNING",
          status,
          teacherId: teacher.id
        }
      });
    }
  }

  const mathematics = await prisma.subject.upsert({
    where: { code: "MATH" },
    update: { name: "Mathematics" },
    create: { code: "MATH", name: "Mathematics" }
  });
  await prisma.classSubject.upsert({
    where: { classId_sectionId_subjectId: { classId: schoolClass.id, sectionId: section.id, subjectId: mathematics.id } },
    update: { teacherId: teacher.id },
    create: { classId: schoolClass.id, sectionId: section.id, subjectId: mathematics.id, teacherId: teacher.id }
  });
  await prisma.classSubject.upsert({
    where: { classId_sectionId_subjectId: { classId: secondClass.id, sectionId: secondSection.id, subjectId: mathematics.id } },
    update: {},
    create: { classId: secondClass.id, sectionId: secondSection.id, subjectId: mathematics.id, teacherId: teacher.id }
  });

  const examDate = new Date();
  examDate.setUTCHours(0, 0, 0, 0);
  examDate.setUTCDate(examDate.getUTCDate() - 14);
  const upcomingExamDate = new Date(examDate);
  upcomingExamDate.setUTCDate(upcomingExamDate.getUTCDate() + 21);
  const rules = [
    { grade: "A", minPercent: 90 }, { grade: "B", minPercent: 80 },
    { grade: "C", minPercent: 70 }, { grade: "D", minPercent: 60 },
    { grade: "E", minPercent: 50 }, { grade: "F", minPercent: 0 }
  ];
  const seededExam = await upsertExam({
    title: "Term 1 Mathematics",
    classId: schoolClass.id,
    sectionId: section.id,
    subjectId: mathematics.id,
    examDate,
    gradeRules: rules
  });
  const gradeEightMarks = [86, 91, 74, 82, 69, 95, 77, 88];
  for (const [index, enrolledStudent] of classEightStudents.entries()) {
    await upsertExamResult(seededExam, enrolledStudent, gradeEightMarks[index]);
  }

  const seededGradeSevenExam = await upsertExam({
    title: "Term 1 Mathematics",
    classId: secondClass.id,
    sectionId: secondSection.id,
    subjectId: mathematics.id,
    examDate,
    gradeRules: rules
  });
  const gradeSevenMarks = [78, 84, 65, 92, 73, 88, 81, 69, 95, 76, 83, 58, 90, 72, 86, 67, 79, 91, 74];
  for (const [index, enrolledStudent] of classSevenStudents.entries()) {
    await upsertExamResult(seededGradeSevenExam, enrolledStudent, gradeSevenMarks[index]);
  }
  await upsertExam({
    title: "Term 2 Mathematics",
    classId: schoolClass.id,
    sectionId: section.id,
    subjectId: mathematics.id,
    examDate: upcomingExamDate,
    gradeRules: rules
  });
  await upsertExam({
    title: "Term 2 Mathematics",
    classId: secondClass.id,
    sectionId: secondSection.id,
    subjectId: mathematics.id,
    examDate: upcomingExamDate,
    gradeRules: rules
  });

  const invoiceNo = "BPS-INV-2026-0001";
  const legacyInvoice = await prisma.feeInvoice.findUnique({ where: { invoiceNo: "DEMO-INV-001" } });
  if (legacyInvoice && !(await prisma.feeInvoice.findUnique({ where: { invoiceNo } }))) {
    await prisma.feeInvoice.update({
      where: { id: legacyInvoice.id },
      data: { invoiceNo }
    });
  }
  const feeRoster = [...classEightStudents, ...classSevenStudents];
  for (const [index, enrolledStudent] of feeRoster.entries()) {
    const admissionSequence = index + 1;
    const studentInvoiceNo = `BPS-INV-2026-${String(admissionSequence).padStart(4, "0")}`;
    const invoice = await prisma.feeInvoice.upsert({
      where: { invoiceNo: studentInvoiceNo },
      update: {},
      create: {
        invoiceNo: studentInvoiceNo,
        studentId: enrolledStudent.id,
        description: "Term 1 tuition",
        amountCents: 750000,
        paidCents: 0,
        dueDate: new Date("2026-12-01T00:00:00.000Z")
      }
    });
    if (admissionSequence === 1) {
      await prisma.feePayment.upsert({
        where: { idempotencyKey: "seed-demo-payment-v1" },
        update: { invoiceId: invoice.id, amountCents: 250000 },
        create: { invoiceId: invoice.id, idempotencyKey: "seed-demo-payment-v1", amountCents: 250000 }
      });
      await prisma.feeInvoice.update({
        where: { id: invoice.id },
        data: { paidCents: 250000 }
      });
    }
  }

  console.log("Seed complete. Demo accounts: admin@demo.school, teacher@demo.school, guardian@demo.school, student@demo.school (password: Demo123!).");
}

seed()
  .catch(error => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
