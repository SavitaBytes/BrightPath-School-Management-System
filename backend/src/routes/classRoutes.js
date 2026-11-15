const express = require("express");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { writeAudit } = require("../utils/audit");

const router = express.Router();
router.use(authenticateToken);

// GET all classes with their sections
router.get("/", authorizeRoles("ADMIN", "TEACHER"), async (req, res) => {
  try {
    const where = req.user.role === "TEACHER"
      ? { teacherAssignments: { some: { teacher: { userId: req.user.userId } } } }
      : {};
    const classes = await prisma.schoolClass.findMany({
      where,
      include: {
        sections: true,
        subjectAssignments: { include: { subject: true, section: true } },
        _count: { select: { students: true } }
      },
      orderBy: { name: "asc" }
    });

    res.json({ success: true, count: classes.length, data: classes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Unable to fetch classes" });
  }
});

// CREATE a class
router.post("/", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { name } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Class name is required"
      });
    }

    const schoolClass = await prisma.$transaction(async tx => {
      const created = await tx.schoolClass.create({ data: { name: name.trim() } });
      await writeAudit(tx, req, "CREATE", "Class", created.id, { name: created.name });
      return created;
    });

    res.status(201).json({
      success: true,
      message: "Class created successfully",
      data: schoolClass
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "This class already exists"
      });
    }

    console.error(error);
    res.status(500).json({ success: false, message: "Unable to create class" });
  }
});

// CREATE a section inside a class
router.post("/:classId/sections", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { name } = req.body;
    const { classId } = req.params;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Section name is required"
      });
    }

    const schoolClass = await prisma.schoolClass.findUnique({
      where: { id: classId }
    });

    if (!schoolClass) {
      return res.status(404).json({
        success: false,
        message: "Class not found"
      });
    }

    const section = await prisma.$transaction(async tx => {
      const created = await tx.section.create({ data: { name: name.trim(), classId } });
      await writeAudit(tx, req, "CREATE", "Section", created.id, { classId, name: created.name });
      return created;
    });

    res.status(201).json({
      success: true,
      message: "Section created successfully",
      data: section
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "This section already exists in this class"
      });
    }

    console.error(error);
    res.status(500).json({ success: false, message: "Unable to create section" });
  }
});

router.post("/:classId/sections/:sectionId/teachers", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { classId, sectionId } = req.params;
    const { teacherId } = req.body;
    if (!teacherId) {
      return res.status(400).json({ success: false, message: "Teacher ID is required." });
    }
    const section = await prisma.section.findUnique({ where: { id: sectionId } });
    if (!section || section.classId !== classId) {
      return res.status(400).json({ success: false, message: "Section does not belong to this class." });
    }
    const assignment = await prisma.$transaction(async tx => {
      const created = await tx.teacherClass.upsert({
        where: { teacherId_sectionId: { teacherId, sectionId } },
        update: { classId },
        create: { teacherId, classId, sectionId },
        include: { teacher: { include: { user: { select: { fullName: true, email: true } } } }, section: true }
      });
      await writeAudit(tx, req, "ASSIGN", "TeacherClass", created.id, { teacherId, classId, sectionId });
      return created;
    });
    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    if (error.code === "P2003") return res.status(400).json({ success: false, message: "Invalid teacher, class or section." });
    console.error("Assign teacher error:", error);
    res.status(500).json({ success: false, message: "Unable to assign teacher." });
  }
});

module.exports = router;