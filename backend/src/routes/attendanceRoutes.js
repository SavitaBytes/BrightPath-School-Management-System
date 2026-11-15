
const express = require("express");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { writeAudit } = require("../utils/audit");

const router = express.Router();
router.use(authenticateToken);

function narrowStudentFilter(where, studentId) {
  if (where.studentId && typeof where.studentId === "object" && Array.isArray(where.studentId.in)) {
    where.studentId = { in: where.studentId.in.filter(id => id === studentId) };
  } else if (typeof where.studentId === "string" && where.studentId !== studentId) {
    where.studentId = "__no_access__";
  } else {
    where.studentId = studentId;
  }
}

router.get("/summary", authorizeRoles("ADMIN", "TEACHER", "GUARDIAN", "STUDENT"), async (req, res) => {
  try {
    const where = {};
    if (req.user.role === "GUARDIAN") {
      const guardian = await prisma.guardian.findUnique({
        where: { userId: req.user.userId },
        include: { students: { select: { studentId: true } } }
      });
      where.studentId = { in: guardian ? guardian.students.map(link => link.studentId) : [] };
    } else if (req.user.role === "STUDENT") {
      const student = await prisma.student.findUnique({ where: { userId: req.user.userId } });
      where.studentId = student?.id || "__unlinked__";
    } else if (req.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.userId } });
      const assigned = teacher ? await prisma.teacherClass.findMany({ where: { teacherId: teacher.id }, select: { sectionId: true } }) : [];
      where.student = { sectionId: { in: assigned.map(item => item.sectionId) } };
    }

    if (req.query.studentId) narrowStudentFilter(where, req.query.studentId);
    if (req.query.classId) where.student = { ...(where.student || {}), classId: req.query.classId };
    if (req.query.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
        return res.status(400).json({ success: false, message: "Date must use YYYY-MM-DD format." });
      }
      const date = new Date(`${req.query.date}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== req.query.date) {
        return res.status(400).json({ success: false, message: "Please provide a valid calendar date." });
      }
      where.date = date;
    }
    if (req.query.session) {
      if (!["MORNING", "AFTERNOON"].includes(req.query.session)) {
        return res.status(400).json({ success: false, message: "Session must be MORNING or AFTERNOON." });
      }
      where.session = req.query.session;
    }

    const records = await prisma.attendance.findMany({ where, select: { status: true } });
    const present = records.filter(record => record.status === "PRESENT").length;
    const absent = records.filter(record => record.status === "ABSENT").length;
    const late = records.filter(record => record.status === "LATE").length;
    res.json({
      success: true,
      data: { total: records.length, present, absent, late, ratePercent: records.length ? Math.round((present + late) / records.length * 100) : 0 }
    });
  } catch (error) {
    console.error("Fetch attendance summary error:", error);
    res.status(500).json({ success: false, message: "Unable to generate attendance summary." });
  }
});

// GET /api/attendance - View attendance records
router.get("/", authorizeRoles("ADMIN", "TEACHER", "GUARDIAN", "STUDENT"), async (req, res) => {
  try {
    const { studentId, date } = req.query;

    const where = {};

    if (req.user.role === "GUARDIAN") {
      const guardian = await prisma.guardian.findUnique({
        where: { userId: req.user.userId },
        include: { students: { select: { studentId: true } } }
      });
      where.studentId = { in: guardian ? guardian.students.map(link => link.studentId) : [] };
    } else if (req.user.role === "STUDENT") {
      const student = await prisma.student.findUnique({ where: { userId: req.user.userId } });
      where.studentId = student?.id || "__unlinked__";
    } else if (req.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.userId } });
      const assigned = teacher ? await prisma.teacherClass.findMany({ where: { teacherId: teacher.id }, select: { sectionId: true } }) : [];
      where.student = { sectionId: { in: assigned.map(item => item.sectionId) } };
    }

    if (studentId) narrowStudentFilter(where, studentId);

    if (date) {
      const parsedDate = new Date(`${date}T00:00:00.000Z`);

      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid date."
        });
      }

      if (parsedDate.toISOString().slice(0, 10) !== date) {
        return res.status(400).json({ success: false, message: "Please provide a valid calendar date." });
      }
      where.date = parsedDate;
    }

    if (req.query.classId) where.student = { ...(where.student || {}), classId: req.query.classId };
    if (req.query.session) {
      if (!["MORNING", "AFTERNOON"].includes(req.query.session)) {
        return res.status(400).json({ success: false, message: "Session must be MORNING or AFTERNOON." });
      }
      where.session = req.query.session;
    }

    const records = await prisma.attendance.findMany({
      where,
      include: {
        student: true,
        teacher: true
      },
      orderBy: {
        date: "desc"
      }
    });

    res.json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);

    res.status(500).json({
      success: false,
      message: "Unable to fetch attendance records."
    });
  }
});

// POST /api/attendance - Mark student attendance
router.post("/", authorizeRoles("ADMIN", "TEACHER"), async (req, res) => {
  try {
    const { studentId, date, session, status } = req.body;

    if (!studentId || !date || !session || !status) {
      return res.status(400).json({
        success: false,
        message: "Student ID, date, session and status are required."
      });
    }

    if (!["MORNING", "AFTERNOON"].includes(session)) {
      return res.status(400).json({
        success: false,
        message: "Session must be MORNING or AFTERNOON."
      });
    }

    if (!["PRESENT", "ABSENT", "LATE"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be PRESENT, ABSENT or LATE."
      });
    }

    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return res.status(400).json({
        success: false,
        message: "Date must use YYYY-MM-DD format."
      });
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid calendar date."
      });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    let teacherId;
    if (req.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.userId } });
      const assignment = teacher && student.sectionId
        ? await prisma.teacherClass.findFirst({ where: { teacherId: teacher.id, sectionId: student.sectionId } })
        : null;
      if (!assignment) {
        return res.status(403).json({ success: false, message: "You can only mark attendance for students in your assigned sections." });
      }
      teacherId = teacher.id;
    }

    const attendance = await prisma.$transaction(async tx => {
      const created = await tx.attendance.create({
        data: { studentId, date: parsedDate, session, status, teacherId },
        include: { student: true }
      });
      await writeAudit(tx, req, "CREATE", "Attendance", created.id, { studentId, date, session, status });
      return created;
    });

    res.status(201).json({
      success: true,
      message: "Attendance marked successfully.",
      data: attendance
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Attendance has already been marked for this student, date and session."
      });
    }

    console.error("Error marking attendance:", error);

    res.status(500).json({
      success: false,
      message: "Unable to mark attendance."
    });
  }
});

module.exports = router;
