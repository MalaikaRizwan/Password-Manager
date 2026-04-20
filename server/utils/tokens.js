import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";

export function createAccessToken(userId) {
  return jwt.sign({ sub: userId }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpires
  });
}

export function createAccessTokenWithBinding(userId, bind) {
  return jwt.sign({ sub: userId, bind }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpires
  });
}

export function createRefreshToken(userId) {
  return jwt.sign({ sub: userId }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpires
  });
}

export function createRefreshTokenWithBinding(userId, bind) {
  return jwt.sign({ sub: userId, bind }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpires
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
