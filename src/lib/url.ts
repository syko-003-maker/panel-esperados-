/**
 * URL Normalization Utilities
 * 
 * Handles protocol normalization for internal vs external URLs.
 * Forces HTTP for localhost/private IPs to avoid SSL errors.
 */

/**
 * Normalize a base URL with proper protocol handling
 * @param raw - Raw URL string (may or may not have protocol)
 * @returns Normalized URL string without trailing slash
 */
export function normalizeBaseUrl(raw: string | undefined): string {
  if (!raw) {
    throw new Error("normalizeBaseUrl: URL is required");
  }

  let input = raw.trim();
  
  // Add https:// if no protocol specified
  if (!input.match(/^https?:\/\//i)) {
    input = `https://${input}`;
  }

  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase();

    // Force HTTP for localhost and private IPs to avoid SSL errors
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    const isPrivateIp =
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);

    if (isLocalhost || isPrivateIp) {
      parsed.protocol = "http:";
    }

    // Remove trailing slash
    let result = parsed.toString();
    if (result.endsWith("/")) {
      result = result.slice(0, -1);
    }

    return result;
  } catch (err) {
    throw new Error(`normalizeBaseUrl: Invalid URL "${raw}": ${err}`);
  }
}

/**
 * Get the base URL for internal API calls within the Next.js app
 * Uses the incoming request URL but ensures correct protocol for localhost
 */
export function getInternalBaseUrl(requestUrl: URL): string {
  const base = `${requestUrl.protocol}//${requestUrl.host}`;
  return normalizeBaseUrl(base);
}
