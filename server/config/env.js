import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");

dotenv.config({ path: rootEnvPath });

const required = ["MONGO_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "LOG_SIGNING_KEY"];
if (process.env.NODE_ENV !== "test") {
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/zk_password_manager_test",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "test_access_secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "test_refresh_secret",
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  sessionBindingEnabled: process.env.SESSION_BINDING_ENABLED === "true",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  logSigningKey: process.env.LOG_SIGNING_KEY || "test_log_signing_key"
};
