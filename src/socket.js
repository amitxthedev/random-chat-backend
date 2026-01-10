// ======================================
// src/socket.js
// Core realtime socket engine (FINAL)
// ======================================

import {
  addUser,
  removeUser,
  getUser,
  setPartner,
  setStatus,
  onlineCount
} from "./users.js";

import {
  addToQueue,
  removeFromQueue,
  getMatch,
  waitingCount
} from "./matcher.js";

import {
  userOnline,
  userOffline,
  userSearching,
  userStopSearching,
  chatStarted,
  chatEnded,
  getStats,
  logError
} from "./analytics.js";

// ======================================
// SOCKET HANDLER
// ======================================

export function socketHandler(io) {
  // 🔐 Protect admin/dashboard socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    // If token exists, validate admin
    if (token && token !== process.env.ADMIN_TOKEN) {
      return next(new Error("Unauthorized admin"));
    }
    next();
  });

  io.on("connection", socket => {
    console.log("🔌 Socket connected:", socket.id);

    // ----------------------------------
    // USER CONNECTED
    // ----------------------------------
    userOnline();

    io.emit("online", onlineCount());

    // ----------------------------------
    // JOIN RANDOM CHAT
    // ----------------------------------
    socket.on("join", data => {
      try {
        addUser(socket.id, data);

        setStatus(socket.id, "searching");
        addToQueue(socket.id);
        userSearching();

        socket.emit("status", "🔍 Finding partner...");

        const match = getMatch();
        if (match) {
          const [u1, u2] = match;

          // Stop searching counters
          userStopSearching();
          userStopSearching();

          setPartner(u1, u2);
          setPartner(u2, u1);

          setStatus(u1, "connected");
          setStatus(u2, "connected");

          chatStarted();

          const user1 = getUser(u1);
          const user2 = getUser(u2);

          io.to(u1).emit("matched", {
            name: user2.name,
            country: user2.country
          });

          io.to(u2).emit("matched", {
            name: user1.name,
            country: user1.country
          });
        }
      } catch (err) {
        logError(err.message);
      }
    });

    // ----------------------------------
    // MESSAGE
    // ----------------------------------
    socket.on("message", text => {
      try {
        const user = getUser(socket.id);
        if (!user || !user.partner) return;

        io.to(user.partner).emit("message", {
          from: user.name,
          text,
          time: Date.now()
        });
      } catch (err) {
        logError(err.message);
      }
    });

    // ----------------------------------
    // SKIP PARTNER
    // ----------------------------------
    socket.on("skip", () => {
      try {
        const user = getUser(socket.id);
        if (!user) return;

        const partnerId = user.partner;
        const partner = getUser(partnerId);

        // End active chat
        if (partner) {
          chatEnded();

          setPartner(partnerId, null);
          setStatus(partnerId, "searching");
          addToQueue(partnerId);
          userSearching();

          io.to(partnerId).emit(
            "status",
            "⏭ Partner skipped. Finding new..."
          );
        }

        setPartner(socket.id, null);
        setStatus(socket.id, "searching");
        addToQueue(socket.id);
        userSearching();

        socket.emit("status", "🔍 Finding new partner...");
      } catch (err) {
        logError(err.message);
      }
    });

    // ----------------------------------
    // END CHAT
    // ----------------------------------
    socket.on("end", () => {
      try {
        const user = getUser(socket.id);
        if (!user) return;

        const partnerId = user.partner;
        const partner = getUser(partnerId);

        if (partner) {
          chatEnded();

          setPartner(partnerId, null);
          setStatus(partnerId, "idle");

          io.to(partnerId).emit("status", "❌ Chat ended");
        }

        removeFromQueue(socket.id);
        setPartner(socket.id, null);
        setStatus(socket.id, "idle");
      } catch (err) {
        logError(err.message);
      }
    });

    // ----------------------------------
    // DISCONNECT
    // ----------------------------------
    socket.on("disconnect", () => {
      try {
        const user = getUser(socket.id);

        userOffline();

        if (user?.partner) {
          chatEnded();

          io.to(user.partner).emit(
            "status",
            "⚠️ Partner disconnected"
          );

          setPartner(user.partner, null);
          setStatus(user.partner, "searching");
          addToQueue(user.partner);
          userSearching();
        }

        removeFromQueue(socket.id);
        removeUser(socket.id);

        io.emit("online", onlineCount());
      } catch (err) {
        logError(err.message);
      }
    });
  });

  // ----------------------------------
  // DASHBOARD STATS (EVERY 2s)
  // ----------------------------------
  setInterval(() => {
    try {
      io.emit("stats", getStats());
    } catch (err) {
      logError(err.message);
    }
  }, 2000);
}
