import express from "express";
import Groq from "groq-sdk";
import { authenticateToken } from "../middleware/auth.js";
import Session from "../models/Session.js";

const router = express.Router();


// GET all sessions
router.get("/sessions", authenticateToken, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user.userId })
      .sort({ updatedAt: -1 })
      .select("_id title createdAt updatedAt messages");

    const list = sessions.map((s) => ({
      id: s._id.toString(),
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      preview: s.messages.length > 0 ? s.messages[s.messages.length - 1].content.slice(0, 60) : "Empty chat",
      messageCount: s.messages.length,
    }));

    res.json({ sessions: list });
  } catch (err) {
    console.error("GET sessions error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST create new session
router.post("/sessions", authenticateToken, async (req, res) => {
  try {
    console.log("Creating session for userId:", req.user.userId);
    const session = await Session.create({
      userId: req.user.userId,
      title: "New Chat",
      messages: [],
    });
    console.log(" Session created:", session._id.toString());
    res.status(201).json({
      session: {
        id: session._id.toString(),
        title: session.title,
        createdAt: session.createdAt,
        messageCount: 0,
        preview: "Empty chat",
      },
    });
  } catch (err) {
    console.error("POST session error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET single session messages
router.get("/sessions/:sessionId", authenticateToken, async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.sessionId,
      userId: req.user.userId,
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json({
      session: {
        id: session._id.toString(),
        title: session.title,
        messages: session.messages,
      },
    });
  } catch (err) {
    console.error("GET session error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH rename session
router.patch("/sessions/:sessionId", authenticateToken, async (req, res) => {
  try {
    const session = await Session.findOneAndUpdate(
      { _id: req.params.sessionId, userId: req.user.userId },
      { title: req.body.title },
      { new: true }
    );
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json({ success: true, title: session.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE session
router.delete("/sessions/:sessionId", authenticateToken, async (req, res) => {
  try {
    await Session.findOneAndDelete({ _id: req.params.sessionId, userId: req.user.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send message with streaming
router.post("/sessions/:sessionId/message", authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    const apiKey = req.headers["x-groq-api-key"];

    if (!apiKey?.trim())
      return res.status(400).json({ error: "Groq API key is required. Please set it in the UI." });

    if (!message?.trim())
      return res.status(400).json({ error: "Message is required" });

    const session = await Session.findOne({
      _id: req.params.sessionId,
      userId: req.user.userId,
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    session.messages.push({ role: "user", content: message, timestamp: new Date() });

    const isFirstMessage = session.messages.length === 1;
    if (isFirstMessage) {
      session.title = message.length > 45 ? message.slice(0, 45) + "…" : message;
    }
    await session.save();

    const contextMessages = session.messages
      .slice(-40)
      .map(({ role, content }) => ({ role, content }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (isFirstMessage) {
      res.write(`data: ${JSON.stringify({ type: "title", title: session.title })}\n\n`);
    }

    let fullResponse = "";
    
    const groq = new Groq({ apiKey: apiKey.trim() });

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content: "You are a helpful, friendly, and knowledgeable AI assistant. Be concise yet thorough. Use markdown formatting when it helps clarity.",
        },
        ...contextMessages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`);
      }
    }

    session.messages.push({ role: "assistant", content: fullResponse, timestamp: new Date() });
    await session.save();

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Message error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
      res.end();
    }
  }
});

export default router;
