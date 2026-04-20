import mongoose from "mongoose";

const RecoverySchema = new mongoose.Schema(
  {
    threshold: { type: Number, required: true, min: 2, max: 10 },
    totalShares: { type: Number, required: true, min: 2, max: 10 },
    encryptedShares: [{ type: String, required: true }],
    contacts: [
      {
        contactId: { type: String, required: true },
        encryptedShare: { type: String, required: true }
      }
    ],
    requestCount: { type: Number, default: 0 },
    requestWindowStart: { type: Date, default: null },
    cooldownUntil: { type: Date, default: null },
    activeRequest: {
      requestedAt: { type: Date },
      submittedContactIds: [{ type: String }]
      ,
      verificationTokens: [
        {
          contactId: { type: String, required: true },
          token: { type: String, required: true },
          used: { type: Boolean, default: false }
        }
      ]
    }
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    authVerifierHash: { type: String, required: true },
    authSalt: { type: String, required: true },
    kdfParams: {
      type: Object,
      default: { memoryCost: 65536, timeCost: 3, parallelism: 4 }
    },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    recovery: { type: RecoverySchema, required: true },
    refreshTokenHash: { type: String }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", UserSchema);
