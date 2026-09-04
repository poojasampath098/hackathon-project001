const crypto = require("crypto");
const googleService = require("../services/google.service");
const { hashPassword, generateAccessToken } = require("../core/security");
const userRepo = require("../db/repositories/user.repository");
const activityService = require("../services/activity.service");

// POST /api/auth/google
// Body: { credential } — the Google Identity Services ID token.
//
// Verifies the ID token server-side, then either creates a new verified account
// (Google already proved email ownership) or logs in an existing one without
// touching its passwordHash. Returns the same { success, data: { user, token } }
// shape as /auth/login and /auth/verify-otp so the frontend's existing session
// storage logic works unchanged.
async function googleSignIn(req, res, next) {
  try {
    if (!googleService.isConfigured()) {
      return next(googleService.notConfiguredError());
    }

    const { credential } = req.body || {};
    if (typeof credential !== "string" || !credential) {
      const err = new Error("Google sign-in token is missing");
      err.statusCode = 400;
      return next(err);
    }

    const profile = await googleService.verifyIdToken(credential);

    let user = await userRepo.findUserByEmail(profile.email);
    if (!user) {
      // A blocked soft-deleted account must not be silently resurrected by a
      // fresh Google sign-in with the same email.
      if (await userRepo.emailExists(profile.email)) {
        const err = new Error("This account has been deleted and cannot be used to sign in.");
        err.statusCode = 403;
        return next(err);
      }
      const passwordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
      user = await userRepo.createUser({
        email: profile.email,
        passwordHash,
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatar: profile.avatar,
        emailVerified: true,
      });
      activityService
        .logActivity(user.id, "user_registered", null, `User registered via Google`, {
          email: profile.email,
        })
        .catch(() => {});
    } else if (!user.emailVerified) {
      // Google has already verified ownership of the email; propagate that to
      // the local account so the user gains access.
      user = await userRepo.markEmailVerified(user.id);
    }

    const token = generateAccessToken({ userId: user.id });

    activityService
      .logActivity(user.id, "user_logged_in", null, `User logged in via Google`, {
        email: profile.email,
      })
      .catch(() => {});

    res.status(200).json({
      success: true,
      message: "Google sign-in successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          emailVerified: !!user.emailVerified,
          avatar: user.avatar || null,
        },
        token,
      },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

module.exports = { googleSignIn };