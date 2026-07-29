/**
 * Same-origin BFF fetch with dual-host auth (cookie or embedded Bearer).
 * Use for `/api/agents/*`, `/api/translate`, `/api/oss/*`, `/api/batch-link/*`, `/api/tangbuy/*`.
 */

export async function sameOriginAuthedFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const { resolveAuthStrategyFromLocation } = await import(
    "@/host/adapters/auth-transport"
  );
  const strategy = resolveAuthStrategyFromLocation();
  const auth = await strategy.prepareRequest();

  const mergedHeaders: Record<string, string> = {
    Accept: "application/json",
    ...auth.headers,
  };
  const initHeaders = init?.headers;
  if (initHeaders instanceof Headers) {
    initHeaders.forEach((value, key) => {
      mergedHeaders[key] = value;
    });
  } else if (Array.isArray(initHeaders)) {
    for (const [key, value] of initHeaders) mergedHeaders[key] = value;
  } else if (initHeaders) {
    Object.assign(mergedHeaders, initHeaders);
  }

  return fetch(input, {
    ...init,
    credentials: init?.credentials ?? auth.credentials,
    headers: mergedHeaders,
  });
}
