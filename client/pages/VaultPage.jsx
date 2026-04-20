import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Copy, Lock, LogOut, Shield } from "lucide-react";
import PasswordGenerator from "../components/PasswordGenerator";
import VaultItemForm from "../components/VaultItemForm";
import { api } from "../services/api";
import { decryptVaultData, deriveVaultKey, encryptVaultData } from "../utils/crypto";
import Button from "../components/UI/Button";
import GlassCard from "../components/UI/GlassCard";
import Loader from "../components/UI/Loader";

export default function VaultPage({ session, authSalt, onLogout }) {
  const [vaultKey, setVaultKey] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isDerivingKey, setIsDerivingKey] = useState(true);
  const [isVaultBusy, setIsVaultBusy] = useState(false);
  const [isFetchingVault, setIsFetchingVault] = useState(false);
  const [vaultTampered, setVaultTampered] = useState(false);
  const lastActionRef = useRef(0);

  useEffect(() => {
    setIsDerivingKey(true);
    deriveVaultKey(session.masterPassword, authSalt)
      .then(setVaultKey)
      .catch(() => setError("Failed to derive vault key"))
      .finally(() => setIsDerivingKey(false));
  }, [session.masterPassword, authSalt]);

  const loadVault = useCallback(async () => {
    setIsFetchingVault(true);
    try {
      const data = await api.listVault();
      setItems(data.items);
    } finally {
      setIsFetchingVault(false);
    }
  }, []);

  useEffect(() => {
    if (vaultKey) {
      loadVault().catch(() => setError("Could not load vault"));
    }
  }, [vaultKey, loadVault]);

  const addItem = useCallback(
    async (formData) => {
      const now = Date.now();
      if (!vaultKey || isVaultBusy || vaultTampered || now - lastActionRef.current < 400) return;
      lastActionRef.current = now;
      setIsVaultBusy(true);
      try {
        // Client-side encryption is intentionally expensive; loading states avoid duplicate submits.
        const encrypted = await encryptVaultData(vaultKey, formData);
        await api.createVaultItem({
          ...encrypted,
          updatedAtClient: new Date().toISOString()
        });
        await loadVault();
      } catch {
        setError("Could not save vault item");
      } finally {
        setIsVaultBusy(false);
      }
    },
    [vaultKey, isVaultBusy, loadVault, vaultTampered]
  );

  const handleDelete = useCallback(
    async (id) => {
      const now = Date.now();
      if (isVaultBusy || now - lastActionRef.current < 400) return;
      lastActionRef.current = now;
      setIsVaultBusy(true);
      try {
        await api.deleteVaultItem(id);
        await loadVault();
      } catch {
        setError("Could not delete vault item");
      } finally {
        setIsVaultBusy(false);
      }
    },
    [isVaultBusy, loadVault]
  );

  return (
    <div className="bg-orbs min-h-screen px-4 py-8">
      <div className="aurora-grid" />
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-4xl font-bold">Encrypted Vault</h2>
            <p className="mt-2 text-sm text-slate-300">Client-side encryption. Zero knowledge. Maximum security.</p>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="text-cyan-300" size={20} />
            <Button variant="ghost" onClick={onLogout}>
              <LogOut size={14} className="mr-1 inline" /> Logout
            </Button>
          </div>
        </div>

        {(isDerivingKey || isFetchingVault) && <Loader label="Processing..." />}
        {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}
        {vaultTampered ? (
          <p className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
            Vault Tampered. Access has been blocked.
          </p>
        ) : null}

        <GlassCard className="glass-outline">
          <div className="mb-6 flex items-center gap-2">
            <Lock size={20} className="text-cyan-300" />
            <h3 className="text-2xl font-semibold">Encrypted Vault</h3>
          </div>
          <p className="mb-6 text-sm text-slate-300">Client-side encryption. Zero knowledge. Maximum security.</p>

          <div className="grid gap-6 lg:grid-cols-[390px,1fr]">
            <div className="space-y-6">
              <GlassCard className="p-6">
                <VaultItemForm onSubmit={addItem} isSubmitting={isVaultBusy || vaultTampered} />
              </GlassCard>
              <PasswordGenerator />
            </div>

            <GlassCard className="min-h-[500px] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-semibold">Vault Items</h3>
                {isFetchingVault && <Loader label="Decrypting vault..." />}
              </div>
              <AsyncVaultList
                items={items}
                vaultKey={vaultKey}
                onDelete={handleDelete}
                isVaultBusy={isVaultBusy}
                onTampered={async (itemId) => {
                  setVaultTampered(true);
                  setItems([]);
                  setError("Integrity verification failed.");
                  if (!itemId) return;
                  try {
                    await api.reportVaultTamper("gcm_failure", itemId);
                  } catch {
                    // Best effort forensic signal.
                  }
                }}
                tampered={vaultTampered}
              />
            </GlassCard>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function AsyncVaultList({ items, vaultKey, onDelete, isVaultBusy, onTampered, tampered }) {
  const [resolved, setResolved] = useState([]);
  const [isDecrypting, setIsDecrypting] = useState(false);

  useEffect(() => {
    if (!vaultKey || tampered) {
      setResolved([]);
      return;
    }
    setIsDecrypting(true);
    (async () => {
      const nextResolved = [];
      for (const item of items) {
        try {
          const decrypted = await decryptVaultData(vaultKey, item.encryptedBlob, item.iv);
          nextResolved.push({
            _id: item._id,
            title: decrypted.title || "Untitled",
            encryptedBlob: item.encryptedBlob,
            iv: item.iv,
            username: decrypted.username || "",
            url: decrypted.url || "",
            notes: decrypted.notes || ""
          });
        } catch {
          setResolved([]);
          await onTampered(item._id);
          return;
        }
      }
      setResolved(nextResolved);
    })().finally(() => setIsDecrypting(false));
  }, [items, vaultKey, onTampered, tampered]);

  return (
    <div>
      {isDecrypting && <Loader label="Processing..." />}
      {!isDecrypting && resolved.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 text-center"
        >
          <Lock size={24} className="mb-2 text-cyan-300" />
          <p className="text-lg font-semibold text-slate-100">No credentials stored yet 🔐</p>
          <p className="mt-1 text-sm text-slate-400">Create your first secure entry from the left panel.</p>
          <Button variant="ghost" className="mt-4">Generate</Button>
        </motion.div>
      ) : null}
      {resolved.map((item) => (
        <MemoVaultListItem key={item._id} item={item} vaultKey={vaultKey} onDelete={onDelete} isVaultBusy={isVaultBusy} />
      ))}
    </div>
  );
}

function VaultListItem({ item, vaultKey, onDelete, isVaultBusy }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const timeoutRef = useRef(null);
  const copyTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    },
    []
  );

  async function togglePassword() {
    if (revealedPassword) {
      setRevealedPassword("");
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    setLoading(true);
    try {
      const decrypted = await decryptVaultData(vaultKey, item.encryptedBlob, item.iv);
      setRevealedPassword(decrypted.password || "");

      // Auto-hide after 10 seconds.
      timeoutRef.current = setTimeout(() => {
        setRevealedPassword("");
      }, 10000);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyPassword() {
    if (!navigator.clipboard?.writeText) {
      setCopyMessage("Clipboard API unavailable.");
      return;
    }
    try {
      const decrypted = await decryptVaultData(vaultKey, item.encryptedBlob, item.iv);
      const passwordToCopy = decrypted.password || "";
      if (!passwordToCopy) {
        setCopyMessage("No password to copy.");
        return;
      }
      await navigator.clipboard.writeText(passwordToCopy);
      setCopyMessage("Copied. Clipboard clears in 15s.");
      copyTimerRef.current = setTimeout(async () => {
        try {
          await navigator.clipboard.writeText("");
        } catch {
          // Best effort clipboard clearing.
        }
        setCopyMessage("");
      }, 15000);
    } catch {
      setCopyMessage("Copy failed.");
    }
  }

  return (
    <motion.div whileHover={{ y: -2 }} className="mb-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setIsExpanded((v) => !v)}>
        <strong className="text-slate-100">{item.title}</strong>
        <ChevronDown size={16} className={`transition ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 space-y-2 overflow-hidden text-sm text-slate-200"
          >
            <div>User: {item.username || "-"}</div>
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-cyan-300" />
              <span>{revealedPassword ? revealedPassword : "••••••••"}</span>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={togglePassword} disabled={loading}>
                {revealedPassword ? "Hide" : "Show"}
              </Button>
            </div>
            <div>URL: {item.url || "-"}</div>
            <div>Notes: {item.notes || "-"}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" className="px-3 py-1 text-xs" onClick={handleCopyPassword} disabled={loading || isVaultBusy}>
                <Copy size={12} className="mr-1 inline" /> Copy Password
              </Button>
              <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => onDelete(item._id)} disabled={isVaultBusy}>
                Delete
              </Button>
            </div>
            {copyMessage ? <div className="text-xs text-cyan-200">{copyMessage}</div> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const MemoVaultListItem = memo(VaultListItem);
