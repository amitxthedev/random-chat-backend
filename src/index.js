// ======================================
// src/index.js
// Server Entry Point (FINAL + DEV SUPPORT)
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
// TELEGRAM BOT
// --------------------------------------
startTelegramBot();

// --------------------------------------
// ADMIN AUTH MIDDLEWARE (PROD ONLY)
// --------------------------------------
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!ADMIN_TOKEN || auth !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

// --------------------------------------
// ✅ DEV ROUTE (NO AUTH - LOCAL ONLY)
// --------------------------------------
app.get("/dev/stats", (req, res) => {
  res.json(getStats());
});

// --------------------------------------
// PROD ROUTES (DASHBOARD)
// --------------------------------------
app.get("/api/stats", adminAuth, (req, res) => {
  res.json(getStats());
});

app.get("/api/errors", adminAuth, (req, res) => {
  res.json(getErrors());
});

// --------------------------------------
// HEALTH CHECK
// --------------------------------------
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    service: "Random Chat Backend",
    time: new Date().toISOString()
  });
});

// --------------------------------------
// START SERVER
// --------------------------------------
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
