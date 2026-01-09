// ======================================
// src/matcher.js
// Random Matchmaking Engine
// ======================================

// FIFO queue (fair matching)
const waitingQueue = [];

/**
 * Add user to waiting queue
 */
export function addToQueue(userId) {
  if (!userId) return;

  // Prevent duplicates
  if (!waitingQueue.includes(userId)) {
    waitingQueue.push(userId);
  }
}

/**
 * Remove user from waiting queue
 */
export function removeFromQueue(userId) {
  if (!userId) return;

  const index = waitingQueue.indexOf(userId);
  if (index !== -1) {
    waitingQueue.splice(index, 1);
  }
}

/**
 * Get matched pair
 * @returns [user1, user2] | null
 */
export function getMatch() {
  if (waitingQueue.length < 2) return null;

  const user1 = waitingQueue.shift();
  const user2 = waitingQueue.shift();

  // Safety check
  if (!user1 || !user2 || user1 === user2) {
    return null;
  }

  return [user1, user2];
}

/**
 * Waiting users count (dashboard)
 */
export function waitingCount() {
  return waitingQueue.length;
}

/**
 * Debug helper (optional)
 */
export function getQueue() {
  return waitingQueue;
}
