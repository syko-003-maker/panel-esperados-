/**
 * Discord ID validation utilities
 * 
 * Discord IDs are 17-20 digit strings (Snowflake format).
 * CRITICAL: Never convert to Number - precision loss beyond 2^53-1
 * causes API 404 errors (Unknown Member).
 */

const DISCORD_ID_REGEX = /^\d{17,20}$/;

export interface DiscordIdValidationResult {
  valid: boolean;
  discordId: string;
  error?: string;
}

/**
 * Validate and normalize Discord ID
 * 
 * @param input - Raw discordId input (may be number, string, etc.)
 * @returns Validation result with normalized string or error
 */
export function validateDiscordId(input: unknown): DiscordIdValidationResult {
  // Convert to string and trim
  const discordId = String(input ?? "").trim();
  
  // Check empty
  if (!discordId) {
    return {
      valid: false,
      discordId: "",
      error: "Discord ID is empty",
    };
  }

  // Validate format (17-20 digits)
  if (!DISCORD_ID_REGEX.test(discordId)) {
    return {
      valid: false,
      discordId,
      error: `Invalid Discord ID format: "${discordId}" (expected 17-20 digits)`,
    };
  }

  // Success
  return {
    valid: true,
    discordId,
  };
}

/**
 * Log Discord ID metadata for debugging
 * Helps identify Number conversion issues
 */
export function logDiscordIdDebug(input: unknown, context: string): void {
  const typeOf = typeof input;
  const asString = String(input ?? "");
  const length = asString.length;
  
  console.log(`[discordId:debug] ${context}`, {
    typeof: typeOf,
    length,
    value: asString,
    isValid: DISCORD_ID_REGEX.test(asString),
  });
}

/**
 * Safe wrapper for guild.members.fetch with validation
 * 
 * @param guild - Discord Guild instance
 * @param discordId - Raw Discord ID input
 * @param context - Context string for logging
 * @returns GuildMember or null if not found/invalid
 */
export async function safeFetchMember(
  guild: any,
  discordId: unknown,
  context: string
): Promise<any | null> {
  const validation = validateDiscordId(discordId);
  
  if (!validation.valid) {
    console.warn(`[safeFetchMember:${context}] Invalid discordId`, {
      input: discordId,
      error: validation.error,
    });
    return null;
  }

  try {
    // Force fresh fetch (no cache) to ensure accurate membership status
    const member = await guild.members.fetch({
      user: validation.discordId,
      force: true,
    });
    
    return member;
  } catch (err: any) {
    // Discord error code 10007 = Unknown Member (not in guild)
    if (err.code === 10007) {
      console.info(`[safeFetchMember:${context}] Member not in guild`, {
        discordId: validation.discordId,
        errorCode: err.code,
      });
      return null;
    }

    // Other errors (rate limit, network, etc.)
    console.error(`[safeFetchMember:${context}] Fetch failed`, {
      discordId: validation.discordId,
      error: err.message,
      code: err.code,
    });
    
    throw err;
  }
}
