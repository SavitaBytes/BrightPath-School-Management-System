
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { writeAudit } = require("../utils/audit");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password, phone, role } = req.body;
    if (typeof fullName !== "string" || fullName.trim().length < 2 || fullName.trim().length > 120 ||
      typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" || password.length < 8 || password.length > 72 ||
      !["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"].includes(role) ||
      (phone !== undefined && (typeof phone !== "string" || phone.trim().length > 30))) {
      return res.status(400).json({
        success: false,
        message: "Choose an account type and enter your name, a valid email address, and a password between 8 and 72 characters."
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");
      return res.status(500).json({
        success: false,
        message: "Authentication is not configured."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const requiresApproval = role === "ADMIN" && process.env.NODE_ENV === "production";
    const user = await prisma.$transaction(async tx => {
      const createdUser = await tx.user.create({
        data: {
          fullName: fullName.trim(),
          email: normalizedEmail,
          passwordHash: await bcrypt.hash(password, 12),
          role,
          isActive: !requiresApproval,
          isApproved: !requiresApproval
        }
      });
      if (role === "GUARDIAN") {
        await tx.guardian.create({
          data: { userId: createdUser.id, phone: phone?.trim() || null }
        });
      } else if (role === "TEACHER") {
        await tx.teacher.create({
          data: { userId: createdUser.id, employeeNo: `TCH-${randomUUID().slice(0, 8).toUpperCase()}` }
        });
      }
      return createdUser;
    });

    if (requiresApproval) {
      return res.status(202).json({
        success: true,
        pendingApproval: true,
        message: "Your administrator account request was sent for approval."
      });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(201).json({
      success: true,
      message: role === "STUDENT"
        ? "Student account created. The school must link it to your student record before records are available."
        : role === "TEACHER"
          ? "Teacher account created. A school administrator must assign your classes before school data is available."
          : role === "ADMIN"
            ? "Administrator account created."
            : "Guardian account created. The school must link your student before records are available.",
      token,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role }
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }
    console.error("Registration error:", error);
    return res.status(500).json({ success: false, message: "Unable to create your account." });
  }
});

router.get("/requests", authenticateToken, authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const requests = await prisma.user.findMany({
      where: { isApproved: false, role: { in: ["ADMIN", "TEACHER"] } },
      select: { id: true, fullName: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error("Fetch account requests error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch account requests." });
  }
});

router.get("/unlinked-students", authenticateToken, authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const accounts = await prisma.user.findMany({
      where: { role: "STUDENT", isActive: true, student: { is: null } },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" }
    });
    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error("Fetch unlinked student accounts error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch unlinked student accounts." });
  }
});

router.post("/requests/:userId/approve", authenticateToken, authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const approvedUser = await prisma.$transaction(async tx => {
      const requestedUser = await tx.user.findFirst({
        where: { id: req.params.userId, isApproved: false, role: { in: ["ADMIN", "TEACHER"] } }
      });
      if (!requestedUser) return null;

      if (requestedUser.role === "TEACHER") {
        await tx.teacher.create({
          data: { userId: requestedUser.id, employeeNo: `TCH-${randomUUID().slice(0, 8).toUpperCase()}` }
        });
      }
      const user = await tx.user.update({
        where: { id: requestedUser.id },
        data: { isApproved: true, isActive: true },
        select: { id: true, fullName: true, email: true, role: true }
      });
      await writeAudit(tx, req, "APPROVE", "AccountRequest", user.id, { email: user.email, role: user.role });
      return user;
    });

    if (!approvedUser) return res.status(404).json({ success: false, message: "Pending account request not found." });
    res.json({ success: true, data: approvedUser });
  } catch (error) {
    console.error("Approve account request error:", error);
    res.status(500).json({ success: false, message: "Unable to approve account request." });
  }
});

router.post("/requests/:userId/reject", authenticateToken, authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const rejected = await prisma.$transaction(async tx => {
      const requestedUser = await tx.user.findFirst({
        where: { id: req.params.userId, isApproved: false, role: { in: ["ADMIN", "TEACHER"] } }
      });
      if (!requestedUser) return false;
      await writeAudit(tx, req, "REJECT", "AccountRequest", requestedUser.id, { email: requestedUser.email, role: requestedUser.role });
      await tx.user.delete({ where: { id: requestedUser.id } });
      return true;
    });
    if (!rejected) return res.status(404).json({ success: false, message: "Pending account request not found." });
    res.json({ success: true, message: "Account request rejected." });
  } catch (error) {
    console.error("Reject account request error:", error);
    res.status(500).json({ success: false, message: "Unable to reject account request." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const requiresAdminApproval = process.env.NODE_ENV === "production";
    if (user.role === "ADMIN" && !user.isApproved && requiresAdminApproval) {
      return res.status(403).json({ success: false, message: "Your administrator account request is awaiting approval." });
    }

    if ((user.role === "TEACHER" || user.role === "ADMIN") && !user.isApproved) {
      user = await prisma.$transaction(async tx => {
        if (user.role === "TEACHER") {
          await tx.teacher.upsert({
            where: { userId: user.id },
            update: {},
            create: {
              userId: user.id,
              employeeNo: `TCH-${randomUUID().slice(0, 8).toUpperCase()}`
            }
          });
        }
        return tx.user.update({
          where: { id: user.id },
          data: { isApproved: true, isActive: true }
        });
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");
      return res.status(500).json({
        success: false,
        message: "Authentication is not configured."
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to log in."
    });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, fullName: true, email: true, role: true }
  });
  res.json({ success: true, data: user });
});

module.exports = router;
