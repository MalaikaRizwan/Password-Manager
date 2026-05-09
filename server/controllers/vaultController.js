import {
  createVaultItem,
  deleteVaultItem,
  listVaultItems,
  updateVaultItem,
  applyPendingVaultReencryption
} from "../services/vaultService.js";
import { appendAuditLog } from "../utils/auditLogger.js";
import { VaultItem } from "../models/VaultItem.js";

const tamperRateState = new Map();
const MAX_TAMPER_REPORTS_PER_MINUTE = 3;
const TAMPER_WINDOW_MS = 60 * 1000;
const TAMPER_DEDUP_MS = 10 * 1000;

export async function getVault(req, res, next) {
  try {
    const items = await listVaultItems(req.userId);
    return res.json({ items });
  } catch (err) {
    return next(err);
  }
}

export async function createVault(req, res, next) {
  try {
    const item = await createVaultItem(req.userId, req.body);
    appendAuditLog("vault_create", { userId: req.userId, itemId: item.id });
    return res.status(201).json({ item });
  } catch (err) {
    return next(err);
  }
}

export async function updateVault(req, res, next) {
  try {
    const item = await updateVaultItem(req.userId, req.params.id, req.body);
    appendAuditLog("vault_update", { userId: req.userId, itemId: item.id });
    return res.json({ item });
  } catch (err) {
    return next(err);
  }
}

export async function removeVault(req, res, next) {
  try {
    await deleteVaultItem(req.userId, req.params.id);
    appendAuditLog("vault_delete", { userId: req.userId, itemId: req.params.id });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

export async function reportVaultTampered(req, res, next) {
  try {
    const userId = String(req.userId || "anonymous");
    const reason = req.body?.reason;
    const vaultItemId = req.body?.vaultItemId;
    const item = await VaultItem.findOne({ _id: vaultItemId, userId: req.userId }).select("_id").lean();
    if (!item) {
      return res.status(400).json({ error: "Invalid tamper context" });
    }
    const now = Date.now();
    const state = tamperRateState.get(userId) || { windowStart: now, count: 0, lastSeen: new Map() };
    if (now - state.windowStart >= TAMPER_WINDOW_MS) {
      state.windowStart = now;
      state.count = 0;
      state.lastSeen.clear();
    }
    const dedupKey = `${reason}:${vaultItemId}`;
    const previous = state.lastSeen.get(dedupKey) || 0;
    if (now - previous < TAMPER_DEDUP_MS) {
      tamperRateState.set(userId, state);
      return res.status(202).json({ message: "Duplicate tamper event ignored" });
    }
    if (state.count >= MAX_TAMPER_REPORTS_PER_MINUTE) {
      tamperRateState.set(userId, state);
      return res.status(429).json({ error: "Too many tamper reports" });
    }
    state.count += 1;
    state.lastSeen.set(dedupKey, now);
    tamperRateState.set(userId, state);

    appendAuditLog("vault_tampered_detected", {
      userId: req.userId,
      reason,
      itemId: vaultItemId
    });
    return res.status(202).json({ message: "Tamper event recorded" });
  } catch (err) {
    return next(err);
  }
}

export async function batchUpdateVault(req, res, next) {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Items must be an array" });
    }

    const updateResults = [];
    for (const item of items) {
      try {
        const { _id, ...updateData } = item;
        if (!_id) {
          updateResults.push({ _id, status: "error", message: "Missing ID" });
          continue;
        }
        const updated = await updateVaultItem(req.userId, _id, updateData);
        updateResults.push({ _id, status: "success", item: updated });
        appendAuditLog("vault_batch_update", { userId: req.userId, itemId: _id });
      } catch (err) {
        updateResults.push({ _id: item._id, status: "error", message: err.message });
      }
    }
    
    return res.json({ 
      message: "Batch update completed",
      results: updateResults
    });
  } catch (err) {
    return next(err);
  }
}
