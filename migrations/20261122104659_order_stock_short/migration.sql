-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "reservations" JSONB,
ADD COLUMN     "stockShort" BOOLEAN NOT NULL DEFAULT false;
