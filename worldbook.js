// apps/worldbook.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getAllDB, getDB, setDB, deleteDB, compressImage
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData, setData, generateId, getNow, getAllDB, getDB, setDB, deleteDB, compressImage
} from '../core/storage.js';

import {
  showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
} from '../core/ui.js';

const STYLE_ID = 'worldbook-styles';
const BG_KEY = 'app_bg_worldbook';
const VISUALS_KEY = 'app_worldbook_visuals';
const COVER_PREFIX = 'app_worldbook_cover_';
const ICON_PREFIX = 'app_worldbook_icon_';

const CATEGORIES = [
  { id: 'profile', name: '人设背景' },
  { id: 'relation', name: '关系设定' },
  { id: 'scene', name: '场景设定' },
  { id: 'tone', name: '口癖语气' },
  { id: 'rule', name: '禁止事项' },
  { id: 'plot', name: '剧情伏笔' },
  { id: 'thinking', name: '思维方式' }
];

const PRIORITIES = [
  { id: 'low', name: '低' },
  { id: 'normal', name: '中' },
  { id: 'high', name: '高' },
  { id: 'core', name: '核心' }
];

const INJECTION_MODES = [
  { id: 'always', name: '一直参考' },
  { id: 'keyword', name: '关键词触发' },
  { id: 'private', name: '只在私聊' },
  { id: 'group', name: '只在群聊' },
  { id: 'rare', name: '低频参考' }
];

let container = null;
let currentTab = 'A';
let editingEntry = null;
let selectedChars = [];
let allChars = [];
let coverCache = new Map();
let iconCache = new Map();
let unsubscribeCharsUpdated = null;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .wb-screen{position:fixed;inset:0;z-index:10;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary);color:var(--text-primary)}
    .wb-screen.has-bg{background-size:cover;background-position:center;background-repeat:no-repeat}
    .wb-soft-layer{position:absolute;inset:0;z-index:0;pointer-events:none;background:transparent}
    .wb-nav{position:fixed;top:0;left:0;right:0;z-index:100;height:calc(56px + env(safe-area-inset-top));display:flex;align-items:center;gap:var(--spacing-sm);padding:env(safe-area-inset-top) 20px 0;background:color-mix(in srgb,var(--bg-primary) 76%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .wb-nav-title{flex:1;min-width:0;font-size:var(--font-size-title);font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wb-body{position:relative;z-index:1;flex:1;overflow-x:hidden;overflow-y:auto;padding:calc(56px + env(safe-area-inset-top) + var(--spacing-md)) 20px calc(88px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
    .wb-hero{padding:18px;margin-bottom:var(--spacing-md);border-radius:28px;background:color-mix(in srgb,var(--bg-card) 92%,transparent);box-shadow:var(--shadow-md);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .wb-screen.has-bg .wb-hero,.wb-screen.has-bg .wb-card,.wb-screen.has-bg .wb-custom-section,.wb-screen.has-bg .wb-tab-bar{background:color-mix(in srgb,var(--bg-card) 72%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .wb-hero-title{color:var(--text-primary);font-size:20px;font-weight:600;line-height:1.35;letter-spacing:-.01em}
    .wb-hero-text{margin-top:6px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .wb-tab-bar{display:flex;gap:var(--spacing-xs);padding:var(--spacing-xs);margin-bottom:var(--spacing-md);border-radius:var(--radius-md);background:var(--surface-muted);box-shadow:var(--shadow-sm)}
    .wb-tab-btn{flex:1;min-height:36px;border-radius:12px;color:var(--text-secondary);font-size:var(--font-size-small);font-weight:500;transition:var(--motion)}
    .wb-tab-btn.active{background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm)}
    .wb-list{display:flex;flex-direction:column;gap:var(--spacing-md)}
    .wb-card{background:color-mix(in srgb,var(--bg-card) 92%,transparent);border-radius:24px;padding:var(--spacing-md);box-shadow:var(--shadow-sm);transition:var(--motion);cursor:pointer;overflow:hidden;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .wb-card:active{transform:scale(.98)}
    .wb-card-cover{height:108px;margin:-2px -2px 14px;border-radius:20px;background:var(--surface-muted);display:flex;align-items:center;justify-content:center;color:var(--accent-dark);overflow:hidden}
    .wb-card-cover img{width:100%;height:100%;object-fit:cover;display:block}
    .wb-card-cover svg{opacity:.82}
    .wb-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--spacing-md)}
    .wb-card-head{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
    .wb-card-icon{width:38px;height:38px;flex:0 0 38px;border-radius:14px;background:var(--accent-light);color:var(--accent-dark);display:flex;align-items:center;justify-content:center;overflow:hidden}
    .wb-card-icon img{width:100%;height:100%;object-fit:cover;display:block}
    .wb-card-info{flex:1;min-width:0}
    .wb-card-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wb-card-type{margin-top:2px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.4}
    .wb-card-preview{margin-top:10px;color:var(--text-secondary);font-size:var(--font-size-base);line-height:1.6;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;white-space:pre-wrap;word-break:break-word}
    .wb-card-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
    .wb-tag{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:4px 10px;border-radius:999px;background:var(--accent-light);color:var(--accent-dark);font-size:12px;font-weight:500;line-height:1.4}
    .wb-tag.all{background:var(--surface-muted);color:var(--text-secondary)}
    .wb-char-avatar,.wb-tag-avatar{width:20px;height:20px;flex:0 0 20px;border-radius:50%;object-fit:cover;background:var(--bg-secondary)}
    .wb-card-actions{display:flex;align-items:center;gap:var(--spacing-sm);margin-top:14px;flex-wrap:wrap}
    .wb-action-btn{min-height:32px;display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:12px;color:var(--text-secondary);background:var(--surface-muted);font-size:12px;font-weight:500;transition:var(--motion)}
    .wb-action-btn:active{transform:scale(.96)}
    .wb-action-btn svg{width:14px;height:14px;flex:0 0 14px}
    .wb-action-btn.danger{color:var(--accent-dark)}
    .wb-empty{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--spacing-sm);padding:var(--spacing-lg);text-align:center;color:var(--text-secondary)}
    .wb-empty-icon{width:58px;height:58px;display:flex;align-items:center;justify-content:center;border-radius:22px;background:var(--accent-light);color:var(--accent-dark);box-shadow:var(--shadow-sm)}
    .wb-empty-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .wb-empty-text{max-width:260px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .wb-sheet{padding-bottom:calc(var(--spacing-lg) + env(safe-area-inset-bottom))}
    .wb-sheet-title{margin-bottom:var(--spacing-md);color:var(--text-primary);font-size:20px;font-weight:600;line-height:1.35;letter-spacing:-.01em}
    .wb-field{margin-bottom:var(--spacing-md)}
    .wb-field-label{display:flex;align-items:center;gap:6px;margin-bottom:var(--spacing-sm);color:var(--text-secondary);font-size:var(--font-size-small);font-weight:500;line-height:1.4}
    .wb-field-label svg{width:15px;height:15px;color:var(--accent)}
    .wb-input,.wb-textarea,.wb-select{width:100%;border-radius:var(--radius-md);background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-base)}
    .wb-input,.wb-select{min-height:46px;padding:10px var(--spacing-md)}
    .wb-textarea{min-height:150px;padding:12px var(--spacing-md);line-height:1.6;resize:none}
    .wb-input::placeholder,.wb-textarea::placeholder{color:var(--text-hint)}
    .wb-type-toggle{display:flex;gap:var(--spacing-xs);padding:var(--spacing-xs);border-radius:var(--radius-md);background:var(--surface-muted)}
    .wb-type-btn{flex:1;min-height:36px;border-radius:12px;color:var(--text-secondary);font-size:var(--font-size-small);font-weight:500;transition:var(--motion)}
    .wb-type-btn.active{background:var(--bg-card);color:var(--accent-dark);box-shadow:var(--shadow-sm)}
    .wb-type-hint{margin-top:var(--spacing-sm);color:var(--text-hint);font-size:var(--font-size-small);line-height:1.5}
    .wb-char-grid,.wb-choice-grid{display:flex;flex-wrap:wrap;gap:var(--spacing-sm)}
    .wb-char-chip,.wb-choice-chip{min-height:34px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;color:var(--text-secondary);background:var(--surface-muted);font-size:var(--font-size-small);font-weight:500;transition:var(--motion)}
    .wb-char-chip:active,.wb-choice-chip:active,.wb-mini-btn:active{transform:scale(.96)}
    .wb-char-chip.selected,.wb-choice-chip.selected{background:var(--accent-light);color:var(--accent-dark)}
    .wb-char-chip.all-chip.selected{background:var(--accent);color:var(--bubble-user-text)}
    .wb-enable-row{min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-md);margin-bottom:var(--spacing-md);padding:4px 0}
    .wb-enable-label{color:var(--text-primary);font-size:var(--font-size-base);font-weight:500}
    .wb-save-btn{width:100%;min-height:48px;border-radius:var(--radius-md);background:var(--accent);color:var(--bubble-user-text);font-size:var(--font-size-base);font-weight:600;box-shadow:var(--shadow-sm);transition:var(--motion)}
    .wb-save-btn:active{transform:scale(.96)}
    .wb-danger-btn{width:100%;min-height:44px;margin-top:var(--spacing-sm);border-radius:var(--radius-md);background:var(--surface-muted);color:var(--accent-dark);font-size:var(--font-size-base);font-weight:600;transition:var(--motion)}
    .wb-custom-section{padding:var(--spacing-md);border-radius:var(--radius-lg);background:var(--bg-card);box-shadow:var(--shadow-sm);margin-bottom:var(--spacing-md)}
    .wb-custom-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .wb-custom-sub{margin-top:4px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .wb-custom-actions{display:flex;gap:var(--spacing-sm);flex-wrap:wrap;margin-top:var(--spacing-md)}
    .wb-mini-btn{min-height:36px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:14px;background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-small);font-weight:600;transition:var(--motion)}
    .wb-mini-btn.primary{background:var(--accent);color:var(--bubble-user-text)}
    .wb-mini-btn.danger{color:var(--accent-dark)}
    .wb-range{width:100%;accent-color:var(--accent)}
    .wb-detail-meta{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 14px}
    .wb-detail-content{padding:14px;border-radius:18px;background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-base);line-height:1.7;white-space:pre-wrap;word-break:break-word}
  `;

  document.head.appendChild(style);
}

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;
  currentTab = 'A';
  editingEntry = null;
  selectedChars = [];
  coverCache = new Map();
  iconCache = new Map();
  allChars = await getAllDB('characters');

  // 角色在别处被编辑时，刷新缓存并重渲染，避免打开期间角色数据陈旧
  if (window.AppBus && !unsubscribeCharsUpdated) {
    unsubscribeCharsUpdated = window.AppBus.on('characters:updated', async () => {
      if (!container) return;
      allChars = await getAllDB('characters');
      await renderList();
    });
  }

  const screen = document.createElement('section');
  screen.className = 'wb-screen';

  const softLayer = document.createElement('div');
  softLayer.className = 'wb-soft-layer';

  const nav = document.createElement('div');
  nav.className = 'wb-nav';

  const backButton = document.createElement('button');
  backButton.className = 'icon-button';
  backButton.type = 'button';
  backButton.setAttribute('aria-label', '返回');
  backButton.appendChild(createIcon('back', 22));
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'wb-nav-title';
  title.textContent = '世界书';

  const customButton = document.createElement('button');
  customButton.className = 'icon-button soft';
  customButton.type = 'button';
  customButton.setAttribute('aria-label', '个性化');
  customButton.appendChild(createIcon('edit', 22));
  customButton.addEventListener('click', openCustomizeSheet);

  const addButton = document.createElement('button');
  addButton.className = 'icon-button soft';
  addButton.type = 'button';
  addButton.setAttribute('aria-label', '新增');
  addButton.appendChild(createIcon('add', 22));
  addButton.addEventListener('click', () => openEditor(null));

  const body = document.createElement('div');
  body.className = 'wb-body';

  const hero = document.createElement('section');
  hero.className = 'wb-hero';

  const heroTitle = document.createElement('div');
  heroTitle.className = 'wb-hero-title';
  heroTitle.textContent = '给 AI 偷偷看的设定本';

  const heroText = document.createElement('div');
  heroText.className = 'wb-hero-text';
  heroText.textContent = '背景、关系、语气、禁忌和伏笔都可以放进来，聊天时会被悄悄参考。';

  hero.append(heroTitle, heroText);

  const tabBar = document.createElement('div');
  tabBar.className = 'wb-tab-bar';

  const tabA = createTabButton('A', '人设背景');
  const tabB = createTabButton('B', '思维方式');
  tabBar.append(tabA, tabB);

  const listWrap = document.createElement('div');
  listWrap.className = 'wb-list-wrap';

  body.append(hero, tabBar, listWrap);
  nav.append(backButton, title, customButton, addButton);
  screen.append(softLayer, nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  await applyWorldbookBackground(screen);
  await renderList();
}

export function unmount() {
  if (container) {
    container.innerHTML = '';
    container = null;
  }

  editingEntry = null;
  selectedChars = [];
  allChars = [];
  coverCache = new Map();
  iconCache = new Map();

  if (unsubscribeCharsUpdated) {
    try { unsubscribeCharsUpdated(); } catch (_) {}
    unsubscribeCharsUpdated = null;
  }
  // 注意：不注销 appBus API，其他 APP 在 worldbook 关闭后仍可能需要查询
}

export async function getWorldbookEntries() {
  const all = await getAllDB('worldbook');
  return Array.isArray(all) ? all.map(normalizeEntry) : [];
}

export async function getWorldbookVisual(entryId) {
  if (!entryId) return { cover: '', icon: '', meta: null };

  const [cover, icon] = await Promise.all([
    getDB('blobs', getCoverKey(entryId)).catch(() => null),
    getDB('blobs', getIconKey(entryId)).catch(() => null)
  ]);

  return {
    cover: getImageFromRecord(cover),
    icon: getImageFromRecord(icon),
    meta: getVisualMeta(entryId)
  };
}

export async function getWorldbookForCharacter(character) {
  try {
    const list = await getWorldbookEntries();
    const all = (Array.isArray(list) ? list : []).filter((entry) => entry && entry.enabled !== false);

    if (!all.length) return [];

    // 兼容两种调用：传 character 对象，或仅传 characterId 字符串
    const charObj = character && typeof character === 'object' ? character : null;
    const charId = charObj ? String(charObj.id || '') : String(character || '');

    if (!charId) {
      return sortByPriority(all);
    }

    // 角色侧绑定（character.worldbookIds）
    const ids = normalizeList(charObj?.worldbookIds).map(String);
    const mode = charObj?.worldbookMode || 'bound_plus_global';
    const bound = all.filter((item) => ids.includes(String(item.id)));

    if (mode === 'only_bound') {
      // 仅角色绑定的条目，但也包含条目侧显式 targetIds 命中本角色的条目
      const entryBound = all.filter((item) => {
        if (ids.includes(String(item.id))) return false;
        const targets = item.targetIds;
        if (targets === 'all' || (Array.isArray(targets) && targets.includes('all'))) return false;
        return Array.isArray(targets) && targets.includes(charId);
      });
      return sortByPriority([...bound, ...entryBound]);
    }

    const global = all.filter((item) => {
      if (ids.includes(String(item.id))) return false;
      if (item.characterId && String(item.characterId) !== charId) return false;
      return item.global === true || item.isGlobal === true || !item.characterId;
    });

    // 条目侧显式 targetIds 命中本角色的条目
    const entryBound = all.filter((item) => {
      if (ids.includes(String(item.id))) return false;
      if (global.includes(item)) return false;
      const targets = item.targetIds;
      if (targets === 'all' || (Array.isArray(targets) && targets.includes('all'))) return false;
      return Array.isArray(targets) && targets.includes(charId);
    });

    return sortByPriority([...bound, ...global, ...entryBound]);
  } catch (error) {
    console.warn('[worldbook] getWorldbookForCharacter failed', error);
    return [];
  }
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sortByPriority(items) {
  const priorityOrder = { core: 4, high: 3, normal: 2, low: 1 };
  return items
    .filter((entry) => entry.content && String(entry.content).trim())
    .sort((a, b) => (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2));
}

function formatWorldbookPart(entry) {
  const category = getCategoryName(entry.category);
  const priority = getPriorityName(entry.priority);
  const mode = getInjectionName(entry.injectionMode);
  const keywords = Array.isArray(entry.keywords) && entry.keywords.length
    ? `\n关键词：${entry.keywords.join('、')}`
    : '';

  return `【${entry.title || '未命名'}｜${category}｜${priority}｜${mode}】${keywords}\n${String(entry.content).trim()}`;
}

function normalizeEntry(entry) {
  const type = entry?.type === 'B' ? 'B' : 'A';
  const category = entry?.category || (type === 'B' ? 'thinking' : 'profile');

  return {
    id: entry?.id || generateId(),
    type,
    title: entry?.title || '未命名',
    content: entry?.content || '',
    targetIds: normalizeTargetIdsForSave(entry?.targetIds),
    enabled: entry?.enabled !== false,
    category,
    priority: PRIORITIES.some((item) => item.id === entry?.priority) ? entry.priority : 'normal',
    keywords: normalizeKeywords(entry?.keywords),
    injectionMode: INJECTION_MODES.some((item) => item.id === entry?.injectionMode) ? entry.injectionMode : 'always',
    createdAt: entry?.createdAt || getNow(),
    updatedAt: entry?.updatedAt || entry?.createdAt || getNow()
  };
}

function normalizeKeywords(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
  }

  return String(value || '')
    .split(/[，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function createTabButton(type, label) {
  const button = document.createElement('button');
  button.className = `wb-tab-btn ${currentTab === type ? 'active' : ''}`;
  button.type = 'button';
  button.textContent = label;
  button.dataset.tab = type;

  button.addEventListener('click', async () => {
    currentTab = type;
    container.querySelectorAll('.wb-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === currentTab);
    });
    await renderList();
  });

  return button;
}

async function renderList() {
  const wrap = container?.querySelector('.wb-list-wrap');
  if (!wrap) return;

  allChars = await getAllDB('characters');

  const entries = (await getWorldbookEntries())
    .filter((entry) => entry && entry.type === currentTab)
    .sort((a, b) => {
      const order = { core: 4, high: 3, normal: 2, low: 1 };
      const diff = (order[b.priority] || 2) - (order[a.priority] || 2);
      if (diff !== 0) return diff;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  await loadVisualCache(entries);
  wrap.innerHTML = '';

  if (!entries.length) {
    wrap.appendChild(createEmptyState());
    return;
  }

  const list = document.createElement('div');
  list.className = 'wb-list';

  entries.forEach((entry) => {
    list.appendChild(createCard(entry));
  });

  wrap.appendChild(list);
}

async function loadVisualCache(entries) {
  await Promise.all(entries.map(async (entry) => {
    if (!coverCache.has(entry.id)) {
      const cover = await getDB('blobs', getCoverKey(entry.id)).catch(() => null);
      const value = getImageFromRecord(cover);
      if (value) coverCache.set(entry.id, value);
    }

    if (!iconCache.has(entry.id)) {
      const icon = await getDB('blobs', getIconKey(entry.id)).catch(() => null);
      const value = getImageFromRecord(icon);
      if (value) iconCache.set(entry.id, value);
    }
  }));
}

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'wb-empty';

  const icon = document.createElement('div');
  icon.className = 'wb-empty-icon';
  icon.appendChild(createIcon(currentTab === 'A' ? 'memory' : 'star', 26));

  const title = document.createElement('div');
  title.className = 'wb-empty-title';
  title.textContent = currentTab === 'A' ? '还没有人设背景' : '还没有思维方式';

  const text = document.createElement('div');
  text.className = 'wb-empty-text';
  text.textContent = currentTab === 'A'
    ? '这里可以写角色背景、世界观和关系设定'
    : '这里可以写所有角色都会参考的思考方式';

  empty.append(icon, title, text);
  return empty;
}

function createCard(entry) {
  const card = document.createElement('article');
  card.className = 'wb-card';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;

  const cover = createCoverBox(entry);
  const top = document.createElement('div');
  top.className = 'wb-card-top';

  const head = document.createElement('div');
  head.className = 'wb-card-head';

  const icon = createIconBox(entry);

  const info = document.createElement('div');
  info.className = 'wb-card-info';

  const title = document.createElement('div');
  title.className = 'wb-card-title';
  title.textContent = entry.title || '未命名';

  const type = document.createElement('div');
  type.className = 'wb-card-type';
  type.textContent = `${entry.type === 'A' ? '人设背景' : '思维方式'} · ${getCategoryName(entry.category)} · ${getPriorityName(entry.priority)}${entry.enabled === false ? ' · 已禁用' : ''}`;

  info.append(title, type);
  head.append(icon, info);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `switch ${entry.enabled !== false ? 'active' : ''}`;
  toggle.setAttribute('aria-label', entry.enabled !== false ? '禁用' : '启用');
  toggle.addEventListener('click', async (event) => {
    event.stopPropagation();
    await setDB('worldbook', entry.id, {
      ...entry,
      enabled: entry.enabled === false,
      updatedAt: getNow()
    });
    showToast(entry.enabled === false ? '已启用' : '已禁用');
    await renderList();
  });

  top.append(head, toggle);

  const preview = document.createElement('div');
  preview.className = 'wb-card-preview';
  preview.textContent = entry.content || '暂无内容';

  const tags = createTags(entry);

  const actions = document.createElement('div');
  actions.className = 'wb-card-actions';

  const imageBtn = document.createElement('button');
  imageBtn.className = 'wb-action-btn';
  imageBtn.type = 'button';
  imageBtn.append(createIcon('image', 14), document.createTextNode('换图'));
  imageBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openEntryImageSheet(entry);
  });

  const editBtn = document.createElement('button');
  editBtn.className = 'wb-action-btn';
  editBtn.type = 'button';
  editBtn.append(createIcon('edit', 14), document.createTextNode('编辑'));
  editBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openEditor(entry);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'wb-action-btn danger';
  deleteBtn.type = 'button';
  deleteBtn.append(createIcon('delete', 14), document.createTextNode('删除'));
  deleteBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    await deleteEntry(entry);
  });

  actions.append(imageBtn, editBtn, deleteBtn);
  card.append(cover, top, preview);

  if (tags) card.appendChild(tags);
  card.appendChild(actions);

  card.addEventListener('click', () => openDetailSheet(entry));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetailSheet(entry);
    }
  });

  return card;
}

function createCoverBox(entry) {
  const box = document.createElement('div');
  box.className = 'wb-card-cover';

  const cover = coverCache.get(entry.id);
  if (cover) {
    const img = document.createElement('img');
    img.src = cover;
    img.alt = '';
    img.dataset.wbId = entry.id;
    img.dataset.wbKind = 'cover';
    img.style.opacity = String(getVisualOpacity(entry.id));
    box.appendChild(img);
  } else {
    box.appendChild(createIcon(entry.type === 'A' ? 'memory' : 'star', 30));
  }

  return box;
}

function createIconBox(entry) {
  const box = document.createElement('div');
  box.className = 'wb-card-icon';

  const icon = iconCache.get(entry.id);
  if (icon) {
    const img = document.createElement('img');
    img.src = icon;
    img.alt = '';
    img.dataset.wbId = entry.id;
    img.dataset.wbKind = 'icon';
    img.style.opacity = String(getVisualOpacity(entry.id));
    box.appendChild(img);
  } else {
    box.appendChild(createIcon(entry.type === 'A' ? 'memory' : 'star', 19));
  }

  return box;
}

function createTags(entry) {
  const tags = document.createElement('div');
  tags.className = 'wb-card-tags';

  const category = document.createElement('span');
  category.className = 'wb-tag';
  category.textContent = getCategoryName(entry.category);

  const mode = document.createElement('span');
  mode.className = 'wb-tag all';
  mode.textContent = getInjectionName(entry.injectionMode);

  tags.append(category, mode);

  if (entry.keywords?.length) {
    const keyword = document.createElement('span');
    keyword.className = 'wb-tag all';
    keyword.textContent = `关键词 ${entry.keywords.slice(0, 3).join('、')}`;
    tags.appendChild(keyword);
  }

  if (entry.type !== 'A') return tags;

  const targets = entry.targetIds;

  if (targets === 'all' || (Array.isArray(targets) && targets.includes('all'))) {
    const tag = document.createElement('span');
    tag.className = 'wb-tag all';
    tag.textContent = '通用 · 所有角色';
    tags.appendChild(tag);
    return tags;
  }

  if (!Array.isArray(targets) || targets.length === 0) {
    const tag = document.createElement('span');
    tag.className = 'wb-tag all';
    tag.textContent = '未绑定角色';
    tags.appendChild(tag);
    return tags;
  }

  targets.forEach((id) => {
    const char = allChars.find((item) => item.id === id);
    const tag = document.createElement('span');
    tag.className = 'wb-tag';

    if (char?.avatar) {
      const img = document.createElement('img');
      img.className = 'wb-tag-avatar';
      img.src = char.avatar;
      img.alt = '';
      tag.appendChild(img);
    }

    tag.appendChild(document.createTextNode(char?.name || '未知角色'));
    tags.appendChild(tag);
  });

  return tags;
}

function openDetailSheet(entry) {
  const sheet = document.createElement('div');
  sheet.className = 'wb-sheet';

  const title = document.createElement('div');
  title.className = 'wb-sheet-title';
  title.textContent = entry.title || '未命名';

  const meta = document.createElement('div');
  meta.className = 'wb-detail-meta';

  [
    entry.type === 'A' ? '人设背景' : '思维方式',
    getCategoryName(entry.category),
    getPriorityName(entry.priority),
    getInjectionName(entry.injectionMode),
    entry.enabled === false ? '已禁用' : '启用中'
  ].forEach((text) => {
    const tag = document.createElement('span');
    tag.className = 'wb-tag all';
    tag.textContent = text;
    meta.appendChild(tag);
  });

  const content = document.createElement('div');
  content.className = 'wb-detail-content';
  content.textContent = entry.content || '暂无内容';

  const actions = document.createElement('div');
  actions.className = 'wb-card-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'wb-action-btn';
  editBtn.type = 'button';
  editBtn.append(createIcon('edit', 14), document.createTextNode('编辑'));
  editBtn.addEventListener('click', () => openEditor(entry));

  const imageBtn = document.createElement('button');
  imageBtn.className = 'wb-action-btn';
  imageBtn.type = 'button';
  imageBtn.append(createIcon('image', 14), document.createTextNode('换图'));
  imageBtn.addEventListener('click', () => openEntryImageSheet(entry));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'wb-action-btn danger';
  deleteBtn.type = 'button';
  deleteBtn.append(createIcon('delete', 14), document.createTextNode('删除'));
  deleteBtn.addEventListener('click', () => deleteEntry(entry));

  actions.append(editBtn, imageBtn, deleteBtn);
  sheet.append(title, meta, content, actions);

  showBottomSheet(sheet);
}

async function deleteEntry(entry) {
  const ok = await showConfirm(`确定删除「${entry.title || '未命名'}」吗？`);
  if (!ok) return;

  await deleteDB('worldbook', entry.id);
  await deleteDB('blobs', getCoverKey(entry.id));
  await deleteDB('blobs', getIconKey(entry.id));
  removeVisualMeta(entry.id);

  coverCache.delete(entry.id);
  iconCache.delete(entry.id);

  hideBottomSheet();
  showToast('已删除');
  await renderList();
  try {
    window.AppBus?.emit('worldbook:updated', { entryId: entry.id, deleted: true });
  } catch (_) {}
}

function openEditor(entry) {
  editingEntry = entry ? normalizeEntry(entry) : null;
  const isEdit = Boolean(editingEntry);
  const initialType = editingEntry?.type === 'B' ? 'B' : 'A';

  if (editingEntry?.type === 'A') {
    selectedChars = normalizeTargetIds(editingEntry.targetIds);
  } else {
    selectedChars = [];
  }

  const sheet = document.createElement('div');
  sheet.className = 'wb-sheet';

  const title = document.createElement('div');
  title.className = 'wb-sheet-title';
  title.textContent = isEdit ? '编辑世界书' : '新增世界书';

  const typeField = createTypeField(initialType, sheet);
  const bindField = createBindField(initialType);
  const titleField = createTextField('标题', '给这条设定起个名字', editingEntry?.title || '');
  const categoryField = createSelectField('分类', CATEGORIES, editingEntry?.category || (initialType === 'B' ? 'thinking' : 'profile'));
  const priorityField = createChoiceField('优先级', PRIORITIES, editingEntry?.priority || 'normal');
  const modeField = createChoiceField('注入方式', INJECTION_MODES, editingEntry?.injectionMode || 'always');
  const keywordField = createTextField('关键词', '用逗号分开，关键词触发时会用到', (editingEntry?.keywords || []).join('，'));
  const contentField = createTextareaField('内容', '写下背景、世界观、说话方式或思维模式', editingEntry?.content || '');
  const enabledRow = createEnabledRow(editingEntry?.enabled !== false);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'wb-save-btn';
  saveBtn.type = 'button';
  saveBtn.textContent = isEdit ? '保存修改' : '添加条目';

  saveBtn.addEventListener('click', async () => {
    const type = sheet.querySelector('.wb-type-btn.active')?.dataset.type || 'A';
    const nextTitle = titleField.querySelector('input').value.trim();
    const nextContent = contentField.querySelector('textarea').value.trim();
    const enabled = enabledRow.querySelector('.switch').classList.contains('active');
    const priority = priorityField.querySelector('.wb-choice-chip.selected')?.dataset.value || 'normal';
    const injectionMode = modeField.querySelector('.wb-choice-chip.selected')?.dataset.value || 'always';

    if (!nextTitle) {
      showToast('标题还没写');
      return;
    }

    if (!nextContent) {
      showToast('内容还没写');
      return;
    }

    const targetIds = type === 'A'
      ? (selectedChars.includes('all') || selectedChars.length === 0 ? 'all' : [...selectedChars])
      : 'all';

    const nextEntry = normalizeEntry({
      id: editingEntry?.id || generateId(),
      type,
      title: nextTitle,
      content: nextContent,
      targetIds,
      enabled,
      category: categoryField.querySelector('select').value,
      priority,
      keywords: normalizeKeywords(keywordField.querySelector('input').value),
      injectionMode,
      createdAt: editingEntry?.createdAt || getNow(),
      updatedAt: getNow()
    });

    await setDB('worldbook', nextEntry.id, nextEntry);
    hideBottomSheet();
    showToast(isEdit ? '已保存' : '已添加');
    editingEntry = null;
    await renderList();
    try {
      window.AppBus?.emit('worldbook:updated', { entryId: nextEntry.id, saved: true, isEdit });
    } catch (_) {}
  });

  sheet.append(title, typeField, bindField, titleField, categoryField, priorityField, modeField, keywordField, contentField, enabledRow, saveBtn);

  if (isEdit) {
    const imageBtn = document.createElement('button');
    imageBtn.className = 'wb-danger-btn';
    imageBtn.type = 'button';
    imageBtn.textContent = '更换这条的人设封面';
    imageBtn.addEventListener('click', () => openEntryImageSheet(editingEntry));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'wb-danger-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = '删除该人设';
    deleteBtn.addEventListener('click', async () => {
      await deleteEntry(editingEntry);
    });

    sheet.append(imageBtn, deleteBtn);
  }

  showBottomSheet(sheet);
}

function createTypeField(initialType, sheet) {
  const field = document.createElement('div');
  field.className = 'wb-field';

  const label = createFieldLabel('edit', '类型');
  const toggle = document.createElement('div');
  toggle.className = 'wb-type-toggle';

  const btnA = document.createElement('button');
  btnA.className = `wb-type-btn ${initialType === 'A' ? 'active' : ''}`;
  btnA.type = 'button';
  btnA.dataset.type = 'A';
  btnA.textContent = '人设背景';

  const btnB = document.createElement('button');
  btnB.className = `wb-type-btn ${initialType === 'B' ? 'active' : ''}`;
  btnB.type = 'button';
  btnB.dataset.type = 'B';
  btnB.textContent = '思维方式';

  const hint = document.createElement('div');
  hint.className = 'wb-type-hint';
  hint.textContent = initialType === 'A'
    ? '人设背景可以绑定指定角色，也可以给全部角色使用'
    : '思维方式会自动给全部角色使用';

  function setType(type) {
    toggle.querySelectorAll('.wb-type-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    const bindField = sheet.querySelector('.wb-bind-field');
    if (bindField) {
      bindField.style.display = type === 'A' ? '' : 'none';
    }

    const categorySelect = sheet.querySelector('[data-role="category-select"]');
    if (categorySelect && type === 'B') categorySelect.value = 'thinking';

    hint.textContent = type === 'A'
      ? '人设背景可以绑定指定角色，也可以给全部角色使用'
      : '思维方式会自动给全部角色使用';
  }

  btnA.addEventListener('click', () => setType('A'));
  btnB.addEventListener('click', () => setType('B'));

  toggle.append(btnA, btnB);
  field.append(label, toggle, hint);
  return field;
}

function createBindField(initialType) {
  const field = document.createElement('div');
  field.className = 'wb-field wb-bind-field';
  field.style.display = initialType === 'A' ? '' : 'none';

  const label = createFieldLabel('heart', '绑定角色');
  const grid = document.createElement('div');
  grid.className = 'wb-char-grid';

  field.append(label, grid);
  renderCharChips(grid);

  return field;
}

function renderCharChips(grid) {
  grid.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = `wb-char-chip all-chip ${selectedChars.includes('all') ? 'selected' : ''}`;
  allChip.textContent = '通用';
  allChip.addEventListener('click', () => {
    selectedChars = selectedChars.includes('all') ? [] : ['all'];
    renderCharChips(grid);
  });
  grid.appendChild(allChip);

  allChars.forEach((char) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `wb-char-chip ${selectedChars.includes(char.id) && !selectedChars.includes('all') ? 'selected' : ''}`;

    if (char.avatar) {
      const img = document.createElement('img');
      img.className = 'wb-char-avatar';
      img.src = char.avatar;
      img.alt = '';
      chip.appendChild(img);
    }

    chip.appendChild(document.createTextNode(char.name || '未命名'));

    chip.addEventListener('click', () => {
      if (selectedChars.includes('all')) {
        selectedChars = [char.id];
      } else if (selectedChars.includes(char.id)) {
        selectedChars = selectedChars.filter((id) => id !== char.id);
      } else {
        selectedChars.push(char.id);
      }

      renderCharChips(grid);
    });

    grid.appendChild(chip);
  });

  if (!allChars.length) {
    const hint = document.createElement('div');
    hint.className = 'wb-type-hint';
    hint.textContent = '还没有角色，之后创建角色也可以回来绑定';
    grid.appendChild(hint);
  }
}

function createTextField(labelText, placeholder, value) {
  const field = document.createElement('div');
  field.className = 'wb-field';

  const label = createFieldLabel('memory', labelText);
  const input = document.createElement('input');
  input.className = 'wb-input';
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = value;

  field.append(label, input);
  return field;
}

function createSelectField(labelText, options, value) {
  const field = document.createElement('div');
  field.className = 'wb-field';

  const label = createFieldLabel('star', labelText);
  const select = document.createElement('select');
  select.className = 'wb-select';
  select.dataset.role = 'category-select';

  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = option.name;
    item.selected = option.id === value;
    select.appendChild(item);
  });

  field.append(label, select);
  return field;
}

function createChoiceField(labelText, options, value) {
  const field = document.createElement('div');
  field.className = 'wb-field';

  const label = createFieldLabel('check', labelText);
  const grid = document.createElement('div');
  grid.className = 'wb-choice-grid';

  options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `wb-choice-chip ${option.id === value ? 'selected' : ''}`;
    button.dataset.value = option.id;
    button.textContent = option.name;
    button.addEventListener('click', () => {
      grid.querySelectorAll('.wb-choice-chip').forEach((item) => {
        item.classList.toggle('selected', item.dataset.value === option.id);
      });
    });
    grid.appendChild(button);
  });

  field.append(label, grid);
  return field;
}

function createTextareaField(labelText, placeholder, value) {
  const field = document.createElement('div');
  field.className = 'wb-field';

  const label = createFieldLabel('edit', labelText);
  const textarea = document.createElement('textarea');
  textarea.className = 'wb-textarea';
  textarea.placeholder = placeholder;
  textarea.value = value;

  field.append(label, textarea);
  return field;
}

function createEnabledRow(enabled) {
  const row = document.createElement('div');
  row.className = 'wb-enable-row';

  const label = document.createElement('div');
  label.className = 'wb-enable-label';
  label.textContent = '启用';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `switch ${enabled ? 'active' : ''}`;
  toggle.setAttribute('aria-label', '启用开关');
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
  });

  row.append(label, toggle);
  return row;
}

function createFieldLabel(iconName, text) {
  const label = document.createElement('div');
  label.className = 'wb-field-label';
  label.append(createIcon(iconName, 15), document.createTextNode(text));
  return label;
}

function openCustomizeSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'wb-sheet';

  const title = document.createElement('div');
  title.className = 'wb-sheet-title';
  title.textContent = '装扮世界书';

  const bgSection = createCustomSection('页面背景', '给世界书换一张适合设定本的背景。');
  bgSection.querySelector('.wb-custom-actions').append(
    createUploadButton('上传背景', BG_KEY, async () => {
      const screen = container?.querySelector('.wb-screen');
      if (screen) await applyWorldbookBackground(screen);
    }),
    createClearBlobButton('清除背景', BG_KEY, async () => {
      const screen = container?.querySelector('.wb-screen');
      if (screen) await applyWorldbookBackground(screen);
    })
  );

  const dataSection = createCustomSection('数据备份', '可以导出全部世界书，也可以从 JSON 导入。');
  const exportBtn = document.createElement('button');
  exportBtn.className = 'wb-mini-btn primary';
  exportBtn.type = 'button';
  exportBtn.append(createIcon('download', 15), document.createTextNode('导出全部'));
  exportBtn.addEventListener('click', exportWorldbook);

  const importBtn = document.createElement('button');
  importBtn.className = 'wb-mini-btn';
  importBtn.type = 'button';
  importBtn.append(createIcon('upload', 15), document.createTextNode('导入 JSON'));
  importBtn.addEventListener('click', importWorldbook);

  dataSection.querySelector('.wb-custom-actions').append(exportBtn, importBtn);

  sheet.append(title, bgSection, dataSection);
  showBottomSheet(sheet);
}

function openEntryImageSheet(entry) {
  const meta = getVisualMeta(entry.id);
  const currentOpacity = getVisualOpacity(entry.id);

  const sheet = document.createElement('div');
  sheet.className = 'wb-sheet';

  const title = document.createElement('div');
  title.className = 'wb-sheet-title';
  title.textContent = '装扮这条设定';

  const coverSection = createCustomSection('封面', '显示在条目卡片上方。');
  coverSection.querySelector('.wb-custom-actions').append(
    createUploadButton('上传封面', getCoverKey(entry.id), async (value) => {
      coverCache.set(entry.id, value);
      setVisualMeta(entry.id, { name: entry.title, opacity: getVisualOpacity(entry.id) });
      await renderList();
    }),
    createClearBlobButton('清除封面', getCoverKey(entry.id), async () => {
      coverCache.delete(entry.id);
      await renderList();
    })
  );

  const iconSection = createCustomSection('小图', '显示在标题左侧。');
  iconSection.querySelector('.wb-custom-actions').append(
    createUploadButton('上传小图', getIconKey(entry.id), async (value) => {
      iconCache.set(entry.id, value);
      setVisualMeta(entry.id, { name: entry.title, opacity: getVisualOpacity(entry.id) });
      await renderList();
    }),
    createClearBlobButton('清除小图', getIconKey(entry.id), async () => {
      iconCache.delete(entry.id);
      await renderList();
    })
  );

  const opacitySection = createCustomSection('图片透明度', '封面和小图会一起变淡或变清楚。');
  const range = document.createElement('input');
  range.className = 'wb-range';
  range.type = 'range';
  range.min = '8';
  range.max = '100';
  range.value = String(Math.round(currentOpacity * 100));

  range.addEventListener('input', () => {
    const opacity = Math.min(1, Math.max(0.08, Number(range.value) / 100));
    previewVisualOpacity(entry.id, opacity);
  });

  range.addEventListener('change', () => {
    const opacity = Math.min(1, Math.max(0.08, Number(range.value) / 100));
    setVisualMeta(entry.id, {
      ...meta,
      name: entry.title,
      opacity
    });
    showToast('透明度已保存');
  });

  opacitySection.appendChild(range);

  sheet.append(title, coverSection, iconSection, opacitySection);
  showBottomSheet(sheet);
}

function createCustomSection(titleText, subText) {
  const section = document.createElement('section');
  section.className = 'wb-custom-section';

  const title = document.createElement('div');
  title.className = 'wb-custom-title';
  title.textContent = titleText;

  const sub = document.createElement('div');
  sub.className = 'wb-custom-sub';
  sub.textContent = subText;

  const actions = document.createElement('div');
  actions.className = 'wb-custom-actions';

  section.append(title, sub, actions);
  return section;
}

function createUploadButton(label, key, afterSave) {
  const button = document.createElement('button');
  button.className = 'wb-mini-btn primary';
  button.type = 'button';
  button.append(createIcon('upload', 15), document.createTextNode(label));
  button.addEventListener('click', () => chooseImage(async (file) => {
    const value = await compressImage(file, 1600, 0.86);
    await setDB('blobs', key, {
      key,
      value,
      source: value,
      opacity: 1,
      updatedAt: getNow()
    });
    await afterSave?.(value);
    hideBottomSheet();
    showToast('已保存');
  }));
  return button;
}

function createClearBlobButton(label, key, afterClear) {
  const button = document.createElement('button');
  button.className = 'wb-mini-btn';
  button.type = 'button';
  button.append(createIcon('clear', 15), document.createTextNode(label));
  button.addEventListener('click', async () => {
    await deleteDB('blobs', key);
    await afterClear?.();
    hideBottomSheet();
    showToast('已清除');
  });
  return button;
}

function chooseImage(onPicked) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      await onPicked(file);
    } catch (_) {
      showToast('图片处理失败');
    }
  });
  input.click();
}

async function applyWorldbookBackground(screen) {
  try {
    const record = await getDB('blobs', BG_KEY);
    const value = getImageFromRecord(record);

    if (!value) {
      screen.classList.remove('has-bg');
      screen.style.backgroundImage = '';
      return;
    }

    screen.classList.add('has-bg');
    screen.style.backgroundImage = `url("${cssUrl(value)}")`;
  } catch (_) {
    screen.classList.remove('has-bg');
    screen.style.backgroundImage = '';
  }
}

function getImageFromRecord(record) {
  if (!record) return '';
  if (typeof record === 'string') return record.trim();

  for (const key of ['value', 'source', 'image', 'imageBase64', 'backgroundImage', 'iconImage', 'url', 'src', 'data']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function cssUrl(value) {
  return String(value || '').replace(/"/g, '\\"');
}

function previewVisualOpacity(id, opacity) {
  const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"');
  container?.querySelectorAll(`[data-wb-id="${safeId}"]`).forEach((img) => {
    img.style.opacity = String(opacity);
  });
}

function getCoverKey(id) {
  return `${COVER_PREFIX}${id}`;
}

function getIconKey(id) {
  return `${ICON_PREFIX}${id}`;
}

function getVisuals() {
  const visuals = getData(VISUALS_KEY, {});
  return visuals && typeof visuals === 'object' ? visuals : {};
}

function getVisualMeta(id) {
  return getVisuals()[id] || null;
}

function setVisualMeta(id, meta) {
  const visuals = getVisuals();
  visuals[id] = {
    name: meta?.name || '',
    opacity: Number.isFinite(Number(meta?.opacity)) ? Number(meta.opacity) : 1,
    updatedAt: getNow()
  };
  setData(VISUALS_KEY, visuals);
}

function removeVisualMeta(id) {
  const visuals = getVisuals();
  delete visuals[id];
  setData(VISUALS_KEY, visuals);
}

function getVisualOpacity(id) {
  const meta = getVisualMeta(id);
  const value = Number(meta?.opacity);
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.08, value));
}

function normalizeTargetIds(targetIds) {
  if (targetIds === 'all') return ['all'];
  if (Array.isArray(targetIds) && targetIds.includes('all')) return ['all'];
  if (Array.isArray(targetIds)) return [...targetIds];
  return ['all'];
}

function normalizeTargetIdsForSave(targetIds) {
  if (targetIds === 'all') return 'all';
  if (Array.isArray(targetIds) && targetIds.includes('all')) return 'all';
  if (Array.isArray(targetIds) && targetIds.length) return [...targetIds];
  return 'all';
}

function getCategoryName(id) {
  return CATEGORIES.find((item) => item.id === id)?.name || '人设背景';
}

function getPriorityName(id) {
  return PRIORITIES.find((item) => item.id === id)?.name || '中';
}

function getInjectionName(id) {
  return INJECTION_MODES.find((item) => item.id === id)?.name || '一直参考';
}

async function exportWorldbook() {
  const entries = await getWorldbookEntries();
  const visuals = getVisuals();

  const blob = new Blob([JSON.stringify({
    entries,
    visuals,
    exportedAt: getNow()
  }, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `worldbook-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('已导出');
}

function importWorldbook() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const entries = Array.isArray(json) ? json : json.entries;

      if (!Array.isArray(entries)) {
        showToast('没有找到世界书条目');
        return;
      }

      for (const item of entries) {
        const entry = normalizeEntry({
          ...item,
          id: item.id || generateId(),
          createdAt: item.createdAt || getNow(),
          updatedAt: getNow()
        });
        await setDB('worldbook', entry.id, entry);
      }

      hideBottomSheet();
      showToast('导入完成');
      await renderList();
    } catch (_) {
      showToast('导入失败');
    }
  });
  input.click();
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getAllDB/getDB/setDB/deleteDB/compressImage；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon
