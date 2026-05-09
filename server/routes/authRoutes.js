import { Router } from "express";
import {
  csrfToken,
  login,
  logout,
  preLogin,
  recoveryRequest,
  recoverySubmitShare,
  recoveryComplete,
  refresh,
  register,
  setupMfa
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { authRateLimiter, csrfProtection, loginRateLimiter } from "../middleware/securityMiddleware.js";
import {
  validateLogin,
  validateRecoveryRequest,
  validateRecoverySubmitShare,
  validateRecoveryComplete,
  validateRegister
} from "../middleware/validation.js";

const router = Router();

router.get("/csrf-token", csrfProtection, csrfToken);
router.post("/prelogin", authRateLimiter, csrfProtection, preLogin);
router.post("/register", authRateLimiter, csrfProtection, validateRegister, register);
router.post("/login", authRateLimiter, loginRateLimiter, csrfProtection, validateLogin, login);
router.post("/refresh", authRateLimiter, csrfProtection, refresh);
router.post("/logout", csrfProtection, logout);
router.post("/mfa/setup", requireAuth, csrfProtection, setupMfa);
router.post("/recovery/request", authRateLimiter, csrfProtection, validateRecoveryRequest, recoveryRequest);
router.post("/recovery/submit-share", authRateLimiter, csrfProtection, validateRecoverySubmitShare, recoverySubmitShare);
router.post("/recovery/complete", authRateLimiter, csrfProtection, validateRecoveryComplete, recoveryComplete);

export default router;
