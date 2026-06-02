-- Add AVERT_EM value to SanctionType enum (insert just after AVERT_LOURD)
ALTER TYPE "SanctionType" ADD VALUE IF NOT EXISTS 'AVERT_EM' AFTER 'AVERT_LOURD';
