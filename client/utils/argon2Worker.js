import { argon2id } from "@noble/hashes/argon2.js";

const encoder = new TextEncoder();

self.onmessage = async (event) => {
  const { id, passphrase, salt, mode } = event.data;
  try {
    // Argon2id is intentionally expensive to resist brute-force attacks.
    // We reduce cost in development for faster local UX, while keeping
    // stronger production settings for real security guarantees.
    const isDev = mode === "development";
    const hash = argon2id(encoder.encode(passphrase), new Uint8Array(salt), {
      m: isDev ? 16384 : 65536,
      t: isDev ? 2 : 3,
      p: isDev ? 2 : 4,
      dkLen: 32
    });
    self.postMessage({ id, ok: true, hash: Array.from(hash) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: "Argon2 derivation failed" });
  }
};
