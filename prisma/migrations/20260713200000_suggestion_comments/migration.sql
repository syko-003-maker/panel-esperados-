-- CreateTable
CREATE TABLE "SuggestionComment" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuggestionComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SuggestionComment_suggestionId_createdAt_idx" ON "SuggestionComment"("suggestionId", "createdAt");

ALTER TABLE "SuggestionComment" ADD CONSTRAINT "SuggestionComment_suggestionId_fkey"
    FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrer les staffNote existants en 1er commentaire (historique préservé)
INSERT INTO "SuggestionComment" ("id", "familyId", "suggestionId", "authorId", "authorName", "message", "createdAt")
SELECT gen_random_uuid()::text, "familyId", "id", NULL, 'Staff', "staffNote", "updatedAt"
FROM "Suggestion"
WHERE "staffNote" IS NOT NULL AND btrim("staffNote") <> '';
