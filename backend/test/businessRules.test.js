const { calculateFeeBalance, calculateGrade } = require("../src/utils/businessRules");

describe("school business rules", () => {
  test("calculates a grade from the configured percentage bands", () => {
    const rules = [
      { grade: "A", minPercent: 80 },
      { grade: "B", minPercent: 60 },
      { grade: "F", minPercent: 0 }
    ];

    expect(calculateGrade(40, 50, rules)).toBe("A");
    expect(() => calculateGrade(51, 50, rules)).toThrow(RangeError);
  });

  test("reconciles paid and outstanding fee balances", () => {
    expect(calculateFeeBalance(10000, [{ amountCents: 4000 }, { amountCents: 1000 }])).toEqual({
      amountCents: 10000,
      paidCents: 5000,
      dueCents: 5000
    });
  });
});
