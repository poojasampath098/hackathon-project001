const express = require("express");
const authController = require("../controllers/auth.controller");
const googleController = require("../controllers/google.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { rateLimit } = require("../middleware/rateLimit.middleware");

const router = express.Router();

// Pre-registration OTP endpoints always send real emails and expose whether an
// email is already registered, so they must be throttled. Two independent
// limiters are stacked on each route:
//   - a per-IP + per-email limiter (stops repeated hits on one email), and
//   - a coarser per-IP-only limiter (stops scanning many distinct emails from a
//     single IP — account enumeration) with a higher ceiling to tolerate many
//     legitimate users behind the same NAT/office IP.
const registrationEmailKey = (req) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `${req.ip}:reg-send-otp:${email || req.ip}`;
};
const verifyOtpEmailKey = (req) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `${req.ip}:reg-verify-otp:${email || req.ip}`;
};

const sendOtpPerEmailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 4,
  message: "Too many verification code requests. Please try again later.",
  keyGenerator: registrationEmailKey,
});

const sendOtpPerIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: "Too many verification code requests. Please try again later.",
});

const verifyOtpPerEmailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: "Too many verification attempts. Please try again later.",
  keyGenerator: verifyOtpEmailKey,
});

const verifyOtpPerIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: "Too many verification attempts. Please try again later.",
});

// Google ID-token sign-in drives an external token verification and is
// unauthenticated, so it is throttled per IP like the other external-facing
// auth endpoints.
const googleSignInRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: "Too many Google sign-in attempts. Please try again later.",
});

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.me);
router.post("/send-otp", authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/register/send-otp", sendOtpPerIpRateLimit, sendOtpPerEmailRateLimit, authController.sendRegistrationOtp);
router.post("/register/verify-otp", verifyOtpPerIpRateLimit, verifyOtpPerEmailRateLimit, authController.verifyRegistrationOtp);
router.post("/google", googleSignInRateLimit, googleController.googleSignIn);

module.exports = router;
