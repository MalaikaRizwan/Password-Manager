import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

test("tampered AES-GCM ciphertext fails decryption", async () => {
  const keyRaw = new Uint8Array(32);
  webcrypto.getRandomValues(keyRaw);
  const iv = new Uint8Array(12);
  webcrypto.getRandomValues(iv);

  const key = await webcrypto.subtle.importKey("raw", keyRaw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const data = new TextEncoder().encode("sensitive-vault-payload");
  const encrypted = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const tampered = new Uint8Array(encrypted);
  tampered[0] ^= 0xff;

  await assert.rejects(async () => {
    await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, tampered);
  });
});
