// apps/chat/thread-actions.js
// imports:
//   from '../../core/storage.js': generateId, getNow, setDB, getDB, deleteDB, getByIndexDB
//   from '../../core/ui.js': showToast
//   from '../../core/tts.js': playTTS, stopAll
// dynamic imports:
//   from './thread-ai.js': requestThreadAIReply, stopThreadAIReply

import {
  generateId,
  getNow,
  setDB,
  getDB,
  deleteDB,
  getByIndexDB
} from '../../core/storage.js';

import { showToast } from '../../core/ui.js';
import { playTTS, stopAll } from '../../core/tts.js';
import { deductBalance, getBalance } from '../wallet.js';

let requestThreadAIReplyFn = null;
let stopThreadAIReplyFn = null;

// ═══════════════════════════════════════
// 【公开接口】消息发送、编辑、删除、引用、复制、重来、续写、停止
// ═══════════════════════════════════════

export async function saveMessageOnly(state, text, extra = {}) {
  const content = String(text || '').trim();
  if (!content) return null;

  const type = normalizeMessageType(extra.type || 'text');

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    content,
    type,
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || ''),
    imageBase64: extra.imageBase64 || '',
    stickerId: extra.stickerId || '',
    stickerImageBase64: extra.stickerImageBase64 || '',
    stickerDescription: extra.stickerDescription || '',
    transferAmount: extra.transferAmount || 0,
    amount: extra.amount || extra.transferAmount || 0,
    price: extra.price || extra.itemPrice || 0,
    note: extra.note || '',
    title: extra.title || '',
    description: extra.description || '',
    itemId: extra.itemId || '',
    itemName: extra.itemName || '',
    itemDesc: extra.itemDesc || extra.itemDescription || '',
    itemPrice: extra.itemPrice || 0,
    itemImage: extra.itemImage || '',
    direction: extra.direction || '',
    card: extra.card || null,
    item: extra.item || null,
    shopItem: extra.shopItem || null,
    characterId: extra.characterId || '',
    characterName: extra.characterName || '',
    characterAvatar: extra.characterAvatar || ''
  });

  await saveMessage(state, message);
  clearQuote(state);

  return message;
}

export async function sendThreadMessage(state, text, extra = {}) {
  if (extra.skipSave) {
    if (extra.triggerAI !== false) {
      await requestAIReplySafely(state, extra);
    }
    return null;
  }

  const content = String(text || '').trim();
  if (!content) return null;

  const type = normalizeMessageType(extra.type || 'text');

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    content,
    type,
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || ''),
    imageBase64: extra.imageBase64 || '',
    stickerId: extra.stickerId || '',
    stickerImageBase64: extra.stickerImageBase64 || '',
    stickerDescription: extra.stickerDescription || '',
    transferAmount: extra.transferAmount || 0,
    amount: extra.amount || extra.transferAmount || 0,
    price: extra.price || extra.itemPrice || 0,
    note: extra.note || '',
    title: extra.title || '',
    description: extra.description || '',
    itemId: extra.itemId || '',
    itemName: extra.itemName || '',
    itemDesc: extra.itemDesc || extra.itemDescription || '',
    itemPrice: extra.itemPrice || 0,
    itemImage: extra.itemImage || '',
    direction: extra.direction || '',
    card: extra.card || null,
    item: extra.item || null,
    shopItem: extra.shopItem || null,
    characterId: extra.characterId || '',
    characterName: extra.characterName || '',
    characterAvatar: extra.characterAvatar || ''
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (message.role === 'user' && extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function sendCardMessage(state, card = {}, extra = {}) {
  const normalized = normalizeCardPayload(card, extra);
  const type = normalizeMessageType(extra.type || normalized.type || card.type || 'shop_item');

  const message = buildBaseMessage(state, {
    ...extra,
    ...normalized,
    role: normalizeRole(extra.role || normalized.role || 'user'),
    type,
    content: String(extra.content || normalized.content || normalized.description || normalized.title || '[小卡片]').trim(),
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (message.role === 'user' && extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function editThreadMessage(state, messageId, nextContent) {
  const id = String(messageId || '').trim();
  const content = String(nextContent || '').trim();

  if (!id || !content) {
    showToast('内容不能为空');
    return null;
  }

  const store = getStoreName(state);
  const message = await getDB(store, id).catch(() => null);

  if (!message) {
    showToast('这条消息找不到了');
    return null;
  }

  if (!canEditMessage(message)) {
    showToast('这条不适合编辑');
    return null;
  }

  const now = getNow();
  const next = cleanForDB({
    ...message,
    content,
    editedAt: now,
    updatedAt: now
  });

  await setDB(store, next);
  await refreshStateMessages(state);

  showToast('改好啦');
  return next;
}

export async function deleteThreadMessage(state, messageId) {
  const id = String(messageId || '').trim();

  if (!id) return false;

  const store = getStoreName(state);
  const message = await getDB(store, id).catch(() => null);

  // 如果这条消息有版本组，连带删除同组所有版本
  if (message?.versionGroupId) {
    const list = getStateList(state);
    const siblings = list.filter((item) => item.versionGroupId === message.versionGroupId);
    for (const sibling of siblings) {
      await deleteDB(store, sibling.id);
    }
  } else {
    await deleteDB(store, id);
  }

  await refreshStateMessages(state);

  if (state.quotedMessageId === id) {
    clearQuote(state);
  }

  showToast('已经删掉');
  return true;
}

export function quoteThreadMessage(state, messageId) {
  const id = String(messageId || '').trim();

  if (!id) {
    clearQuote(state);
    showToast('已取消引用');
    return;
  }

  state.quotedMessageId = id;
  showToast('已引用这句');
}

export async function copyThreadMessage(message) {
  const text = getCopyText(message);

  if (!text) {
    showToast('没有可复制的内容');
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast('复制好啦');
    return true;
  } catch (_) {
    showToast('复制失败');
    return false;
  }
}

export async function regenerateThreadMessage(state, messageId) {
  const id = String(messageId || '').trim();
  const list = getStateList(state);
  const target = list.find((item) => item.id === id);

  if (!target) {
    showToast('这条消息找不到了');
    return null;
  }

  if (target.role !== 'assistant') {
    showToast('只能重来 TA 的回复');
    return null;
  }

  // 获取或创建版本组 ID
  const versionGroupId = target.versionGroupId || generateId('ver');

  const store = getStoreName(state);

  // 如果目标还没有版本组，先给它打上
  if (!target.versionGroupId) {
    const updated = cleanForDB({
      ...target,
      versionGroupId,
      versionStatus: 'archived',
      updatedAt: getNow()
    });
    await setDB(store, updated);
  } else {
    // 已有版本组，标记当前为 archived
    const updated = cleanForDB({
      ...target,
      versionStatus: 'archived',
      updatedAt: getNow()
    });
    await setDB(store, updated);
  }

  await refreshStateMessages(state);

  // 请求新回复，传入 versionGroupId
  await requestAIReplySafely(state, { regenerate: true, versionGroupId });

  return true;
}

export async function switchThreadVersion(state, versionGroupId, direction) {
  const gid = String(versionGroupId || '').trim();
  if (!gid) return false;

  const store = getStoreName(state);
  const list = getStateList(state);
  const versions = list
    .filter((item) => item.versionGroupId === gid)
    .sort(sortByTimestamp);

  if (versions.length <= 1) return false;

  const activeIndex = versions.findIndex((item) => item.versionStatus !== 'archived');
  if (activeIndex < 0) return false;

  let nextIndex;
  if (direction === 'prev') {
    nextIndex = activeIndex > 0 ? activeIndex - 1 : versions.length - 1;
  } else {
    nextIndex = activeIndex < versions.length - 1 ? activeIndex + 1 : 0;
  }

  if (nextIndex === activeIndex) return false;

  const now = getNow();

  await setDB(store, cleanForDB({
    ...versions[activeIndex],
    versionStatus: 'archived',
    updatedAt: now
  }));

  await setDB(store, cleanForDB({
    ...versions[nextIndex],
    versionStatus: 'active',
    updatedAt: now
  }));

  await refreshStateMessages(state);
  return true;
}

export function getVersionInfo(state, message) {
  if (!message?.versionGroupId) return null;

  const list = getStateList(state);
  const versions = list
    .filter((item) => item.versionGroupId === message.versionGroupId)
    .sort(sortByTimestamp);

  if (versions.length <= 1) return null;

  const activeIndex = versions.findIndex((item) => item.versionStatus !== 'archived');
  if (activeIndex < 0) return null;

  return {
    total: versions.length,
    current: activeIndex + 1,
    versionGroupId: message.versionGroupId
  };
}

export async function continueThreadMessage(state) {
  await requestAIReplySafely(state, { continue: true });
  return true;
}

export async function resendThreadMessage(state, messageId) {
  const id = String(messageId || '').trim();
  if (!id) return null;

  const list = getStateList(state);
  const target = list.find((item) => item.id === id);

  if (!target) {
    showToast('这条消息找不到了');
    return null;
  }

  if (target.role !== 'user') {
    showToast('只能重新发送自己的消息');
    return null;
  }

  const content = String(target.content || '').trim();
  if (!content) {
    showToast('这条没有文字内容');
    return null;
  }

  return sendThreadMessage(state, content, { triggerAI: true });
}

export async function stopThreadAIReply(state, options = {}) {
  const fn = await getAIStopFunction();

  if (typeof fn !== 'function') {
    state.aiGenerating = false;
    state.isSending = false;
    showToast('停止模块还没接上');
    return false;
  }

  try {
    const stopped = await fn(state, options);
    state.aiGenerating = false;
    state.isSending = false;

    if (stopped) {
      await refreshStateMessages(state);
      showToast('停住啦');
    }

    return Boolean(stopped);
  } catch (error) {
    console.error(error);
    state.aiGenerating = false;
    state.isSending = false;
    showToast('刚刚没停稳');
    return false;
  }
}

// ═══════════════════════════════════════
// 【卡片和媒体消息】转账、图片、表情包、骰子、猜拳
// ═══════════════════════════════════════

export async function sendTransferMessage(state, amount, note = '', extra = {}) {
  const value = Number(amount || 0);

  if (!Number.isFinite(value) || value <= 0) {
    showToast('金额要大于 0');
    return null;
  }

  if (getBalance() < value) {
    showToast('钱包余额不足，转账失败');
    return null;
  }

  const deductOk = deductBalance(value, `转账给 ${extra.characterName || state.character?.name || 'TA'}`, {
    category: 'transfer',
    source: 'chat_transfer',
    ownerType: 'user'
  });
  if (!deductOk) {
    showToast('钱包扣款失败，转账未成功');
    return null;
  }

  const cleanNote = String(note || extra.note || '').trim();
  const title = String(extra.title || '转账小心意').trim();
  const description = String(extra.description || cleanNote || `转账 ¥${formatAmount(value)}`).trim();

  const card = {
    type: 'transfer',
    title,
    description,
    desc: description,
    note: cleanNote,
    amount: value,
    price: value,
    transferAmount: value,
    direction: extra.direction || 'user_to_ai',
    characterId: extra.characterId || state.characterId || '',
    characterName: extra.characterName || state.character?.name || '',
    image: extra.image || extra.itemImage || '',
    itemImage: extra.itemImage || extra.image || ''
  };

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    type: 'transfer',
    content: cleanNote || `转账 ${formatAmount(value)}`,
    transferAmount: value,
    amount: value,
    price: value,
    note: cleanNote,
    title,
    description,
    direction: card.direction,
    card,
    item: extra.item || null,
    shopItem: extra.shopItem || null,
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (message.role === 'user' && extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function sendImageMessage(state, imageBase64, caption = '', extra = {}) {
  const image = String(imageBase64 || '').trim();

  if (!image) {
    showToast('图片不见了');
    return null;
  }

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    type: 'image',
    content: String(caption || '[图片]').trim(),
    imageBase64: image,
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (message.role === 'user' && extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function sendStickerMessage(state, stickerId, extra = {}) {
  const id = String(stickerId || extra.stickerId || '').trim();
  const sticker = id ? await getDB('stickers', id).catch(() => null) : null;
  const stickerImageBase64 = String(extra.stickerImageBase64 || sticker?.imageBase64 || sticker?.image || sticker?.dataUrl || '').trim();
  const stickerDescription = String(extra.stickerDescription || sticker?.description || sticker?.desc || sticker?.prompt || '').trim();
  const text = String(extra.content || extra.text || stickerDescription || sticker?.name || '[表情包]').trim();

  if (!id && !stickerImageBase64 && !text) {
    showToast('表情包不见了');
    return null;
  }

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    type: 'sticker',
    content: text || '[表情包]',
    stickerId: id,
    stickerImageBase64,
    stickerDescription,
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (message.role === 'user' && extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function sendDiceMessage(state, options = {}) {
  const sides = clampNumber(options.sides || 6, 2, 100);
  const value = rollDice(sides);
  const role = normalizeRole(options.role || 'user');
  const speaker = options.character || null;

  const message = buildBaseMessage(state, {
    ...options,
    role,
    type: 'dice',
    content: `${role === 'assistant' ? getSpeakerName(speaker) : '我'} 摇了骰子：${value}`,
    diceValue: value,
    diceSides: sides,
    rolling: true,
    characterId: role === 'assistant' ? speaker?.id || options.characterId || state.characterId || '' : options.characterId || '',
    characterName: role === 'assistant' ? speaker?.name || options.characterName || '' : options.characterName || '',
    characterAvatar: role === 'assistant' ? speaker?.avatar || options.characterAvatar || '' : options.characterAvatar || ''
  });

  await saveMessage(state, message);
  await settleRollingMessage(state, message.id);

  if (role === 'user' && options.triggerAI !== false) {
    await requestAIReplySafely(state, {
      game: 'dice',
      diceValue: value,
      diceSides: sides
    });
  }

  return {
    ...message,
    rolling: false
  };
}

export async function sendRpsMessage(state, options = {}) {
  const role = normalizeRole(options.role || 'user');
  const speaker = options.character || null;
  const choice = options.choice ? normalizeRpsChoice(options.choice) || randomRpsChoice() : randomRpsChoice();
  const opponentChoice = options.opponentChoice ? normalizeRpsChoice(options.opponentChoice) : '';
  const outcome = opponentChoice ? getRpsOutcome(choice, opponentChoice) : '';

  const message = buildBaseMessage(state, {
    ...options,
    role,
    type: 'rps',
    content: `${role === 'assistant' ? getSpeakerName(speaker) : '我'} 出了${getRpsLabel(choice)}`,
    rpsChoice: choice,
    rpsOpponentChoice: opponentChoice,
    rpsOutcome: outcome,
    rolling: true,
    characterId: role === 'assistant' ? speaker?.id || options.characterId || state.characterId || '' : options.characterId || '',
    characterName: role === 'assistant' ? speaker?.name || options.characterName || '' : options.characterName || '',
    characterAvatar: role === 'assistant' ? speaker?.avatar || options.characterAvatar || '' : options.characterAvatar || ''
  });

  await saveMessage(state, message);
  await settleRollingMessage(state, message.id);

  if (role === 'user' && options.triggerAI !== false) {
    await requestAIReplySafely(state, {
      game: 'rps',
      rpsChoice: choice,
      rpsOpponentChoice: opponentChoice,
      rpsOutcome: outcome
    });
  }

  return {
    ...message,
    rolling: false
  };
}
// ═══════════════════════════════════════
// 【TTS】语音朗读
// ═══════════════════════════════════════

export async function playThreadTTS(state, message) {
  const text = getTtsText(message);

  if (!text) {
    showToast('没有可以朗读的内容');
    return false;
  }

  stopAll();
  state.activeTtsMessageId = message.id || '';
  state.activeTts = true;

  try {
    await playTTS(text);
    return true;
  } catch (_) {
    showToast('朗读失败');
    return false;
  } finally {
    state.activeTtsMessageId = '';
    state.activeTts = false;
  }
}

export function stopThreadTTS() {
  stopAll();
}

// ═══════════════════════════════════════
// 【内部函数】消息构建、卡片规范化、数据库写入
// ═══════════════════════════════════════

function buildBaseMessage(state, data = {}) {
  const now = getNow();
  const role = normalizeRole(data.role || 'user');
  const type = normalizeMessageType(data.type || 'text');

  const message = {
    id: String(data.id || generateId('msg')),
    role,
    content: String(data.content || '').trim(),
    type,
    timestamp: String(data.timestamp || now),
    createdAt: String(data.createdAt || now),
    updatedAt: String(now),
    quoteMessageId: String(data.quoteMessageId || ''),
    quoteText: String(data.quoteText || ''),
    imageBase64: String(data.imageBase64 || ''),
    stickerId: String(data.stickerId || ''),
    stickerImageBase64: String(data.stickerImageBase64 || ''),
    stickerDescription: String(data.stickerDescription || ''),
    transferAmount: Number(data.transferAmount || data.amount || 0),
    amount: Number(data.amount || data.transferAmount || data.price || data.itemPrice || 0),
    price: Number(data.price || data.itemPrice || data.amount || data.transferAmount || 0),
    note: String(data.note || ''),
    title: String(data.title || ''),
    description: String(data.description || data.desc || ''),
    desc: String(data.desc || data.description || ''),
    direction: String(data.direction || ''),
    itemId: String(data.itemId || ''),
    itemName: String(data.itemName || data.name || ''),
    itemDesc: String(data.itemDesc || data.itemDescription || ''),
    itemDescription: String(data.itemDescription || data.itemDesc || ''),
    itemEffect: String(data.itemEffect || ''),
    itemPrice: Number(data.itemPrice || data.price || 0),
    itemImage: String(data.itemImage || data.image || ''),
    image: String(data.image || data.itemImage || ''),
    cardType: String(data.cardType || ''),
    card: normalizeNestedCard(data.card),
    item: normalizeNestedCard(data.item),
    shopItem: normalizeNestedCard(data.shopItem),
    diceValue: Number(data.diceValue || 0),
    diceSides: Number(data.diceSides || 0),
    rpsChoice: String(data.rpsChoice || ''),
    rpsOpponentChoice: String(data.rpsOpponentChoice || ''),
    rpsOutcome: String(data.rpsOutcome || ''),
    rolling: Boolean(data.rolling),
    characterName: String(data.characterName || ''),
    characterAvatar: String(data.characterAvatar || ''),
    versionGroupId: String(data.versionGroupId || ''),
    versionStatus: String(data.versionStatus || 'active')
  };

  if (state.mode === 'group') {
    message.groupId = String(state.groupId || '');
    message.characterId = String(data.characterId || '');
  } else {
    message.characterId = String(data.characterId || state.characterId || '');
    message.groupId = '';
  }

  if (data.editedAt) message.editedAt = String(data.editedAt);
  if (data.duration) message.duration = Number(data.duration) || 0;
  if (data.proactive) message.proactive = Boolean(data.proactive);
  if (data.proactiveReason) message.proactiveReason = String(data.proactiveReason);

  return cleanForDB(message);
}

function normalizeCardPayload(card = {}, extra = {}) {
  const source = card && typeof card === 'object' ? card : {};
  const nestedCard = source.card && typeof source.card === 'object' ? source.card : {};
  const item = source.item && typeof source.item === 'object' ? source.item : {};
  const shopItem = source.shopItem && typeof source.shopItem === 'object' ? source.shopItem : {};
  const merged = {
    ...shopItem,
    ...item,
    ...nestedCard,
    ...source,
    ...extra
  };

  const type = normalizeMessageType(merged.type || merged.cardType || 'shop_item');
  const amount = Number(
    merged.amount ??
    merged.transferAmount ??
    merged.price ??
    merged.itemPrice ??
    merged.shopPrice ??
    0
  ) || 0;

  const image = String(
    merged.image ||
    merged.itemImage ||
    merged.shopImage ||
    merged.productImage ||
    merged.imageBase64 ||
    ''
  ).trim();

  const title = String(
    merged.title ||
    merged.itemName ||
    merged.name ||
    merged.shopName ||
    merged.productName ||
    (type === 'transfer' ? '转账小心意' : type === 'gift' ? '礼物小卡片' : '商品小卡片')
  ).trim();

  const description = String(
    merged.description ||
    merged.desc ||
    merged.itemDesc ||
    merged.itemDescription ||
    merged.shopDesc ||
    merged.content ||
    ''
  ).trim();

  const note = String(
    merged.note ||
    merged.remark ||
    merged.giftNote ||
    merged.message ||
    ''
  ).trim();

  const normalizedItem = {
    id: String(merged.itemId || merged.id || ''),
    itemId: String(merged.itemId || merged.id || ''),
    name: String(merged.itemName || merged.name || title),
    itemName: String(merged.itemName || merged.name || title),
    description,
    itemDesc: String(merged.itemDesc || merged.itemDescription || description),
    itemDescription: String(merged.itemDescription || merged.itemDesc || description),
    effect: String(merged.itemEffect || merged.effect || ''),
    itemEffect: String(merged.itemEffect || merged.effect || ''),
    price: amount,
    itemPrice: amount,
    image,
    itemImage: image,
    imageBase64: image
  };

  return cleanForDB({
    type,
    cardType: String(merged.cardType || type),
    role: normalizeRole(merged.role || extra.role || 'user'),
    content: String(merged.content || note || description || title).trim(),
    title,
    description,
    desc: String(merged.desc || description),
    note,
    message: String(merged.message || note),
    direction: String(merged.direction || ''),
    amount,
    price: amount,
    transferAmount: type === 'transfer' ? amount : Number(merged.transferAmount || 0),
    itemId: String(merged.itemId || merged.id || ''),
    itemName: String(merged.itemName || merged.name || title),
    itemDesc: String(merged.itemDesc || merged.itemDescription || description),
    itemDescription: String(merged.itemDescription || merged.itemDesc || description),
    itemEffect: String(merged.itemEffect || merged.effect || ''),
    itemPrice: Number(merged.itemPrice || amount),
    itemImage: image,
    image,
    imageBase64: image,
    characterId: String(merged.characterId || extra.characterId || ''),
    characterName: String(merged.characterName || extra.characterName || ''),
    characterAvatar: String(merged.characterAvatar || extra.characterAvatar || ''),
    card: {
      type,
      title,
      description,
      desc: String(merged.desc || description),
      note,
      amount,
      price: amount,
      transferAmount: type === 'transfer' ? amount : Number(merged.transferAmount || 0),
      direction: String(merged.direction || ''),
      image,
      itemImage: image
    },
    item: normalizedItem,
    shopItem: normalizedItem
  });
}

function normalizeNestedCard(value) {
  if (!value || typeof value !== 'object') return null;

  return cleanForDB({
    ...value,
    title: String(value.title || value.itemName || value.name || ''),
    description: String(value.description || value.desc || value.itemDesc || value.itemDescription || ''),
    desc: String(value.desc || value.description || value.itemDesc || ''),
    note: String(value.note || value.message || ''),
    amount: Number(value.amount || value.transferAmount || value.price || value.itemPrice || 0),
    price: Number(value.price || value.itemPrice || value.amount || value.transferAmount || 0),
    transferAmount: Number(value.transferAmount || value.amount || 0),
    itemId: String(value.itemId || value.id || ''),
    itemName: String(value.itemName || value.name || ''),
    itemDesc: String(value.itemDesc || value.itemDescription || value.description || ''),
    itemPrice: Number(value.itemPrice || value.price || 0),
    itemImage: String(value.itemImage || value.image || value.imageBase64 || ''),
    image: String(value.image || value.itemImage || value.imageBase64 || ''),
    imageBase64: String(value.imageBase64 || value.image || value.itemImage || '')
  });
}

async function saveMessage(state, message) {
  const store = getStoreName(state);
  const cleanMessage = cleanForDB(message);

  try {
    await setDB(store, cleanMessage);
  } catch (error) {
    console.error('save message failed', error);

    const fallback = buildFallbackMessage(state, cleanMessage);
    try {
      await setDB(store, fallback);
      showToast('内容有点大，先保存了精简版');
    } catch (fallbackError) {
      console.error('save fallback message failed', fallbackError);
      showToast('写入数据库失败');
      throw fallbackError;
    }
  }

  await refreshStateMessages(state);
  return cleanMessage;
}

function buildFallbackMessage(state, message) {
  const now = getNow();
  const fallback = {
    id: String(message.id || generateId('msg')),
    role: normalizeRole(message.role || 'user'),
    content: String(message.content || getPreviewText(message) || '[消息]').trim(),
    type: normalizeMessageType(message.type || 'text'),
    timestamp: String(message.timestamp || now),
    createdAt: String(message.createdAt || now),
    updatedAt: String(now),
    quoteMessageId: String(message.quoteMessageId || ''),
    quoteText: String(message.quoteText || ''),
    imageBase64: '',
    stickerId: String(message.stickerId || ''),
    stickerImageBase64: '',
    stickerDescription: String(message.stickerDescription || ''),
    transferAmount: Number(message.transferAmount || message.amount || 0),
    amount: Number(message.amount || message.transferAmount || message.price || message.itemPrice || 0),
    price: Number(message.price || message.itemPrice || message.amount || message.transferAmount || 0),
    note: String(message.note || ''),
    title: String(message.title || ''),
    description: String(message.description || message.desc || ''),
    desc: String(message.desc || message.description || ''),
    direction: String(message.direction || ''),
    itemId: String(message.itemId || ''),
    itemName: String(message.itemName || ''),
    itemDesc: String(message.itemDesc || message.itemDescription || ''),
    itemDescription: String(message.itemDescription || message.itemDesc || ''),
    itemEffect: String(message.itemEffect || ''),
    itemPrice: Number(message.itemPrice || message.price || 0),
    itemImage: '',
    image: '',
    cardType: String(message.cardType || ''),
    card: stripLargeImageFromCard(message.card),
    item: stripLargeImageFromCard(message.item),
    shopItem: stripLargeImageFromCard(message.shopItem),
    diceValue: Number(message.diceValue || 0),
    diceSides: Number(message.diceSides || 0),
    rpsChoice: String(message.rpsChoice || ''),
    rpsOpponentChoice: String(message.rpsOpponentChoice || ''),
    rpsOutcome: String(message.rpsOutcome || ''),
    rolling: Boolean(message.rolling),
    characterName: String(message.characterName || ''),
    characterAvatar: String(message.characterAvatar || ''),
    versionGroupId: String(message.versionGroupId || ''),
    versionStatus: String(message.versionStatus || 'active')
  };

  if (state.mode === 'group') {
    fallback.groupId = String(state.groupId || message.groupId || '');
    fallback.characterId = String(message.characterId || '');
  } else {
    fallback.characterId = String(state.characterId || message.characterId || '');
    fallback.groupId = '';
  }

  return cleanForDB(fallback);
}

function stripLargeImageFromCard(value) {
  if (!value || typeof value !== 'object') return null;

  return cleanForDB({
    ...value,
    image: '',
    itemImage: '',
    imageBase64: '',
    source: '',
    value: '',
    data: ''
  });
}

async function settleRollingMessage(state, messageId) {
  await wait(680);

  const store = getStoreName(state);
  const message = await getDB(store, messageId).catch(() => null);
  if (!message) return null;

  const next = cleanForDB({
    ...message,
    rolling: false,
    updatedAt: getNow()
  });

  await setDB(store, next);
  await refreshStateMessages(state);

  return next;
}

// ═══════════════════════════════════════
// 【AI调用】安全请求AI回复，动态加载
// ═══════════════════════════════════════

async function requestAIReplySafely(state, options = {}) {
  const fn = await getAIReplyFunction();

  if (typeof fn !== 'function') {
    state.aiGenerating = false;
    showToast('AI 回复模块还没接上');
    return null;
  }

  state.aiGenerating = true;

  try {
    return await fn(state, options);
  } catch (error) {
    console.error(error);
    showToast('TA 刚刚走神了');
    return null;
  } finally {
    state.aiGenerating = false;
  }
}

async function getAIReplyFunction() {
  if (requestThreadAIReplyFn) return requestThreadAIReplyFn;

  const mod = await import('./thread-ai.js').catch(() => null);
  requestThreadAIReplyFn = mod?.requestThreadAIReply || null;
  stopThreadAIReplyFn = mod?.stopThreadAIReply || stopThreadAIReplyFn;

  return requestThreadAIReplyFn;
}

async function getAIStopFunction() {
  if (stopThreadAIReplyFn) return stopThreadAIReplyFn;

  const mod = await import('./thread-ai.js').catch(() => null);
  requestThreadAIReplyFn = mod?.requestThreadAIReply || requestThreadAIReplyFn;
  stopThreadAIReplyFn = mod?.stopThreadAIReply || null;

  return stopThreadAIReplyFn;
}

// ═══════════════════════════════════════
// 【文本处理】引用、预览、复制、TTS文本
// ═══════════════════════════════════════

async function resolveQuoteText(state, messageId) {
  const id = String(messageId || '').trim();
  if (!id) return '';

  const local = getStateList(state).find((item) => item.id === id);
  if (local) return getPreviewText(local);

  const dbMessage = await getDB(getStoreName(state), id).catch(() => null);
  return dbMessage ? getPreviewText(dbMessage) : '';
}

function getPreviewText(message) {
  if (!message) return '';
  const type = normalizeMessageType(message.type || 'text');

  if (type === 'image') return String(message.content || '[图片]');
  if (type === 'sticker') return String(message.stickerDescription || message.content || '[表情包]');
  if (type === 'transfer') {
    const card = getCardSummary(message);
    return `[转账 ${formatAmount(card.amount || message.transferAmount)}]${card.note ? ` ${card.note}` : ''}`;
  }
  if (isLinkedCardType(type)) {
    const card = getCardSummary(message);
    return `[小卡片] ${card.title || message.content || '小物'}`;
  }
  if (type === 'voice') return `[语音] ${trimText(message.content || '', 40)}`;
  if (type === 'dice') return `[骰子 ${message.diceValue || ''}]`;
  if (type === 'rps') return `[石头剪刀布 ${getRpsLabel(message.rpsChoice)}]`;

  const text = String(message.content || '').trim();
  return trimText(text, 80);
}

function getCopyText(message) {
  if (!message) return '';
  const type = normalizeMessageType(message.type || 'text');

  if (type === 'image') return String(message.content || '[图片]');
  if (type === 'sticker') return String(message.stickerDescription || message.content || '[表情包]');
  if (type === 'transfer') {
    const card = getCardSummary(message);
    return `转账：${formatAmount(card.amount || message.transferAmount)}${card.note ? `，备注：${card.note}` : ''}`;
  }
  if (isLinkedCardType(type)) {
    const card = getCardSummary(message);
    return `${card.label}：${card.title}${card.amount ? `，金额：${formatAmount(card.amount)}` : ''}${card.note ? `，备注：${card.note}` : ''}${card.description ? `，说明：${card.description}` : ''}`;
  }
  if (type === 'voice') return `语音文字：${message.content || ''}`;
  if (type === 'dice') return `骰子：${message.diceValue || ''}`;
  if (type === 'rps') return `石头剪刀布：${getRpsLabel(message.rpsChoice)}${message.rpsOutcome ? `，结果：${message.rpsOutcome}` : ''}`;

  return String(message.content || '').trim();
}

function getTtsText(message) {
  if (!message) return '';
  const type = normalizeMessageType(message.type || 'text');

  if (type === 'dice') return `骰子摇到了 ${message.diceValue || ''}`;
  if (type === 'rps') return `石头剪刀布出了 ${getRpsLabel(message.rpsChoice)}`;
  if (type === 'transfer') {
    const card = getCardSummary(message);
    return `收到一条转账消息，金额 ${formatAmount(card.amount || message.transferAmount)}。${card.note || ''}`;
  }
  if (isLinkedCardType(type)) {
    const card = getCardSummary(message);
    return `${card.label}，${card.title}。${card.description || ''}${card.note ? `备注：${card.note}` : ''}`;
  }
  if (type === 'image') return String(message.content || '这是一张图片');
  if (type === 'sticker') return String(message.stickerDescription || message.content || '这是一个表情包');

  return String(message.content || '').trim();
}

function getCardSummary(message) {
  const source = normalizeCardPayload(message || {});
  const type = normalizeMessageType(source.type || message?.type || 'shop_item');

  return {
    type,
    label: type === 'gift' ? '礼物' : type === 'transfer' ? '转账' : '商品',
    title: source.title || source.itemName || message?.content || '小卡片',
    description: source.description || source.itemDesc || '',
    note: source.note || '',
    amount: Number(source.amount || source.transferAmount || source.price || source.itemPrice || 0)
  };
}

// ═══════════════════════════════════════
// 【数据同步】刷新state里的消息列表
// ═══════════════════════════════════════

async function refreshStateMessages(state) {
  const store = getStoreName(state);

  if (state.mode === 'group') {
    const list = await getByIndexDB(store, 'groupId', state.groupId).catch(() => []);
    state.groupMessages = normalizeList(list).map(cleanForDB).sort(sortByTimestamp);
    return state.groupMessages;
  }

  const list = await getByIndexDB(store, 'characterId', state.characterId).catch(() => []);
  state.messages = normalizeList(list).map(cleanForDB).sort(sortByTimestamp);
  return state.messages;
}

// ═══════════════════════════════════════
// 【通用工具】清理、规范化、格式化
// ═══════════════════════════════════════

function cleanForDB(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanForDB(item)).filter((item) => item !== undefined);
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'undefined') return undefined;
    if (typeof value === 'function') return undefined;
    if (typeof value === 'symbol') return undefined;
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const result = {};

  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'undefined') return;
    if (typeof item === 'function') return;
    if (typeof item === 'symbol') return;

    if (item instanceof Date) {
      result[key] = item.toISOString();
      return;
    }

    if (item && typeof item === 'object') {
      const clean = cleanForDB(item);
      if (clean !== undefined) result[key] = clean;
      return;
    }

    result[key] = item;
  });

  return result;
}

function clearQuote(state) {
  state.quotedMessageId = '';
}

function getStoreName(state) {
  return state.mode === 'group' ? 'group_messages' : 'messages';
}

function getStateList(state) {
  return state.mode === 'group' ? normalizeList(state.groupMessages) : normalizeList(state.messages);
}

function canEditMessage(message) {
  return ['text', 'voice', 'sticker'].includes(normalizeMessageType(message?.type || 'text'));
}

function normalizeMessageType(type) {
  const value = String(type || 'text').trim().toLowerCase();

  if (value === 'shop-item') return 'shop_item';

  if ([
    'text',
    'voice',
    'sticker',
    'image',
    'transfer',
    'gift',
    'shop_item',
    'purchase',
    'item',
    'dice',
    'rps'
  ].includes(value)) {
    return value;
  }

  return 'text';
}

function isLinkedCardType(type) {
  return ['gift', 'shop_item', 'purchase', 'item'].includes(normalizeMessageType(type));
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
}

function normalizeRole(role) {
  return role === 'assistant' ? 'assistant' : 'user';
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function rollDice(sides = 6) {
  return Math.floor(Math.random() * sides) + 1;
}

function randomRpsChoice() {
  const list = ['rock', 'paper', 'scissors'];
  return list[Math.floor(Math.random() * list.length)];
}

function normalizeRpsChoice(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['rock', 'stone', '石头'].includes(text)) return 'rock';
  if (['paper', '布'].includes(text)) return 'paper';
  if (['scissors', 'scissor', '剪刀'].includes(text)) return 'scissors';
  return '';
}

function getRpsOutcome(choice, opponentChoice) {
  if (!choice || !opponentChoice) return '';
  if (choice === opponentChoice) return 'draw';

  if (
    (choice === 'rock' && opponentChoice === 'scissors') ||
    (choice === 'scissors' && opponentChoice === 'paper') ||
    (choice === 'paper' && opponentChoice === 'rock')
  ) {
    return 'win';
  }

  return 'lose';
}

function getRpsLabel(choice) {
  if (choice === 'rock') return '石头';
  if (choice === 'paper') return '布';
  if (choice === 'scissors') return '剪刀';
  return '未知';
}

function getSpeakerName(character) {
  return character?.name || 'TA';
}

function formatAmount(amount) {
  const number = Number(amount || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(2);
}

function trimText(text, max) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// 改了什么：1) regenerateThreadMessage 不删旧消息，标记 archived + versionGroupId；2) 新增 switchThreadVersion 翻页；3) 新增 getVersionInfo；4) deleteThreadMessage 连带删除同版本组；5) buildBaseMessage/buildFallbackMessage 加 versionGroupId/versionStatus；6) 修复 getCopyText 里 '翻账' → 'transfer'；7) 修复 getCardSummary 里 'notes' → 'note'。
// 依赖：../../core/storage.js(generateId,getNow,setDB,getDB,deleteDB,getByIndexDB)；../../core/ui.js(showToast)；../../core/tts.js(playTTS,stopAll)；动态依赖 ./thread-ai.js(requestThreadAIReply,stopThreadAIReply)
