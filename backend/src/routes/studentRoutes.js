
const express = require("express");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { writeAudit } = require("../utils/audit");

const router = express.Router();
router.use(authenticateToken);

// GET /api/students - Get all students
router.get("/", authorizeRoles("ADMIN", "TEACHER", "GUARDIAN", "STUDENT"), async (req, res) => {
  try {
    const where = {};
    if (req.user.role === "GUARDIAN") {
      const guardian = await prisma.guardian.findUnique({
        where: { userId: req.user.userId },
        include: { students: { select: { studentId: true } } }
      });
      where.id = { in: guardian ? guardian.students.map(link => link.studentId) : [] };
    } else if (req.user.role === "STUDENT") {
      where.userId = req.user.userId;
    } else if (req.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.userId } });
      const assignments = teacher ? await prisma.teacherClass.findMany({ where: { teacherId: teacher.id }, select: { sectionId: true } }) : [];
      where.sectionId = { in: assignments.map(assignment => assignment.sectionId) };
    }

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      where.OR = [
        { admissionNo: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } }
      ];
    }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const paginated = Boolean(req.query.page || req.query.limit);
    const [students, total] = await prisma.$transaction([
      prisma.student.findMany({
      where,
      include: {
        schoolClass: true,
        section: true
      },
      ...(paginated ? { skip: (page - 1) * limit, take: limit } : {}),
      orderBy: {
        createdAt: "desc"
      }
      }),
      prisma.student.count({ where })
    ]);

    res.status(200).json({
      success: true,
      count: total,
      data: students,
      ...(paginated ? { pagination: { page, limit, total, pages: Math.ceil(total / limit) } } : {})
    });
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch students"
    });
  }
});

// POST /api/students - Create a student
router.post("/", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const {
      admissionNo,
      firstName,
      lastName,
      dateOfBirth,
      gender,
      classId,
      sectionId
    } = req.body;

    if (
      typeof admissionNo !== "string" || !admissionNo.trim() ||
      typeof firstName !== "string" || !firstName.trim() ||
      typeof lastName !== "string" || !lastName.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Admission number, first name and last name are required."
      });
    }

    let parsedDate;

    if (dateOfBirth) {
      parsedDate = new Date(dateOfBirth);

      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid date of birth."
        });
      }
    }

    if (sectionId) {
      const section = await prisma.section.findUnique({
        where: { id: sectionId }
      });

      if (!section || !classId || section.classId !== classId) {
        return res.status(400).json({
          success: false,
          message: "Invalid section or section does not belong to this class."
        });
      }
    }

    const student = await prisma.$transaction(async tx => {
      const created = await tx.student.create({
      data: {
        admissionNo: admissionNo.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: parsedDate,
        gender: gender || null,
        classId: classId || null,
        sectionId: sectionId || null
      },
      include: {
        schoolClass: true,
        section: true
      }
      });
      await writeAudit(tx, req, "CREATE", "Student", created.id, { admissionNo: created.admissionNo });
      return created;
    });

    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: student
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "This admission number already exists."
      });
    }

    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Invalid class or section ID."
      });
    }

    console.error("Error creating student:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create student"
    });
  }
});

router.post("/:id/account", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { userId } = req.body;
    if (typeof userId !== "string" || !userId) {
      return res.status(400).json({ success: false, message: "Choose a registered student account." });
    }

    const linkedStudent = await prisma.$transaction(async tx => {
      const [student, account] = await Promise.all([
        tx.student.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true } }),
        tx.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, role: true, isActive: true, student: { select: { id: true } } }
        })
      ]);
      if (!student || !account) return { status: 404 };
      if (account.role !== "STUDENT" || !account.isActive) return { status: 400 };
      if (student.userId && student.userId !== account.id) return { status: 409 };
      if (account.student && account.student.id !== student.id) return { status: 409 };

      const updated = await tx.student.update({
        where: { id: student.id },
        data: { userId: account.id }
      });
      await writeAudit(tx, req, "LINK", "StudentAccount", updated.id, { email: account.email });
      return { status: 200, student: updated };
    });

    if (linkedStudent.status === 404) return res.status(404).json({ success: false, message: "Student or account not found." });
    if (linkedStudent.status === 400) return res.status(400).json({ success: false, message: "Only active student accounts can be linked." });
    if (linkedStudent.status === 409) return res.status(409).json({ success: false, message: "This student account is already linked to another student." });
    res.json({ success: true, data: linkedStudent.student });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ success: false, message: "This student already has a linked login account." });
    console.error("Link student account error:", error);
    res.status(500).json({ success: false, message: "Unable to link the student account." });
  }
});

// PUT /api/students/:id - Assign student to class and section
router.put("/:id", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { classId, sectionId } = req.body;

    if (!classId || !sectionId) {
      return res.status(400).json({
        success: false,
        message: "Class ID and section ID are required"
      });
    }

    const section = await prisma.section.findUnique({
      where: { id: sectionId }
    });

    if (!section || section.classId !== classId) {
      return res.status(400).json({
        success: false,
        message: "Section does not belong to this class"
      });
    }

    const student = await prisma.$transaction(async tx => {
      const updated = await tx.student.update({
        where: { id: req.params.id },
        data: { classId, sectionId },
        include: { schoolClass: true, section: true }
      });
      await writeAudit(tx, req, "ASSIGN", "Student", updated.id, { classId, sectionId });
      return updated;
    });

    res.json({
      success: true,
      message: "Student assigned successfully",
      data: student
    });
  } catch (error) {
    console.error("Error updating student:", error);

    res.status(error.code === "P2025" ? 404 : 500).json({
      success: false,
      message: "Unable to update student"
    });
  }
});

module.exports = router;
