import mongoose from "mongoose";

const VaultItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "User" },
    encryptedBlob: { type: String, required: true },
    iv: { type: String, required: true },
    updatedAtClient: { type: String, required: true }
  },
  { timestamps: true }
);

export const VaultItem = mongoose.model("VaultItem", VaultItemSchema);
