import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { app } from "./app.js";
import { quarantineCorruptedAuditLog, verifyAuditLogIntegrity } from "./utils/auditLogger.js";

async function bootstrap() {
  const audit = verifyAuditLogIntegrity();
  if (!audit.valid) {
    if (env.nodeEnv === "production") {
      console.error("CRITICAL: audit log integrity check failed. Refusing to start.");
      process.exit(1);
    }
    const result = quarantineCorruptedAuditLog();
    console.warn("WARNING: audit log integrity check failed in non-production mode.");
    if (result.quarantined) {
      console.warn(`Corrupted audit log quarantined at: ${result.file}`);
    }
  }
  await connectDb();
  app.listen(env.port, () => {
    console.log(`Server listening on ${env.port}`);
  });
}

bootstrap().catch(() => {
  process.exit(1);
});
