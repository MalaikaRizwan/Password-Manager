# User Guide

## Installation
1. Install Node.js 20+ and MongoDB.
2. Copy `.env.example` to `.env` and fill secure values.
3. Run `npm run install:all` from project root.

## Running the Application
1. Start MongoDB.
2. Run `npm run dev`.
3. Open `http://localhost:5173`.

## Feature Usage
- Register with email + master password.
- Save recovery shares in an offline secure location.
- Login with the same credentials.
- Add vault items (encrypted in browser before upload).
- Generate strong passwords from the generator panel.
- Logout to clear session cookies.

## Security Explanation (For Demonstration)
- Master password remains in browser memory only.
- Vault entries are encrypted with AES-GCM before API calls.
- Server stores encrypted blobs and verifier hash, never plaintext credentials.
- CSRF, rate limiting, secure headers, and input validation protect APIs.
- Audit events are append-only and tamper-evident via hash chaining.
