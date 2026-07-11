// apps/memo.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB, setDB, deleteDB, compressImage
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData, setData, generateId, getNow, getDB, setDB, deleteDB, compressImage, getAllDB
} from '../core/storage.js';

import {
  showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
} from '../core/ui.js';

const MEMO_KEY = 'memos';
const VISUALS_KEY = 'app_memo_visuals';
const STYLE_ID = 'memo-styles';
const BG_KEY = 'app_bg_memo';
const COVER_PREFIX = 'app_memo_cover_';

const CATEGORIES = [
  { id: 'life', name: '生活' },
  { id: 'idea', name: '灵感' },
  { id: 'todo', name: '待办' },
  { id: 'mood', name: '心情' },
  { id: 'story', name: '剧情' },
  { id: 'secret', name: '小秘密' }
];

let container = null;
let searchText = '';
let coverCache = new Map();

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .memo-screen{position:fixed;inset:0;z-index:10;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary);color:var(--text-primary)}
    .memo-screen.has-bg{background-size:cover;background-position:center;background-repeat:no-repeat}
    .memo-soft-layer{position:absolute;inset:0;z-index:0;pointer-events:none;background:color-mix(in srgb,var(--bg-primary) 80%,transparent)}
    .memo-nav{position:fixed;top:0;left:0;right:0;z-index:100;height:calc(56px + env(safe-area-inset-top));display:flex;align-items:center;gap:var(--spacing-sm);padding:env(safe-area-inset-top) 20px 0;background:var(--surface-glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .memo-nav-title{flex:1;min-width:0;color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .memo-body{position:relative;z-index:1;flex:1;overflow-x:hidden;overflow-y:auto;padding:calc(56px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
    .memo-hero{padding:22px;border-radius:28px;background:var(--bg-card);box-shadow:var(--shadow-md)}
    .memo-hero-top{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-md)}
    .memo-hero-title{color:var(--text-primary);font-size:24px;font-weight:600;line-height:1.25;letter-spacing:-.02em}
    .memo-hero-text{margin-top:8px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .memo-mark{width:48px;height:48px;flex:0 0 48px;display:flex;align-items:center;justify-content:center;border-radius:18px;background:var(--accent-light);color:var(--accent-dark);box-shadow:var(--shadow-sm);overflow:hidden}
    .memo-search-wrap{margin-top:var(--spacing-md);display:flex;align-items:center;gap:var(--spacing-sm);padding:0 14px;min-height:46px;border-radius:18px;background:var(--surface-muted);color:var(--text-secondary)}
    .memo-search-wrap svg{flex:0 0 18px}
    .memo-search{flex:1;min-width:0;background:transparent;color:var(--text-primary);font-size:var(--font-size-base)}
    .memo-search::placeholder{color:var(--text-hint)}
    .memo-list{display:flex;flex-direction:column;gap:var(--spacing-md);margin-top:var(--spacing-md)}
    .memo-card{padding:var(--spacing-md);border-radius:var(--radius-lg);background:var(--bg-card);box-shadow:var(--shadow-sm);transition:var(--motion);cursor:pointer;overflow:hidden}
    .memo-card:active{transform:scale(.98)}
    .memo-cover{height:116px;margin:-2px -2px 14px;border-radius:20px;background:var(--surface-muted);display:flex;align-items:center;justify-content:center;color:var(--accent-dark);overflow:hidden}
    .memo-cover img{width:100%;height:100%;object-fit:cover;display:block}
    .memo-cover svg{opacity:.82}
    .memo-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--spacing-md)}
    .memo-card-main{flex:1;min-width:0}
    .memo-card-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .memo-card-time{margin-top:3px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.4}
    .memo-card-text{margin-top:10px;color:var(--text-secondary);font-size:var(--font-size-base);line-height:1.6;white-space:pre-wrap;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
    .memo-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
    .memo-tag{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:var(--surface-muted);color:var(--text-secondary);font-size:12px;font-weight:500;line-height:1.4}
    .memo-tag.primary{background:var(--accent-light);color:var(--accent-dark)}
    .memo-actions{display:flex;align-items:center;gap:var(--spacing-sm);margin-top:14px;flex-wrap:wrap}
    .memo-action-btn{min-height:32px;display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:12px;color:var(--text-secondary);background:var(--surface-muted);font-size:var(--font-size-small);font-weight:500;transition:var(--motion)}
    .memo-action-btn:active,.memo-mini-btn:active,.memo-choice-chip:active{transform:scale(.96)}
    .memo-action-btn.danger{color:var(--accent-dark)}
    .memo-empty{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--spacing-sm);margin-top:var(--spacing-md);padding:var(--spacing-lg);border-radius:24px;background:var(--bg-card);box-shadow:var(--shadow-sm);color:var(--text-secondary);text-align:center}
    .memo-empty-icon{width:58px;height:58px;display:flex;align-items:center;justify-content:center;border-radius:22px;background:var(--accent-light);color:var(--accent-dark)}
    .memo-empty-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .memo-empty-text{max-width:260px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .memo-sheet-title{margin-bottom:var(--spacing-md);color:var(--text-primary);font-size:20px;font-weight:600;line-height:1.35;letter-spacing:-.01em}
    .memo-field{margin-bottom:var(--spacing-md)}
    .memo-field-label{display:flex;align-items:center;gap:6px;margin-bottom:var(--spacing-sm);color:var(--text-secondary);font-size:var(--font-size-small);font-weight:500;line-height:1.4}
    .memo-field-label svg{width:15px;height:15px;color:var(--accent)}
    .memo-input,.memo-textarea{width:100%;border-radius:var(--radius-md);background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-base)}
    .memo-input{min-height:46px;padding:10px var(--spacing-md)}
    .memo-textarea{min-height:220px;padding:12px var(--spacing-md);line-height:1.6;resize:none}
    .memo-input::placeholder,.memo-textarea::placeholder{color:var(--text-hint)}
    .memo-sheet-actions{display:flex;gap:var(--spacing-sm);margin-top:var(--spacing-lg);flex-wrap:wrap}
    .memo-sheet-actions button{flex:1}
    .memo-choice-grid{display:flex;flex-wrap:wrap;gap:var(--spacing-sm)}
    .memo-choice-chip{min-height:34px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;color:var(--text-secondary);background:var(--surface-muted);font-size:var(--font-size-small);font-weight:500;transition:var(--motion)}
    .memo-choice-chip.selected{background:var(--accent-light);color:var(--accent-dark)}
    .memo-switch-row{min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-md);margin-bottom:var(--spacing-md)}
    .memo-switch-title{color:var(--text-primary);font-size:var(--font-size-base);font-weight:500}
    .memo-switch-sub{margin-top:2px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.4}
    .memo-custom-section{padding:var(--spacing-md);border-radius:var(--radius-lg);background:var(--bg-card);box-shadow:var(--shadow-sm);margin-bottom:var(--spacing-md)}
    .memo-custom-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .memo-custom-sub{margin-top:4px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .memo-custom-actions{display:flex;gap:var(--spacing-sm);flex-wrap:wrap;margin-top:var(--spacing-md)}
    .memo-mini-btn{min-height:36px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:14px;background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-small);font-weight:600;transition:var(--motion)}
    .memo-mini-btn.primary{background:var(--accent);color:var(--bubble-user-text)}
    .memo-mini-btn.danger{color:var(--accent-dark)}
  `;

  document.head.appendChild(style);
}

function normalizeMemo(item) {
  return {
    id: item?.id || generateId(),
    title: item?.title || '未命名',
    content: item?.content || '',
    category: CATEGORIES.some((cat) => cat.id === item?.category) ? item.category : 'life',
    pinned: Boolean(item?.pinned),
    coverMode: item?.coverMode || 'none',
    createdAt: item?.createdAt || getNow(),
    updatedAt: item?.updatedAt || item?.createdAt || getNow()
  };
}

function readMemos() {
  const list = getData(MEMO_KEY);
  if (!Array.isArray(list)) return [];

  return list
    .filter((item) => item && typeof item === 'object')
    .map(normalizeMemo)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
    });
}

function saveMemos(list) {
  setData(MEMO_KEY, Array.isArray(list) ? list.map(normalizeMemo) : []);
}

function getVisuals() {
  const visuals = getData(VISUALS_KEY, {});
  return visuals && typeof visuals === 'object' ? visuals : {};
}

function setVisualMeta(id, meta = {}) {
  const visuals = getVisuals();
  visuals[id] = {
    name: meta.name || '',
    opacity: Number.isFinite(Number(meta.opacity)) ? Number(meta.opacity) : 1,
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
  const value = Number(getVisuals()[id]?.opacity);
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.08, value));
}

function getCoverKey(id) {
  return `${COVER_PREFIX}${id}`;
}

function getCategoryName(id) {
  return CATEGORIES.find((item) => item.id === id)?.name || '生活';
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '刚刚';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;
  searchText = '';
  coverCache = new Map();

  const screen = document.createElement('section');
  screen.className = 'memo-screen';

  const softLayer = document.createElement('div');
  softLayer.className = 'memo-soft-layer';

  const nav = document.createElement('div');
  nav.className = 'memo-nav';

  const backButton = document.createElement('button');
  backButton.className = 'icon-button';
  backButton.type = 'button';
  backButton.setAttribute('aria-label', '返回');
  backButton.appendChild(createIcon('back', 22));
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'memo-nav-title';
  title.textContent = '备忘录';

  const customButton = document.createElement('button');
  customButton.className = 'icon-button soft';
  customButton.type = 'button';
  customButton.setAttribute('aria-label', '装扮');
  customButton.appendChild(createIcon('edit', 22));
  customButton.addEventListener('click', openCustomizeSheet);

  const addButton = document.createElement('button');
  addButton.className = 'icon-button soft';
  addButton.type = 'button';
  addButton.setAttribute('aria-label', '新建');
  addButton.appendChild(createIcon('add', 22));
  addButton.addEventListener('click', () => openEditor(null));

  const body = document.createElement('div');
  body.className = 'memo-body';

  nav.append(backButton, title, customButton, addButton);
  screen.append(softLayer, nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  await applyMemoBackground(screen);
  await loadCoverCache(readMemos());
  renderMemo();
}

export function unmount() {
  coverCache = new Map();

  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

async function applyMemoBackground(screen) {
  try {
    const record = await getDB('blobs', BG_KEY);
    const value = record?.value || '';

    if (!value) {
      screen.classList.remove('has-bg');
      screen.style.backgroundImage = '';
      return;
    }

    screen.classList.add('has-bg');
    screen.style.backgroundImage = `url("${value}")`;
  } catch (_) {
    screen.classList.remove('has-bg');
    screen.style.backgroundImage = '';
  }
}

async function loadCoverCache(memos) {
  await Promise.all(memos.map(async (memo) => {
    if (coverCache.has(memo.id)) return;
    const record = await getDB('blobs', getCoverKey(memo.id)).catch(() => null);
    if (record?.value) coverCache.set(memo.id, record.value);
  }));
}

function getFilteredMemos() {
  const keyword = searchText.trim().toLowerCase();
  const memos = readMemos();

  if (!keyword) return memos;

  return memos.filter((memo) => {
    return `${memo.title}\n${memo.content}\n${getCategoryName(memo.category)}`
      .toLowerCase()
      .includes(keyword);
  });
}

function renderMemo(options = {}) {
  const body = container?.querySelector('.memo-body');
  if (!body) return;

  const all = readMemos();
  const memos = getFilteredMemos();

  body.innerHTML = '';

  const hero = document.createElement('section');
  hero.className = 'memo-hero';

  const heroTop = document.createElement('div');
  heroTop.className = 'memo-hero-top';

  const heroMain = document.createElement('div');

  const heroTitle = document.createElement('div');
  heroTitle.className = 'memo-hero-title';
  heroTitle.textContent = '把小想法先放这里';

  const heroText = document.createElement('div');
  heroText.className = 'memo-hero-text';
  heroText.textContent = all.length
    ? `已经收好 ${all.length} 条小记录`
    : '灵感、待办、心事，都可以轻轻记一下。';

  const mark = document.createElement('div');
  mark.className = 'memo-mark';
  mark.appendChild(createMemoSvg());

  heroMain.append(heroTitle, heroText);
  heroTop.append(heroMain, mark);
  hero.appendChild(heroTop);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'memo-search-wrap';
  searchWrap.appendChild(createIcon('search', 18));

  const search = document.createElement('input');
  search.className = 'memo-search';
  search.type = 'search';
  search.placeholder = '搜搜小纸条';
  search.value = searchText;
  search.addEventListener('input', async () => {
    const cursor = search.selectionStart || 0;
    searchText = search.value;
    await loadCoverCache(getFilteredMemos());
    renderMemo({
      focusSearch: true,
      cursor
    });
  });

  searchWrap.appendChild(search);

  body.append(hero, searchWrap);

  if (!memos.length) {
    body.appendChild(createEmptyState(searchText ? '没搜到小纸条' : '还没有小纸条', searchText ? '换个关键词试试看。' : '点右上角新建，把今天想到的事情先收起来。'));
    restoreSearchFocus(search, options);
    return;
  }

  const list = document.createElement('div');
  list.className = 'memo-list';

  memos.forEach((memo) => {
    list.appendChild(createMemoCard(memo));
  });

  body.appendChild(list);
  restoreSearchFocus(search, options);
}

function restoreSearchFocus(search, options) {
  if (!options?.focusSearch) return;

  window.requestAnimationFrame(() => {
    search.focus({ preventScroll: true });
    const cursor = Math.min(Number(options.cursor) || search.value.length, search.value.length);
    try {
      search.setSelectionRange(cursor, cursor);
    } catch (_) {}
  });
}

function createMemoCard(memo) {
  const card = document.createElement('article');
  card.className = 'memo-card';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;

  const cover = createCoverBox(memo);

  const top = document.createElement('div');
  top.className = 'memo-card-top';

  const main = document.createElement('div');
  main.className = 'memo-card-main';

  const title = document.createElement('div');
  title.className = 'memo-card-title';
  title.textContent = memo.title || '未命名';

  const time = document.createElement('div');
  time.className = 'memo-card-time';
  time.textContent = `更新于 ${formatTime(memo.updatedAt || memo.createdAt)}`;

  main.append(title, time);
  top.appendChild(main);

  const text = document.createElement('div');
  text.className = 'memo-card-text';
  text.textContent = memo.content || '还没有写内容';

  const tags = document.createElement('div');
  tags.className = 'memo-tags';

  const category = document.createElement('span');
  category.className = 'memo-tag primary';
  category.textContent = getCategoryName(memo.category);

  tags.appendChild(category);

  if (memo.pinned) {
    const pinned = document.createElement('span');
    pinned.className = 'memo-tag';
    pinned.textContent = '置顶';
    tags.appendChild(pinned);
  }

  const actions = document.createElement('div');
  actions.className = 'memo-actions';

  const imageButton = document.createElement('button');
  imageButton.className = 'memo-action-btn';
  imageButton.type = 'button';
  imageButton.append(createIcon('image', 14), document.createTextNode('换图'));
  imageButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openMemoImageSheet(memo);
  });

  const pinButton = document.createElement('button');
  pinButton.className = 'memo-action-btn';
  pinButton.type = 'button';
  pinButton.append(createIcon('star', 14), document.createTextNode(memo.pinned ? '取消置顶' : '置顶'));
  pinButton.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePinned(memo);
  });

  const editButton = document.createElement('button');
  editButton.className = 'memo-action-btn';
  editButton.type = 'button';
  editButton.append(createIcon('edit', 14), document.createTextNode('编辑'));
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openEditor(memo);
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'memo-action-btn danger';
  deleteButton.type = 'button';
  deleteButton.append(createIcon('delete', 14), document.createTextNode('删除'));
  deleteButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    await deleteMemo(memo);
  });

  actions.append(imageButton, pinButton, editButton, deleteButton);

  if (cover) card.appendChild(cover);
  card.append(top, text, tags, actions);

  card.addEventListener('click', () => openEditor(memo));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor(memo);
    }
  });

  return card;
}

function createCoverBox(memo) {
  const image = coverCache.get(memo.id);
  if (!image && memo.coverMode !== 'decor') return null;

  const box = document.createElement('div');
  box.className = 'memo-cover';

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    img.style.opacity = String(getVisualOpacity(memo.id));
    box.appendChild(img);
  } else {
    box.appendChild(createMemoSvg());
  }

  return box;
}

function createEmptyState(titleText, textContent) {
  const empty = document.createElement('div');
  empty.className = 'memo-empty';

  const icon = document.createElement('div');
  icon.className = 'memo-empty-icon';
  icon.appendChild(createIcon('edit', 26));

  const title = document.createElement('div');
  title.className = 'memo-empty-title';
  title.textContent = titleText;

  const text = document.createElement('div');
  text.className = 'memo-empty-text';
  text.textContent = textContent;

  empty.append(icon, title, text);
  return empty;
}

async function openEditor(memo) {
  const isEdit = Boolean(memo);
  const current = memo ? normalizeMemo(memo) : null;
  let selectedCategory = current?.category || 'life';
  let pendingCover = '';
  let syncEnabled = false;
  let syncCharacterId = '';

  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'memo-sheet-title';
  title.textContent = isEdit ? '编辑小纸条' : '新建小纸条';

  const titleField = createInputField('标题', '写个短短的标题', current?.title || '');
  const categoryField = createCategoryField(selectedCategory, (value) => {
    selectedCategory = value;
  });
  const pinRow = createSwitchRow('置顶这条', '会放在最上面，更容易找到。', current?.pinned || false);
  const contentField = createTextareaField('正文', '慢慢写，不急', current?.content || '');

  const imageButton = document.createElement('button');
  imageButton.className = 'memo-mini-btn';
  imageButton.type = 'button';
  imageButton.append(createIcon('image', 15), document.createTextNode(isEdit ? '更换封面图' : '选择封面图'));
  imageButton.addEventListener('click', () => chooseImage(async (file) => {
    pendingCover = await compressImage(file, 1400, 0.86);
    showToast('图片选好啦，保存后生效');
  }));

  // "让 TA 也记得这件事" 同步角色记忆
  const characters = await getAllDB('characters').catch(() => []);
  const syncRow = createSwitchRow('让 TA 也记得这件事', '勾选后会把这条备忘录写进 TA 的记忆。', false);
  const syncToggle = syncRow.querySelector('.switch');
  const syncSelect = document.createElement('select');
  syncSelect.className = 'memo-input';
  syncSelect.disabled = true;
  syncSelect.style.marginTop = 'var(--spacing-sm)';
  syncSelect.innerHTML = '<option value="">选择 TA</option>';
  characters.forEach((character) => {
    const option = document.createElement('option');
    option.value = character.id;
    option.textContent = character.name || '未命名';
    syncSelect.appendChild(option);
  });
  syncToggle.addEventListener('click', () => {
    syncEnabled = syncToggle.classList.contains('active');
    syncSelect.disabled = !syncEnabled;
  });
  syncSelect.addEventListener('change', () => {
    syncCharacterId = syncSelect.value;
  });

  const actions = document.createElement('div');
  actions.className = 'memo-sheet-actions';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn-ghost';
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', hideBottomSheet);

  const saveButton = document.createElement('button');
  saveButton.className = 'btn-primary';
  saveButton.type = 'button';
  saveButton.textContent = isEdit ? '保存' : '记下来';

  saveButton.addEventListener('click', async () => {
    const nextTitle = titleField.querySelector('input').value.trim();
    const nextContent = contentField.querySelector('textarea').value.trim();
    const pinned = pinRow.querySelector('.switch').classList.contains('active');

    if (!nextTitle && !nextContent) {
      showToast('还没有写内容');
      return;
    }

    const list = readMemos();
    const now = getNow();
    const memoId = current?.id || generateId();

    if (isEdit) {
      saveMemos(list.map((item) => {
        if (item.id !== current.id) return item;
        return normalizeMemo({
          ...item,
          title: nextTitle || '未命名',
          content: nextContent,
          category: selectedCategory,
          pinned,
          coverMode: pendingCover ? 'image' : item.coverMode,
          updatedAt: now
        });
      }));
    } else {
      list.unshift(normalizeMemo({
        id: memoId,
        title: nextTitle || '未命名',
        content: nextContent,
        category: selectedCategory,
        pinned,
        coverMode: pendingCover ? 'image' : 'none',
        createdAt: now,
        updatedAt: now
      }));
      saveMemos(list);
    }

    if (pendingCover) {
      await saveMemoCover(memoId, pendingCover, nextTitle || '未命名');
    }

    // 同步到角色记忆
    if (syncEnabled && syncCharacterId) {
      try {
        await window.AppBus.recordExternalInteraction({
          characterId: syncCharacterId,
          role: 'assistant',
          content: `我在备忘录里记下了：${nextTitle || '未命名'}。${nextContent}`.trim(),
          source: '备忘录',
          importance: selectedCategory === 'todo' ? 4 : 3
        });
      } catch (_) {}
    }

    hideBottomSheet();
    showToast(syncEnabled && syncCharacterId ? '已收好，TA 也记得啦' : '已收好');
    await loadCoverCache(readMemos());
    renderMemo();
  });

  actions.append(cancelButton, saveButton);
  sheet.append(title, titleField, categoryField, pinRow, imageButton, contentField, syncRow, syncSelect, actions);

  if (isEdit) {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'memo-mini-btn danger';
    deleteButton.type = 'button';
    deleteButton.style.width = '100%';
    deleteButton.style.marginTop = 'var(--spacing-sm)';
    deleteButton.append(createIcon('delete', 15), document.createTextNode('删除这条小纸条'));
    deleteButton.addEventListener('click', async () => {
      await deleteMemo(current);
      hideBottomSheet();
    });
    sheet.appendChild(deleteButton);
  }

  showBottomSheet(sheet);
}

function createCategoryField(value, onChange) {
  const field = document.createElement('div');
  field.className = 'memo-field';

  const label = createFieldLabel('star', '分类');
  const grid = document.createElement('div');
  grid.className = 'memo-choice-grid';

  CATEGORIES.forEach((cat) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `memo-choice-chip ${cat.id === value ? 'selected' : ''}`;
    button.dataset.value = cat.id;
    button.textContent = cat.name;
    button.addEventListener('click', () => {
      grid.querySelectorAll('.memo-choice-chip').forEach((item) => {
        item.classList.toggle('selected', item.dataset.value === cat.id);
      });
      onChange(cat.id);
    });
    grid.appendChild(button);
  });

  field.append(label, grid);
  return field;
}

function createSwitchRow(titleText, subText, active) {
  const row = document.createElement('div');
  row.className = 'memo-switch-row';

  const text = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'memo-switch-title';
  title.textContent = titleText;

  const sub = document.createElement('div');
  sub.className = 'memo-switch-sub';
  sub.textContent = subText;

  text.append(title, sub);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `switch ${active ? 'active' : ''}`;
  toggle.addEventListener('click', () => toggle.classList.toggle('active'));

  row.append(text, toggle);
  return row;
}

function createInputField(labelText, placeholder, value) {
  const field = document.createElement('div');
  field.className = 'memo-field';

  const label = createFieldLabel('edit', labelText);

  const input = document.createElement('input');
  input.className = 'memo-input';
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = value;

  field.append(label, input);
  return field;
}

function createTextareaField(labelText, placeholder, value) {
  const field = document.createElement('div');
  field.className = 'memo-field';

  const label = createFieldLabel('memory', labelText);

  const textarea = document.createElement('textarea');
  textarea.className = 'memo-textarea';
  textarea.placeholder = placeholder;
  textarea.value = value;

  field.append(label, textarea);
  return field;
}

function createFieldLabel(iconName, text) {
  const label = document.createElement('div');
  label.className = 'memo-field-label';
  label.append(createIcon(iconName, 15), document.createTextNode(text));
  return label;
}

async function togglePinned(memo) {
  saveMemos(readMemos().map((item) => {
    if (item.id !== memo.id) return item;
    return {
      ...item,
      pinned: !item.pinned,
      updatedAt: getNow()
    };
  }));

  showToast(memo.pinned ? '已取消置顶' : '已置顶');
  renderMemo();
}

async function deleteMemo(memo) {
  const ok = await showConfirm(`确定删除「${memo.title || '未命名'}」吗？`);
  if (!ok) return;

  const list = readMemos().filter((item) => item.id !== memo.id);
  saveMemos(list);
  await deleteDB('blobs', getCoverKey(memo.id));
  removeVisualMeta(memo.id);
  coverCache.delete(memo.id);

  showToast('已删除');
  renderMemo();
}

function openMemoImageSheet(memo) {
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'memo-sheet-title';
  title.textContent = '装扮这条小纸条';

  const section = createCustomSection('封面图', '上传一张图，让这条笔记更好认。');

  const upload = document.createElement('button');
  upload.className = 'memo-mini-btn primary';
  upload.type = 'button';
  upload.append(createIcon('upload', 15), document.createTextNode('上传封面'));
  upload.addEventListener('click', () => chooseImage(async (file) => {
    const value = await compressImage(file, 1400, 0.86);
    await saveMemoCover(memo.id, value, memo.title);
    saveMemos(readMemos().map((item) => item.id === memo.id ? { ...item, coverMode: 'image', updatedAt: getNow() } : item));
    hideBottomSheet();
    showToast('封面换好啦');
    renderMemo();
  }));

  const clear = document.createElement('button');
  clear.className = 'memo-mini-btn';
  clear.type = 'button';
  clear.append(createIcon('clear', 15), document.createTextNode('清除封面'));
  clear.addEventListener('click', async () => {
    await deleteDB('blobs', getCoverKey(memo.id));
    removeVisualMeta(memo.id);
    coverCache.delete(memo.id);
    saveMemos(readMemos().map((item) => item.id === memo.id ? { ...item, coverMode: 'none', updatedAt: getNow() } : item));
    hideBottomSheet();
    showToast('封面已清除');
    renderMemo();
  });

  section.querySelector('.memo-custom-actions').append(upload, clear);
  sheet.append(title, section);
  showBottomSheet(sheet);
}

async function saveMemoCover(id, value, name) {
  await setDB('blobs', getCoverKey(id), {
    key: getCoverKey(id),
    value,
    source: 'upload',
    opacity: 1,
    updatedAt: getNow()
  });

  coverCache.set(id, value);
  setVisualMeta(id, {
    name,
    opacity: 1
  });
}

function openCustomizeSheet() {
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'memo-sheet-title';
  title.textContent = '装扮备忘录';

  const bgSection = createCustomSection('页面背景', '给备忘录换一张温柔的背景。');

  const uploadBg = document.createElement('button');
  uploadBg.className = 'memo-mini-btn primary';
  uploadBg.type = 'button';
  uploadBg.append(createIcon('upload', 15), document.createTextNode('上传背景'));
  uploadBg.addEventListener('click', () => chooseImage(async (file) => {
    const value = await compressImage(file, 1600, 0.86);
    await setDB('blobs', BG_KEY, {
      key: BG_KEY,
      value,
      source: 'upload',
      opacity: 1,
      updatedAt: getNow()
    });
    const screen = container?.querySelector('.memo-screen');
    if (screen) await applyMemoBackground(screen);
    hideBottomSheet();
    showToast('背景换好啦');
  }));

  const clearBg = document.createElement('button');
  clearBg.className = 'memo-mini-btn';
  clearBg.type = 'button';
  clearBg.append(createIcon('clear', 15), document.createTextNode('清除背景'));
  clearBg.addEventListener('click', async () => {
    await deleteDB('blobs', BG_KEY);
    const screen = container?.querySelector('.memo-screen');
    if (screen) await applyMemoBackground(screen);
    hideBottomSheet();
    showToast('背景已清除');
  });

  bgSection.querySelector('.memo-custom-actions').append(uploadBg, clearBg);

  const dataSection = createCustomSection('数据备份', '导出文字数据，图片仍安全放在本机。');

  const exportBtn = document.createElement('button');
  exportBtn.className = 'memo-mini-btn primary';
  exportBtn.type = 'button';
  exportBtn.append(createIcon('download', 15), document.createTextNode('导出'));
  exportBtn.addEventListener('click', exportMemos);

  const importBtn = document.createElement('button');
  importBtn.className = 'memo-mini-btn';
  importBtn.type = 'button';
  importBtn.append(createIcon('upload', 15), document.createTextNode('导入 JSON'));
  importBtn.addEventListener('click', importMemos);

  dataSection.querySelector('.memo-custom-actions').append(exportBtn, importBtn);

  sheet.append(title, bgSection, dataSection);
  showBottomSheet(sheet);
}

function createCustomSection(titleText, subText) {
  const section = document.createElement('section');
  section.className = 'memo-custom-section';

  const title = document.createElement('div');
  title.className = 'memo-custom-title';
  title.textContent = titleText;

  const sub = document.createElement('div');
  sub.className = 'memo-custom-sub';
  sub.textContent = subText;

  const actions = document.createElement('div');
  actions.className = 'memo-custom-actions';

  section.append(title, sub, actions);
  return section;
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

function exportMemos() {
  const blob = new Blob([JSON.stringify({
    memos: readMemos(),
    visuals: getVisuals(),
    exportedAt: getNow()
  }, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `memos-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('已导出');
}

function importMemos() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const list = Array.isArray(json) ? json : json.memos;

      if (!Array.isArray(list)) {
        showToast('没有找到备忘录');
        return;
      }

      const current = readMemos();
      const incoming = list.map((item) => normalizeMemo({
        ...item,
        id: item.id || generateId(),
        updatedAt: item.updatedAt || getNow()
      }));

      saveMemos([...incoming, ...current]);
      hideBottomSheet();
      showToast('导入完成');
      await loadCoverCache(readMemos());
      renderMemo();
    } catch (_) {
      showToast('导入失败');
    }
  });

  input.click();
}

function createMemoSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '28');
  svg.setAttribute('viewBox', '0 0 28 28');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const paper = svgPath('M8 4.5h9.5L22 9v14.5H8V4.5z');
  paper.setAttribute('fill', 'var(--bg-card)');
  paper.setAttribute('opacity', '0.55');

  svg.append(
    paper,
    svgPath('M8 4.5h9.5L22 9v14.5H8V4.5z'),
    svgPath('M17.5 4.5V9H22'),
    svgPath('M11.5 13h7'),
    svgPath('M11.5 17h7'),
    svgPath('M11.5 21h4')
  );

  return svg;
}

function svgPath(d) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return path;
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getDB/setDB/deleteDB/compressImage；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon
