// Public build-time setting only. Authentication remains in HttpOnly server cookies.
export function resolveApiOrigin(raw, pageOrigin, production) {
  if (!raw) return pageOrigin;
  let url;
  try { url = new URL(raw); }
  catch { throw new Error("The API address is invalid. Please check the deployment settings."); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.username || url.password || url.href !== `${url.origin}/` ||
    (production ? url.protocol !== "https:" : url.protocol !== "https:" && !(url.protocol === "http:" && local))) {
    throw new Error("The API address must be a secure origin without a path or credentials.");
  }
  return url.origin;
}
