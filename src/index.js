// ======================================
// src/index.js
// Server Entry Point
// ======================================

import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";

// Local imports
import { socketHandler } from "./socket.js";
import { startTelegramBot } from "./telegram.js";

// --------------------------------------
// ENV
// --------------------------------------
dotenv.config();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "*";

// --------------------------------------
// APP SETUP
// --------------------------------------
const app = express();

app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
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
startTelegramBot(io);

// --------------------------------------
// HEALTH CHECK (Render)
// --------------------------------------
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Random Chat Backend Running"
  });
});

// --------------------------------------
// START SERVER
// --------------------------------------
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
