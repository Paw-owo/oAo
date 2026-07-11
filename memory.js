// apps/chat/memory.js
// imports:
//   from '../../core/storage.js': getData, generateId, getNow, getAllDB, getDB, setDB, deleteDB, getByIndexDB
//   from '../../core/ui.js': createIcon, showToast, showConfirm

import {
  getData,
  generateId,
  getNow,
  getAllDB,
  getDB,
  setDB,
  deleteDB,
  getByIndexDB
} from '../../core/storage.js';

import {
  createIcon,
  showToast,
  showConfirm
} from '../../core/ui.js';

import { addMemory, editMemory, deleteMemory as coreDeleteMemory, getMemories } from '../../core/memory.js';

const MEMORY_STYLE_ID = 'chat-memory-style';

const SOURCE_LABELS = {
  auto: 'AI悄悄记下',
  summary: '聊天小总结',
  manual: '你亲手写的'
};

const state = {
  rootEl: null,
  appState: null,
  mounted: false,
  characterId: '',
  fromRoute: null,
  character: null,
  user: null,
  characters: [],
  memories: [],
  filter: 'all',
  editingId: ''
};

export async function mountChatMemory(containerEl, options = {}) {
  state.rootEl = containerEl;
  state.appState = options.appState || null;
  state.mounted = true;
  state.characterId = String(options.characterId || '').trim();
  state.fromRoute = options.fromRoute || null;
  state.filter = 'all';
  state.editingId = '';

  injectStyle();
  await loadData();
  render();
}

export function unmountChatMemory() {
  state.mounted = false;

  if (state.rootEl) {
    state.rootEl.replaceChildren();
  }

  state.rootEl = null;
  state.appState = null;
  state.characterId = '';
  state.fromRoute = null;
  state.character = null;
  state.user = null;
  state.characters = [];
  state.memories = [];
  state.filter = 'all';
  state.editingId = '';
}

async function loadData() {
  state.characters = normalizeArray(await getAllDB('characters').catch(() => []))
    .filter((item) => item?.id)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  state.user = await loadUserProfile();

  if (!state.characterId) {
    state.characterId = state.characters[0]?.id || '';
  }

  state.character = state.characterId
    ? await getDB('characters', state.characterId).catch(() => null)
    : null;

  if (!state.character && state.characters.length) {
    state.character = state.characters[0];
    state.characterId = state.character.id;
  }

  if (!state.characterId) {
    state.memories = [];
    return;
  }

  state.memories = await getMemories(state.characterId);
}

function render() {
  if (!state.rootEl || !state.mounted) return;

  const page = el('section', 'chat-page chat-memory-page');
  page.append(
    createHeader(),
    createMemoryHero(),
    createFilterBar(),
    createMemoryList(),
    createAddPanel()
  );

  state.rootEl.replaceChildren(page);
}

function createHeader() {
  const header = el('header', 'chat-memory-header');

  const back = iconButton('back', '返回');
  back.addEventListener('click', () => {
    state.appState?.backFromMemory?.(state.fromRoute);
  });

  const title = el('div', 'chat-memory-title-wrap');
  title.append(
    el('div', 'chat-memory-title', '记忆小本本'),
    el('div', 'chat-memory-subtitle', '这些不会直接插进聊天，只会让 TA 慢慢想起来')
  );

  const spacer = el('span', 'chat-memory-header-spacer');

  header.append(back, title, spacer);
  return header;
}

function createMemoryHero() {
  const hero = el('section', 'chat-memory-hero');

  const user = state.user || {};

  const pair = el('div', 'chat-memory-pair');

  const aiBlock = createHeroAvatarBlock({
    type: 'ai',
    src: getImageValue(state.character || {}),
    name: state.character?.name || 'TA'
  });

  const userBlock = createHeroAvatarBlock({
    type: 'user',
    src: getImageValue(user),
    name: user.name || '我'
  });

  pair.append(aiBlock, userBlock);

  const names = el('div', 'chat-memory-pair-names');
  names.textContent = state.character
    ? `${state.character.name || 'TA'} 和 ${user.name || '我'} 的小记忆`
    : '小记忆';

  hero.append(pair, names);
  return hero;
}

function createHeroAvatarBlock({ type, src, name }) {
  const block = el('div', `chat-memory-hero-block ${type}`);
  const avatar = el('span', `chat-memory-pair-avatar ${type}`);

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(name);
  }

  block.append(avatar);
  return block;
}

function createFilterBar() {
  const wrap = el('section', 'chat-memory-filter-bar');

  [
    ['all', '全部'],
    ['auto', 'AI写的'],
    ['summary', '小总结'],
    ['manual', '手写']
  ].forEach(([key, label]) => {
    const button = el('button', `chat-memory-filter ${state.filter === key ? 'active' : ''}`, label);
    button.type = 'button';
    button.addEventListener('click', () => {
      state.filter = key;
      render();
    });
    wrap.appendChild(button);
  });

  return wrap;
}

function createMemoryList() {
  const area = el('main', 'chat-memory-list-area');
  const list = el('div', 'chat-memory-list');
  const items = getFilteredMemories();

  if (!state.characterId) {
    list.appendChild(createEmpty('还没有角色', '先去角色管理里创建一个角色，再回来写记忆。'));
    area.appendChild(list);
    return area;
  }

  if (!items.length) {
    list.appendChild(createEmpty('这里还空空的', '可以在下面给 TA 写一条小记忆。'));
    area.appendChild(list);
    return area;
  }

  items.forEach((memory) => {
    list.appendChild(createMemoryCard(memory));
  });

  area.appendChild(list);
  return area;
}

function createMemoryCard(memory) {
  const card = el('article', 'chat-memory-card');
  card.dataset.id = memory.id;
  card.dataset.size = getMemoryCardSize(memory.content);

  const head = el('div', 'chat-memory-card-head');
  head.append(
    el('span', `chat-memory-source source-${memory.source}`, SOURCE_LABELS[memory.source] || SOURCE_LABELS.auto),
    el('span', 'chat-memory-time', formatTime(memory.updatedAt || memory.createdAt))
  );

  const content = el('div', 'chat-memory-content', memory.content || '这条记忆没有内容');

  const actions = el('div', 'chat-memory-actions');

  const edit = smallButton('编辑', 'edit');
  edit.addEventListener('click', () => {
    state.editingId = memory.id;
    render();
    requestAnimationFrame(() => {
      state.rootEl?.querySelector('.chat-memory-editor textarea')?.focus();
    });
  });

  const remove = smallButton('删除', 'delete');
  remove.addEventListener('click', async () => {
    await deleteMemory(memory);
  });

  actions.append(edit, remove);
  card.append(head, content, actions);

  if (state.editingId === memory.id) {
    card.appendChild(createEditor(memory));
  }

  return card;
}

function getMemoryCardSize(content) {
  const length = String(content || '').replace(/\s+/g, '').length;
  if (length <= 24) return 'short';
  if (length <= 72) return 'medium';
  return 'long';
}

function createEditor(memory) {
  const editor = el('section', 'chat-memory-editor');

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-input-card chat-memory-textarea';
  textarea.value = memory.content || '';
  textarea.placeholder = '把这条记忆改得更贴心一点';
  textarea.rows = 4;

  const row = el('div', 'chat-memory-editor-actions');

  const cancel = smallButton('取消', 'close');
  cancel.addEventListener('click', () => {
    state.editingId = '';
    render();
  });

  const save = smallButton('保存', 'check');
  save.classList.add('primary');
  save.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) {
      showToast('记忆不能空着');
      return;
    }

    await saveMemory({
      ...memory,
      content,
      source: normalizeSource(memory.source),
      updatedAt: getNow()
    });

    state.editingId = '';
    await refresh();
    showToast('记好啦');
  });

  row.append(cancel, save);
  editor.append(textarea, row);
  return editor;
}

function createAddPanel() {
  const panel = el('footer', 'chat-memory-add-panel');

  const input = document.createElement('textarea');
  input.className = 'chat-input-card chat-memory-add-input';
  input.placeholder = state.character
    ? `给 ${state.character.name || 'TA'} 写一条小记忆`
    : '先选择一个角色';
  input.rows = 2;
  input.disabled = !state.characterId;

  const button = el('button', 'chat-primary-btn chat-memory-add-btn');
  button.type = 'button';
  button.append(createIcon('add', 16), el('span', '', '写进去'));

  button.addEventListener('click', async () => {
    if (!state.characterId) {
      showToast('先选一个角色');
      return;
    }

    const content = input.value.trim();
    if (!content) {
      showToast('写一点再保存');
      return;
    }

    const now = getNow();
    const memory = {
      id: generateId('memory'),
      characterId: state.characterId,
      content,
      source: 'manual',
      createdAt: now,
      updatedAt: now
    };

    await saveMemory(memory);
    input.value = '';
    await refresh();
    showToast('已经放进小本本');
  });

  panel.append(input, button);
  return panel;
}

function createEmpty(title, desc) {
  const empty = el('section', 'chat-empty');
  empty.append(
    el('div', 'chat-empty-title', title),
    el('div', 'chat-empty-desc', desc)
  );
  return empty;
}

async function deleteMemory(memory) {
  const ok = await showConfirm('要删掉这条记忆吗？');
  if (!ok) return;

  await coreDeleteMemory(state.characterId, memory.id);
  await refresh();
  showToast('删掉啦');
}

async function saveMemory(memory) {
  const characterId = String(memory.characterId || state.characterId || '');
  const content = String(memory.content || '').trim();
  const source = normalizeSource(memory.source);

  // 编辑已有记忆：memory.id 已存在于库中，走 editMemory 保留原字段
  if (memory.id && await getDB('memories', memory.id).catch(() => null)) {
    await editMemory(characterId, memory.id, content, { source });
    return;
  }

  // 新增：走 addMemory，由 core 补齐 importance/keywords/mood 等字段
  await addMemory(characterId, content, source, true, { importance: 3 });
}

async function refresh() {
  await loadData();
  render();
}

function getFilteredMemories() {
  if (state.filter === 'all') return state.memories;
  return state.memories.filter((item) => item.source === state.filter);
}

function normalizeMemory(memory) {
  const createdAt = memory.createdAt || getNow();
  const source = normalizeSource(memory.source);

  return {
    id: String(memory.id || generateId('memory')),
    characterId: String(memory.characterId || state.characterId || ''),
    content: String(memory.content || '').trim(),
    source,
    createdAt,
    updatedAt: memory.updatedAt || createdAt
  };
}

function normalizeSource(source) {
  if (source === 'manual') return 'manual';
  if (source === 'summary') return 'summary';
  return 'auto';
}

function sortMemory(a, b) {
  return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
}

function formatTime(value) {
  if (!value) return '';

  const time = new Date(value).getTime();
  if (!time) return '';

  const diff = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = minute * 60;
  const day = hour * 24;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;

  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

async function loadUserProfile() {
  const settings = getData('app_settings') || {};
  const appUser = getData('app_user') || {};
  const profiles = getData('user_profiles') || [];
  const activeId = getData('active_user_profile_id') || settings.activeUserProfileId || '';

  let profile = {};

  if (Array.isArray(profiles) && profiles.length) {
    profile = profiles.find((item) => item.id === activeId) ||
      profiles.find((item) => item.isDefault) ||
      profiles[0] ||
      {};
  }

  const user = {
    ...(settings.user || {}),
    ...appUser,
    ...profile
  };

  user.name = user.name || user.nickname || user.title || '我';
  user.avatar = getImageValue(user);

  if (!user.avatar) {
    const blobAvatar = await findUserAvatarFromBlobs();
    if (blobAvatar) user.avatar = blobAvatar;
  }

  return user;
}

async function findUserAvatarFromBlobs() {
  const keys = [
    'app_user_avatar',
    'user_avatar',
    'settings_user_avatar',
    'profile_user_avatar',
    'active_user_avatar',
    'my_avatar',
    'avatar_user'
  ];

  for (const key of keys) {
    const item = await getDB('blobs', key).catch(() => null);
    const value = getImageValue(item || {});
    if (value) return value;
  }

  const all = await getAllDB('blobs').catch(() => []);
  const matched = normalizeArray(all).find((item) => {
    const key = String(item.key || item.id || item.name || '').toLowerCase();
    return key.includes('user') && key.includes('avatar');
  });

  return getImageValue(matched || {});
}

function getImageValue(item) {
  if (!item || typeof item !== 'object') return '';

  const direct = item.avatar ||
    item.avatarUrl ||
    item.avatarImage ||
    item.avatarSource ||
    item.imageBase64 ||
    item.image ||
    item.iconImage ||
    item.photo ||
    item.picture ||
    item.value ||
    item.data ||
    item.src ||
    '';

  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  if (direct && typeof direct === 'object') {
    return getImageValue(direct);
  }

  if (item.user && typeof item.user === 'object') {
    return getImageValue(item.user);
  }

  return '';
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

function smallButton(text, iconName) {
  const button = el('button', 'chat-memory-small-btn');
  button.type = 'button';
  button.append(createIcon(iconName, 14), el('span', '', text));
  return button;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  if (document.getElementById(MEMORY_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = MEMORY_STYLE_ID;
  style.textContent = `
    .chat-memory-page {
      gap: 0;
    }

    .chat-memory-header {
      flex: 0 0 auto;
      min-height: 68px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) 44px;
      align-items: center;
      gap: 12px;
      padding: 14px 20px 8px;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(18px);
      z-index: 2;
    }

    .chat-memory-header-spacer {
      width: 44px;
      height: 44px;
    }

    .chat-memory-title-wrap {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-memory-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-memory-subtitle {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
    }

    .chat-memory-hero {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      padding: 10px 20px 18px;
    }

    .chat-memory-pair {
      position: relative;
      width: min(218px, 76vw);
      height: 104px;
      display: flex;
      align-items: end;
      justify-content: center;
    }

    .chat-memory-hero-block {
      position: absolute;
      bottom: 0;
      width: 104px;
      height: 104px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .chat-memory-hero-block.ai {
      left: 18px;
      z-index: 2;
    }

    .chat-memory-hero-block.user {
      right: 18px;
      z-index: 1;
    }

    .chat-memory-pair-avatar {
      width: 96px;
      height: 96px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-md);
      font-size: 24px;
      font-weight: 600;
      outline: 6px solid var(--bg-primary);
    }

    .chat-memory-pair-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-memory-pair-names {
      margin-top: 8px;
      max-width: 78%;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.4;
      text-align: center;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-memory-filter-bar {
      flex: 0 0 auto;
      display: flex;
      justify-content: center;
      gap: 10px;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0 20px 12px;
      -webkit-overflow-scrolling: touch;
    }

    .chat-memory-filter-bar::-webkit-scrollbar,
    .chat-memory-list::-webkit-scrollbar {
      display: none;
    }

    .chat-memory-filter {
      flex: 0 0 auto;
      min-height: 36px;
      border-radius: 999px;
      padding: 0 14px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 13px;
      transition: all 200ms ease;
    }

    .chat-memory-filter.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-memory-filter:active {
      transform: scale(0.96);
    }

    .chat-memory-list-area {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 0 20px 12px;
    }

    .chat-memory-list {
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      padding-bottom: 14px;
      -webkit-overflow-scrolling: touch;
    }

    .chat-memory-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 100%;
      padding: 14px;
      border-radius: 22px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-memory-card[data-size="short"] {
      width: fit-content;
      min-width: min(220px, 72vw);
      max-width: min(320px, 86vw);
    }

    .chat-memory-card[data-size="medium"] {
      width: fit-content;
      min-width: min(280px, 82vw);
      max-width: min(520px, 100%);
    }

    .chat-memory-card[data-size="long"] {
      width: 100%;
    }

    .chat-memory-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .chat-memory-source {
      min-height: 26px;
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0 10px;
      background: color-mix(in srgb, var(--accent) 10%, var(--bg-card));
      color: var(--accent);
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
    }

    .chat-memory-time {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .chat-memory-content {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-memory-actions,
    .chat-memory-editor-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .chat-memory-small-btn {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border-radius: 999px;
      padding: 0 11px;
      background: var(--bg-primary);
      color: var(--text-secondary);
      font: inherit;
      font-size: 12px;
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .chat-memory-small-btn.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-memory-small-btn:active {
      transform: scale(0.96);
    }

    .chat-memory-editor {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-top: 2px;
    }

    .chat-memory-textarea,
    .chat-memory-add-input {
      min-height: 82px;
      resize: none;
    }

    .chat-memory-add-panel {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: end;
      gap: 10px;
      padding: 12px 20px calc(14px + env(safe-area-inset-bottom));
      background: color-mix(in srgb, var(--bg-primary) 90%, transparent);
      backdrop-filter: blur(18px);
    }

    .chat-memory-add-btn {
      white-space: nowrap;
    }

    @media (max-width: 680px) {
      .chat-memory-header,
      .chat-memory-hero,
      .chat-memory-filter-bar,
      .chat-memory-list-area,
      .chat-memory-add-panel {
        padding-left: 20px;
        padding-right: 20px;
      }

      .chat-memory-add-panel {
        grid-template-columns: 1fr;
      }

      .chat-memory-add-btn {
        width: 100%;
      }
    }

    @media (max-width: 430px) {
      .chat-memory-pair {
        width: 204px;
        height: 98px;
      }

      .chat-memory-hero-block {
        width: 98px;
        height: 98px;
      }

      .chat-memory-hero-block.ai {
        left: 14px;
      }

      .chat-memory-hero-block.user {
        right: 14px;
      }

      .chat-memory-pair-avatar {
        width: 90px;
        height: 90px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：去掉头像上方两个名字气泡和角色选择气泡；用户头像增加 blobs 兜底读取；标题文字下移。
// 会不会影响其他文件：不会。
// 更新记忆里该文件的导出函数：无变化。
// 依赖：../../core/storage.js(getData,generateId,getNow,getAllDB,getDB,setDB,deleteDB,getByIndexDB)；../../core/ui.js(createIcon,showToast,showConfirm)
