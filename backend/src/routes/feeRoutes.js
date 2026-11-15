const express = require("express");
const { randomUUID } = require("node:crypto");
const prisma = require("../config/prisma");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { calculateFeeBalance } = require("../utils/businessRules");
const { writeAudit } = require("../utils/audit");

const router = express.Router();
router.use(authenticateToken);

function invoiceAccessFilter(user) {
  if (user.role === "GUARDIAN") return { student: { guardians: { some: { guardian: { userId: user.userId } } } } };
  if (user.role === "STUDENT") return { student: { userId: user.userId } };
  if (user.role === "TEACHER") return { id: "__no_access__" };
  return {};
}

router.get("/", authorizeRoles("ADMIN", "GUARDIAN", "STUDENT"), async (req, res) => {
  try {
    const invoices = await prisma.feeInvoice.findMany({
      where: invoiceAccessFilter(req.user),
      include: { student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } }, payments: { orderBy: { createdAt: "asc" } } },
      orderBy: { dueDate: "asc" }
    });
    const data = invoices.map(invoice => ({ ...invoice, ...calculateFeeBalance(invoice.amountCents, invoice.payments) }));
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error("Fetch invoices error:", error);
    res.status(500).json({ success: false, message: "Unable to fetch fee invoices." });
  }
});

router.post("/", authorizeRoles("ADMIN"), async (req, res) => {
  try {
    const { studentId, description, amountCents, dueDate } = req.body;
    if (!studentId || typeof description !== "string" || !description.trim() ||
      !Number.isInteger(amountCents) || amountCents <= 0 ||
      typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ success: false, message: "Student, description, positive amount in cents and due date are required." });
    }
    const date = new Date(`${dueDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dueDate) {
      return res.status(400).json({ success: false, message: "Please provide a valid due date." });
    }
    const invoice = await prisma.$transaction(async tx => {
      const created = await tx.feeInvoice.create({
        data: { invoiceNo: `INV-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`, studentId, description: description.trim(), amountCents, dueDate: date },
        include: { student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } }, payments: true }
      });
      await writeAudit(tx, req, "CREATE", "FeeInvoice", created.id, { amountCents });
      return created;
    });
    res.status(201).json({ success: true, data: { ...invoice, ...calculateFeeBalance(invoice.amountCents, invoice.payments) } });
  } catch (error) {
    if (error.code === "P2003") return res.status(400).json({ success: false, message: "Student not found." });
    console.error("Create invoice error:", error);
    res.status(500).json({ success: false, message: "Unable to create fee invoice." });
  }
});

router.post("/:invoiceId/payments", authorizeRoles("ADMIN", "GUARDIAN", "STUDENT"), async (req, res) => {
  try {
    const { amountCents } = req.body;
    const idempotencyKey = req.get("Idempotency-Key");
    if (!Number.isInteger(amountCents) || amountCents <= 0 || !idempotencyKey || idempotencyKey.length > 100) {
      return res.status(400).json({ success: false, message: "Positive amount in cents and a valid Idempotency-Key header are required." });
    }
    const invoice = await prisma.feeInvoice.findUnique({
      where: { id: req.params.invoiceId },
      include: { payments: true, student: { include: { guardians: { include: { guardian: true } } } } }
    });
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found." });
    if (req.user.role === "GUARDIAN" && !invoice.student.guardians.some(link => link.guardian.userId === req.user.userId)) {
      return res.status(403).json({ success: false, message: "You may only pay a linked student's invoice." });
    }
    if (req.user.role === "STUDENT" && invoice.student.userId !== req.user.userId) {
      return res.status(403).json({ success: false, message: "You may only pay your own invoice." });
    }

    const payment = await prisma.$transaction(async tx => {
      const prior = await tx.feePayment.findUnique({ where: { idempotencyKey } });
      if (prior) {
        if (prior.invoiceId !== invoice.id || prior.amountCents !== amountCents) {
          const conflict = new Error("IDEMPOTENCY_CONFLICT");
          throw conflict;
        }
        return prior;
      }
      const updated = await tx.feeInvoice.updateMany({
        where: { id: invoice.id, paidCents: { lte: invoice.amountCents - amountCents } },
        data: { paidCents: { increment: amountCents } }
      });
      if (updated.count !== 1) {
        const conflict = new Error("PAYMENT_EXCEEDS_BALANCE");
        throw conflict;
      }
      const created = await tx.feePayment.create({
        data: { invoiceId: invoice.id, idempotencyKey, amountCents },
      });
      await writeAudit(tx, req, "PAYMENT", "FeeInvoice", invoice.id, { paymentId: created.id, amountCents });
      return created;
    });
    res.status(201).json({ success: true, data: payment, message: "Simulated payment recorded." });
  } catch (error) {
    if (error.message === "IDEMPOTENCY_CONFLICT") return res.status(409).json({ success: false, message: "This idempotency key was already used for a different payment." });
    if (error.message === "PAYMENT_EXCEEDS_BALANCE" || error.code === "P2002") return res.status(409).json({ success: false, message: error.message === "PAYMENT_EXCEEDS_BALANCE" ? "Payment exceeds the outstanding balance." : "This payment request has already been processed." });
    console.error("Record payment error:", error);
    res.status(500).json({ success: false, message: "Unable to record simulated payment." });
  }
});

module.exports = router;
