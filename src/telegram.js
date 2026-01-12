// ======================================
// src/telegram.js
// Telegram Random Chat Bot (PRODUCTION SAFE)
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

import { addToQueue, getMatch } from "./matcher.js";
import { incrementChats, logError } from "./analytics.js";

// ======================================
// CONFIG
// ======================================

const REQUIRED_CHANNEL = "@onechannelmain";
const WELCOME_IMAGE =
  "https://cdn.pixabay.com/photo/2023/02/04/17/28/chat-7767693_640.jpg";

// ======================================
// START BOT (SAFE)
// ======================================

export function startTelegramBot() {
  if (process.env.NODE_ENV !== "production") {
    console.log("⚠️ Telegram bot polling disabled (non-production)");
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN missing");
    return;
  }

  const bot = new TelegramBot(token, {
    polling: { interval: 1000, autoStart: true }
  });

  console.log("🤖 Telegram bot started (polling)");

  // ======================================
  // TYPING STATE
  // ======================================

  const typingIntervals = new Map();

  const startTyping = id => {
    if (typingIntervals.has(id)) return;
    bot.sendChatAction(id, "typing").catch(() => {});
    const i = setInterval(() => {
      bot.sendChatAction(id, "typing").catch(() => {});
    }, 4000);
    typingIntervals.set(id, i);
  };

  const stopTyping = id => {
    const i = typingIntervals.get(id);
    if (i) clearInterval(i);
    typingIntervals.delete(id);
  };

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
    for (const id of user.chatMessages) {
      try {
        await bot.deleteMessage(chatId, id);
      } catch {}
    }
    clearChatMessages(chatId);
  }

  async function isUserJoined(userId) {
    try {
      const m = await bot.getChatMember(REQUIRED_CHANNEL, userId);
      return ["member", "administrator", "creator"].includes(m.status);
    } catch {
      return false;
    }
  }

  async function sendWelcome(chatId, joined) {
    await bot.sendPhoto(chatId, WELCOME_IMAGE, {
      caption:
        "*Welcome to MeowChat 🐱*\n\n" +
        "• Anonymous 1-to-1 chat\n" +
        "• Real-time messaging\n" +
        "• Safe & private\n\n" +
        "_Join the channel to start chatting_",
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

    await updateStatus(u1, "✅ Connected with a partner");
    await updateStatus(u2, "✅ Connected with a partner");
  }

  // ======================================
  // OFFLINE AUTO END
  // ======================================

  async function autoEndOfflineUser(offlineId) {
    const u = getUser(offlineId);
    if (!u?.partner) return;

    const partnerId = u.partner;

    stopTyping(offlineId);
    stopTyping(partnerId);

    resetChatState(offlineId);
    setStatus(offlineId, "idle");

    resetChatState(partnerId);
    setStatus(partnerId, "searching");
    addToQueue(partnerId);

    await resetStatusMessage(partnerId);
    await updateStatus(
      partnerId,
      "⚠️ Partner disconnected. Finding new..."
    );

    await tryMatch();
  }

  // ======================================
  // COMMANDS
  // ======================================

  bot.onText(/\/start/, async msg => {
    const joined = await isUserJoined(msg.from.id);
    await sendWelcome(msg.chat.id.toString(), joined);
  });

  bot.on("callback_query", async q => {
    const chatId = q.message.chat.id.toString();
    if (q.data !== "start_chat") {
      bot.answerCallbackQuery(q.id).catch(() => {});
      return;
    }

    if (!(await isUserJoined(q.from.id))) {
      await bot.answerCallbackQuery(q.id, {
        text: "Join channel first",
        show_alert: true
      });
      return;
    }

    addUser(chatId, { name: q.from.first_name });
    resetChatState(chatId);
    setStatus(chatId, "searching");
    addToQueue(chatId);

    await resetStatusMessage(chatId);
    await updateStatus(chatId, "🔍 Finding a partner...");
    await tryMatch();
    await bot.answerCallbackQuery(q.id);
  });

  bot.onText(/\/skip/, async msg => {
    const id = msg.chat.id.toString();
    const u = getUser(id);
    if (!u?.partner) return;

    await autoEndOfflineUser(id);
  });

  bot.onText(/\/end/, async msg => {
    const id = msg.chat.id.toString();
    const u = getUser(id);
    if (!u) return;

    if (u.partner) await autoEndOfflineUser(u.partner);

    resetChatState(id);
    await bot.sendMessage(
      id,
      "Chat ended.\nPress *Start Chat* to continue.",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "💬 Start Chat", callback_data: "start_chat" }]]
        }
      }
    );
  });

  // ======================================
  // MESSAGE FORWARDING
  // ======================================

  bot.on("message", async msg => {
    if (!msg.text || msg.text.startsWith("/")) return;

    const id = msg.chat.id.toString();
    const u = getUser(id);
    if (!u || u.status !== "connected") return;

    const partner = u.partner;
    startTyping(partner);

    setTimeout(async () => {
      stopTyping(partner);
      try {
        const sent = await bot.sendMessage(
          partner,
          `💬 ${u.name}: ${msg.text}`
        );
        addChatMessage(partner, sent.message_id);
      } catch {
        await autoEndOfflineUser(partner);
      }
    }, 500);
  });
}
//////////