-- Add approval state for public teacher and administrator sign-up requests.
ALTER TABLE "User" ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT true;
