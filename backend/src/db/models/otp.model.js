const mongoose = require("mongoose");

// Distinct OTP purpose/context. Registration and email-verification codes are
// logically isolated from password-reset codes so a code from one flow can
// never authorize the other.
const OTP_PURPOSES = ["EMAIL_VERIFICATION", "PASSWORD_RESET"];

const otpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    purpose: {
      type: String,
      enum: OTP_PURPOSES,
      default: "EMAIL_VERIFICATION",
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

otpSchema.index({ purpose: 1, email: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Otp = mongoose.model("Otp", otpSchema);

module.exports = Otp;
