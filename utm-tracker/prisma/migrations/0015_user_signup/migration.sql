-- Sign-up context and declined accounts
ALTER TYPE "UserStatus" ADD VALUE 'declined';

ALTER TABLE "User"
  ADD COLUMN "about" TEXT,
  ADD COLUMN "signup" JSONB,
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "decidedBy" TEXT;
