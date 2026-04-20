import sss from "shamirs-secret-sharing";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

let workerInstance = null;
let requestCounter = 0;
const pending = new Map();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePassword(masterPassword) {
  return String(masterPassword || "");
}

function getArgon2Worker() {
  if (!workerInstance) {
    workerInstance = new Worker(new URL("./argon2Worker.js", import.meta.url), { type: "module" });
    workerInstance.onmessage = (event) => {
      const { id, ok, hash, error } = event.data;
      const pair = pending.get(id);
      if (!pair) return;
      pending.delete(id);
      if (!ok) {
        pair.reject(new Error(error || "Argon2 derivation failed"));
        return;
      }
      pair.resolve(new Uint8Array(hash));
    };
  }
  return workerInstance;
}

function deriveArgon2InWorker(passphrase, saltUint8) {
  return new Promise((resolve, reject) => {
    const id = ++requestCounter;
    pending.set(id, { resolve, reject });
    const mode = import.meta.env.MODE === "production" ? "production" : "development";
    getArgon2Worker().postMessage({
      id,
      passphrase,
      salt: Array.from(saltUint8),
      mode
    });
  });
}

export function randomBytesBase64(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

export async function deriveAuthVerifier(email, masterPassword, saltBase64) {
  const salt = new Uint8Array(fromBase64(saltBase64));
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizePassword(masterPassword);
  const hash = await deriveArgon2InWorker(`${normalizedEmail}:${normalizedPassword}`, salt);
  if (!(hash instanceof Uint8Array) || hash.byteLength !== 32) {
    throw new Error("Argon2 derivation produced invalid output");
  }
  return toBase64(hash.buffer);
}

export async function deriveVaultKey(masterPassword, saltBase64) {
  const salt = new Uint8Array(fromBase64(saltBase64));
  const normalizedPassword = normalizePassword(masterPassword);
  const hash = await deriveArgon2InWorker(normalizedPassword, salt);
  if (!(hash instanceof Uint8Array) || hash.byteLength !== 32) {
    throw new Error("Argon2 derivation produced invalid output");
  }
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function deriveRecoveryKey(masterPassword, saltBase64) {
  const salt = new Uint8Array(fromBase64(saltBase64));
  const normalizedPassword = normalizePassword(masterPassword);
  const hash = await deriveArgon2InWorker(`${normalizedPassword}:recovery`, salt);
  if (!(hash instanceof Uint8Array) || hash.byteLength !== 32) {
    throw new Error("Argon2 derivation produced invalid output");
  }
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptVaultData(vaultKey, plainObject) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(plainObject));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, vaultKey, plaintext);
  return { encryptedBlob: toBase64(ciphertext), iv: toBase64(iv) };
}

export async function decryptVaultData(vaultKey, encryptedBlob, ivBase64) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(fromBase64(ivBase64)) },
    vaultKey,
    fromBase64(encryptedBlob)
  );
  return JSON.parse(textDecoder.decode(plaintext));
}

export function generateStrongPassword({ length = 20, lowercase = true, uppercase = true, numbers = true, symbols = true }) {
  let charset = "";
  if (lowercase) charset += "abcdefghijklmnopqrstuvwxyz";
  if (uppercase) charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (numbers) charset += "0123456789";
  if (symbols) charset += "!@#$%^&*()-_=+[]{};:,.<>/?";
  if (!charset) throw new Error("Select at least one charset");

  const maxUint32 = 0x100000000;
  const acceptableMax = Math.floor(maxUint32 / charset.length) * charset.length;
  let password = "";

  while (password.length < length) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const value = random[0];
    if (value >= acceptableMax) {
      continue;
    }
    password += charset[value % charset.length];
  }

  return password;
}

export function splitRecoverySecret(secret, threshold = 3, totalShares = 5) {
  const shares = sss.split(textEncoder.encode(secret), {
    shares: totalShares,
    threshold
  });
  return shares.map((share) => toBase64(share));
}

export async function encryptRecoveryShares(recoveryKey, shares) {
  const encryptedShares = [];
  for (const share of shares) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      recoveryKey,
      textEncoder.encode(share)
    );
    encryptedShares.push(`${toBase64(iv)}.${toBase64(ciphertext)}`);
  }
  return encryptedShares;
}

export async function decryptRecoveryShares(recoveryKey, encryptedShares) {
  const decrypted = [];
  for (const entry of encryptedShares) {
    const [ivBase64, blobBase64] = String(entry).split(".");
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(fromBase64(ivBase64)) },
      recoveryKey,
      fromBase64(blobBase64)
    );
    decrypted.push(textDecoder.decode(plaintext));
  }
  return decrypted;
}

export function recoverSecret(shares) {
  const recovered = sss.combine(shares.map((share) => new Uint8Array(fromBase64(share))));
  return textDecoder.decode(recovered);
}
