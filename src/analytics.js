// ======================================
// src/analytics.js
// Live analytics & monitoring
// ======================================

// Total successful matches
let totalChats = 0;

// Error log (keep small, in-memory)
const errorLogs = [];

/**
 * Increment chat counter
 * Call ONLY when a match is created
 */
export function incrementChats() {
  totalChats++;
}

/**
 * Log an error (socket / telegram / server)
 */
export function logError(message) {
  if (!message) return;

  const error = {
    message,
    time: new Date().toISOString()
  };

  // Keep only last 20 errors
  errorLogs.unshift(error);
  if (errorLogs.length > 20) {
    errorLogs.pop();
  }

  console.error("❌ ERROR:", message);
}

/**
 * Get stats for dashboard
 */
export function getStats({ onlineUsers, waitingUsers }) {
  return {
    onlineUsers,
    waitingUsers,
    totalChats,
    serverTime: new Date().toISOString()
  };
}

/**
 * Get recent errors
 */
export function getErrors() {
  return errorLogs;
}

/**
 * Reset stats (optional, admin only)
 */
export function resetStats() {
  totalChats = 0;
  errorLogs.length = 0;
}
