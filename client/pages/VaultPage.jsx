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
import Input from "../components/UI/Input";

export default function VaultPage({ session, authSalt, onLogout }) {
  const [vaultKey, setVaultKey] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isDerivingKey, setIsDerivingKey] = useState(true);
  const [isVaultBusy, setIsVaultBusy] = useState(false);
  const [isFetchingVault, setIsFetchingVault] = useState(false);
  const [vaultTampered, setVaultTampered] = useState(false);
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [oldPassword, setOldPassword] = useState(() => sessionStorage.getItem("recoveredOldPassword") || "");
  const [oldAuthSalt, setOldAuthSalt] = useState(() => sessionStorage.getItem("recoveredOldAuthSalt") || "");
  const lastActionRef = useRef(0);

  useEffect(() => {
    setIsDerivingKey(true);
    deriveVaultKey(session.masterPassword, authSalt)
      .then(setVaultKey)
      .catch(() => setError("Failed to derive vault key"))
      .finally(() => setIsDerivingKey(false));
  }, [session.masterPassword, authSalt]);

  const loadVault = useCallback(async () => {
    if (!vaultKey) return;
    
    setIsFetchingVault(true);
    try {
      const data = await api.listVault();
      
      // Try to decrypt items with current key
      let hasDecryptionErrors = false;
      const decryptedItems = [];
      
      for (const item of data.items) {
        try {
          await decryptVaultData(vaultKey, item.encryptedBlob, item.iv);
          decryptedItems.push(item);
        } catch (err) {
          // If we can't decrypt, it might be with old key (after password reset)
          hasDecryptionErrors = true;
          console.warn("Could not decrypt item, may need migration:", item._id);
        }
      }
      
      // If we found items we can't decrypt, show migration prompt
      if (hasDecryptionErrors && decryptedItems.length === 0 && data.items.length > 0) {
        setShowMigrationPrompt(true);
        setItems([]);
        setError("Vault contains old encrypted items. Please migrate them with your original password.");
      } else {
        setItems(decryptedItems);
        setVaultTampered(false);
        if (hasDecryptionErrors) {
          setError("Some vault items could not be decrypted. You may need to migrate your vault.");
        }
      }
    } catch (err) {
      setError("Could not load vault: " + (err.message || "Unknown error"));
    } finally {
      setIsFetchingVault(false);
    }
  }, [vaultKey]);

  useEffect(() => {
    if (vaultKey && !isMigrating) {
      loadVault().catch(() => {});
    }
  }, [vaultKey, loadVault, isMigrating]);

  const migrateVault = useCallback(async () => {
    if (!oldPassword || !oldAuthSalt) {
      setError("Please enter your original password and auth salt to migrate vault items.");
      return;
    }

    setIsMigrating(true);
    try {
      setError("Migrating vault items...");
      
      // Derive old vault key
      const oldVaultKey = await deriveVaultKey(oldPassword, oldAuthSalt);
      
      // Fetch all vault items
      const data = await api.listVault();
      
      // Try to decrypt each item with old key, then re-encrypt with new key
      const reencryptedItems = [];
      for (const item of data.items) {
        try {
          const plainData = await decryptVaultData(oldVaultKey, item.encryptedBlob, item.iv);
          const encrypted = await encryptVaultData(vaultKey, plainData);
          reencryptedItems.push({
            _id: item._id,
            ...encrypted,
            updatedAtClient: item.updatedAtClient || new Date().toISOString()
          });
        } catch (decryptError) {
          console.warn("Failed to migrate item:", item._id, decryptError);
        }
      }

      // Batch update all items
      if (reencryptedItems.length > 0) {
        await api.batchUpdateVaultItems(reencryptedItems);
      }

      setError("Migration complete! Reloading vault...");
      setShowMigrationPrompt(false);
      setOldPassword("");
      setOldAuthSalt("");
      sessionStorage.removeItem("recoveredOldPassword");
      sessionStorage.removeItem("recoveredOldAuthSalt");
      
      // Reload vault with new key
      setTimeout(() => {
        loadVault().then(() => setError(""));
      }, 1000);
    } catch (err) {
      setError("Migration failed: " + (err.message || "Check your old password"));
      console.error("Migration error:", err);
    } finally {
      setIsMigrating(false);
    }
  }, [oldPassword, oldAuthSalt, vaultKey, loadVault]);

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

        {showMigrationPrompt && (
          <GlassCard className="mb-6 border border-cyan-400/40 bg-cyan-400/10 p-6">
            <div className="mb-4">
              <h4 className="mb-2 font-semibold text-cyan-200">Migrate Vault to New Encryption</h4>
              <p className="mb-4 text-sm text-cyan-100">Your vault items were encrypted with your old password. To migrate them, enter your original password and the auth salt from your recovery process.</p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-cyan-300">Original Master Password</label>
                  <Input
                    placeholder="Your original/old master password"
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-cyan-300">Original Auth Salt (from recovery emails/backup)</label>
                  <Input
                    placeholder="Paste the auth salt you saved during registration"
                    type="text"
                    value={oldAuthSalt}
                    onChange={(e) => setOldAuthSalt(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={migrateVault} disabled={isMigrating || !oldPassword || !oldAuthSalt}>
                {isMigrating ? "Migrating..." : "Migrate Vault"}
              </Button>
              <Button variant="ghost" onClick={() => {
                setShowMigrationPrompt(false);
                setOldPassword("");
                setOldAuthSalt("");
              }} disabled={isMigrating}>
                Skip for Now
              </Button>
            </div>
          </GlassCard>
        )}

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
