// core/app-bus.js
// imports:
//   from './memory.js': recordExternalInteraction as memoryRecordExternalInteraction
//   from './storage.js': getData, setData

import { recordExternalInteraction as memoryRecordExternalInteraction } from './memory.js';
import { getData, setData } from './storage.js';

// ═══════════════════════════════════════
// 【APP 注册表】每个 APP mount 时注册对外 API
// ═══════════════════════════════════════

const registry = new Map();

export function registerAPI(appId, api) {
  const id = String(appId || '').trim();
  if (!id || !api || typeof api !== 'object') return () => {};
  registry.set(id, api);
  return () => {
    if (registry.get(id) === api) registry.delete(id);
  };
}

export function getAPI(appId) {
  return registry.get(String(appId || '').trim()) || null;
}

export function hasAPI(appId) {
  return registry.has(String(appId || '').trim());
}

// ═══════════════════════════════════════
// 【事件总线】包装 window.AppEvents，加命名约定和事件日志
// ═══════════════════════════════════════

const EVENT_LOG_KEY = 'app_bus_event_log';
const EVENT_LOG_LIMIT = 50;

export function emit(event, data) {
  const name = String(event || '').trim();
  if (!name) return;
  logEvent(name, data);
  if (typeof window !== 'undefined' && window.AppEvents) {
    window.AppEvents.emit(name, data);
  } else if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail: data }));
  }
}

export function on(event, fn) {
  const name = String(event || '').trim();
  if (!name || typeof fn !== 'function') return () => {};
  if (typeof window !== 'undefined' && window.AppEvents) {
    return window.AppEvents.on(name, fn);
  }
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => fn(e.detail);
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}

export function once(event, fn) {
  let off = () => {};
  off = on(event, (data) => {
    off();
    fn(data);
  });
  return off;
}

function logEvent(name, data) {
  try {
    const log = Array.isArray(getData(EVENT_LOG_KEY)) ? getData(EVENT_LOG_KEY) : [];
    log.push({ name, data: safeForLog(data), at: Date.now() });
    while (log.length > EVENT_LOG_LIMIT) log.shift();
    setData(EVENT_LOG_KEY, log);
  } catch (_) {}
}

function safeForLog(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return String(value);
  }
}

export function getEventLog() {
  return Array.isArray(getData(EVENT_LOG_KEY)) ? getData(EVENT_LOG_KEY) : [];
}

// ═══════════════════════════════════════
// 【带参 openApp】委托 window.openApp，但支持 options
// ═══════════════════════════════════════

export async function openApp(appId, options = {}) {
  if (typeof window === 'undefined') return;
  if (typeof window.openApp !== 'function') return;
  // window.openApp 由 index.html 改造后接受第二参数 options
  try {
    await window.openApp(appId, options);
  } catch (error) {
    console.warn('[app-bus] openApp failed:', error);
  }
}

// ═══════════════════════════════════════
// 【统一记忆写入】全部走 core/memory.js，保留 source/keywords/importance
// ═══════════════════════════════════════

export async function recordExternalInteraction(payload = {}) {
  // 兼容旧 chat 版的 (input, legacyInteraction) 双参数签名
  if (arguments.length >= 2 && typeof payload !== 'object') {
    const legacy = arguments[1] || {};
    payload = {
      characterId: payload,
      role: legacy.role || 'assistant',
      content: legacy.content || legacy.text || legacy.note || '',
      source: legacy.source || 'external'
    };
  }

  if (!payload || typeof payload !== 'object') return null;

  const characterId = String(payload.characterId || payload.character?.id || '').trim();
  const content = String(payload.content || payload.text || payload.note || '').trim();
  if (!characterId || !content) return null;

  return await memoryRecordExternalInteraction({
    characterId,
    character: payload.character || null,
    userProfile: payload.userProfile || {},
    role: payload.role === 'user' ? 'user' : 'assistant',
    content,
    source: payload.source || 'external',
    mood: payload.mood || '',
    importance: Number(payload.importance) || 3,
    callName: payload.callName || ''
  });
}

// ═══════════════════════════════════════
// 【工具】批量订阅，返回统一 off
// ═══════════════════════════════════════

export function subscribe(handlers = {}) {
  const offs = [];
  for (const [event, fn] of Object.entries(handlers)) {
    if (typeof fn === 'function') offs.push(on(event, fn));
  }
  return () => offs.forEach((off) => { try { off(); } catch (_) {} });
}
