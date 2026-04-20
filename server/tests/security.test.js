import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { app } from "../app.js";
import { connectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { VaultItem } from "../models/VaultItem.js";

let dbReady = false;

function sampleEncryptedShare(index) {
  const iv = Buffer.from(`iv-${index}`).toString("base64");
  const blob = Buffer.from(`blob-${index}`).toString("base64");
  return `${iv}.${blob}`;
}

function buildRegisterPayload(email, authVerifier) {
  return {
    email,
    authVerifier,
    authSalt: Buffer.from("salt-1234567890").toString("base64"),
    passwordMetrics: {
      length: 16,
      entropy: 80
    },
    recovery: {
      threshold: 3,
      totalShares: 5,
      encryptedShares: [
        sampleEncryptedShare(1),
        sampleEncryptedShare(2),
        sampleEncryptedShare(3),
        sampleEncryptedShare(4),
        sampleEncryptedShare(5)
      ]
    }
  };
}

async function getCsrf(agent) {
  const res = await agent.get("/api/auth/csrf-token");
  return res.body.csrfToken;
}

test.before(async () => {
  try {
    await connectDb();
    dbReady = true;
  } catch {
    dbReady = false;
  }
});

test.after(async () => {
  if (dbReady) {
    await mongoose.connection.close();
  }
});

test("brute force attempts trigger lockout", async (t) => {
  if (!dbReady) return t.skip("Database unavailable");
  await User.deleteMany({});
  await VaultItem.deleteMany({});

  const agent = request.agent(app);
  const csrf = await getCsrf(agent);
  const email = "lockout@example.com";
  const validVerifier = "VALID_AUTH_VERIFIER_VALUE_1234567890";
  const badVerifier = "BAD_AUTH_VERIFIER_VALUE_123456789000";

  const registerRes = await agent
    .post("/api/auth/register")
    .set("x-csrf-token", csrf)
    .send(buildRegisterPayload(email, validVerifier));
  assert.equal(registerRes.statusCode, 201);

  for (let i = 0; i < 4; i += 1) {
    const res = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf)
      .send({ email, authVerifier: badVerifier });
    assert.equal(res.statusCode, 401);
  }

  const lockRes = await agent
    .post("/api/auth/login")
    .set("x-csrf-token", csrf)
    .send({ email, authVerifier: badVerifier });
  assert.equal(lockRes.statusCode, 423);
});

test("refresh token is revoked on logout and cannot be reused", async (t) => {
  if (!dbReady) return t.skip("Database unavailable");
  await User.deleteMany({});
  await VaultItem.deleteMany({});

  const agent = request.agent(app);
  const csrf = await getCsrf(agent);
  const email = "revoke@example.com";
  const verifier = "VALID_AUTH_VERIFIER_VALUE_1234567890";

  await agent
    .post("/api/auth/register")
    .set("x-csrf-token", csrf)
    .send(buildRegisterPayload(email, verifier));

  const loginRes = await agent
    .post("/api/auth/login")
    .set("x-csrf-token", csrf)
    .send({ email, authVerifier: verifier });
  assert.equal(loginRes.statusCode, 200);

  const logoutRes = await agent.post("/api/auth/logout").set("x-csrf-token", csrf).send({});
  assert.equal(logoutRes.statusCode, 200);

  const refreshRes = await agent.post("/api/auth/refresh").set("x-csrf-token", csrf).send({});
  assert.equal(refreshRes.statusCode, 401);
});

test("expired session token is blocked by auth middleware", async (t) => {
  if (!dbReady) return t.skip("Database unavailable");
  await User.deleteMany({});
  await VaultItem.deleteMany({});

  const agent = request.agent(app);
  const csrf = await getCsrf(agent);
  const email = "expired@example.com";
  const verifier = "VALID_AUTH_VERIFIER_VALUE_1234567890";

  await agent
    .post("/api/auth/register")
    .set("x-csrf-token", csrf)
    .send(buildRegisterPayload(email, verifier));

  const loginRes = await agent
    .post("/api/auth/login")
    .set("x-csrf-token", csrf)
    .send({ email, authVerifier: verifier });
  assert.equal(loginRes.statusCode, 200);

  const expiredAccessToken = jwt.sign({ sub: loginRes.body.user.id }, env.jwtAccessSecret, {
    expiresIn: -1
  });

  const vaultRes = await request(app).get("/api/vault").set("Authorization", `Bearer ${expiredAccessToken}`);
  assert.equal(vaultRes.statusCode, 401);
});
