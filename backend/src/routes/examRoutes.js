const express = require("express");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { calculateGrade } = require("../utils/businessRules");
const { writeAudit } = require("../utils/audit");

const router = express.Router();
router.use(authenticateToken);

async function teacherCanAccess(req, classId, sectionId) {
  if (req.user.role !== "TEACHER") return req.user.role === "ADMIN";
  const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.userId } });
  if (!teacher) return false;
  return Boolean(await prisma.teacherClass.findFirst({
    where: { teacherId: teacher.id, classId, ...(sectionId ? { sectionId } : {}) }
  }));
}

router.get("/", async (req, res) => {
  try {
    if (!["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "You do not have permission to view exams." });
    }
    let where = {};
    if (req.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.userId } });
      const assignments = teacher ? await prisma.teacherClass.findMany({ where: { teacherId: teacher.id }, select: { classId: true, sectionId: true } }) : [];
      where = { OR: assignments.map(item => ({ classId: item.classId, sectionId: item.sectionId })) };
    } else if (req.user.role === "GUARDIAN") {
      const linked = await prisma.studentGuardian.findMany({
        where: { guardian: { userId: req.user.userId } },
        select: { student: { select: { classId: true, sectionId: true } } }
      });
      where = { OR: linked.map(item => ({ classId: item.student.classId, ...(item.student.sectionId ? { sectionId: item.student.sectionId } : {}) })) };
    } else if (req.user.role === "STUDENT") {
      const student = await prisma.student.findUnique({ where: { userId: req.user.userId } });
      where = student ? { classId: student.classId, ...(student.sectionId ? { sectionId: student.sectionId } : {}) } : { id: "__unlinked__" };
    }
    if (req.query.classId) where.classId = req.query.classId;
    const exams = await prisma.exam.findMany({
      where,
      include: { subject: true, schoolClass: true, section: true },
      orderBy: { examDate: "desc" }
    });
    res.json({ success: true, count: exams.length, data: exams });
  } catch (error) {
    console.error("Fetch exams error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch exams." });
  }
});

router.post("/", authorizeRoles("ADMIN", "TEACHER"), async (req, res) => {
  try {
    const { title, classId, sectionId, subjectId, examDate, maxMarks, passMarks, gradeRules } = req.body;
    if (!title?.trim() || !classId || !subjectId || !examDate ||
      !Number.isInteger(maxMarks) || maxMarks < 1 ||
      !Number.isInteger(passMarks) || passMarks < 0 || passMarks > maxMarks) {
      return res.status(400).json({ success: false, message: "Provide title, class, subject, date, and valid maximum/pass marks." });
    }
    const date = new Date(`${examDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== examDate) {
      return res.status(400).json({ success: false, message: "Exam date must be a valid YYYY-MM-DD date." });
    }
    if (sectionId) {
      const section = await prisma.section.findUnique({ where: { id: sectionId } });
      if (!section || section.classId !== classId) return res.status(400).json({ success: false, message: "Section does not belong to this class." });
    }
    const subjectAssignment = await prisma.classSubject.findFirst({
      where: { classId, subjectId, ...(sectionId ? { sectionId } : {}) }
    });
    if (!subjectAssignment) return res.status(400).json({ success: false, message: "Assign this subject to the class/section before creating its exam." });
    if (!await teacherCanAccess(req, classId, sectionId)) {
      return res.status(403).json({ success: false, message: "You can only create exams for assigned classes." });
    }
    const rules = gradeRules || [
      { grade: "A", minPercent: 90 }, { grade: "B", minPercent: 80 },
      { grade: "C", minPercent: 70 }, { grade: "D", minPercent: 60 },
      { grade: "E", minPercent: 50 }, { grade: "F", minPercent: 0 }
    ];
    calculateGrade(0, maxMarks, rules);
    if (rules.some(rule => !Number.isFinite(rule.minPercent) || rule.minPercent < 0 || rule.minPercent > 100)) {
      return res.status(400).json({ success: false, message: "Grade thresholds must be between 0 and 100." });
    }
    const exam = await prisma.$transaction(async tx => {
      const created = await tx.exam.create({
        data: { title: title.trim(), classId, sectionId: sectionId || null, subjectId, examDate: date, maxMarks, passMarks, gradeRules: JSON.stringify(rules) },
        include: { subject: true, schoolClass: true, section: true }
      });
      await writeAudit(tx, req, "CREATE", "Exam", created.id, { title: created.title });
      return created;
    });
    res.status(201).json({ success: true, data: exam });
  } catch (error) {
    if (error.code === "P2003") return res.status(400).json({ success: false, message: "Invalid class, section or subject." });
    if (error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Create exam error:", error);
    res.status(500).json({ success: false, message: "Unable to create exam." });
  }
});

router.post("/:examId/results", authorizeRoles("ADMIN", "TEACHER"), async (req, res) => {
  try {
    const { studentId, marks } = req.body;
    const exam = await prisma.exam.findUnique({ where: { id: req.params.examId } });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found." });
    if (!await teacherCanAccess(req, exam.classId, exam.sectionId)) {
      return res.status(403).json({ success: false, message: "You can only enter results for assigned classes." });
    }
    if (typeof studentId !== "string" || !Number.isInteger(marks) || marks < 0 || marks > exam.maxMarks) {
      return res.status(400).json({ success: false, message: `Student ID and whole-number marks between 0 and ${exam.maxMarks} are required.` });
    }
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.classId !== exam.classId || (exam.sectionId && student.sectionId !== exam.sectionId)) {
      return res.status(400).json({ success: false, message: "Student is not enrolled in this exam's class/section." });
    }
    const grade = calculateGrade(marks, exam.maxMarks, exam.gradeRules);
    const result = await prisma.$transaction(async tx => {
      const saved = await tx.examResult.upsert({
        where: { examId_studentId: { examId: exam.id, studentId } },
        update: { marks, grade },
        create: { examId: exam.id, studentId, subjectId: exam.subjectId, marks, grade },
        include: { student: true, exam: { include: { subject: true } } }
      });
      await writeAudit(tx, req, "UPSERT", "ExamResult", saved.id, { examId: exam.id, studentId, marks, grade });
      return saved;
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Save exam result error:", error);
    res.status(500).json({ success: false, message: "Unable to save exam result." });
  }
});

router.get("/students/:studentId/report-card", async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { schoolClass: true, section: true }
    });
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });
    if (req.user.role === "GUARDIAN") {
      const linked = await prisma.studentGuardian.findUnique({
        where: { studentId_guardianId: { studentId, guardianId: (await prisma.guardian.findUnique({ where: { userId: req.user.userId } }))?.id || "" } }
      });
      if (!linked) return res.status(403).json({ success: false, message: "You may only view a linked student's report card." });
    } else if (req.user.role === "STUDENT" && student.userId !== req.user.userId) {
      return res.status(403).json({ success: false, message: "You may only view your own report card." });
    } else if (req.user.role === "TEACHER" && !await teacherCanAccess(req, student.classId, student.sectionId)) {
      return res.status(403).json({ success: false, message: "This student is outside your assigned classes." });
    } else if (!["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "You do not have permission to view this report card." });
    }
    const results = await prisma.examResult.findMany({
      where: { studentId },
      include: { exam: { include: { subject: true } } },
      orderBy: { exam: { examDate: "desc" } }
    });
    const totalMarks = results.reduce((sum, item) => sum + item.marks, 0);
    const totalMaximum = results.reduce((sum, item) => sum + item.exam.maxMarks, 0);
    res.json({
      success: true,
      data: { student, results, totalMarks, totalMaximum, percentage: totalMaximum ? Math.round(totalMarks / totalMaximum * 10000) / 100 : 0 }
    });
  } catch (error) {
    console.error("Fetch report card error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch report card." });
  }
});

module.exports = router;
