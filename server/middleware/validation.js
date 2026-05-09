import validator from "validator";

function isBase64(input) {
  return typeof input === "string" && /^[A-Za-z0-9+/=]+$/.test(input);
}

function isEncryptedShareEnvelope(input) {
  const [iv, blob] = String(input || "").split(".");
  return Boolean(iv && blob && isBase64(iv) && isBase64(blob));
}

export function validateRegister(req, res, next) {
  const { email, authVerifier, authSalt, recovery, passwordMetrics } = req.body;
  if (
    !validator.isEmail(email || "", {
      allow_utf8_local_part: false,
      domain_specific_validation: true,
      require_tld: true
    })
  ) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (!validator.isLength(authVerifier || "", { min: 20, max: 512 })) {
    return res.status(400).json({ error: "Invalid verifier format" });
  }
  if (!isBase64(authSalt || "")) {
    return res.status(400).json({ error: "Invalid salt format" });
  }
  if (!recovery || !Array.isArray(recovery.encryptedShares) || recovery.encryptedShares.length < 2) {
    return res.status(400).json({ error: "Invalid recovery payload" });
  }
  if (!recovery.encryptedShares.every(isEncryptedShareEnvelope)) {
    return res.status(400).json({ error: "Invalid recovery share format" });
  }
  if (
    !passwordMetrics ||
    !validator.isInt(String(passwordMetrics.length || ""), { min: 12, max: 256 }) ||
    !validator.isFloat(String(passwordMetrics.entropy || ""), { min: 50, max: 512 })
  ) {
    return res.status(400).json({ error: "Password strength requirements not met" });
  }
  return next();
}

export function validateLogin(req, res, next) {
  const { email, authVerifier } = req.body;
  if (
    !validator.isEmail(email || "", {
      allow_utf8_local_part: false,
      domain_specific_validation: true,
      require_tld: true
    }) ||
    !validator.isLength(authVerifier || "", { min: 20, max: 512 })
  ) {
    return res.status(400).json({ error: "Invalid credentials format" });
  }
  return next();
}

export function validateVaultPayload(req, res, next) {
  const { encryptedBlob, iv, updatedAtClient } = req.body;
  if (!isBase64(encryptedBlob || "") || !isBase64(iv || "")) {
    return res.status(400).json({ error: "Invalid encrypted payload" });
  }
  if (!validator.isISO8601(updatedAtClient || "")) {
    return res.status(400).json({ error: "Invalid timestamp" });
  }
  return next();
}

export function validateRecoveryRequest(req, res, next) {
  const { email } = req.body || {};
  if (!validator.isEmail(email || "")) {
    return res.status(400).json({ error: "Invalid recovery request" });
  }
  return next();
}

export function validateRecoverySubmitShare(req, res, next) {
  const { email, contactId, encryptedShare, verificationToken } = req.body || {};
  if (!validator.isEmail(email || "")) {
    return res.status(400).json({ error: "Invalid recovery submission" });
  }
  if (!validator.matches(contactId || "", /^[a-z0-9-]{3,40}$/i)) {
    return res.status(400).json({ error: "Invalid recovery submission" });
  }
  if (!validator.matches(verificationToken || "", /^[a-f0-9]{32}$/i)) {
    return res.status(400).json({ error: "Invalid recovery submission" });
  }
  if (!isEncryptedShareEnvelope(encryptedShare || "")) {
    return res.status(400).json({ error: "Invalid recovery submission" });
  }
  return next();
}

export function validateTamperPayload(req, res, next) {
  const allowedReasons = new Set(["gcm_failure"]);
  const reason = req.body?.reason;
  const vaultItemId = req.body?.vaultItemId;
  if (!allowedReasons.has(reason)) {
    return res.status(400).json({ error: "Invalid tamper reason" });
  }
  if (!validator.isMongoId(vaultItemId || "")) {
    return res.status(400).json({ error: "Invalid tamper context" });
  }
  return next();
}

export function validateRecoveryComplete(req, res, next) {
  const { recoveryToken, authVerifier, authSalt, recovery } = req.body || {};
  if (!validator.matches(recoveryToken || "", /^[a-f0-9]{64}$/i)) {
    return res.status(400).json({ error: "Invalid recovery token format" });
  }
  if (!validator.isLength(authVerifier || "", { min: 20, max: 512 })) {
    return res.status(400).json({ error: "Invalid verifier format" });
  }
  if (!isBase64(authSalt || "")) {
    return res.status(400).json({ error: "Invalid salt format" });
  }
  if (recovery) {
    const threshold = Number(recovery.threshold);
    const totalShares = Number(recovery.totalShares);
    if (!Number.isFinite(threshold) || !Number.isFinite(totalShares) || threshold < 2 || totalShares < 2 || threshold > totalShares || totalShares > 10) {
      return res.status(400).json({ error: "Invalid recovery payload" });
    }
    if (!Array.isArray(recovery.encryptedShares) || recovery.encryptedShares.length !== totalShares) {
      return res.status(400).json({ error: "Invalid recovery payload" });
    }
    if (!recovery.encryptedShares.every(isEncryptedShareEnvelope)) {
      return res.status(400).json({ error: "Invalid recovery share format" });
    }
  }
  return next();
}
