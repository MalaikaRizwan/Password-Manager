export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const message = err.message || "Internal server error";
  if (message === "NOT_FOUND") {
    return res.status(404).json({ error: "Resource not found" });
  }
  if (message === "EMAIL_IN_USE") {
    return res.status(409).json({ error: "Email already in use" });
  }
  if (message === "ACCOUNT_LOCKED") {
    return res.status(423).json({ error: "Account is temporarily locked. Try again later." });
  }
  if (message === "INVALID_RECOVERY_REQUEST") {
    return res.status(401).json({ error: "Invalid recovery request" });
  }
  if (message.startsWith("INVALID")) {
    return res.status(401).json({ error: "Invalid authentication data" });
  }
  return res.status(500).json({ error: "Internal server error: " + err.message, stack: err.stack });
}
