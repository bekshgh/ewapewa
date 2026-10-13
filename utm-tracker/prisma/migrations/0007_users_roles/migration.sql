-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'manager', 'viewer');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'disabled');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "projectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'viewer',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

