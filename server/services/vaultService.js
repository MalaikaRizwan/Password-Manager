import { VaultItem } from "../models/VaultItem.js";

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
