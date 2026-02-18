/**
 * Discord Nickname Rules and Utilities
 * Handles normalization and building of Discord nicknames from rpName
 *
 * Discord Limits:
 * - Nickname max 32 characters
 * - Cannot contain newlines
 * - Cannot contain certain special characters
 */
/**
 * Normalize rpName for use as Discord nickname
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 * - Remove newlines and other control characters
 * - Limit to 32 characters (Discord API limit)
 *
 * @param name Raw rpName from database
 * @returns Normalized name or empty string
 */
export function normalizeRpName(name) {
    if (!name)
        return "";
    return (name
        .trim()
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .replace(/[\r\n\t]/g, " ") // Replace newlines/tabs with space
        .substring(0, 32) // Limit to Discord's 32 char limit
        .trim() // Trim again after substring
    );
}
/**
 * Build Discord nickname from member
 * Returns the normalized rpName, or null if rpName is empty
 *
 * @param member Object with rpName property
 * @returns Normalized nickname or null if rpName empty
 */
export function buildNickname(member) {
    const normalized = normalizeRpName(member.rpName);
    return normalized.length > 0 ? normalized : null;
}
/**
 * Check if a nickname would need updating
 * Compares normalized rpName with current Discord nickname
 *
 * @param member Member with rpName
 * @param currentNickname Current Discord nickname (or undefined)
 * @returns true if nickname needs updating
 */
export function shouldUpdateNickname(member, currentNickname) {
    const desired = buildNickname(member);
    // If both are null/empty, no update needed
    if (!desired && !currentNickname)
        return false;
    // Otherwise, update if different
    return desired !== currentNickname;
}
