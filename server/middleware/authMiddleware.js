import { verifyAccessToken } from "../utils/tokens.js";
import { env } from "../config/env.js";
import crypto from "node:crypto";
import { User } from "../models/User.js";

export function getSessionBinding(req) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";
  return crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex");
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.accessToken || (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const payload = verifyAccessToken(token);
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (env.sessionBindingEnabled) {
      const binding = getSessionBinding(req);
      if (payload.bind !== binding) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
    const user = await User.findById(payload.sub).select("role");
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.userId = payload.sub;
    req.userRole = user.role;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
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
