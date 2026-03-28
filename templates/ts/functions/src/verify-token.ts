import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getConfig } from "./config";

// App Bridge session token payload
// Docs: https://shopify.dev/docs/apps/build/authentication/session-tokens
interface SessionTokenPayload {
  iss: string; // https://{shop}.myshopify.com/admin
  dest: string; // https://{shop}.myshopify.com
  aud: string; // API key
  sub: string; // User ID
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  sid: string;
}

// Middleware: verify App Bridge session token.
// The embedded dashboard sends Authorization: Bearer <jwt> with every request.
export function verifySessionToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
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
    }) as SessionTokenPayload;

    if (decoded.aud !== config.apiKey) {
      res.status(403).json({ error: "Token audience mismatch" });
      return;
    }

    // Extract shop from issuer URL
    const issUrl = new URL(decoded.iss);
    (req as any).shopDomain = issUrl.hostname;
    (req as any).sessionToken = decoded;

    next();
  } catch (err) {
    console.error("Session token verification failed:", err);
    res.status(401).json({ error: "Invalid session token" });
  }
}
