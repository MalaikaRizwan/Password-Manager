import argon2 from "argon2";
import { authenticator } from "otplib";
import crypto from "node:crypto";
import { User } from "../models/User.js";
import {
  createAccessToken,
  createAccessTokenWithBinding,
  createRefreshToken,
  createRefreshTokenWithBinding,
  sha256,
  verifyRefreshToken
} from "../utils/tokens.js";
import { env } from "../config/env.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const FAILED_LOGIN_DELAY_MS = 400;
const MAX_RECOVERY_REQUESTS_PER_HOUR = 3;
const RECOVERY_WINDOW_MS = 60 * 60 * 1000;
const RECOVERY_COOLDOWN_MS = 60 * 60 * 1000;
const RECOVERY_TOKEN_TTL_MS = 15 * 60 * 1000;

const kdfParams = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4
};

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeVerifier(authVerifier) {
  return String(authVerifier || "").trim();
}

function createAuthError(message, details = {}) {
  const err = new Error(message);
  Object.assign(err, details);
  return err;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function registerUser({ email, authVerifier, authSalt, recovery }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedVerifier = normalizeVerifier(authVerifier);
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new Error("EMAIL_IN_USE");
  }

  const authVerifierHash = await argon2.hash(normalizedVerifier, kdfParams);
  const encryptedShares = recovery?.encryptedShares || [];
  const contacts = encryptedShares.map((encryptedShare, index) => ({
    contactId: `contact-${index + 1}`,
    encryptedShare
  }));
  const user = await User.create({
    email: normalizedEmail,
    authVerifierHash,
    authSalt,
    recovery: {
      ...recovery,
      contacts
    },
    kdfParams
  });
  return user;
}

export async function getPreLoginData(email) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail }).lean();
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }
  return {
    authSalt: user.authSalt,
    kdfParams: user.kdfParams,
    mfaEnabled: user.mfaEnabled
  };
}

export async function loginUser({ email, authVerifier, totpCode, sessionBinding }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedVerifier = normalizeVerifier(authVerifier);
  console.log("Login attempt email:", normalizedEmail);
  const user = await User.findOne({ email: normalizedEmail });
  console.log("User found:", user?.email);
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const now = Date.now();
  let unlockedNow = false;
  if (user.lockUntil && user.lockUntil.getTime() <= now) {
    user.lockUntil = null;
    user.failedAttempts = 0;
    unlockedNow = true;
    await user.save();
  }
  if (user.lockUntil && user.lockUntil.getTime() > now) {
    await delay(FAILED_LOGIN_DELAY_MS);
    throw createAuthError("ACCOUNT_LOCKED");
  }

  const valid = await argon2.verify(user.authVerifierHash, normalizedVerifier, kdfParams);
  if (!valid) {
    // Small fixed delay reduces high-speed brute-force efficiency
    // while keeping UX acceptable and avoiding heavy CAPTCHA flows.
    await delay(FAILED_LOGIN_DELAY_MS);
    user.failedAttempts = (user.failedAttempts || 0) + 1;
    if (user.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCKOUT_WINDOW_MS);
      await user.save();
      throw createAuthError("ACCOUNT_LOCKED", { accountLockedNow: true, unlockedNow });
    }
    await user.save();
    throw createAuthError("INVALID_CREDENTIALS", { unlockedNow });
  }

  if (user.mfaEnabled) {
    const ok = authenticator.verify({ token: totpCode || "", secret: user.mfaSecret });
    if (!ok) {
      throw createAuthError("INVALID_TOTP", { unlockedNow });
    }
  }

  const hadFailures = Boolean(user.failedAttempts || user.lockUntil);
  user.failedAttempts = 0;
  user.lockUntil = null;

  const accessToken = env.sessionBindingEnabled
    ? createAccessTokenWithBinding(user.id, sessionBinding)
    : createAccessToken(user.id);
  const refreshToken = env.sessionBindingEnabled
    ? createRefreshTokenWithBinding(user.id, sessionBinding)
    : createRefreshToken(user.id);
  user.refreshTokenHash = sha256(refreshToken);
  await user.save();
  return { user, accessToken, refreshToken, unlockedNow, lockStateReset: hadFailures };
}

export async function refreshSession(refreshToken, sessionBinding) {
  if (!refreshToken) {
    throw new Error("INVALID_SESSION");
  }
  const payload = verifyRefreshToken(refreshToken);
  const user = await User.findById(payload.sub);
  if (!user) {
    throw new Error("INVALID_SESSION");
  }
  if (!user.refreshTokenHash) {
    throw new Error("INVALID_SESSION");
  }
  if (user.refreshTokenHash !== sha256(refreshToken)) {
    throw new Error("INVALID_SESSION");
  }
  if (env.sessionBindingEnabled && payload.bind !== sessionBinding) {
    throw new Error("INVALID_SESSION");
  }
  const accessToken = env.sessionBindingEnabled
    ? createAccessTokenWithBinding(user.id, sessionBinding)
    : createAccessToken(user.id);
  const rotatedRefreshToken = env.sessionBindingEnabled
    ? createRefreshTokenWithBinding(user.id, sessionBinding)
    : createRefreshToken(user.id);
  user.refreshTokenHash = sha256(rotatedRefreshToken);
  await user.save();
  return { accessToken, refreshToken: rotatedRefreshToken };
}

export async function revokeRefreshToken(refreshToken, sessionBinding) {
  if (!refreshToken) {
    throw new Error("INVALID_SESSION");
  }
  const payload = verifyRefreshToken(refreshToken);
  const user = await User.findById(payload.sub);
  if (!user || !user.refreshTokenHash) {
    throw new Error("INVALID_SESSION");
  }
  if (env.sessionBindingEnabled && payload.bind !== sessionBinding) {
    throw new Error("INVALID_SESSION");
  }
  if (user.refreshTokenHash !== sha256(refreshToken)) {
    throw new Error("INVALID_SESSION");
  }
  user.refreshTokenHash = undefined;
  await user.save();
  return { userId: user.id };
}

export async function initiateRecovery({ email, authVerifier }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedVerifier = normalizeVerifier(authVerifier);
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new Error("INVALID_RECOVERY_REQUEST");
  }
  const now = Date.now();
  if (user.recovery.cooldownUntil && user.recovery.cooldownUntil.getTime() > now) {
    throw new Error("RECOVERY_RATE_LIMITED");
  }
  if (!user.recovery.requestWindowStart || now - user.recovery.requestWindowStart.getTime() >= RECOVERY_WINDOW_MS) {
    user.recovery.requestWindowStart = new Date(now);
    user.recovery.requestCount = 0;
  }
  if ((user.recovery.requestCount || 0) >= MAX_RECOVERY_REQUESTS_PER_HOUR) {
    user.recovery.cooldownUntil = new Date(now + RECOVERY_COOLDOWN_MS);
    await user.save();
    throw new Error("RECOVERY_RATE_LIMITED");
  }
  const valid = await argon2.verify(user.authVerifierHash, normalizedVerifier, kdfParams);
  if (!valid) {
    user.recovery.requestCount = (user.recovery.requestCount || 0) + 1;
    await user.save();
    throw new Error("INVALID_RECOVERY_REQUEST");
  }
  user.recovery.requestCount = (user.recovery.requestCount || 0) + 1;
  const verificationTokens = (user.recovery.contacts || []).map((entry) => ({
    contactId: entry.contactId,
    token: crypto.randomBytes(16).toString("hex"),
    used: false,
    expiresAt: new Date(Date.now() + RECOVERY_TOKEN_TTL_MS)
  }));
  user.recovery.activeRequest = {
    requestedAt: new Date(),
    submittedContactIds: [],
    verificationTokens
  };
  await user.save();
  return {
    verificationTokens: verificationTokens.map((entry) => ({
      contactId: entry.contactId,
      token: entry.token
    })),
    threshold: user.recovery.threshold,
    totalShares: user.recovery.totalShares
  };
}

export async function submitRecoveryShare({ email, contactId, encryptedShare, verificationToken }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });
  if (!user || !user.recovery?.activeRequest) {
    throw new Error("INVALID_RECOVERY_REQUEST");
  }
  const contact = (user.recovery.contacts || []).find((entry) => entry.contactId === contactId);
  const verifier = (user.recovery.activeRequest.verificationTokens || []).find((entry) => entry.contactId === contactId && entry.token === verificationToken);
  if (verifier && verifier.expiresAt && new Date(verifier.expiresAt).getTime() < Date.now()) {
    throw new Error("RECOVERY_TOKEN_EXPIRED");
  }
  const isUsableVerifier = Boolean(verifier && !verifier.used);
  if (!contact || !isUsableVerifier || contact.encryptedShare !== encryptedShare) {
    throw new Error("INVALID_RECOVERY_REQUEST");
  }
  verifier.used = true;
  const submitted = new Set(user.recovery.activeRequest.submittedContactIds || []);
  submitted.add(contactId);
  user.recovery.activeRequest.submittedContactIds = Array.from(submitted);
  await user.save();

  const collectedShares = user.recovery.contacts
    .filter((entry) => submitted.has(entry.contactId))
    .map((entry) => entry.encryptedShare);

  const ready = collectedShares.length >= user.recovery.threshold;
  if (!ready) {
    return { accepted: true, completed: false };
  }

  user.recovery.activeRequest = undefined;
  await user.save();
  return { accepted: true, completed: true, threshold: user.recovery.threshold };
}

export async function enableMfa(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("NOT_FOUND");
  }
  const secret = authenticator.generateSecret();
  user.mfaSecret = secret;
  user.mfaEnabled = true;
  await user.save();
  return {
    secret,
    otpauthUrl: authenticator.keyuri(user.email, "CY4001-ZKManager", secret)
  };
}
