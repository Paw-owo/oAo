// apps/dream.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getByIndexDB, getAllDB, setDB, deleteDB
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
//   from '../core/api.js': silentRequest

import {
  getData, setData, generateId, getNow, getByIndexDB, getAllDB, setDB, deleteDB
} from '../core/storage.js';

import {
  showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
} from '../core/ui.js';

import { silentRequest } from '../core/api.js';
import { loadWorldbookPromptForCharacter } from '../core/worldbook-prompt.js';

const STYLE_ID = 'dream-styles';
const BG_KEY = 'app_bg_dream';
const TRIGGER_MS = 5 * 60 * 60 * 1000;

const MOODS = [
  { id: 'sweet', label: '甜甜' },
  { id: 'weird', label: '奇怪' },
  { id: 'funny', label: '搞笑' },
  { id: 'sad', label: '忧伤' },
  { id: 'adventure', label: '冒险' },
  { id: 'chaos', label: '混乱' }
];

let container = null;
let charactersCache = [];
let dreamsCache = [];
let filterCharId = 'all';
let searchText = '';
let pageView = 'list';
let unsubscribeCharsUpdated = null;
let currentDream = null;
let wakeMessages = [];
let generating = false;

// ============================================================
// 样式注入
// ============================================================

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .dream-screen{position:fixed;inset:0;z-index:10;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary);color:var(--text-primary)}
    .dream-screen.has-bg{background-size:cover;background-position:center;background-repeat:no-repeat}
    .dream-soft{position:absolute;inset:0;z-index:0;pointer-events:none;background:color-mix(in srgb,var(--bg-primary) 82%,transparent)}
    .dream-nav{position:fixed;top:0;left:0;right:0;z-index:100;height:calc(56px + env(safe-area-inset-top));display:flex;align-items:center;gap:8px;padding:env(safe-area-inset-top) 20px 0;background:var(--bg-primary);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .dream-nav-title{flex:1;min-width:0;color:var(--text-primary);font-size:17px;font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dream-nav-btn{width:38px;height:38px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm);transition:all 200ms ease;border:none;outline:none}
    .dream-nav-btn:active{transform:scale(.94)}
    .dream-body{position:relative;z-index:1;flex:1;overflow-x:hidden;overflow-y:auto;padding:calc(56px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
    .dream-hero{padding:22px;border-radius:28px;background:var(--bg-card);box-shadow:var(--shadow-md)}
    .dream-hero-top{display:flex;align-items:center;justify-content:space-between;gap:16px}
    .dream-hero-title{color:var(--text-primary);font-size:24px;font-weight:600;line-height:1.25;letter-spacing:-.02em}
    .dream-hero-text{margin-top:8px;color:var(--text-secondary);font-size:13px;line-height:1.6}
    .dream-mark{width:52px;height:52px;flex:0 0 52px;display:flex;align-items:center;justify-content:center;border-radius:20px;background:var(--accent-light);color:var(--accent-dark);box-shadow:var(--shadow-sm)}
    .dream-toggle{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:16px;padding:14px;border-radius:20px;background:var(--surface-muted)}
    .dream-toggle-title{color:var(--text-primary);font-size:15px;font-weight:600;line-height:1.35}
    .dream-toggle-sub{margin-top:3px;color:var(--text-secondary);font-size:13px;line-height:1.4}
    .dream-switch{width:48px;height:28px;flex:0 0 48px;border-radius:999px;background:color-mix(in srgb,var(--text-hint) 35%,transparent);position:relative;transition:all 200ms ease;border:none;outline:none}
    .dream-switch::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--bg-card);box-shadow:var(--shadow-sm);transition:all 200ms ease}
    .dream-switch.active{background:var(--accent)}
    .dream-switch.active::after{left:23px}
    .dream-search{margin-top:16px;display:flex;align-items:center;gap:8px;padding:0 14px;min-height:46px;border-radius:18px;background:var(--surface-muted);color:var(--text-secondary)}
    .dream-search svg{flex:0 0 18px}
    .dream-search input{flex:1;min-width:0;background:transparent;color:var(--text-primary);font-size:15px;border:none;outline:none}
    .dream-search input::placeholder{color:var(--text-hint)}
    .dream-filter{display:flex;gap:8px;margin-top:16px;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;padding-bottom:4px}
    .dream-filter::-webkit-scrollbar{display:none}
    .dream-chip{min-height:34px;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;color:var(--text-secondary);background:var(--surface-muted);font-size:13px;font-weight:500;white-space:nowrap;transition:all 200ms ease;border:none;outline:none}
    .dream-chip:active{transform:scale(.96)}
    .dream-chip.selected{background:var(--accent-light);color:var(--accent-dark)}
    .dream-chip-avatar{width:22px;height:22px;border-radius:8px;overflow:hidden;background:var(--accent-light);display:flex;align-items:center;justify-content:center;color:var(--accent-dark);flex:0 0 22px}
    .dream-chip-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .dream-chip-avatar svg{width:12px;height:12px}
    .dream-list{display:flex;flex-direction:column;gap:16px;margin-top:16px}
    .dream-card{padding:16px;border-radius:20px;background:var(--bg-card);box-shadow:var(--shadow-sm);transition:all 200ms ease;cursor:pointer;overflow:hidden;position:relative}
    .dream-card:nth-child(odd){transform:rotate(-.3deg)}
    .dream-card:nth-child(even){transform:rotate(.3deg)}
    .dream-card:active{transform:scale(.98) rotate(0deg)!important}
    .dream-card-side{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 3px 3px 0}
    .dream-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding-left:8px}
    .dream-card-avatar{width:36px;height:36px;flex:0 0 36px;border-radius:14px;background:var(--accent-light);color:var(--accent-dark);overflow:hidden;display:flex;align-items:center;justify-content:center}
    .dream-card-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .dream-card-avatar svg{width:18px;height:18px}
    .dream-card-meta{flex:1;min-width:0}
    .dream-card-name{color:var(--text-primary);font-size:15px;font-weight:600;line-height:1.35}
    .dream-card-date{margin-top:2px;color:var(--text-secondary);font-size:13px;line-height:1.4}
    .dream-mood{width:10px;height:10px;flex:0 0 10px;border-radius:50%;margin-top:4px}
    .dream-card-summary{margin-top:12px;padding-left:8px;color:var(--text-primary);font-size:15px;line-height:1.65;white-space:pre-wrap;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
    .dream-card-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;padding-left:8px}
    .dream-tag{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;background:var(--surface-muted);color:var(--text-secondary);font-size:12px;font-weight:500;line-height:1.4}
    .dream-tag.mood{background:color-mix(in srgb,var(--accent-light) 60%,transparent);color:var(--accent-dark)}
    .dream-unread{width:8px;height:8px;border-radius:50%;background:var(--accent);position:absolute;top:12px;right:12px}
    .dream-empty{min-height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;margin-top:16px;padding:24px;border-radius:24px;background:var(--bg-card);box-shadow:var(--shadow-sm);color:var(--text-secondary);text-align:center}
    .dream-empty-icon{width:58px;height:58px;display:flex;align-items:center;justify-content:center;border-radius:22px;background:var(--accent-light);color:var(--accent-dark)}
    .dream-empty-title{color:var(--text-primary);font-size:17px;font-weight:600;line-height:1.35}
    .dream-empty-text{max-width:260px;color:var(--text-secondary);font-size:13px;line-height:1.6}
    .dream-detail{position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary);color:var(--text-primary);animation:dreamSlide 280ms ease}
    @keyframes dreamSlide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    .dream-detail-body{position:relative;z-index:1;flex:1;overflow-x:hidden;overflow-y:auto;padding:calc(56px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
    .dream-detail-card{padding:24px;border-radius:28px;background:var(--bg-card);box-shadow:var(--shadow-md)}
    .dream-detail-header{display:flex;align-items:center;gap:16px;margin-bottom:16px}
    .dream-detail-avatar{width:48px;height:48px;flex:0 0 48px;border-radius:18px;background:var(--accent-light);color:var(--accent-dark);overflow:hidden;display:flex;align-items:center;justify-content:center}
    .dream-detail-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .dream-detail-avatar svg{width:24px;height:24px}
    .dream-detail-name{color:var(--text-primary);font-size:17px;font-weight:600;line-height:1.35}
    .dream-detail-date{margin-top:3px;color:var(--text-secondary);font-size:13px;line-height:1.4}
    .dream-detail-content{color:var(--text-primary);font-size:15px;line-height:1.8;white-space:pre-wrap;word-break:break-word}
    .dream-detail-info{margin-top:18px;padding:14px;border-radius:20px;background:var(--surface-muted);display:flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:13px;line-height:1.4}
    .dream-detail-info-dot{width:8px;height:8px;border-radius:50%;flex:0 0 8px}
    .dream-detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
    .dream-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
    .dream-btn{min-height:44px;flex:1;min-width:120px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;border-radius:18px;font-size:15px;font-weight:600;transition:all 200ms ease;border:none;outline:none;cursor:pointer}
    .dream-btn:active{transform:scale(.96)}
    .dream-btn.primary{background:var(--accent);color:var(--bubble-user-text)}
    .dream-btn.secondary{background:var(--surface-muted);color:var(--text-primary)}
    .dream-btn.danger{background:color-mix(in srgb,var(--accent-dark) 12%,transparent);color:var(--accent-dark)}
    .dream-wake{position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary);color:var(--text-primary);animation:dreamSlide 280ms ease}
    .dream-wake-body{position:relative;z-index:1;flex:1;overflow-x:hidden;overflow-y:auto;padding:calc(56px + env(safe-area-inset-top) + 18px) 20px 80px;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:16px}
    .dream-wake-context{padding:16px;border-radius:20px;background:var(--accent-light);color:var(--accent-dark);font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
    .dream-wake-msg{display:flex;gap:10px;align-items:flex-start}
    .dream-wake-msg.user{flex-direction:row-reverse}
    .dream-wake-msg-avatar{width:32px;height:32px;flex:0 0 32px;border-radius:12px;overflow:hidden;background:var(--accent-light);color:var(--accent-dark);display:flex;align-items:center;justify-content:center}
    .dream-wake-msg-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .dream-wake-msg-avatar svg{width:16px;height:16px}
    .dream-wake-bubble{max-width:78%;padding:10px 14px;border-radius:18px;font-size:15px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
    .dream-wake-msg:not(.user) .dream-wake-bubble{background:var(--bubble-ai-bg);color:var(--bubble-ai-text);border-bottom-left-radius:6px}
    .dream-wake-msg.user .dream-wake-bubble{background:var(--bubble-user-bg);color:var(--bubble-user-text);border-bottom-right-radius:6px}
    .dream-wake-bar{position:fixed;bottom:0;left:0;right:0;z-index:100;padding:12px 20px calc(12px + env(safe-area-inset-bottom));background:var(--bg-primary);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);display:flex;align-items:flex-end;gap:8px}
    .dream-wake-input{flex:1;min-height:40px;max-height:120px;padding:8px 14px;border-radius:18px;background:var(--surface-muted);color:var(--text-primary);font-size:15px;line-height:1.5;resize:none;overflow-y:auto;border:none;outline:none}
    .dream-wake-input::placeholder{color:var(--text-hint)}
    .dream-wake-send{width:40px;height:40px;flex:0 0 40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--accent);color:var(--bubble-user-text);box-shadow:var(--shadow-sm);transition:all 200ms ease;border:none;outline:none}
    .dream-wake-send:active{transform:scale(.9)}
    .dream-typing{display:flex;align-items:center;gap:4px;padding:8px 14px}
    .dream-typing span{width:6px;height:6px;border-radius:50%;background:var(--text-hint);animation:dotBounce 1.2s ease infinite}
    .dream-typing span:nth-child(2){animation-delay:.2s}
    .dream-typing span:nth-child(3){animation-delay:.4s}
    @keyframes dotBounce{0%,60%,100%{opacity:.3;transform:scale(.8)}30%{opacity:1;transform:scale(1)}}
    .dream-gen{display:flex;align-items:center;justify-content:center;gap:10px;padding:16px;border-radius:20px;background:var(--accent-light);color:var(--accent-dark);font-size:13px;font-weight:500;margin-top:16px}
    .dream-gen-dot{width:28px;height:28px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);animation:genPulse 1400ms ease-in-out infinite}
    @keyframes genPulse{0%{transform:scale(.92);opacity:.55}50%{transform:scale(1);opacity:1}100%{transform:scale(.92);opacity:.55}}
    .mood-sweet{background:var(--accent)}
    .mood-weird{background:var(--accent-dark)}
    .mood-funny{background:var(--accent-light)}
    .mood-sad{background:color-mix(in srgb,var(--accent) 50%,transparent)}
    .mood-adventure{background:color-mix(in srgb,var(--accent-dark) 70%,transparent)}
    .mood-chaos{background:color-mix(in srgb,var(--accent) 30%,var(--text-primary))}
    .dream-edit-title{margin-bottom:16px;color:var(--text-primary);font-size:20px;font-weight:600;line-height:1.35;letter-spacing:-.01em}
    .dream-edit-field{margin-bottom:16px}
    .dream-edit-label{display:flex;align-items:center;gap:6px;margin-bottom:8px;color:var(--text-secondary);font-size:13px;font-weight:500;line-height:1.4}
    .dream-edit-label svg{width:15px;height:15px;color:var(--accent)}
    .dream-edit-input,.dream-edit-textarea{width:100%;border-radius:16px;background:var(--surface-muted);color:var(--text-primary);font-size:15px;border:none;outline:none}
    .dream-edit-input{min-height:46px;padding:10px 16px}
    .dream-edit-textarea{min-height:180px;padding:12px 16px;line-height:1.6;resize:none}
    .dream-edit-input::placeholder,.dream-edit-textarea::placeholder{color:var(--text-hint)}
    .dream-edit-moods{display:flex;flex-wrap:wrap;gap:8px}
    .dream-edit-mood-btn{min-height:34px;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;color:var(--text-secondary);background:var(--surface-muted);font-size:13px;font-weight:500;transition:all 200ms ease;border:none;outline:none}
    .dream-edit-mood-btn:active{transform:scale(.96)}
    .dream-edit-mood-btn.selected{background:var(--accent-light);color:var(--accent-dark)}
    .dream-edit-mood-dot{width:8px;height:8px;border-radius:50%}
    .dream-edit-kw-wrap{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
    .dream-edit-kw-tag{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:var(--surface-muted);color:var(--text-secondary);font-size:12px;font-weight:500}
    .dream-edit-kw-tag button{background:none;border:none;outline:none;color:var(--text-hint);font-size:14px;line-height:1;padding:0;cursor:pointer}
    .dream-edit-kw-input{display:flex;gap:8px}
    .dream-edit-kw-input input{flex:1;min-width:0;min-height:40px;border-radius:18px;padding:0 14px;background:var(--surface-muted);color:var(--text-primary);font-size:14px;border:none;outline:none}
    .dream-edit-kw-input input::placeholder{color:var(--text-hint)}
    .dream-edit-kw-input button{min-width:40px;height:40px;border-radius:18px;background:var(--accent);color:var(--bubble-user-text);display:flex;align-items:center;justify-content:center;border:none;outline:none;cursor:pointer}
    .dream-edit-kw-input button:active{transform:scale(.94)}
    .dream-edit-actions{display:flex;gap:8px;margin-top:20px}
    .dream-edit-actions button{flex:1}
  `;
  document.head.appendChild(s);
}

// ============================================================
// 挂载 / 卸载
// ============================================================

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;
  filterCharId = 'all';
  searchText = '';
  pageView = 'list';
  currentDream = null;
  wakeMessages = [];
  generating = false;

  charactersCache = await getAllDB('characters');
  dreamsCache = await getAllDB('dreams');

  const screen = document.createElement('section');
  screen.className = 'dream-screen';

  const soft = document.createElement('div');
  soft.className = 'dream-soft';

  screen.append(soft);
  container.innerHTML = '';
  container.appendChild(screen);

  await applyBg(screen);
  renderPage();
  await checkAndGenerate();

  unsubscribeCharsUpdated = window.AppBus?.on('characters:updated', async () => {
    if (!container) return;
    charactersCache = await getAllDB('characters');
    renderPage();
  });
}

export function unmount() {
  if (unsubscribeCharsUpdated) {
    try { unsubscribeCharsUpdated(); } catch (_) {}
    unsubscribeCharsUpdated = null;
  }

  if (container) { container.innerHTML = ''; container = null; }
  charactersCache = [];
  dreamsCache = [];
  currentDream = null;
  wakeMessages = [];
}

// ============================================================
// 背景
// ============================================================

async function applyBg(screen) {
  try {
    const r = await getDB('blobs', BG_KEY);
    const v = r?.value || '';
    if (v) { screen.classList.add('has-bg'); screen.style.backgroundImage = `url("${v}")`; }
    else { screen.classList.remove('has-bg'); screen.style.backgroundImage = ''; }
  } catch (_) { screen.classList.remove('has-bg'); screen.style.backgroundImage = ''; }
}

// ============================================================
// 页面路由
// ============================================================

function renderPage() {
  if (pageView === 'detail' && currentDream) renderDetailPage();
  else if (pageView === 'wake' && currentDream) renderWakePage();
  else renderMainPage();
}

function goBack() {
  if (pageView === 'wake') { pageView = 'detail'; renderPage(); }
  else if (pageView === 'detail') { pageView = 'list'; currentDream = null; renderPage(); }
  else window.closeCurrentApp?.();
}

// ============================================================
// 主页（列表）
// ============================================================

function renderMainPage() {
  const screen = container?.querySelector('.dream-screen');
  if (!screen) return;
  screen.querySelectorAll('.dream-body,.dream-nav').forEach(e => e.remove());
  const detail = screen.querySelector('.dream-detail');
  if (detail) detail.remove();

  const nav = document.createElement('div');
  nav.className = 'dream-nav';
  const backBtn = document.createElement('button');
  backBtn.className = 'dream-nav-btn';
  backBtn.type = 'button';
  backBtn.setAttribute('aria-label', '返回');
  backBtn.appendChild(createIcon('back', 22));
  backBtn.addEventListener('click', goBack);
  const title = document.createElement('div');
  title.className = 'dream-nav-title';
  title.textContent = '梦境';
  nav.append(backBtn, title);
  screen.appendChild(nav);

  const body = document.createElement('div');
  body.className = 'dream-body';

  const hero = document.createElement('section');
  hero.className = 'dream-hero';
  const heroTop = document.createElement('div');
  heroTop.className = 'dream-hero-top';
  const heroMain = document.createElement('div');
  const heroTitle = document.createElement('div');
  heroTitle.className = 'dream-hero-title';
  heroTitle.textContent = 'AI的梦境世界';
  const heroText = document.createElement('div');
  heroText.className = 'dream-hero-text';
  heroText.textContent = dreamsCache.length
    ? `已经收集了 ${dreamsCache.length} 个梦境`
    : '等AI睡着了，就会开始做梦啦';
  heroMain.append(heroTitle, heroText);
  const mark = document.createElement('div');
  mark.className = 'dream-mark';
  mark.appendChild(createIcon('dream', 26));
  heroTop.append(heroMain, mark);
  hero.appendChild(heroTop);

  const settings = getData('app_settings') || {};
  const enabled = settings.dreamEnabled === true;
  const toggle = document.createElement('div');
  toggle.className = 'dream-toggle';
  const toggleInfo = document.createElement('div');
  const tTitle = document.createElement('div');
  tTitle.className = 'dream-toggle-title';
  tTitle.textContent = '自动生成梦境';
  const tSub = document.createElement('div');
  tSub.className = 'dream-toggle-sub';
  tSub.textContent = '离线5小时后，AI会根据聊天自动做梦';
  toggleInfo.append(tTitle, tSub);
  const tSwitch = document.createElement('button');
  tSwitch.type = 'button';
  tSwitch.className = `dream-switch ${enabled ? 'active' : ''}`;
  tSwitch.addEventListener('click', () => {
    const s = getData('app_settings') || {};
    s.dreamEnabled = !s.dreamEnabled;
    setData('app_settings', s);
    tSwitch.classList.toggle('active');
    showToast(s.dreamEnabled ? '梦境已开启' : '梦境已关闭');
  });
  toggle.append(toggleInfo, tSwitch);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'dream-search';
  searchWrap.appendChild(createIcon('search', 18));
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = '搜搜梦境';
  searchInput.value = searchText;
  searchInput.addEventListener('input', () => { searchText = searchInput.value; renderList(body); });
  searchWrap.appendChild(searchInput);

  const filterRow = document.createElement('div');
  filterRow.className = 'dream-filter';
  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = `dream-chip ${filterCharId === 'all' ? 'selected' : ''}`;
  allChip.dataset.cid = 'all';
  allChip.textContent = '全部';
  allChip.addEventListener('click', () => { filterCharId = 'all'; refreshChips(filterRow); renderList(body); });
  filterRow.appendChild(allChip);
  charactersCache.forEach(ch => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `dream-chip ${filterCharId === ch.id ? 'selected' : ''}`;
    chip.dataset.cid = ch.id;
    const av = document.createElement('span');
    av.className = 'dream-chip-avatar';
    if (ch.avatar) { const img = document.createElement('img'); img.src = ch.avatar; img.alt = ''; av.appendChild(img); }
    else av.appendChild(createIcon('smile', 12));
    chip.append(av, document.createTextNode(ch.name || '未命名'));
    chip.addEventListener('click', () => { filterCharId = ch.id; refreshChips(filterRow); renderList(body); });
    filterRow.appendChild(chip);
  });

  body.append(hero, toggle, searchWrap, filterRow);

  if (generating) {
    const gen = document.createElement('div');
    gen.className = 'dream-gen';
    const gd = document.createElement('div');
    gd.className = 'dream-gen-dot';
    gd.appendChild(createIcon('dream', 14));
    gen.append(gd, document.createTextNode('AI正在做梦中...'));
    body.appendChild(gen);
  }

  renderList(body);
  screen.appendChild(body);
}

function refreshChips(row) {
  row.querySelectorAll('.dream-chip').forEach(c => c.classList.toggle('selected', c.dataset.cid === filterCharId));
}

function renderList(body) {
  body.querySelectorAll('.dream-list,.dream-empty').forEach(e => e.remove());
  let dreams = [...dreamsCache];
  if (filterCharId !== 'all') dreams = dreams.filter(d => d.characterId === filterCharId);
  const kw = searchText.trim().toLowerCase();
  if (kw) dreams = dreams.filter(d => {
    const ch = charactersCache.find(c => c.id === d.characterId);
    const nameMatch = ch && (ch.name || '').toLowerCase().includes(kw);
    return nameMatch || `${d.content || ''} ${d.summary || ''} ${(d.keywords || []).join(' ')}`.toLowerCase().includes(kw);
  });
  dreams.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  if (!dreams.length) {
    const empty = document.createElement('div');
    empty.className = 'dream-empty';
    const ei = document.createElement('div');
    ei.className = 'dream-empty-icon';
    ei.appendChild(createIcon('dream', 26));
    const et = document.createElement('div');
    et.className = 'dream-empty-title';
    et.textContent = kw ? '没搜到梦境' : '还没有梦境';
    const ep = document.createElement('div');
    ep.className = 'dream-empty-text';
    ep.textContent = kw ? '换个关键词试试看' : '开启自动生成，等AI开始做梦吧';
    empty.append(ei, et, ep);
    body.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'dream-list';
  dreams.forEach(d => list.appendChild(createDreamCard(d)));
  body.appendChild(list);
}

function createDreamCard(dream) {
  const card = document.createElement('article');
  card.className = 'dream-card';
  card.tabIndex = 0;

  const side = document.createElement('div');
  side.className = `dream-card-side mood-${dream.mood || 'sweet'}`;

  const top = document.createElement('div');
  top.className = 'dream-card-top';
  const avatar = document.createElement('div');
  avatar.className = 'dream-card-avatar';
  const ch = charactersCache.find(c => c.id === dream.characterId);
  if (ch?.avatar) { const img = document.createElement('img'); img.src = ch.avatar; img.alt = ''; avatar.appendChild(img); }
  else avatar.appendChild(createIcon('smile', 18));
  const meta = document.createElement('div');
  meta.className = 'dream-card-meta';
  const name = document.createElement('div');
  name.className = 'dream-card-name';
  name.textContent = ch?.name || '未知';
  const date = document.createElement('div');
  date.className = 'dream-card-date';
  date.textContent = fmtDate(dream.createdAt);
  meta.append(name, date);
  const moodDot = document.createElement('div');
  moodDot.className = `dream-mood mood-${dream.mood || 'sweet'}`;
  top.append(avatar, meta, moodDot);

  const summary = document.createElement('div');
  summary.className = 'dream-card-summary';
  const cl = getClarity(dream.createdAt);
  if (cl.percent >= 30) summary.textContent = dream.summary || dream.content?.slice(0, 60) || '...';
  else { summary.textContent = '...记忆已经很模糊了'; summary.style.color = 'var(--text-hint)'; }

  const tags = document.createElement('div');
  tags.className = 'dream-card-tags';
  const mt = document.createElement('span');
  mt.className = 'dream-tag mood';
  mt.textContent = getMoodInfo(dream.mood).label;
  tags.appendChild(mt);
  if (cl.percent < 100) { const ct = document.createElement('span'); ct.className = 'dream-tag'; ct.textContent = cl.label; tags.appendChild(ct); }

  if (!dream.seen) { const u = document.createElement('div'); u.className = 'dream-unread'; card.appendChild(u); }

  card.append(side, top, summary, tags);
  card.addEventListener('click', () => {
    currentDream = dream;
    if (!dream.seen) { dream.seen = true; saveDream(dream); }
    pageView = 'detail';
    renderPage();
  });
  return card;
}

// ============================================================
// 详情页
// ============================================================

function renderDetailPage() {
  const screen = container?.querySelector('.dream-screen');
  if (!screen || !currentDream) return;
  screen.innerHTML = '';
  const soft = document.createElement('div');
  soft.className = 'dream-soft';
  screen.appendChild(soft);

  const ch = charactersCache.find(c => c.id === currentDream.characterId);
  const cl = getClarity(currentDream.createdAt);

  const nav = document.createElement('div');
  nav.className = 'dream-nav';
  const backBtn = document.createElement('button');
  backBtn.className = 'dream-nav-btn';
  backBtn.type = 'button';
  backBtn.setAttribute('aria-label', '返回');
  backBtn.appendChild(createIcon('back', 22));
  backBtn.addEventListener('click', goBack);
  const title = document.createElement('div');
  title.className = 'dream-nav-title';
  title.textContent = '梦境详情';
  nav.append(backBtn, title);
  screen.appendChild(nav);

  const body = document.createElement('div');
  body.className = 'dream-detail-body';

  const card = document.createElement('div');
  card.className = 'dream-detail-card';

  const header = document.createElement('div');
  header.className = 'dream-detail-header';
  const avatar = document.createElement('div');
  avatar.className = 'dream-detail-avatar';
  if (ch?.avatar) { const img = document.createElement('img'); img.src = ch.avatar; img.alt = ''; avatar.appendChild(img); }
  else avatar.appendChild(createIcon('smile', 24));
  const meta = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'dream-detail-name';
  name.textContent = ch?.name || '未知';
  const date = document.createElement('div');
  date.className = 'dream-detail-date';
  date.textContent = `${fmtDate(currentDream.createdAt)} · ${getMoodInfo(currentDream.mood).label}`;
  meta.append(name, date);
  header.append(avatar, meta);

  const content = document.createElement('div');
  content.className = 'dream-detail-content';
  content.textContent = currentDream.content || '这个梦已经记不清了...';

  const info = document.createElement('div');
  info.className = 'dream-detail-info';
  const infoDot = document.createElement('div');
  infoDot.className = 'dream-detail-info-dot';
  infoDot.style.background = cl.percent >= 60 ? 'var(--accent)' : 'var(--text-hint)';
  info.append(infoDot, document.createTextNode(`梦境清晰度：${cl.label}（${cl.percent}%）`));

  const tags = document.createElement('div');
  tags.className = 'dream-detail-tags';
  (currentDream.keywords || []).forEach(kw => { const t = document.createElement('span'); t.className = 'dream-tag'; t.textContent = kw; tags.appendChild(t); });

  card.append(header, content, info, tags);

  const actions = document.createElement('div');
  actions.className = 'dream-detail-actions';

  const wakeBtn = document.createElement('button');
  wakeBtn.className = 'dream-btn primary';
  wakeBtn.type = 'button';
  wakeBtn.append(createIcon('dream', 18), document.createTextNode('叫醒TA'));
  wakeBtn.addEventListener('click', () => { wakeMessages = []; pageView = 'wake'; renderPage(); });

  const editBtn = document.createElement('button');
  editBtn.className = 'dream-btn secondary';
  editBtn.type = 'button';
  editBtn.append(createIcon('edit', 18), document.createTextNode('编辑'));
  editBtn.addEventListener('click', () => openEditSheet());

  const delBtn = document.createElement('button');
  delBtn.className = 'dream-btn danger';
  delBtn.type = 'button';
  delBtn.append(createIcon('delete', 18), document.createTextNode('遗忘'));
  delBtn.addEventListener('click', async () => {
    const ok = await showConfirm('确定让这个梦境消失吗？');
    if (!ok) return;
    await delDream(currentDream.id);
    showToast('梦境已遗忘');
    pageView = 'list';
    currentDream = null;
    renderPage();
  });

  const chatBtn = document.createElement('button');
  chatBtn.className = 'dream-btn secondary';
  chatBtn.type = 'button';
  chatBtn.append(createIcon('send', 18), document.createTextNode('去聊聊'));
  if (currentDream.characterId) {
    chatBtn.addEventListener('click', () => {
      window.AppBus?.openApp?.('chat', { route: { name: 'thread', params: { mode: 'private', characterId: currentDream.characterId, groupId: '' } } });
    });
  } else {
    chatBtn.disabled = true;
    chatBtn.style.opacity = '0.5';
  }

  actions.append(wakeBtn, editBtn, chatBtn, delBtn);
  body.append(card, actions);
  screen.appendChild(body);
}

// ============================================================
// 编辑抽屉
// ============================================================

function openEditSheet() {
  if (!currentDream) return;

  let editedContent = currentDream.content || '';
  let editedSummary = currentDream.summary || '';
  let editedMood = currentDream.mood || 'sweet';
  let editedKeywords = [...(currentDream.keywords || [])];

  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'dream-edit-title';
  title.textContent = '编辑梦境';

  // 正文
  const contentField = createEditField('memory', '梦境正文');
  const contentTa = document.createElement('textarea');
  contentTa.className = 'dream-edit-textarea';
  contentTa.placeholder = '写下这个梦...';
  contentTa.value = editedContent;
  contentTa.addEventListener('input', () => { editedContent = contentTa.value; });
  contentField.appendChild(contentTa);

  // 摘要
  const summaryField = createEditField('star', '一句话摘要');
  const summaryInput = document.createElement('input');
  summaryInput.className = 'dream-edit-input';
  summaryInput.type = 'text';
  summaryInput.placeholder = '用一句话描述这个梦';
  summaryInput.value = editedSummary;
  summaryInput.addEventListener('input', () => { editedSummary = summaryInput.value; });
  summaryField.appendChild(summaryInput);

  // 心情
  const moodField = createEditField('heart', '梦境心情');
  const moodGrid = document.createElement('div');
  moodGrid.className = 'dream-edit-moods';
  MOODS.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dream-edit-mood-btn ${editedMood === m.id ? 'selected' : ''}`;
    btn.dataset.mood = m.id;
    const dot = document.createElement('span');
    dot.className = `dream-edit-mood-dot mood-${m.id}`;
    btn.append(dot, document.createTextNode(m.label));
    btn.addEventListener('click', () => {
      editedMood = m.id;
      moodGrid.querySelectorAll('.dream-edit-mood-btn').forEach(b => b.classList.toggle('selected', b.dataset.mood === m.id));
    });
    moodGrid.appendChild(btn);
  });
  moodField.appendChild(moodGrid);

  // 关键词
  const kwField = createEditField('search', '关键词');
  const kwWrap = document.createElement('div');
  kwWrap.className = 'dream-edit-kw-wrap';
  const renderKwTags = () => {
    kwWrap.innerHTML = '';
    editedKeywords.forEach((kw, i) => {
      const tag = document.createElement('span');
      tag.className = 'dream-edit-kw-tag';
      tag.appendChild(document.createTextNode(kw));
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => { editedKeywords.splice(i, 1); renderKwTags(); });
      tag.appendChild(removeBtn);
      kwWrap.appendChild(tag);
    });
  };
  renderKwTags();

  const kwInputRow = document.createElement('div');
  kwInputRow.className = 'dream-edit-kw-input';
  const kwInput = document.createElement('input');
  kwInput.type = 'text';
  kwInput.placeholder = '输入关键词，点加号';
  const kwAddBtn = document.createElement('button');
  kwAddBtn.type = 'button';
  kwAddBtn.appendChild(createIcon('add', 18));
  const addKw = () => {
    const v = kwInput.value.trim();
    if (!v) return;
    if (editedKeywords.includes(v)) { showToast('已经有了'); return; }
    if (editedKeywords.length >= 8) { showToast('最多8个关键词'); return; }
    editedKeywords.push(v);
    kwInput.value = '';
    renderKwTags();
  };
  kwAddBtn.addEventListener('click', addKw);
  kwInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKw(); } });
  kwInputRow.append(kwInput, kwAddBtn);
  kwField.append(kwWrap, kwInputRow);

  // 按钮
  const actions = document.createElement('div');
  actions.className = 'dream-edit-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-ghost';
  cancelBtn.type = 'button';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', hideBottomSheet);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.type = 'button';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', async () => {
    if (!editedContent.trim()) { showToast('梦境正文不能为空'); return; }
    currentDream = {
      ...currentDream,
      content: editedContent.trim(),
      summary: editedSummary.trim() || editedContent.trim().slice(0, 15),
      mood: editedMood,
      keywords: editedKeywords,
      updatedAt: getNow()
    };
    await saveDream(currentDream);
    hideBottomSheet();
    showToast('梦境已修改');
    renderPage();
  });
  actions.append(cancelBtn, saveBtn);

  sheet.append(title, contentField, summaryField, moodField, kwField, actions);
  showBottomSheet(sheet);
}

function createEditField(iconName, labelText) {
  const field = document.createElement('div');
  field.className = 'dream-edit-field';
  const label = document.createElement('div');
  label.className = 'dream-edit-label';
  label.append(createIcon(iconName, 15), document.createTextNode(labelText));
  field.appendChild(label);
  return field;
}

// ============================================================
// 叫醒对话页
// ============================================================

function renderWakePage() {
  const screen = container?.querySelector('.dream-screen');
  if (!screen || !currentDream) return;
  screen.innerHTML = '';
  const soft = document.createElement('div');
  soft.className = 'dream-soft';
  screen.appendChild(soft);

  const ch = charactersCache.find(c => c.id === currentDream.characterId);

  const nav = document.createElement('div');
  nav.className = 'dream-nav';
  const backBtn = document.createElement('button');
  backBtn.className = 'dream-nav-btn';
  backBtn.type = 'button';
  backBtn.setAttribute('aria-label', '返回');
  backBtn.appendChild(createIcon('back', 22));
  backBtn.addEventListener('click', goBack);
  const title = document.createElement('div');
  title.className = 'dream-nav-title';
  title.textContent = `${ch?.name || 'AI'}的梦境`;
  nav.append(backBtn, title);
  screen.appendChild(nav);

  const body = document.createElement('div');
  body.className = 'dream-wake-body';

  const context = document.createElement('div');
  context.className = 'dream-wake-context';
  context.textContent = `梦境片段：${currentDream.summary || currentDream.content?.slice(0, 80) + '...' || '一个模糊的梦'}`;
  body.appendChild(context);

  if (!wakeMessages.length) {
    wakeMessages.push({ role: 'assistant', content: '（迷迷糊糊地睁开眼睛）嗯...你怎么在这里...我刚才做了一个奇怪的梦...' });
  }
  wakeMessages.forEach(m => body.appendChild(wakeMsg(m, ch)));

  const bar = document.createElement('div');
  bar.className = 'dream-wake-bar';
  const input = document.createElement('textarea');
  input.className = 'dream-wake-input';
  input.placeholder = '跟梦里的TA说点什么...';
  input.rows = 1;
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(input, body, ch); } });
  const sendBtn = document.createElement('button');
  sendBtn.className = 'dream-wake-send';
  sendBtn.type = 'button';
  sendBtn.appendChild(createIcon('send', 18));
  sendBtn.addEventListener('click', () => doSend(input, body, ch));
  bar.append(input, sendBtn);

  screen.append(body, bar);
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; input.focus({ preventScroll: true }); });
}

function wakeMsg(msg, ch) {
  const isU = msg.role === 'user';
  const w = document.createElement('div');
  w.className = `dream-wake-msg ${isU ? 'user' : ''}`;
  const av = document.createElement('div');
  av.className = 'dream-wake-msg-avatar';
  if (isU) av.appendChild(createIcon('heart', 16));
  else if (ch?.avatar) { const img = document.createElement('img'); img.src = ch.avatar; img.alt = ''; av.appendChild(img); }
  else av.appendChild(createIcon('smile', 16));
  const bub = document.createElement('div');
  bub.className = 'dream-wake-bubble';
  bub.textContent = msg.content;
  w.append(av, bub);
  return w;
}

async function doSend(input, body, ch) {
  const text = input.value.trim();
  if (!text || !ch) return;
  wakeMessages.push({ role: 'user', content: text });
  body.appendChild(wakeMsg({ role: 'user', content: text }, ch));
  input.value = '';
  input.style.height = 'auto';
  body.scrollTop = body.scrollHeight;

  const typing = document.createElement('div');
  typing.className = 'dream-wake-msg';
  const tAv = document.createElement('div');
  tAv.className = 'dream-wake-msg-avatar';
  if (ch.avatar) { const img = document.createElement('img'); img.src = ch.avatar; img.alt = ''; tAv.appendChild(img); }
  else tAv.appendChild(createIcon('smile', 16));
  const tBub = document.createElement('div');
  tBub.className = 'dream-wake-bubble dream-typing';
  tBub.innerHTML = '<span></span><span></span><span></span>';
  typing.append(tAv, tBub);
  body.appendChild(typing);
  body.scrollTop = body.scrollHeight;

  try {
    const worldbookPrompt = await loadWorldbookPromptForCharacter(ch).catch(() => '');
    const sysPrompt = `${worldbookPrompt ? worldbookPrompt + '\n\n' : ''}我是${ch.name || 'AI'}。我刚才做了一个梦，梦的内容是：${currentDream.content}\n\n现在用户把我从梦里叫醒了。我要用迷迷糊糊、半梦半醒的语气回应，可能会分不清梦境和现实，说话有点奇怪。我会保持我的人设性格，但在刚醒来的状态下会有些恍惚。称呼用户为${ch.nicknameForUser || '你'}。`;
    const msgs = [{ role: 'system', content: sysPrompt }, ...wakeMessages];
    const config = buildApiCfg(ch);
    const reply = await silentRequest(config, msgs);
    typing.remove();
    const replyText = typeof reply === 'string' ? reply : (reply?.content || reply?.text || '...嗯？');
    wakeMessages.push({ role: 'assistant', content: replyText });
    body.appendChild(wakeMsg({ role: 'assistant', content: replyText }, ch));
    body.scrollTop = body.scrollHeight;
    if (currentDream && !currentDream.repliedAt) { currentDream.repliedAt = getNow(); saveDream(currentDream); }
  } catch (err) {
    typing.remove();
    showToast('AI好像还没睡醒，再试试？');
    console.warn('[梦境] 叫醒失败:', err);
  }
}

// ============================================================
// 梦境生成
// ============================================================

async function checkAndGenerate() {
  const settings = getData('app_settings') || {};
  if (!settings.dreamEnabled) return;
  const last = getData('app_dream_last_gen') || 0;
  const now = Date.now();
  if (now - last < TRIGGER_MS) return;

  for (const ch of charactersCache) {
    const chDreams = (await getByIndexDB('dreams', 'characterId', ch.id)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const lastDream = chDreams[0];
    if (!lastDream || (now - new Date(lastDream.createdAt).getTime()) > TRIGGER_MS) {
      const msgs = await getByIndexDB('messages', 'characterId', ch.id);
      if (msgs.length > 0) await doGenerate(ch);
    }
  }
  setData('app_dream_last_gen', now);
}

async function doGenerate(ch) {
  if (generating) return;
  generating = true;
  try {
    const msgs = (await getByIndexDB('messages', 'characterId', ch.id))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 20).reverse();
    const recentText = msgs.map(m => `${m.role === 'user' ? '用户' : ch.name}：${m.content || ''}`).join('\n');

    const worldbookPrompt = await loadWorldbookPromptForCharacter(ch).catch(() => '');

    const prompt = `${worldbookPrompt ? worldbookPrompt + '\n\n' : ''}我是${ch.name || 'AI'}。
请根据我和用户最近的对话内容，为我创作一个梦境。
我的人设：${ch.systemPrompt || ch.description || ch.persona || '一个温柔的角色'}
最近的对话：
${recentText || '（还没有对话记录）'}
要求：
1. 以第一人称"我"来描述这个梦
2. 大约200-300字
3. 梦境内容要和最近的对话有隐约的关联
4. 可以加入荒诞、超现实的元素
请用以下JSON格式回复，不要包含其他内容：
{"content":"梦境正文","summary":"一句话摘要15字以内","mood":"sweet或weird或funny或sad或adventure或chaos","keywords":["关键词1","关键词2","关键词3"]}`;

    const config = buildApiCfg(ch);
    const result = await silentRequest(config, [
      { role: 'system', content: '你是一个梦境创作者。请只回复JSON格式的内容，不要有其他文字。' },
      { role: 'user', content: prompt }
    ]);

    let dream;
    try {
      const raw = typeof result === 'string' ? result : (result?.content || result?.text || '');
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      dream = {
        id: generateId('dream'), characterId: ch.id,
        content: String(parsed.content || '').slice(0, 800),
        summary: String(parsed.summary || '').slice(0, 50),
        mood: MOODS.some(m => m.id === parsed.mood) ? parsed.mood : 'sweet',
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 6).map(String) : [],
        createdAt: getNow(), seen: false, repliedAt: null
      };
    } catch (_) {
      const raw = typeof result === 'string' ? result : (result?.content || result?.text || '');
      dream = {
        id: generateId('dream'), characterId: ch.id,
        content: raw.slice(0, 800) || '一个记不清的梦...',
        summary: raw.slice(0, 15) || '一个梦',
        mood: MOODS[Math.floor(Math.random() * MOODS.length)].id,
        keywords: [], createdAt: getNow(), seen: false, repliedAt: null
      };
    }

    await saveDream(dream);
    if (pageView === 'list') renderPage();
    // 写入角色记忆 + 通知其他 APP
    try {
      const summaryText = dream.summary || dream.content.slice(0, 30);
      await window.AppBus?.recordExternalInteraction?.({
        characterId: ch.id,
        role: 'assistant',
        content: `我做了一个梦：${summaryText}。${dream.content || ''}`.slice(0, 600),
        source: '梦境',
        importance: 3,
        mood: dream.mood || ''
      });
      window.AppBus?.emit?.('dream:created', { dreamId: dream.id, characterId: ch.id, mood: dream.mood });
    } catch (_) {}
  } catch (err) {
    console.warn('[梦境] 生成失败:', err);
  } finally {
    generating = false;
  }
}

// ============================================================
// 数据层
// ============================================================

async function saveDream(dream) {
  await setDB('dreams', dream.id, dream);
  const i = dreamsCache.findIndex(d => d.id === dream.id);
  if (i >= 0) dreamsCache[i] = dream; else dreamsCache.push(dream);
}

async function delDream(id) {
  await deleteDB('dreams', id);
  dreamsCache = dreamsCache.filter(d => d.id !== id);
}

function getClarity(createdAt) {
  if (!createdAt) return { level: 'fading', percent: 10, label: '几乎遗忘' };
  const days = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  if (days < 3) return { level: 'clear', percent: 100, label: '清晰' };
  if (days < 7) return { level: 'hazy', percent: 60, label: '朦胧' };
  if (days < 30) return { level: 'blurry', percent: 30, label: '模糊' };
  return { level: 'fading', percent: 10, label: '几乎遗忘' };
}

function getMoodInfo(id) { return MOODS.find(m => m.id === id) || MOODS[0]; }

function fmtDate(iso) {
  if (!iso) return '未知时间';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '未知时间';
  const h = (Date.now() - d.getTime()) / 3600000;
  if (h < 1) return '刚刚';
  if (h < 24) return `${Math.floor(h)}小时前`;
  if (h < 48) return '昨天';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(d);
}

function buildApiCfg(ch) {
  const settings = getData('app_settings') || {};
  if (ch?.apiConfig && !ch.apiConfig.useGlobal) {
    const cfg = ch.apiConfig;
    // 优先通过 endpointId 在 settings.apiEndpoints 中查找端点（对齐 thread-ai/core/api 机制）
    if (cfg.endpointId) {
      const ep = (settings.apiEndpoints || []).find(e => e.id === cfg.endpointId);
      if (ep) {
        return { provider: ep.provider || cfg.provider || 'openai', endpoint: ep.endpoint || '', apiKey: ep.apiKey || '', model: cfg.model || ep.model || settings.defaultModel || '' };
      }
    }
    // 兼容旧字段 endpoint/apiKey（无 endpointId 或端点未找到时兜底）
    return { provider: cfg.provider || 'openai', endpoint: cfg.endpoint || '', apiKey: cfg.apiKey || '', model: cfg.model || '' };
  }
  const cc = getData(`chat_${ch.id}_config`) || {};
  const eid = cc.apiEndpointId || settings.defaultApiEndpointId;
  const ep = (settings.apiEndpoints || []).find(e => e.id === eid);
  if (ep) return { provider: ep.provider || 'openai', endpoint: ep.endpoint || '', apiKey: ep.apiKey || '', model: ep.model || settings.defaultModel || '' };
  return { provider: 'openai', endpoint: '', apiKey: '', model: settings.defaultModel || '' };
}

// depends: ../core/storage.js(getData,setData,generateId,getNow,getByIndexDB,getAllDB,setDB,deleteDB)；../core/ui.js(showToast,showBottomSheet,hideBottomSheet,showConfirm,createIcon)；../core/api.js(silentRequest)
