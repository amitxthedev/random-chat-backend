// ======================================
// src/index.js
// Server Entry Point (FINAL + DEV + KEEP ALIVE)
// ======================================

import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";

// Local imports
import { socketHandler } from "./socket.js";
import { startTelegramBot } from "./telegram.js";
import { getStats, getErrors } from "./analytics.js";

// --------------------------------------
// ENV
// --------------------------------------
dotenv.config();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://127.0.0.1:5173";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SELF_URL =
  process.env.SELF_URL || `http://localhost:${PORT}`;

// --------------------------------------
// APP SETUP
// --------------------------------------
const app = express();

app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json());

// --------------------------------------
// HTTP + SOCKET SERVER
// --------------------------------------
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

// --------------------------------------
// SOCKET LOGIC
// --------------------------------------
socketHandler(io);

// --------------------------------------
// TELEGRAM BOT (ONLY ONCE)
// --------------------------------------
startTelegramBot();

// --------------------------------------
// ADMIN AUTH (PROD)
// --------------------------------------
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!ADMIN_TOKEN || auth !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

// --------------------------------------
// DEV ROUTES (NO AUTH)
// --------------------------------------
app.get("/dev/stats", (req, res) => {
  res.json(getStats());
});

app.get("/dev/errors", (req, res) => {
  res.json(getErrors());
});

// --------------------------------------
// PROD ROUTES (AUTH)
// --------------------------------------
app.get("/api/stats", adminAuth, (req, res) => {
  res.json(getStats());
});

app.get("/api/errors", adminAuth, (req, res) => {
  res.json(getErrors());
});

// --------------------------------------
// HEALTH CHECK (RENDER)
// --------------------------------------
app.get("/", (req, res) => {
  res.send("OK");
});

// --------------------------------------
// START SERVER
// --------------------------------------
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

// --------------------------------------
// 🔁 KEEP ALIVE (EVERY 5 MINUTES)
// --------------------------------------
setInterval(async () => {
  try {
    const res = await fetch(SELF_URL);
    console.log("🔁 Self-ping OK:", res.status);
  } catch (err) {
    console.error("❌ Self-ping failed:", err.message);
  }
}, 5 * 60 * 1000);
