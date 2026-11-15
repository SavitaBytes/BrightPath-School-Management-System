const express = require("express");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { writeAudit } = require("../utils/audit");

const router = express.Router();
router.use(authenticateToken);

router.get("/", authorizeRoles("ADMIN", "TEACHER"), async (req, res) => {
  try {
    const where = req.user.role === "TEACHER"
      ? { classAssignments: { some: { teacher: { userId: req.user.userId } } } }
      : {};
    const subjects = await prisma.subject.findMany({
      where,
      include: {
        classAssignments: {
          include: { schoolClass: true, section: true, teacher: { include: { user: { select: { fullName: true } } } } }
        }
      },
      orderBy: { name: "asc" }
    });
    res.json({ success: true, count: subjects.length, data: subjects });
  } catch (error) {
    console.error("Fetch subjects error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch subjects." });
  }
});

router.post("/", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { code, name } = req.body;
    if (typeof code !== "string" || !code.trim() || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Subject code and name are required." });
    }
    const subject = await prisma.$transaction(async tx => {
      const created = await tx.subject.create({ data: { code: code.trim().toUpperCase(), name: name.trim() } });
      await writeAudit(tx, req, "CREATE", "Subject", created.id, { code: created.code });
      return created;
    });
    res.status(201).json({ success: true, data: subject });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ success: false, message: "This subject code already exists." });
    console.error("Create subject error:", error);
    res.status(500).json({ success: false, message: "Unable to create subject." });
  }
});

router.post("/assignments", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { classId, sectionId, subjectId, teacherId } = req.body;
    if (!classId || !sectionId || !subjectId) {
      return res.status(400).json({ success: false, message: "Class, section and subject are required." });
    }
    const section = await prisma.section.findUnique({ where: { id: sectionId } });
    if (!section || section.classId !== classId) {
      return res.status(400).json({ success: false, message: "Section does not belong to this class." });
    }
    if (teacherId) {
      const assigned = await prisma.teacherClass.findFirst({ where: { teacherId, sectionId } });
      if (!assigned) return res.status(400).json({ success: false, message: "Assign the teacher to this section first." });
    }
    const assignment = await prisma.$transaction(async tx => {
      const created = await tx.classSubject.upsert({
        where: { classId_sectionId_subjectId: { classId, sectionId, subjectId } },
        update: { teacherId: teacherId || null },
        create: { classId, sectionId, subjectId, teacherId: teacherId || null },
        include: { schoolClass: true, section: true, subject: true }
      });
      await writeAudit(tx, req, "ASSIGN", "ClassSubject", created.id, { classId, sectionId, subjectId, teacherId: teacherId || null });
      return created;
    });
    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    if (error.code === "P2003") return res.status(400).json({ success: false, message: "Invalid class, section, subject or teacher." });
    console.error("Assign subject error:", error);
    res.status(500).json({ success: false, message: "Unable to assign subject." });
  }
});

module.exports = router;
