/**
 * In-memory Tangbuy access token for embedded Admin iframe (third-party cookies unreliable).
 * Standalone continues to use httpOnly cookies — this store stays empty.
 */

let embeddedAccessToken: string | null = null;
let embeddedShopDomain: string | null = null;
let embeddedShopEmail: string | null = null;
let embeddedExpiresAt = 0;

export function setEmbeddedAccessToken(
  token: string | null,
  opts?: {
    shopDomain?: string | null;
    shopEmail?: string | null;
    expiresInSeconds?: number;
  }
): void {
  embeddedAccessToken = token;
  embeddedShopDomain = opts?.shopDomain?.trim() || null;
  if (opts?.shopEmail !== undefined) {
    embeddedShopEmail = opts.shopEmail?.trim() || null;
  }
  if (token && opts?.expiresInSeconds && opts.expiresInSeconds > 0) {
    // Refresh 60s before expiry.
    embeddedExpiresAt = Date.now() + Math.max(30, opts.expiresInSeconds - 60) * 1000;
  } else {
    embeddedExpiresAt = token ? Date.now() + 14 * 60 * 1000 : 0;
  }
}

export function getEmbeddedAccessToken(): string | null {
  if (!embeddedAccessToken) return null;
  if (embeddedExpiresAt > 0 && Date.now() >= embeddedExpiresAt) {
    return null;
  }
  return embeddedAccessToken;
}

export function getEmbeddedShopDomain(): string | null {
  return embeddedShopDomain;
}

/** Shopify shop contact email from the last successful session-token exchange. */
export function getEmbeddedShopEmail(): string | null {
  return embeddedShopEmail;
}

export function clearEmbeddedAccessToken(): void {
  embeddedAccessToken = null;
  embeddedShopDomain = null;
  embeddedShopEmail = null;
  embeddedExpiresAt = 0;
}

export function isEmbeddedAccessTokenExpiredOrMissing(): boolean {
  return !getEmbeddedAccessToken();
}
