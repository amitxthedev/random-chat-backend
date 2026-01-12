// ======================================
// src/telegram.js
// Telegram Random Chat Bot (FINAL STABLE)
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
// START BOT
// ======================================

export function startTelegramBot() {
  if (process.env.NODE_ENV !== "production") {
    console.log("⚠️ Telegram bot disabled in non-production");
    return;
  }

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

  const typing = new Map();

  const startTyping = id => {
    if (typing.has(id)) return;
    bot.sendChatAction(id, "typing").catch(() => {});
    typing.set(
      id,
      setInterval(() => {
        bot.sendChatAction(id, "typing").catch(() => {});
      }, 4000)
    );
  };

  const stopTyping = id => {
    if (typing.has(id)) clearInterval(typing.get(id));
    typing.delete(id);
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

  async function isUserJoined(userId) {
    try {
      const m = await bot.getChatMember(REQUIRED_CHANNEL, userId);
      return ["member", "administrator", "creator"].includes(m.status);
    } catch {
      return false;
    }
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
  // OFFLINE HANDLER (AUTO)
  // ======================================

  async function handleOffline(offlineId) {
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

    await updateStatus(
      partnerId,
      "⚠️ Partner went offline. Finding new..."
    );

    await tryMatch();
  }

  // ======================================
  // SKIP HANDLER
  // ======================================

  async function handleSkip(userId) {
    const u = getUser(userId);
    if (!u?.partner) return;

    const partnerId = u.partner;

    stopTyping(userId);
    stopTyping(partnerId);

    resetChatState(userId);
    resetChatState(partnerId);

    setStatus(userId, "searching");
    setStatus(partnerId, "searching");

    addToQueue(userId);
    addToQueue(partnerId);

    await updateStatus(userId, "⏭ Skipped. Finding new...");
    await updateStatus(partnerId, "⏭ Partner skipped. Finding new...");

    await tryMatch();
  }

  // ======================================
  // END HANDLER (FINAL STOP)
  // ======================================

  async function handleEnd(enderId) {
    const u = getUser(enderId);
    if (!u) return;

    const partnerId = u.partner;

    stopTyping(enderId);
    if (partnerId) stopTyping(partnerId);

    resetChatState(enderId);
    setStatus(enderId, "idle"); // ❌ DO NOT requeue

    if (partnerId) {
      resetChatState(partnerId);
      setStatus(partnerId, "searching");
      addToQueue(partnerId);

      await updateStatus(
        partnerId,
        "❌ Partner ended the chat. Finding new..."
      );
    }

    await bot.sendMessage(
      enderId,
      "🙏 Chat ended.\n\nTap *Start Chat* to chat again.",
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
  }

  // ======================================
  // COMMANDS
  // ======================================

  bot.onText(/\/start/, async msg => {
    const joined = await isUserJoined(msg.from.id);

    await bot.sendPhoto(msg.chat.id, WELCOME_IMAGE, {
      caption: "*Welcome to MeowChat 🐱*",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: joined
          ? [[{ text: "💬 Start Chat", callback_data: "start_chat" }]]
          : [[{
              text: "🔔 Join Channel",
              url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}`
            }]]
      }
    });
  });

  bot.on("callback_query", async q => {
    if (q.data !== "start_chat") return;

    if (!(await isUserJoined(q.from.id))) {
      return bot.answerCallbackQuery(q.id, {
        text: "Join channel first",
        show_alert: true
      });
    }

    const chatId = q.message.chat.id.toString();

    addUser(chatId, { name: q.from.first_name });

    resetChatState(chatId);
    setStatus(chatId, "searching");
    addToQueue(chatId);

    await updateStatus(chatId, "🔍 Finding a partner...");
    await tryMatch();
    await bot.answerCallbackQuery(q.id);
  });

  bot.onText(/\/skip/, msg =>
    handleSkip(msg.chat.id.toString())
  );

  bot.onText(/\/end/, msg =>
    handleEnd(msg.chat.id.toString())
  );

  // ======================================
  // MESSAGE FORWARDING
  // ======================================

  bot.on("message", async msg => {
    if (!msg.text || msg.text.startsWith("/")) return;

    const chatId = msg.chat.id.toString();
    const u = getUser(chatId);
    if (!u || u.status !== "connected") return;

    const partnerId = u.partner;
    startTyping(partnerId);

    try {
      const sent = await bot.sendMessage(
        partnerId,
        `💬 ${u.name}: ${msg.text}`
      );
      addChatMessage(partnerId, sent.message_id);
    } catch {
      await handleOffline(partnerId);
    } finally {
      stopTyping(partnerId);
    }
  });
}
