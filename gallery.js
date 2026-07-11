// apps/gallery.js
// imports:
//   from '../core/storage.js': getAllDB, getDB
//   from '../core/ui.js': createIcon, showBottomSheet, hideBottomSheet, showToast

import { getAllDB, getDB } from '../core/storage.js';
import { createIcon, showBottomSheet, hideBottomSheet, showToast } from '../core/ui.js';

const STYLE_ID = 'grudge-book-style';

let unsubscribeGrudgePunishment = null;
let unsubscribeCharsUpdated = null;

const state = {
  rootEl: null,
  mounted: false,
  tab: 'all',
  search: '',
  items: [],
  characters: new Map(),
  rawCounts: {
    grudges: 0,
    punishments: 0,
    locks: 0
  }
};

export async function mount(containerEl) {
  state.rootEl = containerEl;
  state.mounted = true;
  state.tab = 'all';
  state.search = '';

  injectStyle();
  await loadData();
  render();

  // 监听 chat 里的惩罚事件，自动刷新记仇本列表
  try {
    unsubscribeGrudgePunishment = window.AppBus?.on('grudge:punishment', async () => {
      if (!state.mounted) return;
      await loadData();
      render();
    });
  } catch (_) {}

  // 角色在别处被编辑时，刷新缓存并重渲染，避免打开期间角色数据陈旧
  try {
    if (window.AppBus && !unsubscribeCharsUpdated) {
      unsubscribeCharsUpdated = window.AppBus.on('characters:updated', async () => {
        if (!state.mounted) return;
        await loadData();
        render();
      });
    }
  } catch (_) {}
}

export function unmount() {
  state.mounted = false;
  state.items = [];
  state.characters = new Map();

  if (unsubscribeGrudgePunishment) {
    try { unsubscribeGrudgePunishment(); } catch (_) {}
    unsubscribeGrudgePunishment = null;
  }

  if (unsubscribeCharsUpdated) {
    try { unsubscribeCharsUpdated(); } catch (_) {}
    unsubscribeCharsUpdated = null;
  }

  if (state.rootEl) {
    state.rootEl.replaceChildren();
  }

  state.rootEl = null;
}

async function loadData() {
  const [characters, grudges, punishments, locks] = await Promise.all([
    getAllDB('characters').catch(() => []),
    getAllDB('grudges').catch(() => []),
    getAllDB('punishments').catch(() => []),
    getAllDB('relationship_locks').catch(() => [])
  ]);

  state.rawCounts = {
    grudges: normalizeArray(grudges).length,
    punishments: normalizeArray(punishments).length,
    locks: normalizeArray(locks).length
  };

  state.characters = new Map(
    normalizeArray(characters)
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item])
  );

  const items = [];

  normalizeArray(grudges).forEach((item) => {
    if (!item?.id) return;
    const character = getCharacter(item.characterId);
    items.push({
      id: item.id,
      kind: 'grudge',
      title: item.reason || item.title || item.summary || item.event || 'TA 记下了一点小委屈',
      desc: item.content || item.note || item.reason || item.summary || item.event || '这条还没写清楚，但 TA 好像确实有点在意。',
      characterId: item.characterId || '',
      characterName: item.characterName || character.name || 'TA',
      characterAvatar: item.characterAvatar || character.avatar || '',
      status: item.status || 'active',
      mood: item.mood || item.emotion || '',
      severity: Number(item.severity || item.score || item.weight || 0),
      time: item.updatedAt || item.createdAt || item.timestamp || item.time || '',
      raw: item
    });
  });

  normalizeArray(punishments).forEach((item) => {
    if (!item?.id) return;
    const character = getCharacter(item.characterId);
    items.push({
      id: item.id,
      kind: 'punishment',
      title: item.title || item.name || '一条小惩罚',
      desc: item.description || item.desc || item.reason || item.task || 'TA 给这件事留了一个小任务。',
      characterId: item.characterId || '',
      characterName: item.characterName || character.name || 'TA',
      characterAvatar: item.characterAvatar || character.avatar || '',
      status: item.status || 'active',
      mood: item.type || item.mood || '',
      severity: Number(item.requiredCount || item.currentCount || item.level || 0),
      time: item.updatedAt || item.createdAt || item.timestamp || item.time || '',
      raw: item
    });
  });

  normalizeArray(locks).forEach((item) => {
    if (!item?.id) return;
    const character = getCharacter(item.characterId);
    items.push({
      id: item.id,
      kind: 'lock',
      title: item.title || getLockTitle(item.type),
      desc: item.reason || item.content || item.note || 'TA 暂时把心门关小了一点点。',
      characterId: item.characterId || '',
      characterName: item.characterName || character.name || 'TA',
      characterAvatar: item.characterAvatar || character.avatar || '',
      status: getLockStatus(item),
      mood: item.type || '',
      severity: Number(item.level || item.severity || 0),
      time: item.updatedAt || item.createdAt || item.startsAt || item.timestamp || '',
      raw: item
    });
  });

  state.items = items.sort(sortByTimeDesc);
}

function render() {
  if (!state.rootEl || !state.mounted) return;

  const page = el('section', 'grudge-page');
  page.append(
    createHeader(),
    createStats(),
    createSearch(),
    createTabs(),
    createList()
  );

  state.rootEl.replaceChildren(page);
}

function createHeader() {
  const header = el('header', 'grudge-header');

  const back = iconButton('back', '返回桌面');
  back.classList.add('grudge-back-btn');
  back.addEventListener('click', () => closeApp());

  const left = el('div', 'grudge-header-text');
  left.append(
    el('div', 'grudge-title', '记仇本'),
    el('div', 'grudge-subtitle', 'TA 记住的小委屈，都先放在这里。')
  );

  const actions = el('div', 'grudge-header-actions');

  const check = iconButton('info', '自检');
  check.addEventListener('click', () => openSelfCheck());

  const refresh = iconButton('refresh', '刷新');
  refresh.addEventListener('click', async () => {
    await loadData();
    render();
    showToast('翻了一遍小本本');
  });

  actions.append(check, refresh);
  header.append(back, left, actions);
  return header;
}

function closeApp() {
  if (typeof window.closeCurrentApp === 'function') {
    window.closeCurrentApp();
    return;
  }

  window.dispatchEvent(new CustomEvent('app-close'));
}

function createStats() {
  const wrap = el('section', 'grudge-stats');

  const activeGrudges = state.items.filter((item) => item.kind === 'grudge' && item.status !== 'resolved').length;
  const activePunishments = state.items.filter((item) => item.kind === 'punishment' && item.status !== 'done' && item.status !== 'completed').length;
  const activeLocks = state.items.filter((item) => item.kind === 'lock' && item.status === 'active').length;

  wrap.append(
    createStatCard('记着的小委屈', activeGrudges),
    createStatCard('没完成的小任务', activePunishments),
    createStatCard('还在闹别扭', activeLocks)
  );

  return wrap;
}

function createStatCard(label, value) {
  const card = el('article', 'grudge-stat-card');
  card.append(
    el('div', 'grudge-stat-value', String(value)),
    el('div', 'grudge-stat-label', label)
  );
  return card;
}

function createSearch() {
  const wrap = el('div', 'grudge-search');

  const input = document.createElement('input');
  input.className = 'chat-input-card grudge-search-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = '搜名字、小委屈、惩罚';
  input.value = state.search;

  input.addEventListener('input', () => {
    state.search = input.value.trim();
    render();
  });

  const clear = iconButton('close', '清空');
  clear.addEventListener('click', () => {
    state.search = '';
    render();
  });

  wrap.append(input, clear);
  return wrap;
}

function createTabs() {
  const tabs = el('nav', 'grudge-tabs');

  [
    ['all', '全部'],
    ['grudge', '记仇'],
    ['punishment', '惩罚'],
    ['lock', '冷战']
  ].forEach(([key, text]) => {
    const button = el('button', `grudge-tab ${state.tab === key ? 'active' : ''}`, text);
    button.type = 'button';
    button.addEventListener('click', () => {
      state.tab = key;
      render();
    });
    tabs.appendChild(button);
  });

  return tabs;
}

function createList() {
  const area = el('main', 'grudge-list-area');
  const list = el('div', 'grudge-list');

  const items = getVisibleItems();

  if (!items.length) {
    list.appendChild(createEmpty());
  } else {
    items.forEach((item) => {
      list.appendChild(createItemCard(item));
    });
  }

  area.appendChild(list);
  return area;
}

function createItemCard(item) {
  const card = el('article', `grudge-card kind-${item.kind}`);

  const avatar = createAvatar(item.characterAvatar, item.characterName);

  const body = el('button', 'grudge-card-body');
  body.type = 'button';

  const top = el('div', 'grudge-card-top');
  top.append(
    el('div', 'grudge-card-name', item.characterName),
    el('div', 'grudge-card-time', formatTime(item.time))
  );

  const title = el('div', 'grudge-card-title', item.title);
  const desc = el('div', 'grudge-card-desc', item.desc);

  const meta = el('div', 'grudge-card-meta');
  meta.append(
    el('span', 'grudge-pill', getKindLabel(item.kind)),
    el('span', 'grudge-pill soft', getStatusLabel(item))
  );

  body.append(top, title, desc, meta);
  body.addEventListener('click', () => openDetail(item));

  card.append(avatar, body);
  return card;
}

function createEmpty() {
  const empty = el('section', 'grudge-empty');
  empty.append(
    el('div', 'grudge-empty-icon'),
    el('div', 'grudge-empty-title', state.search ? '没翻到这一页' : '小本本现在很干净'),
    el('div', 'grudge-empty-desc', state.search ? '换个词再找找，TA 可能换了个说法。' : '点右上角自检，看看数据库里到底有没有写入记录。')
  );

  const icon = empty.querySelector('.grudge-empty-icon');
  icon.appendChild(createIcon('grudge', 24));

  return empty;
}

function openDetail(item) {
  const sheet = el('div', 'grudge-detail-sheet');

  const head = el('div', 'grudge-detail-head');
  head.append(
    createAvatar(item.characterAvatar, item.characterName),
    el('div', 'grudge-detail-title-wrap')
  );

  head.querySelector('.grudge-detail-title-wrap').append(
    el('div', 'grudge-detail-name', item.characterName),
    el('div', 'grudge-detail-kind', `${getKindLabel(item.kind)} · ${getStatusLabel(item)}`)
  );

  const content = el('section', 'grudge-detail-card');
  content.append(
    el('div', 'grudge-detail-title', item.title),
    el('div', 'grudge-detail-desc', item.desc)
  );

  const raw = item.raw || {};
  const info = el('div', 'grudge-detail-info');

  [
    ['心情', item.mood || raw.mood || raw.type || '没写'],
    ['严重度', item.severity ? String(item.severity) : '轻轻一点'],
    ['开始时间', formatFullTime(raw.createdAt || raw.startsAt || item.time)],
    ['结束时间', raw.endsAt ? formatFullTime(raw.endsAt) : '没写']
  ].forEach(([label, value]) => {
    info.append(createInfoRow(label, value));
  });

  const close = el('button', 'grudge-detail-close', '收好');
  close.type = 'button';
  close.addEventListener('click', () => hideBottomSheet());

  // 跳转到 chat 该角色会话（如果记仇条目绑定了角色）
  const chatBtn = el('button', 'grudge-detail-close', '去聊聊');
  chatBtn.type = 'button';
  chatBtn.style.background = 'var(--bg-card)';
  chatBtn.style.color = 'var(--text-primary)';
  if (item.characterId) {
    chatBtn.addEventListener('click', () => {
      try {
        hideBottomSheet();
        window.AppBus?.openApp('chat', {
          route: { name: 'thread', params: { mode: 'private', characterId: item.characterId, groupId: '' } }
        });
      } catch (_) {}
    });
  } else {
    chatBtn.disabled = true;
    chatBtn.style.opacity = '0.5';
  }

  sheet.append(head, content, info, close, chatBtn);
  showBottomSheet(sheet);
}

function openSelfCheck() {
  const sheet = el('div', 'grudge-check-sheet');

  const head = el('div', 'grudge-check-head');
  head.append(
    el('div', 'grudge-check-title', '小本本自检'),
    el('div', 'grudge-check-desc', '这里看的是数据库真实条数。')
  );

  const list = el('div', 'grudge-check-list');
  list.append(
    createCheckRow('grudges', '记仇记录', state.rawCounts.grudges),
    createCheckRow('punishments', '惩罚记录', state.rawCounts.punishments),
    createCheckRow('relationship_locks', '关系锁记录', state.rawCounts.locks),
    createCheckRow('当前可显示', '整理后能展示的卡片', state.items.length)
  );

  const tip = el('div', 'grudge-check-tip');
  const total = state.rawCounts.grudges + state.rawCounts.punishments + state.rawCounts.locks;

  if (total === 0) {
    tip.textContent = '三个仓库都是 0，说明聊天 AI 还没有真的写入记仇数据。';
  } else if (state.items.length === 0) {
    tip.textContent = '仓库里有数据，但整理后没显示，说明字段名可能还没对齐。';
  } else {
    tip.textContent = '有数据，也能显示。小本本这边是通的。';
  }

  const close = el('button', 'grudge-detail-close', '知道啦');
  close.type = 'button';
  close.addEventListener('click', () => hideBottomSheet());

  sheet.append(head, list, tip, close);
  showBottomSheet(sheet);
}

function createCheckRow(key, label, value) {
  const row = el('div', 'grudge-check-row');
  row.append(
    el('span', 'grudge-check-key', key),
    el('span', 'grudge-check-label', label),
    el('span', 'grudge-check-value', String(value))
  );
  return row;
}

function createInfoRow(label, value) {
  const row = el('div', 'grudge-info-row');
  row.append(
    el('span', 'grudge-info-label', label),
    el('span', 'grudge-info-value', value)
  );
  return row;
}

function getVisibleItems() {
  const q = normalizeSearch(state.search);

  return state.items.filter((item) => {
    if (state.tab !== 'all' && item.kind !== state.tab) return false;

    if (!q) return true;

    return [
      item.title,
      item.desc,
      item.characterName,
      item.status,
      item.mood
    ].some((value) => normalizeSearch(value).includes(q));
  });
}

function getCharacter(characterId) {
  const id = String(characterId || '').trim();
  return state.characters.get(id) || {};
}

function getLockTitle(type) {
  if (type === 'soft_block') return 'TA 暂时躲起来了';
  if (type === 'cooldown') return 'TA 现在有点冷';
  if (type === 'ultimatum') return 'TA 在等你认真解释';
  return 'TA 关上了一点心门';
}

function getLockStatus(lock) {
  if (!lock) return 'unknown';
  if (lock.status !== 'active') return lock.status || 'inactive';

  const endsAt = new Date(lock.endsAt || 0).getTime();
  if (endsAt && endsAt <= Date.now()) return 'expired';

  return 'active';
}

function getKindLabel(kind) {
  if (kind === 'grudge') return '记仇';
  if (kind === 'punishment') return '惩罚';
  if (kind === 'lock') return '冷战';
  return '记录';
}

function getStatusLabel(item) {
  const status = String(item.status || '').toLowerCase();

  if (status === 'active') return '进行中';
  if (status === 'expired') return '已结束';
  if (status === 'resolved') return '哄好了';
  if (status === 'done' || status === 'completed') return '完成了';
  if (status === 'pending') return '等处理';

  return status || '没写';
}

function createAvatar(src, name) {
  const avatar = el('span', 'grudge-avatar');

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

function iconButton(iconName, label) {
  const button = el('button', 'chat-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(createIcon(iconName, 18));
  return button;
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function sortByTimeDesc(a, b) {
  return String(b.time || '').localeCompare(String(a.time || ''));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function formatTime(value) {
  const time = new Date(value || 0).getTime();
  if (!time) return '';

  const diff = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;

  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatFullTime(value) {
  const time = new Date(value || 0);
  if (!time.getTime()) return '没写';

  const y = time.getFullYear();
  const m = String(time.getMonth() + 1).padStart(2, '0');
  const d = String(time.getDate()).padStart(2, '0');
  const h = String(time.getHours()).padStart(2, '0');
  const min = String(time.getMinutes()).padStart(2, '0');

  return `${y}-${m}-${d} ${h}:${min}`;
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
    .grudge-page {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .grudge-header {
      flex: 0 0 auto;
      min-height: 70px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 16px 20px 10px;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(18px);
      z-index: 2;
    }

    .grudge-back-btn {
      justify-self: start;
    }

    .grudge-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-self: end;
    }

    .grudge-header-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .grudge-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .grudge-subtitle {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
    }

    .grudge-stats {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 8px 20px 12px;
    }

    .grudge-stat-card,
    .grudge-card,
    .grudge-detail-card,
    .grudge-detail-info,
    .grudge-check-list,
    .grudge-check-tip {
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .grudge-stat-card {
      min-width: 0;
      padding: 14px 10px;
      border-radius: 20px;
    }

    .grudge-stat-value {
      color: var(--accent);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.2;
      text-align: center;
    }

    .grudge-stat-label {
      margin-top: 5px;
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.35;
      text-align: center;
    }

    .grudge-search {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 0 20px 12px;
    }

    .grudge-tabs {
      flex: 0 0 auto;
      display: flex;
      gap: 8px;
      padding: 0 20px 12px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .grudge-tab {
      flex: 0 0 auto;
      min-height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 13px;
      transition: all 200ms ease;
    }

    .grudge-tab.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .grudge-tab:active {
      transform: scale(0.96);
    }

    .grudge-list-area {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 0 20px 20px;
    }

    .grudge-list {
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 18px;
      -webkit-overflow-scrolling: touch;
    }

    .grudge-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      padding: 12px;
      border-radius: 22px;
      animation: grudgeCardIn 200ms ease both;
    }

    .grudge-avatar {
      width: 46px;
      height: 46px;
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

    .grudge-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .grudge-card-body {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      font: inherit;
    }

    .grudge-card-top {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }

    .grudge-card-name {
      min-width: 0;
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .grudge-card-time {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .grudge-card-title {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.45;
    }

    .grudge-card-desc {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .grudge-card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 2px;
    }

    .grudge-pill {
      min-height: 22px;
      display: inline-flex;
      align-items: center;
      padding: 0 9px;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent);
      font-size: 11px;
      line-height: 1;
    }

    .grudge-pill.soft {
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    .grudge-empty {
      min-height: 52vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 18px;
      text-align: center;
    }

    .grudge-empty-icon {
      width: 56px;
      height: 56px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 22px;
      background: var(--bg-card);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
      margin-bottom: 14px;
    }

    .grudge-empty-title,
    .grudge-check-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .grudge-empty-desc,
    .grudge-check-desc {
      max-width: 280px;
      margin-top: 7px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .grudge-detail-sheet,
    .grudge-check-sheet {
      padding: 6px 20px 20px;
    }

    .grudge-detail-head {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      margin-bottom: 14px;
    }

    .grudge-check-head {
      margin-bottom: 14px;
    }

    .grudge-detail-title-wrap {
      min-width: 0;
    }

    .grudge-detail-name {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .grudge-detail-kind {
      margin-top: 3px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
    }

    .grudge-detail-card,
    .grudge-detail-info,
    .grudge-check-list,
    .grudge-check-tip {
      padding: 14px;
      border-radius: 20px;
    }

    .grudge-detail-title {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.45;
    }

    .grudge-detail-desc {
      margin-top: 8px;
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .grudge-detail-info,
    .grudge-check-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 10px;
    }

    .grudge-info-row {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
    }

    .grudge-info-label,
    .grudge-check-key {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.5;
    }

    .grudge-info-value,
    .grudge-check-label {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
      word-break: break-word;
    }

    .grudge-check-row {
      display: grid;
      grid-template-columns: 1fr 1.2fr auto;
      gap: 10px;
      align-items: center;
    }

    .grudge-check-value {
      color: var(--accent);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.3;
      text-align: right;
    }

    .grudge-check-tip {
      margin-top: 10px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.65;
    }

    .grudge-detail-close {
      width: 100%;
      min-height: 44px;
      margin-top: 14px;
      border-radius: 16px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .grudge-detail-close:active {
      transform: scale(0.96);
    }

    @keyframes grudgeCardIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 430px) {
      .grudge-stats {
        grid-template-columns: 1fr;
      }

      .grudge-check-row {
        grid-template-columns: 1fr auto;
      }

      .grudge-check-key {
        grid-column: 1 / -1;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../core/storage.js(getAllDB,getDB)；../core/ui.js(createIcon,showBottomSheet,hideBottomSheet,showToast)
