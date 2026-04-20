import { motion } from "framer-motion";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../services/api";
import {
  decryptRecoveryShares,
  deriveAuthVerifier,
  deriveRecoveryKey,
  randomBytesBase64,
  recoverSecret,
  splitRecoverySecret,
  encryptRecoveryShares
} from "../utils/crypto";
import Button from "../components/UI/Button";
import GlassCard from "../components/UI/GlassCard";
import Input from "../components/UI/Input";
import Loader from "../components/UI/Loader";

export default function AuthPage({ onLoggedIn, onSaltReady }) {
  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [message, setMessage] = useState("");
  const [shares, setShares] = useState([]);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [authSaltForRecovery, setAuthSaltForRecovery] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isValidatingRecovery, setIsValidatingRecovery] = useState(false);
  const lastActionRef = useRef(0);

  function estimatePasswordEntropy(password) {
    let charset = 0;
    if (/[a-z]/.test(password)) charset += 26;
    if (/[A-Z]/.test(password)) charset += 26;
    if (/[0-9]/.test(password)) charset += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charset += 32;
    if (!charset) return 0;
    return Math.log2(charset) * password.length;
  }

  async function handleRegister() {
    const now = Date.now();
    if (isRegistering || now - lastActionRef.current < 400) return;
    lastActionRef.current = now;
    if (masterPassword.length < 12 || estimatePasswordEntropy(masterPassword) < 50) {
      setMessage("Master password is too weak (minimum 12 chars and high entropy).");
      return;
    }
    // Crypto-heavy steps (Argon2 + AES-GCM share wrapping) can take time.
    // Loading states keep UX responsive and prevent duplicate secure requests.
    setIsRegistering(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const authSalt = randomBytesBase64(16);
      const authVerifier = await deriveAuthVerifier(normalizedEmail, masterPassword, authSalt);
      const recoverySecret = crypto.randomUUID();
      const plainShares = splitRecoverySecret(recoverySecret, 3, 5);
      const recoveryKey = await deriveRecoveryKey(masterPassword, authSalt);
      const encryptedShares = await encryptRecoveryShares(recoveryKey, plainShares);

      await api.register({
        email: normalizedEmail,
        authVerifier,
        authSalt,
        passwordMetrics: {
          length: masterPassword.length,
          entropy: Number(estimatePasswordEntropy(masterPassword).toFixed(2))
        },
        recovery: { threshold: 3, totalShares: 5, encryptedShares }
      });
      onSaltReady(authSalt);
      setAuthSaltForRecovery(authSalt);
      setShares(encryptedShares);
      setMessage("Registration successful. Store your encrypted recovery shares securely.");
    } catch {
      setMessage("Registration failed. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleLogin() {
    const now = Date.now();
    if (isLoggingIn || now - lastActionRef.current < 400) return;
    lastActionRef.current = now;
    setIsLoggingIn(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const pre = await api.preLogin({ email: normalizedEmail });
      const authSalt = pre.authSalt;
      const authVerifier = await deriveAuthVerifier(normalizedEmail, masterPassword, authSalt);
      const data = await api.login({ email: normalizedEmail, authVerifier });
      onSaltReady(authSalt);
      setAuthSaltForRecovery(authSalt);
      onLoggedIn({ ...data.user, email: normalizedEmail, masterPassword });
    } catch (error) {
      const serverMessage = String(error?.message || "");
      if (serverMessage === "ACCOUNT_LOCKED" || serverMessage.includes("temporarily locked")) {
        setMessage("Account temporarily locked due to failed attempts. Please wait 15 minutes.");
      } else if (serverMessage === "Too many requests, please try again later.") {
        setMessage("Too many login attempts from this IP. Please wait and try again.");
      } else if (serverMessage.includes("Invalid authentication data")) {
        setMessage("Login failed. Email or password is incorrect.");
      } else {
        setMessage("Login failed. Check credentials.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <div className="bg-orbs flex min-h-screen items-center justify-center px-4 py-10">
      <div className="aurora-grid" />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="w-full max-w-2xl"
      >
        <GlassCard className="glass-outline space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-4xl font-bold tracking-tight">Zero-Knowledge Vault</h2>
              <p className="mt-2 text-sm text-slate-300">Client-side encryption. Zero knowledge. Maximum security.</p>
            </div>
            <ShieldCheck className="text-cyan-300" size={24} />
          </div>

          <div className="space-y-4">
            <Input placeholder="University Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input
              placeholder="Master Password"
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleRegister} disabled={isRegistering || isLoggingIn}>
              Register
            </Button>
            <Button variant="ghost" onClick={handleLogin} disabled={isRegistering || isLoggingIn}>
              Login
            </Button>
            {(isRegistering || isLoggingIn) && <Loader label="Processing..." />}
          </div>

          {message ? <p className="text-base text-cyan-200">{message}</p> : null}

          {shares.length > 0 && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <h4 className="mb-2 text-lg font-semibold text-cyan-200">Recovery Shares (store offline)</h4>
              <pre className="max-h-28 overflow-auto text-xs text-cyan-100/90">{shares.join("\n")}</pre>
            </div>
          )}

          <div className="rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur-lg">
            <div className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-200">
              <KeyRound size={14} /> Recovery Check
            </div>
            <Input
              as="textarea"
              placeholder="Paste 3 lines: contactId|token|encryptedShare"
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={async () => {
                  if (isValidatingRecovery) return;
                  setIsValidatingRecovery(true);
                  try {
                    const rawShares = recoveryInput
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean);

                    if (rawShares.length < 3) {
                      setMessage("At least 3 shares are required.");
                      return;
                    }

                    const authVerifier = await deriveAuthVerifier(email, masterPassword, authSaltForRecovery);
                    const request = await api.requestRecovery({ email, authVerifier });
                    if (Array.isArray(request.verificationTokens) && request.verificationTokens.length > 0) {
                      setMessage(
                        `Recovery request received. Contact tokens: ${request.verificationTokens
                          .map((entry) => `${entry.contactId}:${entry.token}`)
                          .join(" | ")}`
                      );
                    }
                    const submittedEncryptedShares = [];
                    for (let i = 0; i < rawShares.length; i += 1) {
                      const line = rawShares[i];
                      const parts = line.split("|");
                      if (parts.length < 3) {
                        setMessage("Invalid format. Use contactId|token|encryptedShare.");
                        return;
                      }
                      const contactId = parts[0].trim();
                      const verificationToken = parts[1].trim();
                      const encryptedShare = parts.slice(2).join("|").trim();
                      submittedEncryptedShares.push(encryptedShare);
                      await api.submitRecoveryShare({
                        email,
                        contactId,
                        verificationToken,
                        encryptedShare
                      });
                    }

                    const recoveryKey = await deriveRecoveryKey(masterPassword, authSaltForRecovery);
                    const sharesForRecovery = await decryptRecoveryShares(recoveryKey, submittedEncryptedShares);
                    const secret = recoverSecret(sharesForRecovery);
                    setMessage(`Recovered secret fingerprint: ${secret.slice(0, 12)}...`);
                  } catch {
                    setMessage("Recovery validation failed. Ensure share format is correct.");
                  } finally {
                    setIsValidatingRecovery(false);
                  }
                }}
                disabled={isValidatingRecovery}
              >
                Validate Recovery Shares
              </Button>
              {isValidatingRecovery && <Loader label="Processing..." />}
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
