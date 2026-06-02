-- Credentials pour proxy families.lyg.fr.
-- 1 ligne par famille, cookie chiffré AES-256-GCM.
-- familyId est PK ET FK → ON DELETE CASCADE depuis Family.
CREATE TABLE "LygCredential" (
  "familyId"         TEXT PRIMARY KEY,
  "cookieCiphertext" TEXT NOT NULL,
  "ownerDiscordId"   TEXT NOT NULL,
  "ownerName"        TEXT,
  "expired"          BOOLEAN NOT NULL DEFAULT false,
  "lastVerifiedAt"   TIMESTAMP(3),
  "lastUsedAt"       TIMESTAMP(3),
  "lastError"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LygCredential_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE
);
