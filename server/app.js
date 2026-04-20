import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import authRoutes from "./routes/authRoutes.js";
import vaultRoutes from "./routes/vaultRoutes.js";
import { errorHandler } from "./middleware/errorMiddleware.js";
import { apiRateLimiter, secureHeaders } from "./middleware/securityMiddleware.js";

export const app = express();

app.locals.cookieSecure = env.cookieSecure;

app.disable("x-powered-by");
app.use(secureHeaders);
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "128kb" }));
app.use(cookieParser());
app.use(apiRateLimiter);

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/vault", vaultRoutes);

app.use(errorHandler);
