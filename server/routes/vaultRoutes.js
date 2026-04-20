import { Router } from "express";
import { createVault, getVault, removeVault, reportVaultTampered, updateVault } from "../controllers/vaultController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { csrfProtection } from "../middleware/securityMiddleware.js";
import { validateTamperPayload, validateVaultPayload } from "../middleware/validation.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("user", "admin"));
router.get("/", getVault);
router.post("/", csrfProtection, validateVaultPayload, createVault);
router.put("/:id", csrfProtection, validateVaultPayload, updateVault);
router.delete("/:id", csrfProtection, removeVault);
router.post("/tamper-detected", csrfProtection, validateTamperPayload, reportVaultTampered);

export default router;
