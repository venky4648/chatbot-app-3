import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Convert userId string to Mongoose ObjectId
    const userId = decoded.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ error: "Token invalid — please log out and log in again" });
    }

    req.user = {
      userId: new mongoose.Types.ObjectId(userId),
      username: decoded.username,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(403).json({ error: "Token expired or invalid — please log in again" });
  }
};
