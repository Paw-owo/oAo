// apps/chat/thread.js
// imports:
//   from '../../core/storage.js': getData, setData, getDB, getByIndexDB
//   from '../../core/ui.js': createIcon, showToast, hideBottomSheet
//   from '../../core/tts.js': stopAll
//   from './thread-render.js': renderThreadMessages
//   from './thread-actions.js': sendThreadMessage, stopThreadAIReply
//   from './thread-stickers.js': openStickerSheet, closeStickerSheet
//   from './thread-panels.js': openThreadToolsPanel, closeThreadPanels
//   from './thread-relationship.js': loadRelationshipState, getRelationshipLockLevel, getRelationshipStatusText, createRelationshipLockBar, openRelationshipLockSheet
//   from './thread-ai.js': checkThreadProactiveMessages
//   from './thread-settings.js': mountThreadSettings, unmountThreadSettings

import { getData, setData, getDB, getByIndexDB } from '../../core/storage.js';
import { createIcon, showToast, hideBottomSheet } from '../../core/ui.js';
import { stopAll } from '../../core/tts.js';

import { renderThreadMessages } from './thread-render.js';
import { sendThreadMessage, stopThreadAIReply } from './thread-actions.js';
import { openStickerSheet, closeStickerSheet } from './thread-stickers.js';
import { openThreadToolsPanel, closeThreadPanels } from './thread-panels.js';
import {
  loadRelationshipState,
  getRelationshipLockLevel,
  getRelationshipStatusText,
  createRelationshipLockBar,
  openRelationshipLockSheet
} from './thread-relationship.js';
import { checkThreadProactiveMessages } from './thread-ai.js';
import { mountThreadSettings, unmountThreadSettings } from './thread-settings.js';

const STYLE_ID = 'chat-thread-style';
const PAGE_SIZE = 50;
const PROACTIVE_CHECK_INTERVAL = 10 * 60 * 1000;
const DRAFT_KEY = 'chat_draft_map';

const state = {
  rootEl: null,
  appState: null,
  mounted: false,
  mode: 'private',
  characterId: '',
  groupId: '',
  character: null,
  group: null,
  messages: [],
  groupMessages: [],
  visibleCount: PAGE_SIZE,
  quotedMessageId: '',
  inputValue: '',
  searchOpen: false,
  searchValue: '',
  aiGenerating: false,
  stoppingAI: false,
  messageQueue: [],
  proactiveTimer: null,
  proactiveChecking: false,
  keyboardOpen: false,
  keyboardOffset: 0,
  keyboardViewportHandler: null,
  relationshipLock: null,
  relationshipPunishment: null,
  activeTtsMessageId: '',
  activeTts: false,
  displayMode: 'bubble',
  reloadAndRender: null,
  renderOnly: null,
  wallpaperImage: '',
  wallpaperOpacity: 1
};

// ═══════════════════════════════════════
// 【草稿持久化】私聊按 characterId，群聊按 groupId，互不串扰
// ═══════════════════════════════════════

function loadDraftMap() {
  const saved = getData(DRAFT_KEY);
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

function saveDraftMap(map) {
  setData(DRAFT_KEY, map);
}

function getDraftKey() {
  if (state.mode === 'group') {
    const id = String(state.groupId || '').trim();
    return id ? `group:${id}` : '';
  }
  const id = String(state.characterId || '').trim();
  return id ? `private:${id}` : '';
}

function restoreDraft() {
  const key = getDraftKey();
  if (!key) {
    state.inputValue = '';
    return;
  }
  const map = loadDraftMap();
  state.inputValue = String(map[key] || '');
}

function persistDraft() {
  const key = getDraftKey();
  if (!key) return;
  const map = loadDraftMap();
  const text = String(state.inputValue || '');
  if (text) {
    map[key] = text;
  } else if (Object.prototype.hasOwnProperty.call(map, key)) {
    delete map[key];
  }
  saveDraftMap(map);
}

function clearDraft() {
  const key = getDraftKey();
  if (!key) return;
  const map = loadDraftMap();
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    delete map[key];
    saveDraftMap(map);
  }
}

export async function mountChatThread(containerEl, options = {}) {
  state.rootEl = containerEl;
  state.appState = options.appState || null;
  state.mounted = true;
  state.mode = options.mode === 'group' ? 'group' : 'private';
  state.characterId = String(options.characterId || '').trim();
  state.groupId = String(options.groupId || '').trim();
  // 全局活动会话标识：供 chat-event-bridge / 未读递增判断“用户是否正在该会话”
  window.__chatActiveThread = { mode: state.mode, characterId: state.characterId, groupId: state.groupId };
  state.visibleCount = loadVisibleCount();
  state.quotedMessageId = '';
  state.inputValue = '';
  state.searchOpen = false;
  state.searchValue = '';
  state.aiGenerating = false;
  state.stoppingAI = false;
  state.messageQueue = [];
  state.proactiveChecking = false;
  state.keyboardOpen = false;
  state.keyboardOffset = 0;
  state.relationshipLock = null;
  state.relationshipPunishment = null;
  state.activeTtsMessageId = '';
  state.activeTts = false;
  state.displayMode = resolveDisplayMode();
  state.reloadAndRender = reloadAndRender;
  state.renderOnly = () => { if (state.rootEl && state.mounted) render(); };
  state.wallpaperImage = '';
  state.wallpaperOpacity = 1;

  restoreDraft();

  injectStyle();
  setupKeyboardViewport();

  await loadThreadData();
  await loadWallpaperCache();

  if (state.mode === 'private') {
    await loadRelationshipState(state);
  }

  render();
  startProactiveChecks();
}

export function unmountChatThread() {
  state.mounted = false;
  state.aiGenerating = false;
  state.stoppingAI = false;
  state.messageQueue = [];
  window.__chatActiveThread = null;

  stopAll();
  stopProactiveChecks();
  cleanupKeyboardViewport();
  closeStickerSheet();
  closeThreadPanels();
  hideBottomSheet();

  if (state.rootEl) {
    state.rootEl.replaceChildren();
  }

  state.rootEl = null;
  state.appState = null;
  state.character = null;
  state.group = null;
  state.messages = [];
  state.groupMessages = [];
  state.quotedMessageId = '';
  state.inputValue = '';
  state.searchOpen = false;
  state.searchValue = '';
  state.relationshipLock = null;
  state.relationshipPunishment = null;
  state.reloadAndRender = null;
  state.renderOnly = null;
  state.wallpaperImage = '';
  state.wallpaperOpacity = 1;
}

function openSettingsPage() {
  const containerEl = state.rootEl;
  const savedAppState = state.appState;
  const savedCharacterId = state.characterId;
  const savedMode = state.mode;
  const savedGroupId = state.groupId;

  unmountChatThread();

  mountThreadSettings(containerEl, {
    characterId: savedCharacterId,
    appState: {
      goThread: () => {
        unmountThreadSettings();
        mountChatThread(containerEl, {
          appState: savedAppState,
          characterId: savedCharacterId,
          groupId: savedGroupId,
          mode: savedMode
        });
      }
    }
  });
}

async function loadThreadData() {
  state.displayMode = resolveDisplayMode();

  if (state.mode === 'group') {
    state.group = state.groupId ? await getDB('groups', state.groupId).catch(() => null) : null;
    state.groupMessages = normalizeList(await getByIndexDB('group_messages', 'groupId', state.groupId).catch(() => []))
      .sort(sortByTimestamp);
    state.messages = [];
    state.relationshipLock = null;
    state.relationshipPunishment = null;
    return;
  }

  state.character = state.characterId ? await getDB('characters', state.characterId).catch(() => null) : null;
  state.messages = normalizeList(await getByIndexDB('messages', 'characterId', state.characterId).catch(() => []))
    .sort(sortByTimestamp);
  state.groupMessages = [];
}

function loadVisibleCount() {
  const count = Number(getData(getVisibleCountKey()));
  if (!Number.isFinite(count) || count < 12) return PAGE_SIZE;
  return Math.floor(count);
}

function saveVisibleCount(count) {
  state.visibleCount = Math.max(12, Math.floor(Number(count) || PAGE_SIZE));
  setData(getVisibleCountKey(), state.visibleCount);
}

async function loadWallpaperCache() {
  state.wallpaperImage = '';
  state.wallpaperOpacity = 1;

  if (!state.characterId) return;

  const blobKey = `app_bg_chat_${state.characterId}`;
  try {
    const record = await getDB('blobs', blobKey);
    if (!record) return;
    const image = record.value || record.image || '';
    if (!image) return;
    const opacityKey = `app_bg_chat_opacity_${state.characterId}`;
    const raw = Number(getData(opacityKey) ?? record.opacity ?? 100);
    state.wallpaperImage = image;
    state.wallpaperOpacity = Math.max(0, Math.min(100, raw)) / 100;
  } catch {
  }
}

function render() {
  if (!state.rootEl || !state.mounted) return;

  const page = el('section', `chat-page chat-thread-page mode-${state.displayMode}`);
  page.dataset.keyboard = state.keyboardOpen ? 'true' : 'false';
  page.dataset.locked = getRelationshipLockLevel(state) ? 'true' : 'false';
  page.dataset.aiGenerating = isAIWorking() ? 'true' : 'false';
  page.style.setProperty('--chat-keyboard-offset', `${state.keyboardOffset}px`);

  if (state.wallpaperImage) {
    const bg = el('div', 'chat-thread-wallpaper');
    bg.style.backgroundImage = `url(${state.wallpaperImage})`;
    bg.style.opacity = String(state.wallpaperOpacity);
    page.append(bg);
  }

  page.append(createHeader());

  if (state.searchOpen) {
    page.append(createSearchCard());
  }

  page.append(createMessageArea(), createInputBar());
  state.rootEl.replaceChildren(page);

  renderThreadMessages(state, page);
  renderLoadMoreButton(page);
}

async function reloadAndRender() {
  await loadThreadData();
  await loadWallpaperCache();

  if (state.mode === 'private') {
    await loadRelationshipState(state);
  }

  render();
}

function createHeader() {
  const header = el('header', 'chat-thread-header');

  const back = iconButton('back', '返回');
  back.addEventListener('click', () => {
    stopAll();
    state.appState?.goList?.({ tab: state.mode === 'group' ? 'group' : 'private' });
  });

  const title = el('button', 'chat-thread-title-wrap');
  title.type = 'button';
  title.append(
    createAvatar(getTargetAvatar(), getTargetName()),
    createTitleText()
  );
  title.addEventListener('click', () => openSettingsPage());

  const actions = el('div', 'chat-thread-header-actions');

  if (state.mode === 'private') {
    const memory = iconButton('memory', '记忆');
    memory.addEventListener('click', () => {
      state.appState?.openMemory?.(state.characterId, {
        fromRoute: state.appState?.getRoute?.()
      });
    });
    actions.append(memory);
  }

  const search = iconButton('search', '搜索');
  search.classList.toggle('is-active', state.searchOpen);
  search.addEventListener('click', () => {
    state.searchOpen = !state.searchOpen;
    if (!state.searchOpen) state.searchValue = '';
    render();
  });

  const settings = iconButton('settings', '设置');
  settings.addEventListener('click', () => openSettingsPage());

  actions.append(search, settings);
  header.append(back, title, actions);
  return header;
}

function createTitleText() {
  const wrap = el('div', 'chat-thread-title-text');
  wrap.append(
    el('div', 'chat-thread-name', getTargetName()),
    el('div', 'chat-thread-status', getStatusText())
  );
  return wrap;
}

function createSearchCard() {
  const wrap = el('section', 'chat-thread-search-card');

  const input = document.createElement('input');
  input.className = 'chat-thread-search-input';
  input.type = 'text';
  input.value = state.searchValue || '';
  input.placeholder = '搜聊天内容';
  input.autocomplete = 'off';
  input.setAttribute('spellcheck', 'false');

  input.addEventListener('input', () => {
    state.searchValue = input.value.trim();
    refreshMessageAreaOnly();
  });

  input.addEventListener('focus', handleComposerFocus);
  input.addEventListener('blur', handleComposerBlur);

  const close = iconButton('close', '关闭搜索');
  close.addEventListener('click', () => {
    state.searchOpen = false;
    state.searchValue = '';
    blurActiveInput();
    render();
  });

  wrap.append(input, close);

  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  return wrap;
}

function refreshMessageAreaOnly() {
  const page = state.rootEl?.querySelector?.('.chat-thread-page');
  if (!page) {
    render();
    return;
  }

  const oldArea = page.querySelector('.chat-thread-area');
  if (!oldArea) {
    render();
    return;
  }

  const nextArea = createMessageArea();
  oldArea.replaceWith(nextArea);
  renderThreadMessages(state, page);
  renderLoadMoreButton(page);
}

function createMessageArea() {
  const area = el('main', 'chat-thread-area');
  const list = el('div', 'chat-thread-list');
  list.id = 'chat-thread-list';

  area.addEventListener('pointerdown', handleBlankAreaPointerDown);
  area.append(list);
  return area;
}

function renderLoadMoreButton(page) {
  const list = page.querySelector('#chat-thread-list');
  if (!list) return;

  const old = list.querySelector('.chat-load-more-wrap');
  if (old) old.remove();

  const all = getAllCurrentMessages();
  if (state.searchValue || all.length <= state.visibleCount) return;

  const hidden = all.length - state.visibleCount;
  const wrap = el('div', 'chat-load-more-wrap');
  const btn = el('button', 'chat-load-more-btn', `还有 ${hidden} 条旧消息`);
  btn.type = 'button';
  btn.addEventListener('click', () => {
    saveVisibleCount(state.visibleCount + PAGE_SIZE);
    render();
  });
  wrap.append(btn);
  list.prepend(wrap);
}

function createInputBar() {
  const bar = el('footer', 'chat-thread-input-bar');

  if (getRelationshipLockLevel(state)) {
    bar.classList.add('is-relationship-locked');
    bar.append(createRelationshipLockBar(state, { onRefresh: reloadAndRender }));
    return bar;
  }

  const tools = iconButton('add', '工具');
  tools.addEventListener('click', () => openThreadToolsPanel(state, {}));

  const input = document.createElement('textarea');
  input.className = 'chat-thread-input';
  input.rows = 1;
  input.value = state.inputValue || '';
  input.placeholder = isAIWorking()
    ? 'TA 正在回复，发的话会排队等 TA'
    : '慢慢说';
  input.disabled = state.stoppingAI;
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.autocorrect = 'off';
  input.spellcheck = false;
  input.enterKeyHint = 'send';

  input.addEventListener('input', () => {
    state.inputValue = input.value;
    persistDraft();
    autoResize(input);
  });

  input.addEventListener('focus', handleComposerFocus);
  input.addEventListener('blur', handleComposerBlur);

  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      await handleSend(input);
    }
  });

  const sticker = iconButton('smile', '表情包');
  sticker.addEventListener('click', () => openStickerSheet(state, { onRefresh: reloadAndRender }));

  const send = el('button', 'chat-thread-send');
  send.type = 'button';

  if (isAIWorking()) {
    send.classList.add('is-ai-working');
    send.append(createIcon('stop', 16));
    send.setAttribute('aria-label', '停止回复');
    send.disabled = state.stoppingAI;
    send.addEventListener('click', () => handleStopAI());
  } else {
    send.append(createIcon('send', 16));
    send.setAttribute('aria-label', '发送');
    send.addEventListener('click', () => handleSend(input));
  }

  bar.append(tools, input, sticker, send);
  requestAnimationFrame(() => autoResize(input));
  return bar;
}

async function handleSend(input) {
  const text = String(input.value || '').trim();
  if (!text) return;

  if (getRelationshipLockLevel(state)) {
    openRelationshipLockSheet(state, { onRefresh: reloadAndRender });
    return;
  }

  // AI 正在回复：消息排队，不打断
  if (isAIWorking()) {
    state.inputValue = '';
    input.value = '';
    autoResize(input);
    clearDraft();

    try {
      const { saveMessageOnly } = await import('./thread-actions.js').catch(() => ({}));

      if (typeof saveMessageOnly === 'function') {
        await saveMessageOnly(state, text, {
          quoteMessageId: state.quotedMessageId
        });
      } else {
        await sendThreadMessage(state, text, { triggerAI: false });
      }

      state.quotedMessageId = '';
      state.messageQueue.push(text);
      render();
      showToast('排队中，等 TA 回完就接着');
    } catch (error) {
      console.error('[chat-thread] queue message failed', error);
      showToast('发送没成功');
    }
    return;
  }

  // 正常发送
  state.inputValue = '';
  input.value = '';
  autoResize(input);
  blurActiveInput();
  clearDraft();

  try {
    const { saveMessageOnly } = await import('./thread-actions.js').catch(() => ({}));

    if (typeof saveMessageOnly === 'function') {
      await saveMessageOnly(state, text, {
        quoteMessageId: state.quotedMessageId
      });
    } else {
      await sendThreadMessage(state, text, { triggerAI: false });
    }

    state.quotedMessageId = '';
    render();
  } catch (error) {
    console.error('[chat-thread] save user message failed', error);
    showToast('发送没成功');
    return;
  }

  state.aiGenerating = true;
  render();

  try {
    await sendThreadMessage(state, '', { triggerAI: true, skipSave: true });
  } catch (error) {
    console.error('[chat-thread] AI reply failed', error);
    showToast('TA 刚刚走神了');
  } finally {
    state.aiGenerating = false;

    // 如果有排队的消息，循环处理直到队列清空
    while (state.messageQueue.length > 0 && state.mounted) {
      state.messageQueue = [];
      state.aiGenerating = true;
      render();
      try {
        await sendThreadMessage(state, '', { triggerAI: true, skipSave: true });
      } catch (error) {
        console.error('[chat-thread] queued AI reply failed', error);
        showToast('TA 刚刚走神了');
        break;
      } finally {
        state.aiGenerating = false;
      }
    }

    render();
  }
}

async function handleStopAI() {
  if (state.stoppingAI) return;

  state.stoppingAI = true;
  state.messageQueue = [];
  render();

  try {
    await stopThreadAIReply(state, { message: '我先停在这里了。' });
  } catch (error) {
    console.error('[chat-thread] stop failed', error);
  } finally {
    state.stoppingAI = false;
    state.aiGenerating = false;
    await reloadAndRender();
  }
}

function isAIWorking() {
  if (state.aiGenerating || state.stoppingAI) return true;
  return getAllCurrentMessages().some((item) => item?.role === 'assistant' && item?.isPending);
}

function startProactiveChecks() {
  stopProactiveChecks();
  if (state.mode === 'group') return;

  window.setTimeout(() => runProactiveCheck(), 3000);
  state.proactiveTimer = window.setInterval(runProactiveCheck, PROACTIVE_CHECK_INTERVAL);

  document.addEventListener('visibilitychange', handleProactiveVisible);
  window.addEventListener('focus', handleProactiveVisible);
}

function stopProactiveChecks() {
  if (state.proactiveTimer) {
    window.clearInterval(state.proactiveTimer);
    state.proactiveTimer = null;
  }

  document.removeEventListener('visibilitychange', handleProactiveVisible);
  window.removeEventListener('focus', handleProactiveVisible);
}

function handleProactiveVisible() {
  if (!state.mounted || state.mode === 'group') return;
  window.setTimeout(() => {
    if (state.mounted) runProactiveCheck();
  }, 3000);
}

async function runProactiveCheck() {
  if (!state.mounted || state.mode === 'group') return;
  if (getRelationshipLockLevel(state) || state.proactiveChecking || isAIWorking()) return;

  state.proactiveChecking = true;

  try {
    const message = await checkThreadProactiveMessages(state, { incrementUnread: false });
    if (message) {
      await reloadAndRender();
    }
  } catch (error) {
    console.error('[chat-thread] proactive check failed', error);
  } finally {
    state.proactiveChecking = false;
  }
}

function setupKeyboardViewport() {
  cleanupKeyboardViewport();
  state.keyboardViewportHandler = () => updateKeyboardViewport();

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', state.keyboardViewportHandler);
    window.visualViewport.addEventListener('scroll', state.keyboardViewportHandler);
  }

  window.addEventListener('resize', state.keyboardViewportHandler);
  updateKeyboardViewport();
}

function cleanupKeyboardViewport() {
  if (state.keyboardViewportHandler) {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', state.keyboardViewportHandler);
      window.visualViewport.removeEventListener('scroll', state.keyboardViewportHandler);
    }

    window.removeEventListener('resize', state.keyboardViewportHandler);
    state.keyboardViewportHandler = null;
  }

  state.keyboardOpen = false;
  state.keyboardOffset = 0;
  document.documentElement.style.removeProperty('--chat-keyboard-offset');
}

function updateKeyboardViewport() {
  if (!state.mounted) return;

  const viewport = window.visualViewport;
  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const visualHeight = viewport?.height || layoutHeight;
  const visualTop = viewport?.offsetTop || 0;
  const offset = Math.max(0, layoutHeight - visualHeight - visualTop);

  state.keyboardOffset = offset > 80 ? Math.round(offset) : 0;
  state.keyboardOpen = state.keyboardOffset > 0 || isInputFocused();

  document.documentElement.style.setProperty('--chat-keyboard-offset', `${state.keyboardOffset}px`);

  const page = state.rootEl?.querySelector?.('.chat-thread-page');
  if (page) {
    page.dataset.keyboard = state.keyboardOpen ? 'true' : 'false';
    page.style.setProperty('--chat-keyboard-offset', `${state.keyboardOffset}px`);
  }
}

function handleComposerFocus() {
  state.keyboardOpen = true;
  window.setTimeout(updateKeyboardViewport, 40);
  window.setTimeout(updateKeyboardViewport, 260);
}

function handleComposerBlur() {
  window.setTimeout(() => {
    state.keyboardOpen = isInputFocused();
    if (!state.keyboardOpen) state.keyboardOffset = 0;
    updateKeyboardViewport();
  }, 80);
}

function getStatusText() {
  if (isAIWorking()) {
    if (state.messageQueue.length > 0) {
      return `正在回复（还有 ${state.messageQueue.length} 条排队）`;
    }
    return '正在输入';
  }

  if (state.mode === 'group') {
    return `${normalizeList(state.group?.memberIds).length} 个成员`;
  }

  const locked = getRelationshipStatusText(state);
  if (locked) return locked;

  const last = state.messages[state.messages.length - 1];
  if (!last) return '还没有聊天记录';

  const time = new Date(last.timestamp || last.createdAt || 0).getTime();
  if (!time) return '在线';

  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;

  if (diff < minute) return '刚刚在线';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)}小时前`;
  return '今天来过';
}

function handleBlankAreaPointerDown(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  if (target.closest(
    'button, input, textarea, select, a, [role="button"], .chat-message-row, .chat-thread-input-bar, .bottom-sheet, .sheet-overlay'
  )) {
    return;
  }

  blurActiveInput();
}

function blurActiveInput() {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  ) {
    active.blur();
  }
}

function isInputFocused() {
  const active = document.activeElement;
  return Boolean(
    state.rootEl &&
    active instanceof Element &&
    state.rootEl.contains(active) &&
    (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    )
  );
}

function getAllCurrentMessages() {
  return state.mode === 'group' ? state.groupMessages : state.messages;
}

function getTargetName() {
  return state.mode === 'group' ? state.group?.name || '群聊' : state.character?.name || '聊天';
}

function getTargetAvatar() {
  return state.mode === 'group' ? state.group?.avatar || '' : state.character?.avatar || '';
}

function createAvatar(src, name) {
  const avatar = el('span', 'chat-thread-avatar');

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.append(img);
  } else {
    avatar.textContent = getInitial(name);
  }

  return avatar;
}

function resolveDisplayMode() {
  const settings = getData('app_settings') || {};
  return settings.bubbleMode === 'dialog' ? 'dialog' : 'bubble';
}

function getVisibleCountKey() {
  if (state.mode === 'group') return `chat_group_${state.groupId}_visible_count`;
  return state.characterId ? `chat_${state.characterId}_visible_count` : 'chat_visible_count_default';
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(132, textarea.scrollHeight)}px`;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || a?.createdAt || '').localeCompare(String(b?.timestamp || b?.createdAt || ''));
}

function iconButton(iconName, label) {
  const button = el('button', 'chat-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.append(createIcon(iconName, 18));
  return button;
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .chat-thread-page{
      --chat-keyboard-offset:0px;
      position:relative;
      height:calc(100dvh - var(--chat-keyboard-offset,0px));
      max-height:calc(100dvh - var(--chat-keyboard-offset,0px));
      display:flex;
      flex-direction:column;
      overflow:hidden;
      background:var(--bg-primary);
      color:var(--text-primary);
      transition:height 200ms ease, max-height 200ms ease;
    }

    .chat-thread-wallpaper{
      position:absolute;
      inset:0;
      z-index:0;
      background-size:cover;
      background-position:center;
      background-repeat:no-repeat;
      pointer-events:none;
    }

    .chat-thread-page > :not(.chat-thread-wallpaper){
      position:relative;
      z-index:1;
    }

    .chat-thread-header{
      flex:0 0 auto;
      min-height:62px;
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      padding:12px 20px 10px;
      background:color-mix(in srgb, var(--bg-primary) 92%, transparent);
      backdrop-filter:blur(18px);
      z-index:3;
    }

    .chat-icon-btn, .chat-thread-send{
      width:44px;
      height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
    }

    .chat-icon-btn:active, .chat-thread-send:active{
      transform:scale(.96);
    }

    .chat-icon-btn.is-active{
      color:var(--accent);
    }

    .chat-thread-title-wrap{
      min-width:0;
      display:inline-flex;
      align-items:center;
      gap:10px;
      background:transparent;
      color:inherit;
      text-align:left;
    }

    .chat-thread-avatar{
      width:38px;
      height:38px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      border-radius:999px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
      font-size:14px;
      font-weight:600;
      flex:0 0 auto;
    }

    .chat-thread-avatar img{
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .chat-thread-title-text{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:2px;
    }

    .chat-thread-name{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    .chat-thread-status{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .chat-thread-header-actions{
      display:flex;
      align-items:center;
      justify-content:flex-end;
      gap:8px;
    }

    .chat-thread-search-card{
      flex:0 0 auto;
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:8px;
      padding:0 20px 12px;
    }

    .chat-thread-search-input{
      width:100%;
      min-height:44px;
      padding:0 12px;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:16px;
      line-height:1.6;
    }

    .chat-thread-area{
      flex:1 1 auto;
      min-height:0;
      overflow:hidden;
      padding:0 20px 12px;
    }

    .chat-thread-list{
      height:100%;
      overflow-y:auto;
      overflow-x:hidden;
      display:flex;
      flex-direction:column;
      gap:10px;
      padding-bottom:18px;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
    }

    .chat-thread-input-bar{
      flex:0 0 auto;
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto auto;
      align-items:end;
      gap:8px;
      padding:12px 20px calc(14px + env(safe-area-inset-bottom));
      background:color-mix(in srgb, var(--bg-primary) 90%, transparent);
      backdrop-filter:blur(18px);
      z-index:3;
    }

    .chat-thread-input-bar.is-relationship-locked{
      display:block;
    }

    .chat-thread-input{
      width:100%;
      min-height:44px;
      resize:none;
      padding:10px 12px;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:16px;
      line-height:1.6;
      -webkit-appearance:none;
      appearance:none;
    }

    .chat-thread-input:disabled{
      opacity:.75;
    }

    .chat-thread-send{
      background:var(--accent);
      color:var(--bubble-user-text);
    }

    .chat-thread-send.is-ai-working{
      animation:chatThreadPulse 1100ms ease-in-out infinite;
    }

    .chat-load-more-wrap{
      display:flex;
      justify-content:center;
      padding:4px 0 8px;
    }

    .chat-load-more-btn{
      min-height:34px;
      padding:0 14px;
      border-radius:999px;
      background:var(--bg-card);
      color:var(--text-secondary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:12px;
      transition:all 200ms ease;
    }

    .chat-load-more-btn:active{
      transform:scale(.96);
    }

    @keyframes chatThreadPulse{
      0%, 100%{ transform:scale(1); opacity:1 }
      50%{ transform:scale(.97); opacity:.82 }
    }

    @media(max-width:680px){
      .chat-thread-header, .chat-thread-search-card, .chat-thread-area, .chat-thread-input-bar{
        padding-left:20px;
        padding-right:20px;
      }
    }

    @media(max-width:430px){
      .chat-thread-avatar{ width:34px; height:34px }
      .chat-thread-status{ max-width:128px }
    }

    @media(prefers-reduced-motion:reduce){
      .chat-thread-page, .chat-icon-btn, .chat-thread-send, .chat-load-more-btn{
        animation:none;
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：handleSend 的 finally 块从 if 改成 while 循环，每次循环清空 messageQueue 再触发 AI 回复，确保排队消息全部处理完。
// 依赖：../../core/storage.js(getData,setData,getDB,getByIndexDB)；../../core/ui.js(createIcon,showToast,hideBottomSheet)；../../core/tts.js(stopAll)；./thread-render.js(renderThreadMessages)；./thread-actions.js(sendThreadMessage,stopThreadAIReply)；./thread-stickers.js(openStickerSheet,closeStickerSheet)；./thread-panels.js(openThreadToolsPanel,closeThreadPanels)；./thread-relationship.js(loadRelationshipState,getRelationshipLockLevel,getRelationshipStatusText,createRelationshipLockBar,openRelationshipLockSheet)；./thread-ai.js(checkThreadProactiveMessages)；./thread-settings.js(mountThreadSettings,unmountThreadSettings)
