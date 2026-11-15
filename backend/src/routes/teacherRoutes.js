
const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { writeAudit } = require("../utils/audit");

const router = express.Router();
router.use(authenticateToken);

// GET /api/teachers - List teachers
router.get("/", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({
      success: true,
      data: teachers
    });
  } catch (error) {
    console.error("Get teachers error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to fetch teachers."
    });
  }
});

// POST /api/teachers - Create a teacher
router.post("/", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { fullName, email, password, employeeNo, phone } = req.body;

    if (!fullName || !email || !password || !employeeNo) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and employee number are required."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const teacher = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: fullName.trim(),
          email: email.toLowerCase().trim(),
          passwordHash,
          role: "TEACHER"
        }
      });

      const created = await tx.teacher.create({
        data: {
          userId: user.id,
          employeeNo: employeeNo.trim(),
          phone: phone || null
        },
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
              isActive: true
            }
          }
        }
      });
      await writeAudit(tx, req, "CREATE", "Teacher", created.id, { employeeNo: created.employeeNo });
      return created;
    });

    res.status(201).json({
      success: true,
      message: "Teacher created successfully.",
      data: teacher
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Email or employee number already exists."
      });
    }

    console.error("Create teacher error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to create teacher."
    });
  }
});

module.exports = router;
