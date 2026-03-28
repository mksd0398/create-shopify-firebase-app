const jwt = require("jsonwebtoken");
const { getConfig } = require("./config");

// Middleware: verify App Bridge session token.
// The embedded dashboard sends Authorization: Bearer <jwt> with every request.
// Docs: https://shopify.dev/docs/apps/build/authentication/session-tokens
function verifySessionToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];
  const config = getConfig();

  try {
    const decoded = jwt.verify(token, config.apiSecret, {
      algorithms: ["HS256"],
    });

    if (decoded.aud !== config.apiKey) {
      res.status(403).json({ error: "Token audience mismatch" });
      return;
    }

    // Extract shop from issuer URL
    const issUrl = new URL(decoded.iss);
    req.shopDomain = issUrl.hostname;
    req.sessionToken = decoded;

    next();
  } catch (err) {
    console.error("Session token verification failed:", err);
    res.status(401).json({ error: "Invalid session token" });
  }
}

module.exports = { verifySessionToken };
