// ======================================
// src/telegram.js
// Telegram Random Chat Bot (FINAL + TYPING + OFFLINE SAFE)
// ======================================

import TelegramBot from "node-telegram-bot-api";

import {
  addUser,
  getUser,
  setPartner,
  setStatus,
  addChatMessage,
  clearChatMessages,
  setStatusMessageId,
  resetChatState
} from "./users.js";

import {
  addToQueue,
  getMatch
} from "./matcher.js";

import {
  incrementChats,
  logError
} from "./analytics.js";

// ======================================
// CONFIG
// ======================================

const REQUIRED_CHANNEL = "@onechannelmain";
const WELCOME_IMAGE =
  "https://imgs.search.brave.com/SnWeFXxwSWze7ivb4ZIht7NmBjog0eH7mlJOAPKFC8k/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jZG4u/cGl4YWJheS5jb20v/cGhvdG8vMjAyMy8w/Mi8wNC8xNy8yOC9j/aGF0LTc3Njc2OTNf/NjQwLmpwZw";

// ======================================
// START BOT
// ======================================

export function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN missing");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });
  console.log("🤖 Telegram bot started");

  // ======================================
  // TYPING STATE
  // ======================================

  const typingIntervals = new Map();

  function startTyping(receiverId) {
    if (typingIntervals.has(receiverId)) return;
    bot.sendChatAction(receiverId, "typing");
    const interval = setInterval(() => {
      bot.sendChatAction(receiverId, "typing");
    }, 4000);
    typingIntervals.set(receiverId, interval);
  }

  function stopTyping(receiverId) {
    const interval = typingIntervals.get(receiverId);
    if (interval) {
      clearInterval(interval);
      typingIntervals.delete(receiverId);
    }
  }

  // ======================================
  // 🔥 AUTO END OFFLINE USER
  // ======================================

  async function autoEndOfflineUser(offlineId) {
    const offlineUser = getUser(offlineId);
    if (!offlineUser || !offlineUser.partner) return;

    const partnerId = offlineUser.partner;

    stopTyping(offlineId);
    stopTyping(partnerId);

    // Offline user stops completely
    resetChatState(offlineId);
    setStatus(offlineId, "idle");

    // Partner continues
    resetChatState(partnerId);
    setStatus(partnerId, "searching");
    addToQueue(partnerId);

    await updateStatus(
      partnerId,
      "⚠️ Partner went offline. Finding a new one..."
    );

    await tryMatch();
  }

  // ======================================
  // HELPERS
  // ======================================

  async function updateStatus(chatId, text) {
    const user = getUser(chatId);
    try {
      if (user?.statusMessageId) {
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: user.statusMessageId
        });
        return;
      }
    } catch {
      if (user) user.statusMessageId = null;
    }

    const msg = await bot.sendMessage(chatId, text);
    setStatusMessageId(chatId, msg.message_id);
  }

  async function resetStatusMessage(chatId) {
    const user = getUser(chatId);
    if (!user?.statusMessageId) return;
    try {
      await bot.deleteMessage(chatId, user.statusMessageId);
    } catch {}
    user.statusMessageId = null;
  }

  async function clearChat(chatId) {
    const user = getUser(chatId);
    if (!user) return;
    for (const msgId of user.chatMessages) {
      try {
        await bot.deleteMessage(chatId, msgId);
      } catch {}
    }
    clearChatMessages(chatId);
  }

  async function isUserJoined(userId) {
    try {
      const member = await bot.getChatMember(REQUIRED_CHANNEL, userId);
      return ["member", "administrator", "creator"].includes(member.status);
    } catch {
      return false;
    }
  }

  async function sendWelcome(chatId, joined = false) {
    await bot.sendPhoto(chatId, WELCOME_IMAGE, {
      caption:
        "👋 *Welcome to MeowChat!*\n\n" +
        "💬 Talk anonymously with random people\n" +
        "⚡ Real-time 1-to-1 chat\n" +
        "🔒 Safe & private\n\n" +
        "📢 *Join our channel to start chatting*",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            joined
              ? { text: "✅ Joined", callback_data: "noop" }
              : {
                  text: "🔔 Join Channel",
                  url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}`
                }
          ],
          [{ text: "💬 Start Chat", callback_data: "start_chat" }]
        ]
      }
    });
  }

  // ======================================
  // MATCH ENGINE
  // ======================================

  async function tryMatch() {
    const match = getMatch();
    if (!match) return;

    const [u1, u2] = match;
    setPartner(u1, u2);
    setPartner(u2, u1);
    setStatus(u1, "connected");
    setStatus(u2, "connected");
    incrementChats();

    await updateStatus(u1, "✅ Connected with a random partner");
    await updateStatus(u2, "✅ Connected with a random partner");
  }

  // ======================================
  // /start
  // ======================================

  bot.onText(/\/start/, async msg => {
    const chatId = msg.chat.id.toString();
    const joined = await isUserJoined(msg.from.id);
    await sendWelcome(chatId, joined);
  });

  // ======================================
  // BUTTON HANDLER (SAFE)
  // ======================================

  bot.on("callback_query", async query => {
    const chatId = query.message.chat.id.toString();
    const userId = query.from.id;

    const answerOnce = async (opts = {}) => {
      try {
        await bot.answerCallbackQuery(query.id, opts);
      } catch {}
    };

    if (query.data === "noop") {
      await answerOnce();
      return;
    }

    if (query.data !== "start_chat") return;

    const joined = await isUserJoined(userId);
    if (!joined) {
      await answerOnce({
        text: "❌ Please join the channel first!",
        show_alert: true
      });
      return;
    }

    addUser(chatId, {
      name: query.from.first_name,
      country: query.from.language_code || "Unknown"
    });

    resetChatState(chatId);
    setStatus(chatId, "searching");
    addToQueue(chatId);

    await resetStatusMessage(chatId);
    await updateStatus(chatId, "🔍 Finding a random partner...");
    await tryMatch();

    await answerOnce();
  });

  // ======================================
  // /skip
  // ======================================

  bot.onText(/\/skip/, async msg => {
    const chatId = msg.chat.id.toString();
    const user = getUser(chatId);
    if (!user?.partner) return;

    const partnerId = user.partner;
    stopTyping(chatId);
    stopTyping(partnerId);

    await clearChat(chatId);
    await clearChat(partnerId);
    await resetStatusMessage(chatId);
    await resetStatusMessage(partnerId);

    resetChatState(chatId);
    resetChatState(partnerId);

    setStatus(chatId, "searching");
    setStatus(partnerId, "searching");

    addToQueue(chatId);
    addToQueue(partnerId);

    await updateStatus(chatId, "⏭ Partner skipped. Finding new...");
    await updateStatus(partnerId, "⏭ Partner skipped. Finding new...");
    await tryMatch();
  });

  // ======================================
  // /end
  // ======================================

  bot.onText(/\/end/, async msg => {
    const chatId = msg.chat.id.toString();
    const user = getUser(chatId);
    if (!user) return;

    const partnerId = user.partner;

    stopTyping(chatId);
    if (partnerId) stopTyping(partnerId);

    await clearChat(chatId);
    if (partnerId) await clearChat(partnerId);

    await resetStatusMessage(chatId);
    if (partnerId) await resetStatusMessage(partnerId);

    if (partnerId) {
      resetChatState(partnerId);
      setStatus(partnerId, "searching");
      addToQueue(partnerId);

      await updateStatus(
        partnerId,
        "❌ Partner left the chat. Finding a new one..."
      );
    }

    resetChatState(chatId);

    await bot.sendMessage(
      chatId,
      "🙏 *Thanks for using MeowChat!*\n\n" +
        "If you want to chat again, simply click the button below 👇",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💬 Start Chat", callback_data: "start_chat" }]
          ]
        }
      }
    );

    await tryMatch();
  });

  // ======================================
  // MESSAGE FORWARDING + OFFLINE DETECT
  // ======================================

  bot.on("message", async msg => {
    if (!msg.text || msg.text.startsWith("/")) return;

    const chatId = msg.chat.id.toString();
    const user = getUser(chatId);
    if (!user || user.status !== "connected") return;

    const partnerId = user.partner;
    startTyping(partnerId);

    setTimeout(async () => {
      stopTyping(partnerId);
      try {
        const sent = await bot.sendMessage(
          partnerId,
          `💬 ${user.name}: ${msg.text}`
        );
        addChatMessage(partnerId, sent.message_id);
      } catch {
        // 🔥 Partner unreachable
        await autoEndOfflineUser(partnerId);
      }
    }, 700);
  });
}
