// core/anniversary-bridge.js
// 常驻检查到期纪念日提醒，不依赖 anniversary APP mount
// 启动时由 index.html 调用 initAnniversaryBridge() 初始化一次
// 复用 anniversary.js 的 checkTodayAnniversaries 和 chat-event-bridge.js 的 appendExternalChatMessage
// 去重沿用 app_anniversary_greeted 键，每天每个纪念日只提醒一次

import { getData, setData } from './storage.js';
import { emit } from './app-bus.js';
import { showToast } from './ui.js';
import { checkTodayAnniversaries } from '../apps/anniversary.js';
import { appendExternalChatMessage } from './chat-event-bridge.js';

let initialized = false;
let reminderTimer = null;
const CHECK_INTERVAL = 60 * 60 * 1000; // 每小时检查一次

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getGreetedKeys() {
  const raw = getData('app_anniversary_greeted');
  return new Set(Array.isArray(raw) ? raw : []);
}

function saveGreetedKeys(keys) {
  try {
    setData('app_anniversary_greeted', [...keys]);
  } catch (_) {}
}

export function initAnniversaryBridge() {
  if (initialized) return;
  initialized = true;

  // 启动后稍等再检查（让 DB 初始化完成）
  window.setTimeout(() => {
    checkAnniversaryReminders().catch(() => {});
  }, 3000);

  reminderTimer = window.setInterval(() => {
    checkAnniversaryReminders().catch(() => {});
  }, CHECK_INTERVAL);

  // 页面重新可见时也检查一次（跨天场景）
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkAnniversaryReminders().catch(() => {});
    }
  });
}

async function checkAnniversaryReminders() {
  const today = getTodayString();
  const todayItems = await checkTodayAnniversaries();
  if (!todayItems || !todayItems.length) return;

  const greetedKeys = getGreetedKeys();

  for (const item of todayItems) {
    const greetKey = `${item.id}_${today}`;
    if (greetedKeys.has(greetKey)) continue;
    greetedKeys.add(greetKey);
    saveGreetedKeys(greetedKeys);

    // 计算天数（当天 = 0）
    const days = 0;

    // 发事件，沿用项目命名风格
    const reminderData = {
      anniversaryId: item.id,
      title: item.name,
      date: item.date,
      characterId: item.characterId || '',
      days,
      note: item.note || '',
      source: item.source || 'user',
      createdBy: item.createdBy || ''
    };

    try {
      emit('anniversary:reminder', reminderData);
    } catch (_) {}

    // 写角色记忆（对齐原 anniversary.js 的 recordExternalInteraction）
    if (item.characterId) {
      try {
        await window.AppBus.recordExternalInteraction({
          characterId: item.characterId,
          role: 'assistant',
          content: `今天是${item.name || '纪念日'}。${item.note || ''}`.trim(),
          source: '纪念日',
          importance: 5
        });
      } catch (_) {}

      // 写入对应私聊 messages store + chat_unread_counts（复用 bridge 的落库方法）
      try {
        await appendExternalChatMessage({
          characterId: String(item.characterId),
          characterName: '',
          role: 'assistant',
          type: 'text',
          content: `今天是${item.name || '纪念日'}${item.note ? `，${item.note}` : ''}。要不要去聊聊？`,
          title: item.name,
          note: item.note || '',
          direction: 'ai_to_user',
          sourceEventId: `anniversary_${item.id}_${today}`,
          incrementUnread: true
        });
      } catch (_) {}
    }

    // toast 提醒（保留原有行为）
    showToast(`今天是 ${item.name || '纪念日'}，要不要去聊聊？`);
  }
}
