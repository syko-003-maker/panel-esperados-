/**
 * Content validation for ticket submissions
 * Anti-spam and quality checks
 */

const userContentHistory = new Map<string, { hash: string; timestamp: number }>();

const MIN_LENGTH = 15;
const MIN_UNIQUE_RATIO = 0.3;
const DUPLICATE_WINDOW_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

function normalizeContent(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hashContent(text: string): string {
  let hash = 0;
  const normalized = normalizeContent(text);
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function getUniqueCharRatio(text: string): number {
  const normalized = normalizeContent(text);
  if (normalized.length === 0) return 0;
  const uniqueChars = new Set(normalized);
  return uniqueChars.size / normalized.length;
}

export function validateTicketText(
  userId: string,
  text: string
): { ok: boolean; reason?: string } {
  const normalized = normalizeContent(text);

  // Check minimum length
  if (normalized.length < MIN_LENGTH) {
    return {
      ok: false,
      reason: "Le contenu est trop court. Merci de fournir au minimum 15 caractères.",
    };
  }

  // Check for high repetition
  const uniqueRatio = getUniqueCharRatio(text);
  if (uniqueRatio < MIN_UNIQUE_RATIO) {
    return {
      ok: false,
      reason: "Le contenu semble contenir beaucoup de répétitions. Merci de fournir du texte original.",
    };
  }

  // Check for duplicate submission
  const userHistory = userContentHistory.get(userId);
  if (userHistory) {
    const now = Date.now();
    const timeSinceLastSubmit = now - userHistory.timestamp;
    const currentHash = hashContent(text);

    if (
      timeSinceLastSubmit < DUPLICATE_WINDOW_MS &&
      userHistory.hash === currentHash
    ) {
      return {
        ok: false,
        reason: "Ce contenu a déjà été soumis récemment. Merci de fournir une description différente.",
      };
    }
  }

  // Save content hash
  userContentHistory.set(userId, {
    hash: hashContent(text),
    timestamp: Date.now(),
  });

  return { ok: true };
}

// Cleanup old content history
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of userContentHistory.entries()) {
    if (now - data.timestamp > CLEANUP_INTERVAL_MS) {
      userContentHistory.delete(userId);
    }
  }
}, CLEANUP_INTERVAL_MS);
