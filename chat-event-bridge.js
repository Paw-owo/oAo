// core/chat-event-bridge.js
// 常驻监听 shop:gift / wallet:transfer，落库到 messages store + 写 chat_unread_counts
// 不依赖 chat.js 是否挂载，启动时由 index.html 调用 initChatEventBridge() 初始化一次
// 复用现有 messages store 和 chat_unread_counts 键，不新增 store / 不新增未读键
// 角色隔离：无 characterId 不落库，不乱塞默认角色

import { getData, setData, generateId, getNow, setDB } from './storage.js';
import { on, emit } from './app-bus.js';

let initialized = false;
const recentEventIds = new Set();
const RECENT_ID_LIMIT = 64;

// 去重：事件有 id 用 id，否则基于 type+characterId+direction+amount/itemId+timestamp 组合
function buildSourceEventId(type, data) {
  if (data?.id) return String(data.id);
  return [
    type,
    String(data?.characterId || ''),
    String(data?.direction || ''),
    String(data?.amount || data?.itemPrice || ''),
    String(data?.itemId || ''),
    String(data?.timestamp || data?.createdAt || '')
  ].join('|');
}

function isDuplicate(eventId) {
  if (!eventId) return false;
  if (recentEventIds.has(eventId)) return true;
  recentEventIds.add(eventId);
  if (recentEventIds.size > RECENT_ID_LIMIT) {
    const first = recentEventIds.values().next().value;
    recentEventIds.delete(first);
  }
  return false;
}

export function initChatEventBridge() {
  if (initialized) return;
  initialized = true;

  on('shop:gift', (data) => { handleShopGift(data); });
  on('wallet:transfer', (data) => { handleWalletTransfer(data); });
}

async function handleShopGift(data) {
  const characterId = String(data?.characterId || '').trim();
  if (!characterId) {
    console.warn('[chat-event-bridge] shop:gift 缺少 characterId，跳过落库');
    return;
  }

  const eventId = buildSourceEventId('shop:gift', data);
  if (isDuplicate(eventId)) return;

  const itemName = data?.itemName || data?.title || '礼物';
  const name = data?.characterName || data?.characterId || 'TA';
  const dir = data?.direction;

  await appendExternalChatMessage({
    sourceEventId: eventId,
    characterId,
    characterName: name,
    role: dir === 'ai_to_user' ? 'assistant' : 'user',
    type: 'gift',
    content: dir === 'ai_to_user'
      ? `收到 ${name} 的礼物：${itemName}${data?.note ? `，${data.note}` : ''}`
      : `已送 ${name} 礼物：${itemName}${data?.note ? `，${data.note}` : ''}`,
    note: String(data?.note || ''),
    direction: dir || '',
    title: dir === 'ai_to_user' ? `${name}送给我一件小物` : `送给${name}的小礼物`,
    itemId: String(data?.itemId || ''),
    itemName,
    itemDesc: String(data?.itemDesc || data?.itemDescription || ''),
    itemPrice: Number(data?.itemPrice || data?.price || 0),
    itemImage: String(data?.itemImage || data?.image || ''),
    card: data?.card || null,
    item: data?.item || null,
    shopItem: data?.shopItem || null,
    incrementUnread: true
  });
}

async function handleWalletTransfer(data) {
  const characterId = String(data?.characterId || '').trim();
  if (!characterId) {
    console.warn('[chat-event-bridge] wallet:transfer 缺少 characterId，跳过落库');
    return;
  }

  const eventId = buildSourceEventId('wallet:transfer', data);
  if (isDuplicate(eventId)) return;

  const amount = Number(data?.amount || 0);
  const name = data?.characterName || data?.characterId || 'TA';
  const dir = data?.direction;

  await appendExternalChatMessage({
    sourceEventId: eventId,
    characterId,
    characterName: name,
    role: dir === 'ai_to_user' ? 'assistant' : 'user',
    type: 'transfer',
    content: dir === 'ai_to_user'
      ? `收到 ${name} 转来的 ¥${amount}${data?.note ? `，${data.note}` : ''}`
      : `已转给 ${name} ¥${amount}${data?.note ? `，${data.note}` : ''}`,
    amount,
    transferAmount: amount,
    note: String(data?.note || ''),
    direction: dir || '',
    title: dir === 'ai_to_user' ? `${name}转给我` : `转给${name}`,
    incrementUnread: true
  });
}

// 把外部事件写入私聊消息库 + 写未读
// 字段格式对齐 thread-actions.js 的 buildBaseMessage，保证渲染层正常显示
// 导出供 anniversary-bridge 等常驻模块复用，不新建第二套消息系统
export async function appendExternalChatMessage(payload = {}) {
  const characterId = String(payload.characterId || '').trim();
  if (!characterId) return null;

  const now = getNow();
  const role = payload.role === 'assistant' ? 'assistant' : 'user';
  const rawType = String(payload.type || 'text').trim().toLowerCase();
  const type = rawType === 'shop-item' ? 'shop_item'
    : ['text', 'voice', 'sticker', 'image', 'transfer', 'gift', 'shop_item', 'purchase', 'item', 'dice', 'rps'].includes(rawType)
      ? rawType
      : 'text';

  const message = {
    id: generateId('msg'),
    role,
    content: String(payload.content || '').trim(),
    type,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    quoteMessageId: '',
    quoteText: '',
    imageBase64: '',
    stickerId: '',
    stickerImageBase64: '',
    stickerDescription: '',
    transferAmount: Number(payload.transferAmount || payload.amount || 0),
    amount: Number(payload.amount || payload.transferAmount || payload.price || payload.itemPrice || 0),
    price: Number(payload.price || payload.itemPrice || payload.amount || 0),
    note: String(payload.note || ''),
    title: String(payload.title || ''),
    description: String(payload.description || payload.desc || ''),
    desc: String(payload.desc || payload.description || ''),
    direction: String(payload.direction || ''),
    itemId: String(payload.itemId || ''),
    itemName: String(payload.itemName || ''),
    itemDesc: String(payload.itemDesc || payload.itemDescription || ''),
    itemDescription: String(payload.itemDescription || payload.itemDesc || ''),
    itemEffect: String(payload.itemEffect || ''),
    itemPrice: Number(payload.itemPrice || payload.price || 0),
    itemImage: String(payload.itemImage || payload.image || ''),
    image: String(payload.image || payload.itemImage || ''),
    cardType: String(payload.cardType || type),
    card: payload.card || null,
    item: payload.item || null,
    shopItem: payload.shopItem || null,
    sourceEventId: String(payload.sourceEventId || ''),
    characterId,
    characterName: String(payload.characterName || ''),
    characterAvatar: String(payload.characterAvatar || ''),
    groupId: '',
    versionGroupId: '',
    versionStatus: 'active'
  };

  try {
    await setDB('messages', message);
  } catch (error) {
    console.error('[chat-event-bridge] appendExternalChatMessage setDB failed', error);
    return null;
  }

  // 写未读：私聊用 chat_unread_counts，群聊不动 chat_group_unread_counts
  // 若用户当前正在该私聊会话，不递增未读（chat.js 会 renderRoute 刷新显示）
  const activeThread = window.__chatActiveThread;
  const isActivePrivate = activeThread && activeThread.mode === 'private' &&
    String(activeThread.characterId || '') === String(characterId || '');
  if (!isActivePrivate) {
    try {
      const unreadMap = getData('chat_unread_counts') || {};
      const next = Math.max(0, Number(unreadMap[characterId] || 0) + 1);
      setData('chat_unread_counts', { ...unreadMap, [characterId]: next });
      if (typeof window.refreshDesktopBadges === 'function') window.refreshDesktopBadges();
    } catch (_) {}
  }

  // 通知 chat.js 刷新 UI（chat.js 可选监听，不强制）
  try {
    emit('chat:external-message', { characterId, type, message });
  } catch (_) {}

  return message;
}
