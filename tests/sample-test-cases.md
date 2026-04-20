# Sample Security Test Cases

## Authentication
1. Register with valid email/verifier/salt/recovery shares -> expect `201`.
2. Register duplicate email -> expect `409`.
3. Login with invalid verifier -> expect `401`.
4. Login with valid verifier -> expect secure auth cookies.

## CSRF
1. POST `/api/vault` without CSRF token -> expect `403`.
2. POST `/api/vault` with valid CSRF token and cookies -> expect `201`.

## Vault Encryption
1. Create vault entry and inspect network payload -> plaintext fields must not appear.
2. Ensure server DB stores only `encryptedBlob`, `iv`, metadata.
3. AES-GCM decryption with wrong key/IV must fail in client.

## Rate Limiting
1. Trigger >30 auth attempts in 15 minutes -> expect HTTP `429`.

## Audit Logs
1. Trigger register/login/create/delete flows.
2. Verify each log line includes `previousHash`, `chainHash`, and `signature`.
3. Verify hash chain continuity across lines.
