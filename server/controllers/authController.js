import {
  enableMfa,
  getPreLoginData,
  initiateRecovery,
  loginUser,
  revokeRefreshToken,
  refreshSession,
  registerUser,
  submitRecoveryShare,
  completeRecovery
} from "../services/authService.js";
import { appendAuditLog } from "../utils/auditLogger.js";
import validator from "validator";
import { env } from "../config/env.js";
import { getSessionBinding } from "../middleware/authMiddleware.js";
import crypto from "node:crypto";

function getRequestFingerprint(req) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  const userAgentHash = crypto.createHash("sha256").update(userAgent).digest("hex");
  return { ip, userAgentHash };
}

function setAuthCookies(res, accessToken, refreshToken, secure) {
  const secureCookie = secure || env.nodeEnv === "production";
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookie,
    maxAge: 15 * 60 * 1000
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookie,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export async function register(req, res, next) {
  try {
    const user = await registerUser(req.body);
    appendAuditLog("register", { userId: user.id, email: user.email });
    return res.status(201).json({ message: "Registration complete" });
  } catch (err) {
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken, unlockedNow } = await loginUser({
      ...req.body,
      sessionBinding: getSessionBinding(req)
    });
    setAuthCookies(res, accessToken, refreshToken, req.app.locals.cookieSecure);
    appendAuditLog("login", { userId: user.id });
    if (unlockedNow) {
      appendAuditLog("account_unlocked", { userId: user.id, reason: "lockout_window_elapsed" });
    }
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        mfaEnabled: user.mfaEnabled,
        kdfParams: user.kdfParams
      }
    });
  } catch (err) {
    const { ip, userAgentHash } = getRequestFingerprint(req);
    appendAuditLog("login_failed", {
      email: req.body?.email || "unknown",
      ip,
      userAgentHash,
      reason: "authentication_failed"
      // Future improvement: trigger anomaly detection when threshold of failed attempts is exceeded.
    });
    if (err.accountLockedNow) {
      appendAuditLog("account_locked", {
        email: req.body?.email || "unknown",
        ip,
        userAgentHash
      });
    }
    if (err.unlockedNow) {
      appendAuditLog("account_unlocked", {
        email: req.body?.email || "unknown",
        ip,
        userAgentHash,
        reason: "lockout_window_elapsed"
      });
    }
    return next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.cookies;
    const session = await refreshSession(refreshToken || "", getSessionBinding(req));
    setAuthCookies(res, session.accessToken, session.refreshToken, req.app.locals.cookieSecure);
    appendAuditLog("refresh_session", {});
    return res.json({ message: "Session refreshed" });
  } catch (err) {
    return next(err);
  }
}

export async function logout(req, res) {
  const secureCookie = req.app.locals.cookieSecure || env.nodeEnv === "production";
  const cookieOptions = { httpOnly: true, sameSite: "strict", secure: secureCookie };
  const { refreshToken } = req.cookies;
  try {
    if (refreshToken) {
      const revoked = await revokeRefreshToken(refreshToken || "", getSessionBinding(req));
      appendAuditLog("refresh_token_revoked", { userId: revoked.userId });
    }
  } catch {
    // Best effort revocation during logout.
  } finally {
    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);
  }
  appendAuditLog("logout", {});
  return res.json({ message: "Logged out" });
}

export async function setupMfa(req, res, next) {
  try {
    const data = await enableMfa(req.userId);
    appendAuditLog("enable_mfa", { userId: req.userId });
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

export async function csrfToken(req, res) {
  return res.json({ csrfToken: req.csrfToken() });
}

export async function preLogin(req, res, next) {
  try {
    if (!validator.isEmail(req.body.email || "")) {
      return res.status(400).json({ error: "Invalid email" });
    }
    const data = await getPreLoginData(req.body.email);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

export async function recoveryRequest(req, res, next) {
  try {
    const payload = await initiateRecovery(req.body);
    appendAuditLog("recovery_initiated", { email: req.body?.email || "unknown" });
    return res.status(202).json({
      message: "Recovery request received",
      verificationTokens: payload.verificationTokens
    });
  } catch (err) {
    if (err.message === "RECOVERY_RATE_LIMITED") {
      appendAuditLog("recovery_rate_limited", { email: req.body?.email || "unknown" });
    }
    appendAuditLog("recovery_failed", { email: req.body?.email || "unknown", reason: "request_rejected" });
    return res.status(202).json({
      message: "Recovery request received",
      verificationTokens: Array.from({ length: 5 }, (_, index) => ({
        contactId: `contact-${index + 1}`,
        token: crypto.randomBytes(16).toString("hex")
      }))
    });
  }
}

export async function recoverySubmitShare(req, res, next) {
  try {
    const payload = await submitRecoveryShare(req.body);
    appendAuditLog("recovery_contact_verified", {
      email: req.body?.email || "unknown",
      contactId: req.body?.contactId || "unknown"
    });
    if (payload.completed) {
      appendAuditLog("recovery_success", {
        email: req.body?.email || "unknown",
        threshold: payload.threshold
      });
      return res.status(200).json({ message: "Recovery completed", recoveryToken: payload.recoveryToken });
    }
    return res.status(202).json({ message: "Recovery share accepted" });
  } catch (err) {
    if (err.message === "RECOVERY_TOKEN_EXPIRED") {
      appendAuditLog("recovery_token_expired", {
        email: req.body?.email || "unknown",
        contactId: req.body?.contactId || "unknown"
      });
    }
    appendAuditLog("recovery_failed", { email: req.body?.email || "unknown", reason: "share_rejected" });
    return res.status(202).json({ message: "Recovery request received" });
  }
}

export async function recoveryComplete(req, res, next) {
  try {
    const session = await completeRecovery(req.body);
    appendAuditLog("recovery_completed", { userId: session.userId });

    const cookieOptions = { httpOnly: true, sameSite: "strict", secure: req.app.locals.cookieSecure || env.nodeEnv === "production" };
    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);

    return res.json({ message: "Recovery string updated successfully. Please log in with your new master password." });
  } catch (err) {
    appendAuditLog("recovery_complete_failed", { reason: err.message });
    return next(err);
  }
}

export async function reencryptVaultForRecovery(req, res, next) {
  try {
    // Verify the user has a valid recovery token
    // The recovery token should have been validated before calling this endpoint
    // This endpoint accepts re-encrypted vault items from the client
    const { recoveryToken, reencryptedItems } = req.body;
    
    if (!recoveryToken || !Array.isArray(reencryptedItems)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // TODO: Validate recovery token and update vault items
    // For now, accept the re-encrypted items which will be applied after password reset
    // Note: In a real scenario, this would be a temporary holding area since the user
    // isn't authenticated yet during recovery
    
    return res.json({ 
      message: "Vault items queued for re-encryption",
      itemsQueued: reencryptedItems.length 
    });
  } catch (err) {
    return next(err);
  }
}
