# Security Decisions (UMLsec-Aligned)

## 1) Zero-Knowledge Boundary
- Trust boundary is enforced in the browser.
- Server never receives plaintext vault data, master password, or decrypted keys.
- Server stores only encrypted vault blobs, IVs, and authentication verifier hash.

## 2) Cryptography
- Vault encryption: AES-256-GCM with unique 12-byte IV per record.
- Client key derivation: Argon2id (`memory=64MB`, `iterations=3`, `parallelism=4`, `hashLen=32`).
- Authentication verifier derivation is generated in client and hashed on server using Argon2id.
- Recovery supports Shamir Secret Sharing with `k=3`, `n=5`.

## 3) Authentication and Sessions
- Access/refresh tokens with JWT.
- Tokens delivered in `HttpOnly`, `SameSite=Strict` cookies.
- Refresh token rotation with server-side SHA-256 hash persistence.
- Optional MFA via TOTP secret provisioning endpoint.

## 4) API and Platform Hardening
- `helmet` for secure HTTP headers.
- `express-rate-limit` for auth and API abuse protection.
- `csurf` with cookie-based CSRF tokens.
- Strict request validation with `validator` and typed payload checks.
- CORS restricted to configured client origin.
- Minimal error exposure to avoid security metadata leaks.

## 5) Data and Injection Protection
- MongoDB ODM schema validation + constrained query patterns reduce injection risk.
- Input validation and no dynamic shell execution prevent command injection paths.
- React output encoding and strict JSON contracts reduce XSS risk.

## 6) Audit Logging
- Append-only log file (`server/logs/audit.log`).
- Each event is chained with previous hash (`SHA-256`) and signed with `HMAC-SHA-256`.
- Tamper evidence is provided by hash-chain and signature verification capability.

## 7) HTTPS Readiness
- Cookie security flags are environment-controlled (`COOKIE_SECURE=true` in HTTPS).
- Production deployment must terminate TLS at reverse proxy/load balancer.
