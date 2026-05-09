import { VaultItem } from "../models/VaultItem.js";
import { User } from "../models/User.js";

export async function listVaultItems(userId) {
  return VaultItem.find({ userId }).sort({ updatedAt: -1 }).lean();
}

export async function createVaultItem(userId, payload) {
  return VaultItem.create({ userId, ...payload });
}

export async function updateVaultItem(userId, id, payload) {
  const item = await VaultItem.findOneAndUpdate({ _id: id, userId }, payload, { new: true });
  if (!item) {
    throw new Error("NOT_FOUND");
  }
  return item;
}

export async function deleteVaultItem(userId, id) {
  const item = await VaultItem.findOneAndDelete({ _id: id, userId });
  if (!item) {
    throw new Error("NOT_FOUND");
  }
}

export async function applyPendingVaultReencryption(userId) {
  const user = await User.findById(userId);
  if (!user || !user.pendingVaultReencryption || user.pendingVaultReencryption.length === 0) {
    return { appliedCount: 0 };
  }

  const pendingItems = user.pendingVaultReencryption;
  let appliedCount = 0;

  for (const item of pendingItems) {
    try {
      const { _id, encryptedBlob, iv, updatedAtClient } = item;
      await VaultItem.findOneAndUpdate(
        { _id, userId },
        { encryptedBlob, iv, updatedAtClient },
        { new: true }
      );
      appliedCount++;
    } catch (err) {
      console.error("Failed to apply pending vault item:", err);
    }
  }

  // Clear pending items after applying
  user.pendingVaultReencryption = [];
  await user.save();

  return { appliedCount };
}
