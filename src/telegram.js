// ======================================
// src/telegram.js
// Telegram Random Chat Bot (FIXED LOGIC)
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
const REQUIRED_CHANNEL = "@onechannelmain";
const WELCOME_IMAGE =
  "https://cdn.pixabay.com/photo/2023/02/04/17/28/chat-7767693_640.jpg";

// ======================================
export function startTelegramBot() {
  if (process.env.NODE_ENV !== "production") {
    console.log("⚠️ Telegram bot disabled (non-production)");
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return console.error("❌ TOKEN MISSING");

  const bot = new TelegramBot(token, { polling: true });
  console.log("🤖 Telegram bot started");

  // ======================================
  // TYPING
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

  async function updateStatus(chatId, text) {
    const u = getUser(chatId);
    try {
      if (u?.statusMessageId) {
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: u.statusMessageId
        });
        return;
      }
    } catch {
      if (u) u.statusMessageId = null;
    }
    const m = await bot.sendMessage(chatId, text);
    setStatusMessageId(chatId, m.message_id);
  }

  async function isUserJoined(id) {
    try {
      const m = await bot.getChatMember(REQUIRED_CHANNEL, id);
      return ["member", "administrator", "creator"].includes(m.status);
    } catch {
      return false;
    }
  }

  // ======================================
  // MATCH
  async function tryMatch() {
    const match = getMatch();
    if (!match) return;

    const [a, b] = match;
    setPartner(a, b);
    setPartner(b, a);
    setStatus(a, "connected");
    setStatus(b, "connected");
    incrementChats();

    await updateStatus(a, "✅ Connected");
    await updateStatus(b, "✅ Connected");
  }

  // ======================================
  // 🔴 OFFLINE (AUTO)
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
  // ⏭️ SKIP
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
  // ❌ END (FINAL)
  async function handleEnd(enderId) {
    const u = getUser(enderId);
    if (!u) return;

    const partnerId = u.partner;

    stopTyping(enderId);
    if (partnerId) stopTyping(partnerId);

    resetChatState(enderId);
    setStatus(enderId, "idle");

    // ❌ DO NOT REQUEUE ENDER

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
      "Chat ended.\nTap *Start Chat* to begin again.",
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

  bot.onText(/\/start/, async msg => {
    const joined = await isUserJoined(msg.from.id);
    await bot.sendPhoto(msg.chat.id, WELCOME_IMAGE, {
      caption: "*Welcome to MeowChat*",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          joined
            ? [{ text: "💬 Start Chat", callback_data: "start_chat" }]
            : [
                {
                  text: "🔔 Join Channel",
                  url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}`
                }
              ]
        ]
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

    const id = q.message.chat.id.toString();
    addUser(id, { name: q.from.first_name });

    resetChatState(id);
    setStatus(id, "searching");
    addToQueue(id);

    await updateStatus(id, "🔍 Finding partner...");
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
  // MESSAGE
  bot.on("message", async msg => {
    if (!msg.text || msg.text.startsWith("/")) return;

    const id = msg.chat.id.toString();
    const u = getUser(id);
    if (!u || u.status !== "connected") return;

    const p = u.partner;
    startTyping(p);

    try {
      const sent = await bot.sendMessage(
        p,
        `💬 ${u.name}: ${msg.text}`
      );
      addChatMessage(p, sent.message_id);
    } catch {
      await handleOffline(p);
    } finally {
      stopTyping(p);
    }
  });
}
