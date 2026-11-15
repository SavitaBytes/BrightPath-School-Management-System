function calculateGrade(marks, maxMarks, gradeRules) {
  if (!Number.isInteger(marks) || !Number.isInteger(maxMarks) || maxMarks <= 0 || marks < 0 || marks > maxMarks) {
    throw new RangeError("Marks must be a whole number between 0 and the exam maximum.");
  }

  const rules = typeof gradeRules === "string" ? JSON.parse(gradeRules) : gradeRules;
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new TypeError("At least one grading rule is required.");
  }

  const percent = (marks / maxMarks) * 100;
  const match = [...rules]
    .sort((a, b) => b.minPercent - a.minPercent)
    .find(rule => Number.isFinite(rule.minPercent) && percent >= rule.minPercent);

  if (!match || typeof match.grade !== "string") {
    throw new TypeError("Grading rules must cover scores from 0 to 100.");
  }

  return match.grade;
}

function calculateFeeBalance(amountCents, payments) {
  const paidCents = payments.reduce((total, payment) => total + payment.amountCents, 0);
  return {
    amountCents,
    paidCents,
    dueCents: Math.max(0, amountCents - paidCents)
  };
}

module.exports = { calculateGrade, calculateFeeBalance };
