import dotenv from "dotenv";
dotenv.config();


import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
console.log(MONGO_URI);
console.log(process.env.PORT);

if (!MONGO_URI) {
  console.error(" MONGO_URI is missing in .env file! Please add it.");
  process.exit(1);
}

if (!process.env.GROQ_API_KEY) {
  console.error(" GROQ_API_KEY is missing in .env file!");
  process.exit(1);
}

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.get("/health", (req, res) => res.json({ status: "ok" }));

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log(" MongoDB connected successfully");
    app.listen(PORT, () => console.log(` Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error(" MongoDB connection failed:", err.message);
    process.exit(1);
  });
