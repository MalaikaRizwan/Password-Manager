# Zero-Knowledge Secure Password Manager with Encrypted Vault

Production-grade full-stack implementation for CY-4001 (Iteration 3), designed with UMLsec-aligned secure architecture and strict client-side cryptography boundaries.

## Project Structure

```text
project-root/
├── client/
│   ├── src/
│   ├── components/
│   ├── pages/
│   ├── utils/crypto.js
│   └── services/api.js
├── server/
│   ├── controllers/
│   ├── services/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   ├── utils/
│   └── config/
├── docs/
│   ├── security-decisions.md
│   └── user-guide.md
├── tests/
├── .env.example
├── README.md
└── package.json
```

## Security Model

- Zero-knowledge: server never receives plaintext vault entries or master password.
- Client-side encryption only: AES-256-GCM encryption/decryption occurs in browser memory.
- Client-side key derivation: Argon2id (`mem=64MB`, `time=3`, `parallelism=4`).
- Server-side verifier protection: Argon2id hash of client verifier.
- Recovery workflow: Shamir Secret Sharing (`k=3`, `n=5`).

## Technology Stack

- Frontend: React + Vite, Web Crypto API, argon2-browser
- Backend: Node.js, Express, MongoDB (Mongoose), JWT
- Security libs: argon2, helmet, express-rate-limit, csurf, validator

## Features Implemented

1. Registration and login with verifier-based auth.
2. JWT access/refresh flow via HttpOnly strict cookies.
3. Optional TOTP MFA setup endpoint.
4. Encrypted vault CRUD (ciphertext only over network).
5. CSPRNG password generator.
6. Account recovery share generation and reconstruction check.
7. CSRF protection with token/cookie pattern.
8. Signed append-only audit log.

## Environment Variables

Copy `.env.example` to `.env` and set:

- `MONGO_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `LOG_SIGNING_KEY`
- `CLIENT_ORIGIN`
- `COOKIE_SECURE` (`true` in HTTPS production)

## Installation

```bash
npm run install:all
```

## Run in Development

```bash
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`

## API Overview

### Auth
- `GET /api/auth/csrf-token`
- `POST /api/auth/prelogin`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/mfa/setup`

### Vault
- `GET /api/vault`
- `POST /api/vault`
- `PUT /api/vault/:id`
- `DELETE /api/vault/:id`

## Secure Development Notes

- No hardcoded secrets in code.
- Validation on auth and vault inputs.
- Consistent secure error responses.
- Rate limits on authentication and API routes.
- Helmet + strict cookie flags + CORS restrictions.
- Audit logs include hash chain + HMAC signature.

## Testing

- Backend smoke test: `server/tests/health.test.js`
- Additional manual and security tests: `tests/sample-test-cases.md`

Run tests:

```bash
npm run test
```

## User Guide and Security Documentation

- User Guide: `docs/user-guide.md`
- Security Decisions: `docs/security-decisions.md`

## Known Production Hardening Recommendations

- Enforce HTTPS and set `COOKIE_SECURE=true`.
- Add dedicated secrets manager for environment variables.
- Add SIEM forwarding for audit logs.
- Add full automated test coverage for cryptographic edge cases.
- Add CSP policy tuned for deployed frontend.
