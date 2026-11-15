const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { writeAudit } = require("../utils/audit");

const router = express.Router();
router.use(authenticateToken, authorizeRoles("ADMIN"));

router.get("/", async (req, res) => {
  try {
    const guardians = await prisma.guardian.findMany({
      include: {
        user: { select: { fullName: true, email: true, isActive: true } },
        students: { include: { student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, count: guardians.length, data: guardians });
  } catch (error) {
    console.error("Fetch guardians error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch guardians." });
  }
});

router.post("/:guardianId/students", async (req, res) => {
  try {
    const { studentId, relation } = req.body;
    if (typeof studentId !== "string" || !studentId ||
      (relation !== undefined && !["Parent", "Guardian", "Other"].includes(relation))) {
      return res.status(400).json({ success: false, message: "Choose a student and a valid relationship." });
    }

    const link = await prisma.$transaction(async tx => {
      const created = await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId, guardianId: req.params.guardianId } },
        update: { relation: relation || "Guardian" },
        create: { studentId, guardianId: req.params.guardianId, relation: relation || "Guardian" }
      });
      await writeAudit(tx, req, "LINK", "GuardianStudent", `${req.params.guardianId}:${studentId}`, { studentId, relation: relation || "Guardian" });
      return created;
    });

    res.status(200).json({ success: true, data: link });
  } catch (error) {
    if (error.code === "P2003" || error.code === "P2025") {
      return res.status(404).json({ success: false, message: "Guardian account or student not found." });
    }
    console.error("Link guardian student error:", error);
    res.status(500).json({ success: false, message: "Unable to link guardian to student." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { fullName, email, password, phone, studentId, relation } = req.body;
    if (typeof fullName !== "string" || !fullName.trim() || typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" ||
      password.length < 8 || !studentId) {
      return res.status(400).json({ success: false, message: "Name, valid email, password (8+ characters) and linked student are required." });
    }
    const guardian = await prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: { fullName: fullName.trim(), email: email.toLowerCase().trim(), passwordHash: await bcrypt.hash(password, 12), role: "GUARDIAN" }
      });
      const created = await tx.guardian.create({ data: { userId: user.id, phone: phone || null } });
      await tx.studentGuardian.create({ data: { studentId, guardianId: created.id, relation: relation || null } });
      await writeAudit(tx, req, "CREATE", "Guardian", created.id, { studentId });
      return tx.guardian.findUnique({
        where: { id: created.id },
        include: { user: { select: { fullName: true, email: true } }, students: { include: { student: true } } }
      });
    });
    res.status(201).json({ success: true, data: guardian });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ success: false, message: "An account with this email already exists." });
    if (error.code === "P2003") return res.status(400).json({ success: false, message: "Student not found." });
    console.error("Create guardian error:", error);
    res.status(500).json({ success: false, message: "Unable to create guardian." });
  }
});

module.exports = router;
