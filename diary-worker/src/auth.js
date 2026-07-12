// Auth primitives using the built-in Web Crypto API (no npm).
// - Passwords: salted PBKDF2-SHA256 (slow KDF), stored as "saltB64:hashB64".
// - Sessions: JWT signed with HMAC-SHA256, 30-day expiry.

const enc = new TextEncoder();
const dec = new TextDecoder();
const PBKDF2_ITER = 100000;
const JWT_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

/* ---------- base64url ---------- */
function b64u(bytes) {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- password hashing ---------- */
async function deriveBits(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    key,
    256
  );
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt);
  return b64u(salt) + ":" + b64u(bits);
}

export async function verifyPassword(password, stored) {
  const [saltB, hashB] = (stored || "").split(":");
  if (!saltB || !hashB) return false;
  const bits = await deriveBits(password, unb64u(saltB));
  const a = new Uint8Array(bits);
  const b = unb64u(hashB);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; // constant-time compare
  return diff === 0;
}

/* ---------- JWT (HS256) ---------- */
async function hmacKey(secret, usage) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signJWT(payload, secret) {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + JWT_TTL_SEC };
  const head = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const data = head + "." + b64u(enc.encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(data));
  return data + "." + b64u(sig);
}

export async function verifyJWT(token, secret) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  const data = parts[0] + "." + parts[1];
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), unb64u(parts[2]), enc.encode(data));
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(dec.decode(unb64u(parts[1])));
  } catch {
    return null;
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

export { JWT_TTL_SEC };
