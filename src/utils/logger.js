// ======================================
// src/utils/logger.js
// Central logging utility
// ======================================

const ENABLE_LOGS = process.env.ENABLE_LOGS !== "false";

/**
 * Info log
 */
export function logInfo(message) {
  if (!ENABLE_LOGS) return;

  console.log(
    `[INFO] ${new Date().toISOString()} → ${message}`
  );
}

/**
 * Warning log
 */
export function logWarn(message) {
  if (!ENABLE_LOGS) return;

  console.warn(
    `[WARN] ${new Date().toISOString()} → ${message}`
  );
}

/**
 * Error log
 */
export function logError(message, error = null) {
  if (!ENABLE_LOGS) return;

  console.error(
    `[ERROR] ${new Date().toISOString()} → ${message}`
  );

  if (error) {
    console.error(error);
  }
}
