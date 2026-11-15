const express = require("express");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authenticateToken);

router.get("/summary", authorizeRoles("ADMIN", "TEACHER"), async (req, res) => {
  try {
    let attendanceWhere = {};
    if (req.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.userId } });
      const assignments = teacher ? await prisma.teacherClass.findMany({ where: { teacherId: teacher.id }, select: { sectionId: true } }) : [];
      attendanceWhere = { student: { sectionId: { in: assignments.map(item => item.sectionId) } } };
    }

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const weeklyAttendanceWhere = {
      ...attendanceWhere,
      date: { gte: weekStart, lt: tomorrowStart }
    };
    const gradesWhere = {
      createdAt: { gte: todayStart, lt: tomorrowStart },
      ...(req.user.role === "TEACHER" ? { student: attendanceWhere.student } : {})
    };
    const [students, teachers, classes, exams, invoices, payments, attendance, recentGrades, recentActivity] = await Promise.all([
      req.user.role === "ADMIN" ? prisma.student.count() : prisma.student.count({ where: attendanceWhere.student }),
      req.user.role === "ADMIN" ? prisma.teacher.count() : Promise.resolve(null),
      req.user.role === "ADMIN" ? prisma.schoolClass.count() : Promise.resolve(null),
      req.user.role === "ADMIN" ? prisma.exam.count() : Promise.resolve(null),
      req.user.role === "ADMIN" ? prisma.feeInvoice.aggregate({ _sum: { amountCents: true }, _count: true }) : Promise.resolve(null),
      req.user.role === "ADMIN" ? prisma.feePayment.aggregate({ _sum: { amountCents: true } }) : Promise.resolve(null),
      prisma.attendance.findMany({ where: weeklyAttendanceWhere, select: { status: true, date: true, createdAt: true, student: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.examResult.findMany({
        where: gradesWhere,
        select: { id: true, marks: true, grade: true, createdAt: true, student: { select: { firstName: true, lastName: true } }, exam: { select: { title: true, subject: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 5
      }),
      req.user.role === "ADMIN"
        ? prisma.auditLog.findMany({ include: { actor: { select: { fullName: true } } }, orderBy: { createdAt: "desc" }, take: 5 })
        : prisma.attendance.findMany({
          where: attendanceWhere,
          include: { student: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: "desc" },
          take: 5
        })
    ]);
    const attendanceByDay = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart.getTime() + index * 24 * 60 * 60 * 1000);
      const dateLabel = date.toISOString().slice(0, 10);
      const records = attendance.filter(item => item.date.toISOString().slice(0, 10) === dateLabel);
      return {
        date: dateLabel,
        present: records.filter(item => item.status === "PRESENT" || item.status === "LATE").length,
        absent: records.filter(item => item.status === "ABSENT").length
      };
    });
    const todaysAttendance = attendance.filter(item => item.date >= todayStart && item.date < tomorrowStart);
    const present = attendance.filter(item => item.status === "PRESENT" || item.status === "LATE").length;
    const activity = recentActivity.map(item => req.user.role === "ADMIN"
      ? { id: item.id, action: item.action, entity: item.entity, createdAt: item.createdAt, actor: item.actor.fullName }
      : { id: item.id, action: "ATTENDANCE", entity: "Attendance", createdAt: item.createdAt, actor: `${item.student.firstName} ${item.student.lastName}`, status: item.status });
    res.json({
      success: true,
      data: {
        students,
        teachers,
        classes,
        exams,
        attendance: {
          recorded: attendance.length,
          presentOrLate: present,
          absent: attendance.filter(item => item.status === "ABSENT").length,
          ratePercent: attendance.length ? Math.round(present / attendance.length * 100) : 0,
          today: {
            recorded: todaysAttendance.length,
            present: todaysAttendance.filter(item => item.status === "PRESENT").length,
            absent: todaysAttendance.filter(item => item.status === "ABSENT").length,
            late: todaysAttendance.filter(item => item.status === "LATE").length
          },
          byDay: attendanceByDay
        },
        recentGrades,
        recentGradesCount: await prisma.examResult.count({ where: gradesWhere }),
        recentActivity: activity,
        fees: req.user.role === "ADMIN" ? {
          invoicedCents: invoices._sum.amountCents || 0,
          paidCents: payments._sum.amountCents || 0,
          outstandingCents: Math.max(0, (invoices._sum.amountCents || 0) - (payments._sum.amountCents || 0)),
          invoiceCount: invoices._count
        } : null
      }
    });
  } catch (error) {
    console.error("Fetch report summary error:", error);
    res.status(500).json({ success: false, message: "Unable to generate report summary." });
  }
});

router.get("/audit", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const [records, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { actor: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.auditLog.count()
    ]);
    res.json({ success: true, data: records, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Fetch audit logs error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch audit log." });
  }
});

module.exports = router;
