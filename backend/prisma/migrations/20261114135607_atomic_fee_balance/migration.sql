-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FeeInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeInvoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FeeInvoice" ("amountCents", "createdAt", "description", "dueDate", "id", "invoiceNo", "studentId") SELECT "amountCents", "createdAt", "description", "dueDate", "id", "invoiceNo", "studentId" FROM "FeeInvoice";
DROP TABLE "FeeInvoice";
ALTER TABLE "new_FeeInvoice" RENAME TO "FeeInvoice";
CREATE UNIQUE INDEX "FeeInvoice_invoiceNo_key" ON "FeeInvoice"("invoiceNo");
CREATE INDEX "FeeInvoice_studentId_dueDate_idx" ON "FeeInvoice"("studentId", "dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
