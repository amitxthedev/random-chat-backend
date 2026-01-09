// ======================================
// src/users.js
// Central user store (Telegram + Socket)
// ======================================

// Using Map for fast access & safety
// key = userId (telegram chatId OR socket.id)
const users = new Map();

/**
 * Add a new user (Telegram or Socket)
 */
export function addUser(userId, data = {}) {
  if (!userId) return;

  if (!users.has(userId)) {
    users.set(userId, {
      id: userId,

      // Profile
      name: data.name || "Anonymous",
      country: data.country || "Unknown",

      // Chat state
      partner: null,
      status: "idle", // idle | searching | connected

      // 🔥 TELEGRAM UX IMPROVEMENTS
      statusMessageId: null, // single system message
      chatMessages: [],      // message_ids sent by bot (for cleanup)

      // Meta
      joinedAt: Date.now()
    });
  }
}

/**
 * Get user by ID
 */
export function getUser(userId) {
  return users.get(userId);
}

/**
 * Remove user completely (disconnect / stop)
 */
export function removeUser(userId) {
  if (!userId) return;
  users.delete(userId);
}

/**
 * Set partner
 */
export function setPartner(userId, partnerId) {
  const user = users.get(userId);
  if (!user) return;
  user.partner = partnerId;
}

/**
 * Set status
 */
export function setStatus(userId, status) {
  const user = users.get(userId);
  if (!user) return;
  user.status = status;
}

/**
 * Save a bot-sent message ID (for later deletion)
 */
export function addChatMessage(userId, messageId) {
  const user = users.get(userId);
  if (!user || !messageId) return;

  user.chatMessages.push(messageId);

  // Safety cap (avoid memory leak)
  if (user.chatMessages.length > 50) {
    user.chatMessages.shift();
  }
}

/**
 * Clear tracked chat messages (after skip / end)
 */
export function clearChatMessages(userId) {
  const user = users.get(userId);
  if (!user) return;
  user.chatMessages = [];
}

/**
 * Set / update status message ID
 */
export function setStatusMessageId(userId, messageId) {
  const user = users.get(userId);
  if (!user) return;
  user.statusMessageId = messageId;
}

/**
 * Reset chat state (used on skip / end)
 */
export function resetChatState(userId) {
  const user = users.get(userId);
  if (!user) return;

  user.partner = null;
  user.status = "idle";
  user.chatMessages = [];
}

/**
 * Get all users (dashboard / analytics)
 */
export function getAllUsers() {
  return users;
}

/**
 * Online users count
 */
export function onlineCount() {
  return users.size;
}
