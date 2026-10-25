-- CreateEnum
CREATE TYPE "ShipmentDocPart" AS ENUM ('ORIGIN_AWB', 'TRANSIT_AWB', 'CONTAINER');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "shipmentPart" "ShipmentDocPart";

