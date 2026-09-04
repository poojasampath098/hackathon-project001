const { verifyAccessToken } = require("../core/security");

function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    const err = new Error("Authentication required");
    err.statusCode = 401;
    return next(err);
  }

  const parts = header.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    const err = new Error("Invalid or expired token");
    err.statusCode = 401;
    return next(err);
  }

  try {
    const decoded = verifyAccessToken(parts[1]);
    req.user = decoded;
    next();
  } catch (err) {
    err.statusCode = 401;
    err.message = "Invalid or expired token";
    next(err);
  }
}

module.exports = { authenticate };
