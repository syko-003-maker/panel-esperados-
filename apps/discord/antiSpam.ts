/**
 * Anti-spam protection for Discord interactions
 * In-memory cooldowns and flood protection
 */

// Hub button click cooldown (5 seconds)
const hubClickCooldowns = new Map<string, number>();
const HUB_CLICK_COOLDOWN_MS = 5 * 1000;

// Ticket creation cooldown (5 minutes)
const ticketCooldowns = new Map<string, number>();
const TICKET_COOLDOWN_MS = 5 * 60 * 1000;

// Double-submit protection
const processingKeys = new Set<string>();

// Thread message flood protection (3 seconds)
const threadMessageCooldowns = new Map<string, number>();
const THREAD_MESSAGE_COOLDOWN_MS = 3 * 1000;

export function canClickHub(userId: string): { ok: boolean; retryInMs?: number } {
  const now = Date.now();
  const lastClick = hubClickCooldowns.get(userId);

  if (lastClick) {
    const elapsed = now - lastClick;
    if (elapsed < HUB_CLICK_COOLDOWN_MS) {
      return { ok: false, retryInMs: HUB_CLICK_COOLDOWN_MS - elapsed };
    }
  }

  hubClickCooldowns.set(userId, now);
  return { ok: true };
}

export function canOpenTicket(userId: string): { ok: boolean; retryInMs?: number } {
  const now = Date.now();
  const lastTicket = ticketCooldowns.get(userId);

  if (lastTicket) {
    const elapsed = now - lastTicket;
    if (elapsed < TICKET_COOLDOWN_MS) {
      return { ok: false, retryInMs: TICKET_COOLDOWN_MS - elapsed };
    }
  }

  ticketCooldowns.set(userId, now);
  return { ok: true };
}

export function guardProcessing(key: string): { ok: boolean; release: () => void } {
  if (processingKeys.has(key)) {
    return { ok: false, release: () => {} };
  }

  processingKeys.add(key);
  return {
    ok: true,
    release: () => processingKeys.delete(key),
  };
}

export function canSendThreadMessage(
  threadId: string,
  userId: string
): { ok: boolean; retryInMs?: number } {
  const now = Date.now();
  const key = `${threadId}:${userId}`;
  const lastMessage = threadMessageCooldowns.get(key);

  if (lastMessage) {
    const elapsed = now - lastMessage;
    if (elapsed < THREAD_MESSAGE_COOLDOWN_MS) {
      return { ok: false, retryInMs: THREAD_MESSAGE_COOLDOWN_MS - elapsed };
    }
  }

  threadMessageCooldowns.set(key, now);
  return { ok: true };
}

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();

  for (const [userId, timestamp] of hubClickCooldowns.entries()) {
    if (now - timestamp > HUB_CLICK_COOLDOWN_MS * 100) {
      hubClickCooldowns.delete(userId);
    }
  }

  for (const [userId, timestamp] of ticketCooldowns.entries()) {
    if (now - timestamp > TICKET_COOLDOWN_MS * 2) {
      ticketCooldowns.delete(userId);
    }
  }

  for (const [key, timestamp] of threadMessageCooldowns.entries()) {
    if (now - timestamp > THREAD_MESSAGE_COOLDOWN_MS * 100) {
      threadMessageCooldowns.delete(key);
    }
  }
}, 10 * 60 * 1000);
