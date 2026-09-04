const { OAuth2Client } = require("google-auth-library");
const config = require("../core/config");

// Google ID-token verification (Google Identity Services).
//
// The browser obtains a Google-issued ID token (JWT) and sends it to the server
// as { credential }. OAuth2Client.verifyIdToken checks the RS256 signature
// against Google's published public keys, the issuer, the expiry, and that the
// audience matches this app's GOOGLE_CLIENT_ID. Only GOOGLE_CLIENT_ID is
// required for verification — a client secret is never used here.
//
// Replaces the earlier authorization-code flow (createAuthUrl / state /
// exchangeCodeAndVerify), which required both GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET plus a registered redirect URI.

const NOT_CONFIGURED_MESSAGE =
  "Google sign-in is not configured. Please add GOOGLE_CLIENT_ID server environment variable, or sign in with " +
  "email and password.";

function isConfigured() {
  return Boolean(config.googleClientId);
}

function notConfiguredError() {
  const err = new Error(NOT_CONFIGURED_MESSAGE);
  err.statusCode = 503;
  return err;
}

// Verifies a Google ID token and returns the normalized, Google-verified
// profile. Throws with a statusCode (503 not configured / 401 invalid) so the
// controller can map failures to clear client-facing errors instead of a 500.
async function verifyIdToken(idToken) {
  if (!isConfigured()) throw notConfiguredError();

  let payload;
  try {
    const client = new OAuth2Client(config.googleClientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });
    payload = ticket.getPayload();
  } catch (err) {
    // google-auth-library rejects expired/tampered/wrong-audience tokens by
    // throwing; surface that as a clear 401, never a generic 500.
    const wrapped = new Error(
      "Invalid or expired Google sign-in token. Please try signing in again."
    );
    wrapped.statusCode = 401;
    wrapped.cause = err;
    throw wrapped;
  }

  if (!payload || typeof payload.email !== "string" || !payload.email) {
    const err = new Error("Google account has no email address");
    err.statusCode = 401;
    throw err;
  }
  if (payload.email_verified !== true) {
    const err = new Error(
      "Google email is not verified. Please verify your email with Google."
    );
    err.statusCode = 401;
    throw err;
  }

  return {
    email: payload.email.toLowerCase(),
    firstName: typeof payload.given_name === "string" ? payload.given_name : "",
    lastName: typeof payload.family_name === "string" ? payload.family_name : "",
    avatar: typeof payload.picture === "string" ? payload.picture : null,
  };
}

module.exports = { isConfigured, notConfiguredError, verifyIdToken };