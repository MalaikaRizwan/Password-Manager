import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";

const logDir = path.resolve("server", "logs");
const logFile = path.join(logDir, "audit.log");

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

let previousHash = "GENESIS";

function calculateCurrentHash(timestamp, eventType, userId, previous, details) {
  const body = JSON.stringify({ timestamp, eventType, userId, details });
  return crypto.createHash("sha256").update(`${previous}|${body}`).digest("hex");
}

function signHash(currentHash) {
  return crypto.createHmac("sha256", env.logSigningKey).update(currentHash).digest("hex");
}

function bootstrapPreviousHash() {
  if (!fs.existsSync(logFile)) return;
  const lines = fs
    .readFileSync(logFile, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return;
  try {
    const last = JSON.parse(lines[lines.length - 1]);
    previousHash = last.currentHash || "GENESIS";
  } catch {
    previousHash = "GENESIS";
  }
}

bootstrapPreviousHash();

export function appendAuditLog(eventType, meta = {}) {
  const timestamp = new Date().toISOString();
  const userId = meta.userId || "anonymous";
  const currentHash = calculateCurrentHash(timestamp, eventType, userId, previousHash, meta);
  const signature = signHash(currentHash);

  const record = {
    timestamp,
    eventType,
    userId,
    previousHash,
    currentHash,
    signature,
    details: meta
  };

  fs.appendFileSync(logFile, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a" });
  previousHash = currentHash;
}

export function verifyAuditLogIntegrity() {
  if (!fs.existsSync(logFile)) {
    return { valid: true, entries: 0 };
  }
  const lines = fs
    .readFileSync(logFile, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let expectedPrevious = "GENESIS";
  for (const line of lines) {
    const entry = JSON.parse(line);
    const recalculated = calculateCurrentHash(
      entry.timestamp,
      entry.eventType,
      entry.userId,
      expectedPrevious,
      entry.details || {}
    );
    const expectedSignature = signHash(recalculated);
    if (entry.previousHash !== expectedPrevious || entry.currentHash !== recalculated || entry.signature !== expectedSignature) {
      return { valid: false, entries: lines.length };
    }
    expectedPrevious = entry.currentHash;
  }

  return { valid: true, entries: lines.length };
}

export function quarantineCorruptedAuditLog() {
  if (!fs.existsSync(logFile)) {
    previousHash = "GENESIS";
    return { quarantined: false, file: null };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const quarantinedFile = path.join(logDir, `audit.corrupt.${timestamp}.log`);
  fs.renameSync(logFile, quarantinedFile);
  previousHash = "GENESIS";
  return { quarantined: true, file: quarantinedFile };
}
