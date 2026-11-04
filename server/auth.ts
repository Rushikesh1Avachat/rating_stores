import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "./types.js";

export interface AuthRequest extends Request {
  auth?: { userId: number; role: Role };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please sign in to continue." });
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET must be set.");
    const payload = jwt.verify(token, secret);
    if (typeof payload === "string" || typeof payload.sub !== "string" || !payload.role) {
      return res.status(401).json({ error: "Invalid session." });
    }
    req.auth = { userId: Number(payload.sub), role: payload.role as Role };
    next();
  } catch (error) {
    if (error instanceof Error && error.message === "JWT_SECRET must be set.") return next(error);
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

export function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return next();
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET must be set.");
    const payload = jwt.verify(token, secret);
    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !/^[1-9]\d*$/.test(payload.sub) ||
      !["admin", "user", "owner"].includes(String(payload.role))
    ) {
      return res.status(401).json({ error: "Invalid session." });
    }
    req.auth = { userId: Number(payload.sub), role: payload.role as Role };
    return next();
  } catch (error) {
    if (error instanceof Error && error.message === "JWT_SECRET must be set.") return next(error);
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    next();
  };
}
