// apps/chat/list.js
// imports:
//   from '../../core/storage.js': getData, setData, generateId, getNow, setDB, getAllDB, getByIndexDB, deleteDB
//   from '../../core/ui.js': createIcon, showToast, showConfirm, showBottomSheet, hideBottomSheet
//   from './thread-ai.js': checkThreadProactiveMessages

import {
  getData,
  setData,
  generateId,
  getNow,
  setDB,
  getAllDB,
  getByIndexDB,
  deleteDB
} from '../../core/storage.js';

import {
  createIcon,
  showToast,
  showConfirm,
  showBottomSheet,
  hideBottomSheet
} from '../../core/ui.js';

import { checkThreadProactiveMessages } from './thread-ai.js';
import { addMemory } from '../../core/memory.js';
import { getActiveRelationshipLock } from './thread-relationship.js';

const LIST_STYLE_ID = 'chat-list-style';
const HIDDEN_PRIVATE_KEY = 'chat_hidden_private_threads';
const PRIVATE_UNREAD_KEY = 'chat_unread_counts';
const GROUP_UNREAD_KEY = 'chat_group_unread_counts';
const LAST_ROUTE_KEY = 'chat_last_route';
const PROACTIVE_CHECK_INTERVAL = 60 * 1000;

const state = {
  rootEl: null,
  appState: null,
  mounted: false,
  tab: 'private',
  search: '',
  privateItems: [],
  groupItems: [],
  proactiveTimer: null,
  proactiveChecking: false
};

// ═══════════════════════════════════════
// 【公开接口】挂载和卸载聊天列表
// ═══════════════════════════════════════

export async function mountChatList(containerEl, options = {}) {
  state.rootEl = containerEl;
  state.appState = options.appState || null;
  state.mounted = true;
  state.tab = options.tab === 'group' ? 'group' : 'private';
  state.search = String(options.search || '').trim();
  state.proactiveChecking = false;

  injectStyle();
  await loadItems();
  render();
  startProactiveChecks();
}

export function unmountChatList() {
  state.mounted = false;
  stopProactiveChecks();

  if (state.rootEl) {
    state.rootEl.replaceChildren();
  }

  state.rootEl = null;
  state.appState = null;
  state.privateItems = [];
  state.groupItems = [];
}

// ═══════════════════════════════════════
// 【主动消息】列表页定时检查，触发AI主动发消息
// ═══════════════════════════════════════

function startProactiveChecks() {
  stopProactiveChecks();
  window.setTimeout(() => runProactiveChecks(), 1200);
  state.proactiveTimer = window.setInterval(runProactiveChecks, PROACTIVE_CHECK_INTERVAL);
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
  if (!state.mounted) return;
  runProactiveChecks();
}

async function runProactiveChecks() {
  if (!state.mounted || state.proactiveChecking) return;
  if (document.visibilityState !== 'visible') return;

  state.proactiveChecking = true;
  let hadNewMessage = false;

  try {
    const characters = state.privateItems.map((item) => item.raw).filter(Boolean);

    for (const character of characters) {
      if (!state.mounted) break;

      try {
        const minimalState = {
          mode: 'private',
          characterId: character.id,
          character,
          messages: [],
          aiGenerating: false,
          isSending: false
        };

        const result = await checkThreadProactiveMessages(minimalState, { incrementUnread: true });
        if (result) hadNewMessage = true;
      } catch (_) {
        /* 跳过单个角色的检查错误 */
      }
    }
  } catch (_) {
    /* silent */
  } finally {
    state.proactiveChecking = false;

    if (hadNewMessage && state.mounted) {
      await loadItems();
      render();
    }
  }
}

// ═══════════════════════════════════════
// 【数据加载】读取角色、群聊和最新消息
// ═══════════════════════════════════════

async function loadItems() {
  const [characters, groups] = await Promise.all([
    getAllDB('characters').catch(() => []),
    getAllDB('groups').catch(() => [])
  ]);

  const hidden = getHiddenPrivateThreads();

  const privateItems = await Promise.all(
    normalizeArray(characters)
      .filter((character) => character?.id && !hidden.includes(character.id))
      .map((character) => buildPrivateItem(character))
  );

  const groupItems = await Promise.all(
    normalizeArray(groups)
      .filter((group) => group?.id)
      .map((group) => buildGroupItem(group))
  );

  state.privateItems = privateItems
    .filter((item) => item && !isSoftBlockedItem(item))
    .sort(sortListItems);

  state.groupItems = groupItems.sort(sortListItems);
}

async function buildPrivateItem(character) {
  const messages = normalizeArray(await getByIndexDB('messages', 'characterId', character.id).catch(() => []))
    .filter((message) => message?.id)
    .sort(sortByTimestamp);

  const latest = messages[messages.length - 1] || null;
  const matched = findMatchedMessage(messages, state.search);
  const relationshipLock = await getActiveRelationshipLock(character.id);

  const unreadMap = normalizeObject(getData(PRIVATE_UNREAD_KEY));
  const unread = relationshipLock?.type === 'soft_block'
    ? 0
    : Math.max(0, Number(unreadMap[character.id] || 0));

  return {
    id: character.id,
    type: 'private',
    name: character.name || '未命名',
    avatar: character.avatar || '',
    preview: getRelationshipPreview(relationshipLock) || (latest ? getMessagePreview(latest) : '还没有聊天记录'),
    matchedPreview: matched ? getMessagePreview(matched, true) : '',
    time: latest?.timestamp || relationshipLock?.updatedAt || character.updatedAt || character.createdAt || '',
    unread,
    relationshipLock,
    messageCount: messages.length,
    raw: character
  };
}

async function buildGroupItem(group) {
  const messages = normalizeArray(await getByIndexDB('group_messages', 'groupId', group.id).catch(() => []))
    .filter((message) => message?.id)
    .sort(sortByTimestamp);

  const latest = messages[messages.length - 1] || null;
  const matched = findMatchedMessage(messages, state.search);

  const unreadMap = normalizeObject(getData(GROUP_UNREAD_KEY));
  const unread = Math.max(0, Number(unreadMap[group.id] || 0));
  const count = normalizeArray(group.memberIds).length;

  return {
    id: group.id,
    type: 'group',
    name: group.name || '未命名群聊',
    avatar: group.avatar || '',
    preview: latest ? getMessagePreview(latest) : `${count || 0} 个成员，等你开口`,
    matchedPreview: matched ? getMessagePreview(matched, true) : '',
    time: latest?.timestamp || group.updatedAt || group.createdAt || '',
    unread,
    memberCount: count,
    messageCount: messages.length,
    raw: group
  };
}

// ═══════════════════════════════════════
// 【主渲染】绘制列表页壳
// ═══════════════════════════════════════

function isSoftBlockedItem(item) {
  return item?.relationshipLock?.type === 'soft_block';
}

function getRelationshipPreview(lock) {
  if (!lock || lock.status !== 'active') return '';

  if (lock.type === 'soft_block') return '';
  if (lock.type === 'cooldown') return 'TA 有点冷，先给 TA 一点时间。';
  if (lock.type === 'ultimatum') return 'TA 在等你认真解释。';

  return lock.reason || 'TA 现在有点闹别扭。';
}

function getRelationshipBadge(lock) {
  if (!lock || lock.status !== 'active') return '';

  if (lock.type === 'cooldown') return '冷战中';
  if (lock.type === 'ultimatum') return '最后通牒';
  if (lock.type === 'soft_block') return '躲起来了';

  return '闹别扭';
}

function render() {
  if (!state.rootEl || !state.mounted) return;

  const page = el('section', 'chat-page chat-list-page');
  page.append(
    createHeader(),
    createTabs(),
    createSearch(),
    createListArea()
  );

  state.rootEl.replaceChildren(page);
}

// ═══════════════════════════════════════
// 【顶部栏】返回、标题、快捷菜单
// ═══════════════════════════════════════

function createHeader() {
  const header = el('header', 'chat-list-header');

  const close = iconButton('back', '返回桌面');
  close.classList.add('chat-list-back-btn');
  close.addEventListener('click', () => {
    state.appState?.closeApp?.();
  });

  const titleWrap = el('div', 'chat-list-title-wrap');
  titleWrap.append(
    el('div', 'chat-list-title-main', '消息'),
    el('div', 'chat-list-title-sub', '私聊和群聊分开放好')
  );

  const quick = iconButton('more', '快捷菜单');
  quick.classList.add('chat-list-create-group-btn');
  quick.addEventListener('click', openQuickMenu);

  header.append(close, titleWrap, quick);
  return header;
}

// ═══════════════════════════════════════
// 【快捷菜单】选择人设、建群、恢复隐藏
// ═══════════════════════════════════════

function openQuickMenu() {
  const sheet = el('section', 'chat-list-sheet');

  sheet.append(
    el('div', 'chat-list-sheet-title', '快捷小菜单'),
    el('div', 'chat-list-sheet-desc', '常用操作都收在这里。')
  );

  const actions = el('div', 'chat-list-action-list');

  actions.append(
    createSheetAction('memory', '选择人设开聊', '从所有角色里挑一个，直接开始聊天。', async () => {
      hideBottomSheet();
      await openCharacterPicker();
    }),
    createSheetAction('add', '建立群聊', '把已有角色拉进同一个小房间。', async () => {
      hideBottomSheet();
      await createGroupChat();
    }),
    createSheetAction('eye', '恢复隐藏私聊', '把之前藏起来的会话放回列表。', async () => {
      hideBottomSheet();
      await openHiddenThreadsSheet();
    }),
    createSheetAction('delete', '清理空群聊', '删除没有成员、也没有消息的空群。', async () => {
      hideBottomSheet();
      await cleanEmptyGroups();
    })
  );

  sheet.appendChild(actions);
  showBottomSheet(sheet);
}

function createSheetAction(iconName, title, desc, onClick, danger = false) {
  const button = el('button', `chat-list-action ${danger ? 'danger' : ''}`);
  button.type = 'button';

  const icon = el('span', 'chat-list-action-icon');
  icon.appendChild(createIcon(iconName, 18));

  const text = el('span', 'chat-list-action-text');
  text.append(
    el('span', 'chat-list-action-title', title),
    el('span', 'chat-list-action-desc', desc)
  );

  button.append(icon, text);
  button.addEventListener('click', onClick);
  return button;
}

async function openCharacterPicker() {
  const characters = normalizeArray(await getAllDB('characters').catch(() => []))
    .filter((item) => item?.id)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const sheet = el('section', 'chat-list-sheet');
  sheet.append(
    el('div', 'chat-list-sheet-title', '选择人设开聊'),
    el('div', 'chat-list-sheet-desc', '旧聊天不会乱丢，可以先收成小记忆。')
  );

  const list = el('div', 'chat-list-picker');

  if (!characters.length) {
    list.append(
      el('div', 'chat-list-picker-empty', '还没有角色，先去角色管理里创建一个吧。')
    );
  } else {
    characters.forEach((character) => {
      list.appendChild(createCharacterPickerRow(character));
    });
  }

  sheet.appendChild(list);
  showBottomSheet(sheet);
}

function createCharacterPickerRow(character) {
  const row = el('article', 'chat-list-picker-row');
  const avatar = createAvatar(character.avatar || '', character.name || '未命名', 'private');

  const info = el('div', 'chat-list-picker-info');
  info.append(
    el('div', 'chat-list-picker-name', character.name || '未命名'),
    el('div', 'chat-list-picker-desc', '点一下直接开聊，也可以开新对话。')
  );

  const actions = el('div', 'chat-list-picker-actions');

  const open = el('button', 'chat-mini-btn', '开聊');
  open.type = 'button';
  open.addEventListener('click', async () => {
    hideBottomSheet();
    await openPrivateThread(character.id);
  });

  const fresh = el('button', 'chat-mini-btn primary', '新对话');
  fresh.type = 'button';
  fresh.addEventListener('click', async () => {
    const item = await buildPrivateItem(character);
    hideBottomSheet();
    await confirmNewConversation(item, true);
  });

  actions.append(open, fresh);
  row.append(avatar, info, actions);
  return row;
}

async function openHiddenThreadsSheet() {
  const hiddenIds = getHiddenPrivateThreads();

  const characters = normalizeArray(await getAllDB('characters').catch(() => []))
    .filter((item) => item?.id && hiddenIds.includes(item.id));

  const sheet = el('section', 'chat-list-sheet');
  sheet.append(
    el('div', 'chat-list-sheet-title', '隐藏的小会话'),
    el('div', 'chat-list-sheet-desc', '想见谁，就把 TA 放回列表。')
  );

  const list = el('div', 'chat-list-picker');

  if (!characters.length) {
    list.appendChild(el('div', 'chat-list-picker-empty', '这里空空的，没有被隐藏的私聊。'));
  } else {
    characters.forEach((character) => {
      const row = el('article', 'chat-list-picker-row');
      row.appendChild(createAvatar(character.avatar || '', character.name || '未命名', 'private'));

      const info = el('div', 'chat-list-picker-info');
      info.append(
        el('div', 'chat-list-picker-name', character.name || '未命名'),
        el('div', 'chat-list-picker-desc', '恢复后会重新出现在私聊列表。')
      );

      const restore = el('button', 'chat-mini-btn primary', '恢复');
      restore.type = 'button';
      restore.addEventListener('click', async () => {
        removeFromHiddenPrivate(character.id);
        hideBottomSheet();
        showToast('已经放回列表啦');
        await rerender();
      });

      row.append(info, restore);
      list.appendChild(row);
    });
  }

  sheet.appendChild(list);
  showBottomSheet(sheet);
}

async function cleanEmptyGroups() {
  const groups = normalizeArray(await getAllDB('groups').catch(() => []));
  const emptyGroups = [];

  for (const group of groups) {
    if (!group?.id) continue;

    const memberCount = normalizeArray(group.memberIds).length;
    const messages = normalizeArray(await getByIndexDB('group_messages', 'groupId', group.id).catch(() => []));
    if (memberCount === 0 && messages.length === 0) {
      emptyGroups.push(group);
    }
  }

  if (!emptyGroups.length) {
    showToast('没有需要清理的空群聊');
    return;
  }

  const ok = await showConfirm(`找到 ${emptyGroups.length} 个空群聊，要清理掉吗？`);
  if (!ok) return;

  await Promise.all(emptyGroups.map((group) => deleteGroupEverywhere(group.id)));
  showToast('空群聊清理好啦');
  await rerender();
}

async function createGroupChat() {
  const characters = normalizeArray(await getAllDB('characters').catch(() => []))
    .filter((item) => item?.id);

  if (!characters.length) {
    showToast('先去角色管理里添加角色');
    return;
  }

  const now = getNow();
  const group = {
    id: generateId('group'),
    name: buildGroupName(characters),
    avatar: '',
    memberIds: characters.map((item) => item.id),
    createdAt: now,
    updatedAt: now
  };

  await setDB('groups', group);

  state.tab = 'group';
  state.search = '';
  await loadItems();
  render();

  showToast('群聊建好啦');

  if (typeof state.appState?.openGroupThread === 'function') {
    await state.appState.openGroupThread(group.id);
  }
}

function buildGroupName(characters) {
  const names = characters
    .slice(0, 3)
    .map((item) => String(item.name || '').trim())
    .filter(Boolean);

  if (!names.length) return '新的群聊';
  if (characters.length <= 3) return `${names.join('、')}的小群聊`;
  return `${names.join('、')}等 ${characters.length} 人的小群聊`;
}

// ═══════════════════════════════════════
// 【标签页】私聊、群聊切换
// ═══════════════════════════════════════

function createTabs() {
  const tabs = el('div', 'chat-list-tabs');

  const privateTab = createTabButton('私聊', 'private');
  const groupTab = createTabButton('群聊', 'group');

  tabs.append(privateTab, groupTab);
  return tabs;
}

function createTabButton(text, tab) {
  const button = el('button', `chat-list-tab ${state.tab === tab ? 'active' : ''}`);
  button.type = 'button';
  button.textContent = text;

  button.addEventListener('click', async () => {
    if (state.tab === tab) return;
    state.tab = tab;
    state.search = '';
    await rerender();
  });

  return button;
}

// ═══════════════════════════════════════
// 【搜索栏】搜索名字或聊天内容
// ═══════════════════════════════════════

function createSearch() {
  const wrap = el('div', 'chat-list-search-wrap');

  const input = document.createElement('input');
  input.className = 'chat-input-card chat-list-search-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = state.tab === 'group' ? '搜群名或群消息' : '搜名字或聊天内容';
  input.value = state.search;

  input.addEventListener('input', async () => {
    state.search = input.value.trim();
    await rerender();
  });

  const clear = iconButton('close', '清空搜索');
  clear.addEventListener('click', async () => {
    state.search = '';
    await rerender();
  });

  wrap.append(input, clear);
  return wrap;
}

// ═══════════════════════════════════════
// 【列表区】私聊和群聊列表渲染
// ═══════════════════════════════════════

function createListArea() {
  const area = el('main', 'chat-list-area');
  const list = el('div', 'chat-list-scroll');

  const items = getVisibleItems();

  if (!items.length) {
    list.appendChild(createEmpty());
  } else {
    items.forEach((item) => {
      list.appendChild(createRow(item));
    });
  }

  area.appendChild(list);
  return area;
}

function createRow(item) {
  const row = el('article', 'chat-thread-row');
  row.dataset.id = item.id;
  row.dataset.type = item.type;

  if (item.relationshipLock) {
    row.dataset.relationshipLocked = 'true';
    row.dataset.relationshipType = item.relationshipLock.type || '';
  }

  const avatar = createAvatar(item.avatar, item.name, item.type);
  const body = el('button', 'chat-thread-body');
  body.type = 'button';

  const top = el('div', 'chat-thread-top');
  const nameWrap = el('div', 'chat-thread-name-wrap');
  nameWrap.appendChild(el('div', 'chat-thread-name', item.name));

  const badgeText = getRelationshipBadge(item.relationshipLock);
  if (badgeText) {
    nameWrap.appendChild(el('span', 'chat-thread-lock-badge', badgeText));
  }

  top.append(
    nameWrap,
    el('div', 'chat-thread-time', formatTime(item.time))
  );

  const bottom = el('div', 'chat-thread-bottom');
  const preview = el('div', 'chat-thread-preview', item.matchedPreview || item.preview);
  if (item.matchedPreview) preview.classList.add('matched');
  if (item.relationshipLock) preview.classList.add('relationship-preview');

  bottom.append(preview);

  if (item.unread > 0) {
    bottom.appendChild(el('span', 'chat-thread-unread', String(Math.min(item.unread, 99))));
  }

  body.append(top, bottom);

  body.addEventListener('click', async () => {
    if (item.type === 'group') {
      await openGroupThread(item.id);
      return;
    }

    await openPrivateThread(item.id);
  });

  const more = iconButton('more', '更多操作');
  more.classList.add('chat-thread-more-btn');
  more.addEventListener('click', async (event) => {
    event.stopPropagation();

    if (item.type === 'group') {
      openGroupMoreSheet(item);
      return;
    }

    openPrivateMoreSheet(item);
  });

  row.append(avatar, body, more);
  return row;
}

// ═══════════════════════════════════════
// 【私聊更多操作】打开、新对话、清空、隐藏、删除
// ═══════════════════════════════════════

function openPrivateMoreSheet(item) {
  const sheet = el('section', 'chat-list-sheet');

  sheet.append(
    el('div', 'chat-list-sheet-title', item.name),
    el('div', 'chat-list-sheet-desc', `${item.messageCount || 0} 条聊天记录，操作前会问你确认。`)
  );

  const actions = el('div', 'chat-list-action-list');

  actions.append(
    createSheetAction('memory', '打开聊天', '继续和 TA 说话。', async () => {
      hideBottomSheet();
      await openPrivateThread(item.id);
    }),
    createSheetAction('refresh', '开新对话并保留记忆', '把旧聊天收成小记忆，再清空聊天窗口。', async () => {
      hideBottomSheet();
      await confirmNewConversation(item, true);
    }),
    createSheetAction('delete', '清空聊天记录', '只删除聊天，不删除角色。', async () => {
      hideBottomSheet();
      await confirmClearMessages(item);
    }),
    createSheetAction('eye-off', '隐藏这个会话', '角色还在，只是不显示在消息列表。', async () => {
      hideBottomSheet();
      await confirmHidePrivateThread(item);
    }),
    createSheetAction('ban', '删除这个角色', '删除角色和相关聊天数据。', async () => {
      hideBottomSheet();
      await confirmDeleteCharacter(item);
    }, true)
  );

  sheet.appendChild(actions);
  showBottomSheet(sheet);
}

// ═══════════════════════════════════════
// 【群聊更多操作】打开、改名、清空、删除
// ═══════════════════════════════════════

function openGroupMoreSheet(item) {
  const sheet = el('section', 'chat-list-sheet');

  sheet.append(
    el('div', 'chat-list-sheet-title', item.name),
    el('div', 'chat-list-sheet-desc', `${item.memberCount || 0} 个成员，${item.messageCount || 0} 条群消息。`)
  );

  const actions = el('div', 'chat-list-action-list');

  actions.append(
    createSheetAction('memory', '打开群聊', '回到这个小群。', async () => {
      hideBottomSheet();
      await openGroupThread(item.id);
    }),
    createSheetAction('edit', '修改群名', '给这个小群换个名字。', async () => {
      hideBottomSheet();
      await renameGroup(item);
    }),
    createSheetAction('delete', '清空群消息', '只删除群聊记录，不删除群。', async () => {
      hideBottomSheet();
      await confirmClearGroupMessages(item);
    }),
    createSheetAction('ban', '删除群聊', '删除这个群和群消息。', async () => {
      hideBottomSheet();
      await confirmDeleteGroup(item);
    }, true)
  );

  sheet.appendChild(actions);
  showBottomSheet(sheet);
}

// ═══════════════════════════════════════
// 【导航操作】进入私聊、进入群聊
// ═══════════════════════════════════════

async function openPrivateThread(characterId) {
  clearPrivateUnread(characterId);

  if (typeof state.appState?.openPrivateThread === 'function') {
    await state.appState.openPrivateThread(characterId);
  }
}

async function openGroupThread(groupId) {
  clearGroupUnread(groupId);

  if (typeof state.appState?.openGroupThread === 'function') {
    await state.appState.openGroupThread(groupId);
  }
}

// ═══════════════════════════════════════
// 【空状态】无聊天记录或无搜索结果
// ═══════════════════════════════════════

function createEmpty() {
  const empty = el('section', 'chat-empty');

  if (state.search) {
    empty.append(
      el('div', 'chat-empty-title', '没搜到'),
      el('div', 'chat-empty-desc', '换个词试试，也许它藏在另一段话里。')
    );
    return empty;
  }

  empty.append(
    el('div', 'chat-empty-title', state.tab === 'group' ? '还没有群聊' : '还没有私聊'),
    el('div', 'chat-empty-desc', state.tab === 'group' ? '点右上角菜单，就能建一个小群。' : '点右上角菜单选择人设，就能开始聊天。')
  );

  return empty;
}

// ═══════════════════════════════════════
// 【搜索过滤】按关键词过滤列表项
// ═══════════════════════════════════════

function getVisibleItems() {
  const q = normalizeSearch(state.search);
  const items = state.tab === 'group' ? state.groupItems : state.privateItems;

  if (!q) return items;

  return items.filter((item) => {
    return normalizeSearch(item.name).includes(q) ||
      normalizeSearch(item.preview).includes(q) ||
      normalizeSearch(item.matchedPreview).includes(q);
  });
}

function findMatchedMessage(messages, search) {
  const q = normalizeSearch(search);
  if (!q) return null;

  return messages.find((message) => {
    const text = normalizeSearch([
      message.content || '',
      message.stickerDescription || '',
      message.quoteText || '',
      message.itemName || '',
      message.itemDesc || '',
      message.title || '',
      message.description || ''
    ].join(' '));
    return text.includes(q);
  }) || null;
}

// ═══════════════════════════════════════
// 【确认操作】新对话、清空、隐藏、删除
// ═══════════════════════════════════════

async function confirmNewConversation(item, openAfter = false) {
  const ok = await showConfirm(`要和「${item.name}」开一段新对话吗？旧聊天会收成一条小记忆，角色还在。`);
  if (!ok) return;

  const messages = await getCharacterMessages(item.id);

  await deleteMessages(messages);

  if (messages.length) {
    await saveConversationMemory(item, messages).catch(() => null);
  }

  clearPrivateUnread(item.id);
  clearLastRouteIfCharacter(item.id);

  showToast('新对话准备好啦');
  await rerender();

  if (openAfter) {
    await openPrivateThread(item.id);
  }
}

async function confirmClearMessages(item) {
  const ok = await showConfirm(`确定清空「${item.name}」的聊天记录吗？只清聊天，不会删除角色。`);
  if (!ok) return;

  const messages = await getCharacterMessages(item.id);
  await deleteMessages(messages);
  clearPrivateUnread(item.id);
  clearLastRouteIfCharacter(item.id);

  showToast('聊天记录清空啦');
  await rerender();
}

async function confirmHidePrivateThread(item) {
  const ok = await showConfirm(`要把「${item.name}」从消息列表隐藏吗？可以在快捷菜单里恢复。`);
  if (!ok) return;

  addHiddenPrivate(item.id);
  clearPrivateUnread(item.id);
  showToast('已经藏起来啦');
  await rerender();
}

async function confirmDeleteCharacter(item) {
  const ok = await showConfirm(`真的要删除「${item.name}」吗？这会删掉角色和相关聊天数据，不只是清记录哦。`);
  if (!ok) return;

  await deleteCharacterEverywhere(item.id);
  showToast('已经把 TA 从列表里移走了');
  await rerender();

  window.dispatchEvent(new CustomEvent('desktop:refresh'));
  try { window.AppBus?.emit('characters:updated', {}); } catch (_) {}
}

async function renameGroup(item) {
  const nextName = await showTextInputDialog({
    title: '修改群名',
    message: '给这个小群换个顺口的名字。',
    value: item.name || '未命名群聊',
    placeholder: '输入群名'
  });

  if (nextName === null) return;

  const name = String(nextName || '').trim();
  if (!name) {
    showToast('群名不能为空');
    return;
  }

  await setDB('groups', {
    ...item.raw,
    name,
    updatedAt: getNow()
  });

  showToast('群名改好啦');
  await rerender();
}

function showTextInputDialog(options = {}) {
  return new Promise((resolve) => {
    const backdrop = el('div', 'chat-input-dialog-backdrop');
    const layer = el('div', 'chat-input-dialog-layer');
    const card = el('section', 'chat-input-dialog-card');

    const title = el('div', 'chat-input-dialog-title', options.title || '输入内容');
    const message = el('div', 'chat-input-dialog-message', options.message || '');

    const input = document.createElement('input');
    input.className = 'chat-input-dialog-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = options.placeholder || '';
    input.value = options.value || '';

    const actions = el('div', 'chat-input-dialog-actions');

    const cancel = el('button', 'chat-input-dialog-btn ghost', '先不要');
    cancel.type = 'button';

    const confirm = el('button', 'chat-input-dialog-btn primary', '好呀');
    confirm.type = 'button';

    actions.append(cancel, confirm);
    card.append(title, message, input, actions);
    layer.append(card);
    document.body.append(backdrop, layer);

    const close = (value) => {
      backdrop.classList.remove('open');
      card.classList.remove('open');

      document.removeEventListener('keydown', onKeydown);

      window.setTimeout(() => {
        backdrop.remove();
        layer.remove();
        resolve(value);
      }, 220);
    };

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        close(input.value);
      }
    };

    backdrop.addEventListener('click', () => close(null));
    cancel.addEventListener('click', () => close(null));
    confirm.addEventListener('click', () => close(input.value));
    document.addEventListener('keydown', onKeydown);

    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      card.classList.add('open');
      input.focus({ preventScroll: true });
      input.select();
    });
  });
}

async function confirmClearGroupMessages(item) {
  const ok = await showConfirm(`确定清空「${item.name}」的群消息吗？群还会保留。`);
  if (!ok) return;

  const messages = await getGroupMessages(item.id);
  await deleteGroupMessages(messages);
  clearGroupUnread(item.id);
  clearLastRouteIfGroup(item.id);

  showToast('群消息清空啦');
  await rerender();
}

async function confirmDeleteGroup(item) {
  const ok = await showConfirm(`真的要删除「${item.name}」吗？群和群消息都会删除。`);
  if (!ok) return;

  await deleteGroupEverywhere(item.id);
  showToast('群聊删掉啦');
  await rerender();

  window.dispatchEvent(new CustomEvent('desktop:refresh'));
}

// ═══════════════════════════════════════
// 【消息操作】读取、删除、保存对话记忆
// ═══════════════════════════════════════

async function getCharacterMessages(characterId) {
  return normalizeArray(await getByIndexDB('messages', 'characterId', characterId).catch(() => []))
    .filter((message) => message?.id);
}

async function getGroupMessages(groupId) {
  return normalizeArray(await getByIndexDB('group_messages', 'groupId', groupId).catch(() => []))
    .filter((message) => message?.id);
}

async function deleteMessages(messages) {
  await Promise.all(
    normalizeArray(messages)
      .filter((message) => message?.id)
      .map((message) => deleteDB('messages', message.id).catch(() => null))
  );
}

async function deleteGroupMessages(messages) {
  await Promise.all(
    normalizeArray(messages)
      .filter((message) => message?.id)
      .map((message) => deleteDB('group_messages', message.id).catch(() => null))
  );
}

async function saveConversationMemory(item, messages) {
  const useful = normalizeArray(messages)
    .filter((message) => message?.content || message?.stickerDescription || message?.itemName)
    .slice(-8)
    .map((message) => {
      const who = message.role === 'user' ? '用户' : item.name;
      const content = message.content || message.stickerDescription || message.itemName || '';
      return `${who}：${String(content).replace(/\s+/g, ' ').trim()}`;
    })
    .filter(Boolean);

  if (!useful.length) return;

  const content = `开新对话前的小回忆：${useful.join(' / ').slice(0, 520)}`;
  await addMemory(item.id, content, 'summary', true, { importance: 3 });
}

// ═══════════════════════════════════════
// 【删除联动】角色删除时清理所有相关数据
// ═══════════════════════════════════════

async function deleteCharacterEverywhere(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  await Promise.all([
    deleteDB('characters', id).catch(() => null),
    deleteIndexedByCharacter('messages', 'characterId', id),
    deleteIndexedByCharacter('memories', 'characterId', id),
    deleteIndexedByCharacter('dreams', 'characterId', id),
    deleteIndexedByCharacter('grudges', 'characterId', id),
    deleteIndexedByCharacter('punishments', 'characterId', id),
    deleteIndexedByCharacter('relationship_locks', 'characterId', id)
  ]);

  await removeCharacterFromGroups(id);
  clearPrivateUnread(id);
  removeFromHiddenPrivate(id);
  clearLastRouteIfCharacter(id);
}

async function deleteIndexedByCharacter(storeName, indexName, characterId) {
  const rows = normalizeArray(await getByIndexDB(storeName, indexName, characterId).catch(() => []));
  await Promise.all(
    rows
      .filter((row) => row?.id)
      .map((row) => deleteDB(storeName, row.id).catch(() => null))
  );
}

async function removeCharacterFromGroups(characterId) {
  const groups = normalizeArray(await getAllDB('groups').catch(() => []));

  await Promise.all(groups.map(async (group) => {
    const memberIds = normalizeArray(group.memberIds);
    if (!memberIds.includes(characterId)) return;

    await setDB('groups', {
      ...group,
      memberIds: memberIds.filter((id) => id !== characterId),
      updatedAt: getNow()
    }).catch(() => null);
  }));
}

async function deleteGroupEverywhere(groupId) {
  const id = String(groupId || '').trim();
  if (!id) return;

  const messages = await getGroupMessages(id);
  await Promise.all([
    deleteDB('groups', id).catch(() => null),
    deleteGroupMessages(messages)
  ]);

  clearGroupUnread(id);
  clearLastRouteIfGroup(id);
}

async function rerender() {
  if (!state.mounted) return;
  await loadItems();
  render();
}

// ═══════════════════════════════════════
// 【隐藏私聊】隐藏/恢复列表中的私聊
// ═══════════════════════════════════════

function getHiddenPrivateThreads() {
  const saved = getData(HIDDEN_PRIVATE_KEY);
  return Array.isArray(saved) ? saved : [];
}

function addHiddenPrivate(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const hidden = getHiddenPrivateThreads();
  if (!hidden.includes(id)) {
    hidden.push(id);
    setData(HIDDEN_PRIVATE_KEY, hidden);
  }
}

function removeFromHiddenPrivate(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const hidden = getHiddenPrivateThreads().filter((item) => item !== id);
  setData(HIDDEN_PRIVATE_KEY, hidden);
}

// ═══════════════════════════════════════
// 【角标清理】清除未读数、清理路由
// ═══════════════════════════════════════

function clearPrivateUnread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const unreadMap = normalizeObject(getData(PRIVATE_UNREAD_KEY));
  if (Object.prototype.hasOwnProperty.call(unreadMap, id)) {
    delete unreadMap[id];
    setData(PRIVATE_UNREAD_KEY, unreadMap);
  }

  window.refreshDesktopBadges?.();
}

function clearGroupUnread(groupId) {
  const id = String(groupId || '').trim();
  if (!id) return;

  const unreadMap = normalizeObject(getData(GROUP_UNREAD_KEY));
  if (Object.prototype.hasOwnProperty.call(unreadMap, id)) {
    delete unreadMap[id];
    setData(GROUP_UNREAD_KEY, unreadMap);
  }

  window.refreshDesktopBadges?.();
}

function clearLastRouteIfCharacter(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const route = getData(LAST_ROUTE_KEY);
  if (!route || typeof route !== 'object') return;

  const params = normalizeObject(route.params);
  if (params.characterId === id || params.id === id) {
    setData(LAST_ROUTE_KEY, { name: 'list', params: {} });
  }
}

function clearLastRouteIfGroup(groupId) {
  const id = String(groupId || '').trim();
  if (!id) return;

  const route = getData(LAST_ROUTE_KEY);
  if (!route || typeof route !== 'object') return;

  const params = normalizeObject(route.params);
  if (params.groupId === id || params.id === id) {
    setData(LAST_ROUTE_KEY, { name: 'list', params: {} });
  }
}

// ═══════════════════════════════════════
// 【辅助函数】消息预览、头像、格式化
// ═══════════════════════════════════════

function getMessagePreview(message, longer = false) {
  if (!message) return '';

  if (message.type === 'image') return '[图片]';
  if (message.type === 'sticker') return `[表情包] ${message.stickerDescription || message.content || ''}`.trim();
  if (message.type === 'transfer') return `[转账 ${Number(message.transferAmount || 0)}]`;
  if (['gift', 'shop_item', 'shop-item', 'purchase', 'item'].includes(String(message.type || ''))) {
    return `[小卡片] ${message.itemName || message.title || message.name || message.content || ''}`.trim();
  }
  if (message.type === 'voice') return '[语音]';
  if (message.type === 'dice') return `[骰子 ${message.diceValue || ''}]`;
  if (message.type === 'rps') return '[石头剪刀布]';

  const text = String(message.content || '').replace(/\s+/g, ' ').trim();
  const max = longer ? 64 : 42;

  if (!text) return '[消息]';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function createAvatar(src, name, type) {
  const avatar = el('span', `chat-list-avatar ${type === 'group' ? 'group' : ''}`);

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(name);
  }

  return avatar;
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function iconButton(iconName, label) {
  const button = el('button', 'chat-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(createIcon(iconName, 18));
  return button;
}

function formatTime(value) {
  if (!value) return '';

  const time = new Date(value).getTime();
  if (!time) return '';

  const now = Date.now();
  const diff = Math.max(0, now - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;

  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function sortListItems(a, b) {
  const at = new Date(a.time || 0).getTime();
  const bt = new Date(b.time || 0).getTime();

  if (at !== bt) return bt - at;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
}

function sortByUpdatedAtDesc(a, b) {
  return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】列表页全部样式
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(LIST_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = LIST_STYLE_ID;
  style.textContent = `
    .chat-list-page {
      gap: 0;
    }

    .chat-list-header {
      flex: 0 0 auto;
      min-height: 68px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) 44px;
      align-items: center;
      gap: 12px;
      padding: 14px 20px 10px;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(18px);
      z-index: 2;
    }

    .chat-list-back-btn {
      justify-self: start;
    }

    .chat-list-create-group-btn {
      justify-self: end;
    }

    .chat-list-title-wrap {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-list-title-main {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-list-title-sub {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
    }

    .chat-list-tabs {
      flex: 0 0 auto;
      display: flex;
      gap: 10px;
      padding: 4px 20px 12px;
    }

    .chat-list-tab {
      min-height: 38px;
      border-radius: 999px;
      padding: 0 16px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .chat-list-tab.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-list-tab:active {
      transform: scale(0.96);
    }

    .chat-list-search-wrap {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 0 20px 12px;
    }

    .chat-list-search-input {
      min-width: 0;
    }

    .chat-list-area {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 0 20px 20px;
    }

    .chat-list-scroll {
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 18px;
      -webkit-overflow-scrolling: touch;
    }

    .chat-thread-row {
      min-height: 70px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 22px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .chat-thread-row[data-relationship-locked="true"] {
      background: color-mix(in srgb, var(--bg-card) 92%, var(--accent-light));
    }

    .chat-thread-row:active {
      transform: scale(0.99);
    }

    .chat-list-avatar {
      width: 46px;
      height: 46px;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 999px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: 16px;
      font-weight: 600;
    }

    .chat-list-avatar.group {
      border-radius: 18px;
    }

    .chat-list-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-thread-body {
      min-width: 0;
      padding: 0;
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      text-align: left;
    }

    .chat-thread-more-btn {
      width: 36px;
      height: 36px;
      flex: 0 0 auto;
    }

    .chat-thread-top {
      min-width: 0;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 4px;
    }

    .chat-thread-name-wrap {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .chat-thread-name {
      min-width: 0;
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-thread-lock-badge {
      flex: 0 0 auto;
      max-width: 72px;
      min-height: 20px;
      display: inline-flex;
      align-items: center;
      padding: 0 8px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
      font-size: 11px;
      line-height: 1;
      white-space: nowrap;
    }

    .chat-thread-time {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .chat-thread-bottom {
      min-width: 0;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
    }

    .chat-thread-preview {
      min-width: 0;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.45;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-thread-preview.relationship-preview {
      color: var(--accent);
    }

    .chat-thread-preview.matched {
      color: var(--text-primary);
    }

    .chat-thread-unread {
      min-width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--bubble-user-text);
      font-size: 11px;
      line-height: 1;
    }

    .chat-list-sheet {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 4px 0 8px;
      color: var(--text-primary);
    }

    .chat-list-sheet-title {
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.4;
      color: var(--text-primary);
    }

    .chat-list-sheet-desc {
      margin-top: -6px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .chat-list-action-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .chat-list-action {
      width: 100%;
      min-height: 62px;
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 20px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: left;
      font: inherit;
      transition: all 200ms ease;
    }

    .chat-list-action:active {
      transform: scale(0.98);
    }

    .chat-list-action.danger {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-list-action-icon {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--surface-muted);
      color: currentColor;
      box-shadow: var(--shadow-sm);
    }

    .chat-list-action-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-list-action-title {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
      color: currentColor;
    }

    .chat-list-action-desc {
      font-size: 12px;
      line-height: 1.45;
      color: var(--text-secondary);
    }

    .chat-list-action.danger .chat-list-action-desc {
      color: color-mix(in srgb, var(--bubble-user-text) 78%, transparent);
    }

    .chat-list-picker {
      max-height: min(58vh, 520px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 2px 0 8px;
      -webkit-overflow-scrolling: touch;
    }

    .chat-list-picker-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 22px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-list-picker-info {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-list-picker-name {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-list-picker-desc,
    .chat-list-picker-empty {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.5;
    }

    .chat-list-picker-empty {
      padding: 18px 4px;
      text-align: center;
    }

    .chat-list-picker-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .chat-mini-btn {
      min-height: 34px;
      border-radius: 999px;
      padding: 0 12px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 12px;
      white-space: nowrap;
      transition: all 200ms ease;
    }

    .chat-mini-btn.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-mini-btn:active {
      transform: scale(0.96);
    }

    .chat-input-dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10030;
      background: var(--bg-overlay);
      opacity: 0;
      pointer-events: none;
      transition: all 200ms ease;
    }

    .chat-input-dialog-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .chat-input-dialog-layer {
      position: fixed;
      inset: 0;
      z-index: 10040;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      pointer-events: none;
    }

    .chat-input-dialog-card {
      width: min(360px, calc(100vw - 48px));
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 22px 20px 18px;
      border-radius: 28px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-lg);
      font-family: var(--font-main);
      opacity: 0;
      pointer-events: auto;
      transform: translate3d(0, 12px, 0) scale(0.96);
      transition: all 200ms ease;
    }

    .chat-input-dialog-card.open {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1);
    }

    .chat-input-dialog-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.4;
      text-align: center;
    }

    .chat-input-dialog-message {
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      text-align: center;
    }

    .chat-input-dialog-input {
      width: 100%;
      min-height: 46px;
      box-sizing: border-box;
      border-radius: 18px;
      padding: 0 14px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font: inherit;
      font-size: 16px;
      outline: transparent solid 2px;
      box-shadow: var(--shadow-sm);
    }

    .chat-input-dialog-input::placeholder {
      color: var(--text-hint);
    }

    .chat-input-dialog-input:focus-visible {
      box-shadow: var(--shadow-md);
    }

    .chat-input-dialog-actions {
      display: flex;
      gap: 10px;
      margin-top: 4px;
    }

    .chat-input-dialog-btn {
      min-height: 44px;
      flex: 1;
      border-radius: 18px;
      padding: 0 14px;
      font: inherit;
      font-size: var(--font-size-base);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .chat-input-dialog-btn.ghost {
      background: var(--bg-secondary);
      color: var(--text-secondary);
    }

    .chat-input-dialog-btn.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-input-dialog-btn:active {
      transform: scale(0.96);
    }

    @media (max-width: 680px) {
      .chat-list-header,
      .chat-list-tabs,
      .chat-list-search-wrap,
      .chat-list-area {
        padding-left: 20px;
        padding-right: 20px;
      }

      .chat-list-picker-row {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .chat-list-picker-actions {
        grid-column: 1 / -1;
        justify-content: flex-end;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：deleteCharacterEverywhere 里加了 deleteIndexedByCharacter('dreams', 'characterId', id)，删角色时连带清理该角色的梦境。
// 原来效果：删角色后梦境还在，变成孤儿数据。
// 现在效果：删角色时同步删除该角色所有梦境。
// 会不会影响其他文件：不会。只在内部的删除函数加了一行。
// depends: ../../core/storage.js(getData,setData,generateId,getNow,setDB,getAllDB,getByIndexDB,deleteDB)；../../core/ui.js(createIcon,showToast,showConfirm,showBottomSheet,hideBottomSheet)；./thread-ai.js(checkThreadProactiveMessages)
