import { verifyAccessToken } from "../utils/tokens.js";
import { env } from "../config/env.js";
import crypto from "node:crypto";
import { User } from "../models/User.js";

function normalizeIp(rawIp) {
  let ip = String(rawIp || "").trim();
  if (!ip) return "unknown";
  // If Express ever provides a list (rare here), keep the first.
  if (ip.includes(",")) ip = ip.split(",")[0].trim();
  // Normalize IPv4-mapped IPv6 addresses.
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  // Normalize localhost IPv6 to IPv4 for stability in dev.
  if (ip === "::1") ip = "127.0.0.1";
  return ip;
}

function normalizeUserAgent(ua) {
  return String(ua || "unknown").trim().toLowerCase() || "unknown";
}

export function getSessionBinding(req) {
  const ip = normalizeIp(req.ip || req.socket?.remoteAddress);
  const ua = normalizeUserAgent(req.headers["user-agent"]);
  return crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex");
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.accessToken || (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Unauthorized", ...(env.nodeEnv !== "production" ? { reason: "missing_access_token_cookie" } : {}) });
    }
    const payload = verifyAccessToken(token);
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      return res.status(401).json({ error: "Unauthorized", ...(env.nodeEnv !== "production" ? { reason: "access_token_expired" } : {}) });
    }
    if (env.sessionBindingEnabled) {
      const binding = getSessionBinding(req);
      if (payload.bind !== binding) {
        return res.status(401).json({
          error: "Unauthorized",
          ...(env.nodeEnv !== "production" ? { reason: "session_binding_mismatch" } : {})
        });
      }
    }
    const user = await User.findById(payload.sub).select("role");
    if (!user) {
      return res.status(401).json({ error: "Unauthorized", ...(env.nodeEnv !== "production" ? { reason: "user_not_found" } : {}) });
    }
    req.userId = payload.sub;
    req.userRole = user.role;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized", ...(env.nodeEnv !== "production" ? { reason: "token_invalid_or_verify_failed" } : {}) });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}
