// ======================================
// src/analytics.js
// Live analytics & monitoring (SAFE FINAL)
// ======================================

// ---------- COUNTERS ----------
let onlineUsers = 0;     // users connected
let searchingUsers = 0;  // users waiting for match
let activeChats = 0;     // current active chats
let totalChats = 0;      // total chats created (lifetime)

// ---------- ERROR LOGS ----------
const errorLogs = []; // keep last 20 errors

// ---------- INTERNAL GUARDS ----------
// Prevent double counting
const onlineSet = new Set();
const searchingSet = new Set();

// ======================================
// USER STATE TRACKING (SAFE)
// ======================================

export function userOnline(userId) {
  if (onlineSet.has(userId)) return;
  onlineSet.add(userId);
  onlineUsers++;
}

export function userOffline(userId) {
  if (!onlineSet.has(userId)) return;
  onlineSet.delete(userId);
  onlineUsers = Math.max(0, onlineUsers - 1);
}

export function userSearching(userId) {
  if (searchingSet.has(userId)) return;
  searchingSet.add(userId);
  searchingUsers++;
}

export function userStopSearching(userId) {
  if (!searchingSet.has(userId)) return;
  searchingSet.delete(userId);
  searchingUsers = Math.max(0, searchingUsers - 1);
}

// ======================================
// CHAT TRACKING (SAFE)
// ======================================

/**
 * Call ONLY when a match is created
 */
export function chatStarted() {
  activeChats++;
  totalChats++;
}

/**
 * Call when a chat ends or partner disconnects
 */
export function chatEnded() {
  activeChats = Math.max(0, activeChats - 1);
}

/**
 * 🔁 BACKWARD COMPATIBILITY
 */
export function incrementChats() {
  chatStarted();
}

// ======================================
// ERROR TRACKING
// ======================================

export function logError(message) {
  if (!message) return;

  const error = {
    message,
    time: new Date().toISOString()
  };

  errorLogs.unshift(error);

  if (errorLogs.length > 20) {
    errorLogs.pop();
  }

  console.error("❌ ERROR:", message);
}

// ======================================
// DASHBOARD DATA
// ======================================

export function getStats() {
  return {
    onlineUsers,
    searchingUsers,
    activeChats,
    totalChats,
    serverTime: new Date().toISOString()
  };
}

export function getErrors() {
  return errorLogs;
}

// ======================================
// ADMIN (OPTIONAL)
// ======================================

export function resetStats() {
  onlineUsers = 0;
  searchingUsers = 0;
  activeChats = 0;
  totalChats = 0;

  onlineSet.clear();
  searchingSet.clear();
  errorLogs.length = 0;
}
