/**
 * Global fetch interceptor — silent access-token refresh
 * ======================================================
 * Access tokens live 15 minutes; the refresh token lives 30 days. Without this
 * the app simply stopped working once the access token expired, because nothing
 * ever called /api/auth/refresh.
 *
 * On a 401 from any /api call this:
 *   1. exchanges the refresh token for a new access token (once, even if many
 *      requests fail at the same moment),
 *   2. retries the original request with the new token,
 *   3. or, if the refresh is rejected (expired, or the session was revoked by
 *      an Apeilo lockdown), clears the tokens and signals the app to sign out.
 *
 * Imported for its side effect from main.jsx so it is installed before any
 * component can fire a request.
 */

const SESSION_EXPIRED_EVENT = "soda:session-expired";

// Keep a clean reference — everything below must bypass the patched version.
const originalFetch = window.fetch.bind(window);

let refreshInFlight = null;

function urlOf(input) {
  if (typeof input === "string") return input;
  if (input && typeof input.url === "string") return input.url;
  return "";
}

/** Only same-origin API calls are our concern (never the refresh call itself). */
function isRefreshableApiCall(url) {
  return url.startsWith("/api") && !url.startsWith("/api/auth/refresh");
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return null;

  try {
    const res = await originalFetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;            // expired, or revoked by a lockdown
    const data = await res.json();
    if (data.token) localStorage.setItem("token", data.token);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    return data.token || null;
  } catch {
    return null;                          // offline — leave the session alone
  }
}

/** Replace the Authorization header on a retry, whatever form headers take. */
function withToken(init, token) {
  const next = { ...(init || {}) };
  const src = next.headers;
  const headers = {};
  if (src instanceof Headers) {
    src.forEach((v, k) => { headers[k] = v; });
  } else if (Array.isArray(src)) {
    src.forEach(([k, v]) => { headers[k] = v; });
  } else if (src && typeof src === "object") {
    Object.assign(headers, src);
  }
  // Drop any existing casing variant before setting the fresh token.
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === "authorization") delete headers[k];
  }
  headers.Authorization = `Bearer ${token}`;
  next.headers = headers;
  return next;
}

window.fetch = async function patchedFetch(input, init) {
  const response = await originalFetch(input, init);

  if (response.status !== 401) return response;
  const url = urlOf(input);
  if (!isRefreshableApiCall(url)) return response;
  if (!localStorage.getItem("refreshToken")) return response;

  // Share one refresh across every request that failed together.
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null; });
  }
  const newToken = await refreshInFlight;

  if (!newToken) {
    clearSession();
    return response;      // hand the original 401 back to the caller
  }

  // Retry once with the fresh token. A body that was already consumed can't be
  // replayed, so Request objects are re-sent as-is.
  return originalFetch(input, withToken(init, newToken));
};

export { SESSION_EXPIRED_EVENT };
