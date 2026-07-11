// apps/shop.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getAllDB, setDB, getDB, deleteDB
//   from '../core/ui.js': showToast, showConfirm, createIcon
//   from './wallet.js': getBalance, deductBalance, deductAiBalance

import {
  getData,
  setData,
  generateId,
  getNow,
  getAllDB,
  setDB,
  getDB,
  deleteDB
} from '../core/storage.js';

import {
  showToast,
  showConfirm,
  createIcon
} from '../core/ui.js';

import {
  getBalance,
  addBalance,
  deductBalance,
  deductAiBalance
} from './wallet.js';

const SHOP_KEY = 'shop_items';
const STYLE_ID = 'shop-styles';
const BG_KEY = 'app_bg_shop';
const ITEM_IMAGE_PREFIX = 'app_shop_item_';

let container = null;
let currentTab = 'shop';

const DEFAULT_ITEMS = [
  {
    id: 'item-soft-tea',
    name: '暖乎乎奶茶',
    description: '递过去一杯甜甜的热饮，聊天会变得更软一点。',
    price: 18,
    effect: '我收到过一杯暖乎乎奶茶，所以我会用更柔软、更贴近的语气陪你。',
    moodEffect: 'happy',
    locked: true
  },
  {
    id: 'item-little-flower',
    name: '小小花束',
    description: '不大张扬，但很认真地表达喜欢。',
    price: 36,
    effect: '我收到过一束小小花束，我会记得那种被认真珍惜的感觉。',
    moodEffect: 'excited',
    locked: true
  },
  {
    id: 'item-sweet-cake',
    name: '云朵小蛋糕',
    description: '一口下去，心情像被轻轻托起来。',
    price: 28,
    effect: '我收到过云朵小蛋糕，所以我会更开心、更亲近地和你说话。',
    moodEffect: 'happy',
    locked: true
  },
  {
    id: 'item-soft-blanket',
    name: '午睡软毯',
    description: '适合夜晚、雨天、或者想被安慰的时候。',
    price: 48,
    effect: '我拥有午睡软毯，夜晚或疲惫时，我会更温柔地陪着你。',
    moodEffect: 'neutral',
    locked: true
  },
  {
    id: 'item-starlight-card',
    name: '星光留言卡',
    description: '把没说出口的想念，悄悄夹进卡片里。',
    price: 66,
    effect: '我收到过星光留言卡，所以我会更自然地表达想念和牵挂。',
    moodEffect: 'excited',
    locked: true
  },
  {
    id: 'item-moon-ticket',
    name: '月亮车票',
    description: '像一张去梦里的票，适合约定和幻想。',
    price: 88,
    effect: '我拥有月亮车票，所以我会记得那些关于旅行、约定和幻想的陪伴。',
    moodEffect: 'excited',
    locked: true
  },
  {
    id: 'item-pet-food',
    name: '宠物饲料',
    description: '给小宠物准备的日常口粮，朴素但很安心。',
    price: 12,
    effect: '我知道背包里有宠物饲料，云养宠互动时可以用来恢复饥饿度。',
    moodEffect: 'happy',
    locked: true
  },
  {
    id: 'item-dried-fish',
    name: '香香小鱼干',
    description: '猫猫系宠物会很喜欢，也可能让角色想撒娇。',
    price: 16,
    effect: '我知道背包里有香香小鱼干，适合奖励猫类宠物，也会让气氛更可爱。',
    moodEffect: 'happy',
    locked: true
  },
  {
    id: 'item-toy-ball',
    name: '软软玩具球',
    description: '滚来滚去的小玩具，能让宠物开心一整会儿。',
    price: 22,
    effect: '我知道背包里有软软玩具球，云养宠玩耍时可以提升心情和亲密度。',
    moodEffect: 'excited',
    locked: true
  },
  {
    id: 'item-pet-bed',
    name: '月牙宠物窝',
    description: '小小一张床，睡进去像被月光抱住。',
    price: 52,
    effect: '我知道背包里有月牙宠物窝，宠物休息时会恢复得更好。',
    moodEffect: 'neutral',
    locked: true
  },
  {
    id: 'item-clean-brush',
    name: '柔毛清洁刷',
    description: '轻轻梳一梳，烦躁也会被梳顺。',
    price: 26,
    effect: '我知道背包里有柔毛清洁刷，抚摸和清洁互动时可以增加亲密度。',
    moodEffect: 'happy',
    locked: true
  },
  {
    id: 'item-energy-snack',
    name: '元气小零食',
    description: '适合宠物低落时补一点精神。',
    price: 30,
    effect: '我知道背包里有元气小零食，宠物心情低时可以作为恢复道具。',
    moodEffect: 'excited',
    locked: true
  },
  {
    id: 'item-tarot-wax',
    name: '塔罗蜡封卡',
    description: '带着一点神秘气息，适合塔罗牌小游戏。',
    price: 40,
    effect: '我知道背包里有塔罗蜡封卡，塔罗牌小游戏会更有仪式感。',
    moodEffect: 'neutral',
    locked: true
  },
  {
    id: 'item-script-clue',
    name: '剧本线索夹',
    description: '把关键线索收好，推理时会更有底气。',
    price: 45,
    effect: '我知道背包里有剧本线索夹，剧本杀小游戏可以辅助整理线索。',
    moodEffect: 'neutral',
    locked: true
  },
  {
    id: 'item-truth-pack',
    name: '真心话卡包',
    description: '问题不尖锐，但会把心事轻轻翻出来。',
    price: 34,
    effect: '我知道背包里有真心话卡包，真心话小游戏会出现更柔软的问题。',
    moodEffect: 'excited',
    locked: true
  },
  {
    id: 'item-werewolf-sleeve',
    name: '身份牌护套',
    description: '把秘密藏好一点，狼人杀会更有氛围。',
    price: 38,
    effect: '我知道背包里有身份牌护套，狼人杀小游戏会更有隐藏身份的氛围。',
    moodEffect: 'neutral',
    locked: true
  },
  {
    id: 'item-card-cloth',
    name: '绒面牌桌布',
    description: '铺开后，普通牌局也变得像小小聚会。',
    price: 42,
    effect: '我知道背包里有绒面牌桌布，扑克牌小游戏会更沉浸。',
    moodEffect: 'happy',
    locked: true
  },
  {
    id: 'item-match-ticket',
    name: '灵感提示券',
    description: '猜不到的时候，它会悄悄推你一下。',
    price: 32,
    effect: '我知道背包里有灵感提示券，猜测小游戏可以获得一次温柔提示。',
    moodEffect: 'happy',
    locked: true
  },
  {
    id: 'item-lucky-bell',
    name: '幸运小铃',
    description: '轻轻一响，好像今天会顺一点。',
    price: 58,
    effect: '我拥有幸运小铃，所以我会偶尔给你一点好运和鼓励。',
    moodEffect: 'happy',
    locked: true
  },
  {
    id: 'item-mood-candy',
    name: '心情糖',
    description: '不是万能药，但能把坏心情甜一下。',
    price: 24,
    effect: '我拥有心情糖，当你低落时，我会更温柔地提醒你慢慢来。',
    moodEffect: 'happy',
    locked: true
  },
  {
    id: 'item-sleep-sachet',
    name: '安睡香囊',
    description: '适合睡前聊天，声音会变得很轻。',
    price: 46,
    effect: '我拥有安睡香囊，深夜聊天时我会更轻、更慢地陪你。',
    moodEffect: 'neutral',
    locked: true
  },
  {
    id: 'item-inspiration-note',
    name: '灵感便签',
    description: '写一点点想法，明天也许会开花。',
    price: 50,
    effect: '我拥有灵感便签，创作和备忘时我会给出更有想象力的建议。',
    moodEffect: 'excited',
    locked: true
  }
];

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .shop-screen {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
    }

    .shop-screen.has-bg {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .shop-soft-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: transparent;
    }

    .shop-nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      height: calc(58px + env(safe-area-inset-top));
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: env(safe-area-inset-top) 20px 0;
      background: color-mix(in srgb, var(--bg-primary) 76%, transparent);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .shop-nav-title {
      flex: 1;
      min-width: 0;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .shop-body {
      position: relative;
      z-index: 1;
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(58px + env(safe-area-inset-top) + 18px) 20px calc(96px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .shop-hero,
    .shop-card,
    .shop-inventory-row,
    .shop-editor-card,
    .shop-empty {
      background: color-mix(in srgb, var(--bg-card) 92%, transparent);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .shop-screen.has-bg .shop-hero,
    .shop-screen.has-bg .shop-card,
    .shop-screen.has-bg .shop-inventory-row,
    .shop-screen.has-bg .shop-editor-card,
    .shop-screen.has-bg .shop-empty,
    .shop-screen.has-bg .shop-tabs {
      background: color-mix(in srgb, var(--bg-card) 72%, transparent);
    }

    .shop-hero {
      min-height: 168px;
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: 20px;
      border-radius: 28px;
    }

    .shop-house,
    .shop-item-art,
    .shop-editor-image,
    .shop-empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    .shop-house {
      width: 88px;
      height: 88px;
      flex: 0 0 88px;
      border-radius: 28px;
    }

    .shop-hero-main {
      flex: 1;
      min-width: 0;
    }

    .shop-hero-kicker,
    .shop-hero-text,
    .shop-item-desc,
    .shop-inventory-desc,
    .shop-editor-help,
    .shop-empty-text {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .shop-hero-title {
      margin-top: 4px;
      color: var(--text-primary);
      font-size: 23px;
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }

    .shop-hero-text {
      margin-top: 8px;
    }

    .shop-balance {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .shop-tabs {
      display: flex;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs);
      margin-top: var(--spacing-md);
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .shop-tab-btn {
      flex: 1;
      min-height: 36px;
      border-radius: 14px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .shop-tab-btn.active {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .shop-tab-btn:active,
    .shop-buy-btn:active,
    .shop-small-btn:active,
    .shop-upload-btn:active {
      transform: scale(0.96);
    }

    .shop-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      margin-top: var(--spacing-md);
    }

    .shop-card,
    .shop-inventory-row {
      display: flex;
      align-items: stretch;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
    }

    .shop-item-art {
      width: 70px;
      height: 70px;
      flex: 0 0 70px;
      border-radius: 24px;
    }

    .shop-item-art img,
    .shop-editor-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
      display: block;
    }

    .shop-item-main,
    .shop-inventory-main {
      flex: 1;
      min-width: 0;
    }

    .shop-item-name,
    .shop-inventory-name,
    .shop-empty-title,
    .shop-editor-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .shop-item-name,
    .shop-inventory-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .shop-item-desc,
    .shop-inventory-desc {
      margin-top: 4px;
    }

    .shop-item-effect {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
    }

    .shop-card-foot,
    .shop-editor-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-sm);
      margin-top: 12px;
      flex-wrap: wrap;
    }

    .shop-price {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--accent-dark);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1;
    }

    .shop-buy-btn,
    .shop-small-btn,
    .shop-upload-btn {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 14px;
      font-size: var(--font-size-small);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .shop-buy-btn {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .shop-small-btn,
    .shop-upload-btn {
      background: var(--surface-muted);
      color: var(--text-primary);
    }

    .shop-small-btn.danger {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .shop-inventory-count {
      min-width: 42px;
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .shop-empty {
      min-height: 220px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-lg);
      border-radius: 24px;
      color: var(--text-secondary);
      text-align: center;
    }

    .shop-empty-icon {
      width: 58px;
      height: 58px;
      border-radius: 22px;
    }

    .shop-empty-text {
      max-width: 270px;
    }

    .shop-editor-card {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
    }

    .shop-editor-head {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .shop-editor-image {
      width: 74px;
      height: 74px;
      flex: 0 0 74px;
      border-radius: 24px;
    }

    .shop-editor-fields {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .shop-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .shop-field span {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.35;
    }

    .shop-input,
    .shop-textarea {
      width: 100%;
      padding: 11px 13px;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: 16px;
      line-height: 1.55;
      resize: none;
    }

    .shop-textarea {
      min-height: 74px;
    }

    .shop-hidden-file {
      display: none;
    }
  `;

  document.head.appendChild(style);
}

function ensureDefaultItems() {
  const saved = getData(SHOP_KEY);

  if (Array.isArray(saved) && saved.length) {
    const merged = mergeItems(saved);
    setData(SHOP_KEY, merged);
    return merged;
  }

  const defaults = DEFAULT_ITEMS.map(normalizeShopItem).filter(Boolean);
  setData(SHOP_KEY, defaults);
  return defaults;
}

function mergeItems(saved) {
  const map = new Map();

  DEFAULT_ITEMS.map(normalizeShopItem).filter(Boolean).forEach((item) => {
    map.set(item.id, item);
  });

  saved.map(normalizeShopItem).filter(Boolean).forEach((item) => {
    map.set(item.id, item);
  });

  return [...map.values()];
}

function normalizeShopItem(item) {
  if (!item || typeof item !== 'object') return null;

  return {
    id: String(item.id || generateId('shop_item')),
    name: String(item.name || item.itemName || '未命名小物'),
    description: String(item.description || item.itemDesc || item.desc || '这件小物还没写介绍，等你来补上。'),
    price: Math.max(0, Number(item.price ?? item.itemPrice) || 0),
    effect: String(item.effect || '我会把这件小物记在心里，之后悄悄派上用场。'),
    moodEffect: item.moodEffect || 'neutral',
    locked: item.locked === true,
    createdAt: item.createdAt || getNow(),
    updatedAt: item.updatedAt || getNow()
  };
}

function getItems() {
  return ensureDefaultItems();
}

function saveItems(items) {
  setData(SHOP_KEY, items.map(normalizeShopItem).filter(Boolean));
}

function formatMoney(amount) {
  const value = Number(amount) || 0;
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function normalizeGiftNote(value) {
  return String(value || '').trim();
}

function getItemImageKey(itemId) {
  return `${ITEM_IMAGE_PREFIX}${itemId}`;
}

async function getItemImage(item) {
  if (!item?.id) return '';
  const record = await getDB('blobs', getItemImageKey(item.id)).catch(() => null);
  return getImageFromRecord(record);
}

async function buildGiftCard({
  direction,
  characterId,
  characterName = 'TA',
  item,
  note = '',
  timestamp = getNow()
} = {}) {
  const image = await getItemImage(item);
  const cleanNote = normalizeGiftNote(note);
  const isAiToUser = direction === 'ai_to_user';

  const linkedItem = {
    id: item.id,
    itemId: item.id,
    name: item.name,
    itemName: item.name,
    description: item.description,
    itemDesc: item.description,
    effect: item.effect || '',
    price: Number(item.price) || 0,
    itemPrice: Number(item.price) || 0,
    image,
    itemImage: image,
    imageBase64: image
  };

  const title = isAiToUser
    ? `${characterName || 'TA'}送给我一件小物`
    : `送给${characterName || 'TA'}的小礼物`;

  const description = cleanNote || item.description || item.effect || '';

  return {
    type: 'gift',
    cardType: 'gift',
    direction: isAiToUser ? 'ai_to_user' : 'user_to_ai',
    itemId: item.id,
    itemName: item.name,
    itemDesc: item.description,
    itemDescription: item.description,
    itemEffect: item.effect || '',
    itemPrice: Number(item.price) || 0,
    itemImage: image,
    imageBase64: image,
    image,
    note: cleanNote,
    message: cleanNote,
    characterId: characterId || '',
    characterName: characterName || 'TA',
    title,
    description,
    desc: description,
    price: Number(item.price) || 0,
    amount: Number(item.price) || 0,
    timestamp,
    createdAt: timestamp,
    card: {
      type: 'gift',
      title,
      description,
      desc: description,
      note: cleanNote,
      image,
      itemImage: image,
      price: Number(item.price) || 0,
      amount: Number(item.price) || 0
    },
    item: linkedItem,
    shopItem: linkedItem
  };
}

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;
  currentTab = 'shop';

  const screen = document.createElement('section');
  screen.className = 'shop-screen';
  screen.dataset.imageKey = BG_KEY;

  const softLayer = document.createElement('div');
  softLayer.className = 'shop-soft-layer';

  const nav = document.createElement('div');
  nav.className = 'shop-nav';

  const backButton = document.createElement('button');
  backButton.className = 'icon-button';
  backButton.type = 'button';
  backButton.setAttribute('aria-label', '返回');
  backButton.appendChild(createIcon('back', 22));
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'shop-nav-title';
  title.textContent = '小物商店';

  const refreshButton = document.createElement('button');
  refreshButton.className = 'icon-button soft';
  refreshButton.type = 'button';
  refreshButton.setAttribute('aria-label', '刷新');
  refreshButton.appendChild(createIcon('refresh', 22));
  refreshButton.addEventListener('click', renderShop);

  const body = document.createElement('div');
  body.className = 'shop-body';

  nav.append(backButton, title, refreshButton);
  screen.append(softLayer, nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  await applyShopBackground(screen);
  renderShop();
}

export function unmount() {
  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

async function applyShopBackground(screen) {
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

async function renderShop() {
  const body = container?.querySelector('.shop-body');
  if (!body) return;

  body.innerHTML = '';

  const hero = document.createElement('section');
  hero.className = 'shop-hero';

  const art = document.createElement('div');
  art.className = 'shop-house';
  art.appendChild(createShopSvg());

  const main = document.createElement('div');
  main.className = 'shop-hero-main';

  const kicker = document.createElement('div');
  kicker.className = 'shop-hero-kicker';
  kicker.textContent = '小物铺开门啦 OvO';

  const title = document.createElement('div');
  title.className = 'shop-hero-title';
  title.textContent = '把喜欢的小东西带回家';

  const text = document.createElement('div');
  text.className = 'shop-hero-text';
  text.textContent = '可以买给自己，也可以送给TA。商品图、名字和文案都能自己改。';

  const balance = document.createElement('div');
  balance.className = 'shop-balance';
  balance.append(createIcon('transfer', 15), document.createTextNode(`余额 ¥${formatMoney(getBalance())}`));

  main.append(kicker, title, text, balance);
  hero.append(art, main);

  const tabs = document.createElement('div');
  tabs.className = 'shop-tabs';
  tabs.append(
    createTabButton('shop', '商店'),
    createTabButton('bag', '背包'),
    createTabButton('custom', '自定义')
  );

  const list = document.createElement('div');
  list.className = 'shop-list';

  body.append(hero, tabs, list);

  if (currentTab === 'shop') {
    await renderItemList(list);
  } else if (currentTab === 'bag') {
    await renderInventory(list);
  } else {
    await renderCustomPanel(list);
  }
}

function createTabButton(tab, label) {
  const button = document.createElement('button');
  button.className = `shop-tab-btn ${currentTab === tab ? 'active' : ''}`;
  button.type = 'button';
  button.textContent = label;

  button.addEventListener('click', async () => {
    currentTab = tab;
    await renderShop();
  });

  return button;
}

async function renderItemList(list) {
  const items = getItems();

  if (!items.length) {
    list.appendChild(createEmptyState('货架空空的', '先去自定义里放一点小物吧 ᗜ ‸ ᗜ'));
    return;
  }

  for (const item of items) {
    list.appendChild(await createItemCard(item));
  }
}

async function createItemCard(item) {
  const card = document.createElement('article');
  card.className = 'shop-card';

  const art = document.createElement('div');
  art.className = 'shop-item-art';
  await fillItemArt(art, item);

  const main = document.createElement('div');
  main.className = 'shop-item-main';

  const name = document.createElement('div');
  name.className = 'shop-item-name';
  name.textContent = item.name;

  const desc = document.createElement('div');
  desc.className = 'shop-item-desc';
  desc.textContent = item.description;

  const effect = document.createElement('div');
  effect.className = 'shop-item-effect';
  effect.textContent = item.effect || '这个小东西会在之后悄悄派上用场。';

  const foot = document.createElement('div');
  foot.className = 'shop-card-foot';

  const price = document.createElement('div');
  price.className = 'shop-price';
  price.append(createIcon('transfer', 15), document.createTextNode(`¥${formatMoney(item.price)}`));

  const actions = document.createElement('div');
  actions.className = 'shop-editor-actions';

  const buy = document.createElement('button');
  buy.className = 'shop-buy-btn';
  buy.type = 'button';
  buy.append(createIcon('add', 15), document.createTextNode('带走'));
  buy.addEventListener('click', () => buyItem(item));

  const gift = document.createElement('button');
  gift.className = 'shop-small-btn';
  gift.type = 'button';
  gift.append(createIcon('heart', 15), document.createTextNode('送给TA'));
  gift.addEventListener('click', () => chooseGiftTarget(item));

  actions.append(buy, gift);
  foot.append(price, actions);
  main.append(name, desc, effect, foot);
  card.append(art, main);

  return card;
}

async function chooseGiftTarget(item) {
  const characters = await getAllDB('characters');

  if (!characters.length) {
    showToast('还没有可以收礼物的TA呢 ฅ-u-ฅ');
    return;
  }

  const names = characters
    .map((character, index) => `${index + 1}. ${character.name || '未命名'}`)
    .join('\n');

  const input = window.prompt(`想把「${item.name}」送给谁呀？\n${names}\n\n输入序号就好。`);
  if (!input) return;

  const index = Number(input) - 1;
  const character = characters[index];

  if (!character) {
    showToast('没有找到这个TA ๑ᵒᯅᵒ๑');
    return;
  }

  const note = window.prompt('要不要写一句礼物小纸条？可以直接留空。') || '';

  await userGiftToAI({
    characterId: character.id,
    characterName: character.name || 'TA',
    itemId: item.id,
    note
  });

  await renderShop();
}

async function buyItem(item) {
  if (getBalance() < item.price) {
    showToast('余额有点害羞，先去钱包补一点吧 ˶╸▵╺˶');
    return;
  }

  const ok = await showConfirm(`要把「${item.name}」带回背包吗？`);
  if (!ok) return;

  const paid = deductBalance(item.price, `购买 ${item.name}`);
  if (!paid) {
    showToast('余额不够啦 ᗜ ‸ ᗜ');
    return;
  }

  const inventoryId = await addToInventory(item, {
    owner: 'user',
    source: 'purchase'
  });

  if (!inventoryId) {
    // 入库失败，把已扣金额退回，避免扣钱无库存
    const refunded = addBalance(item.price, `退款：购买 ${item.name} 失败`);
    if (!refunded) {
      console.error('[shop] buyItem 入库失败且退款失败，用户余额可能短缺', { itemId: item.id, price: item.price });
      showToast('入库没成功，退款也出问题了，需要修一下');
    } else {
      console.warn('[shop] buyItem 入库失败，已退款', { itemId: item.id, price: item.price });
      showToast('入库没成功，钱已经退回来啦');
    }
    await renderShop();
    return;
  }

  showToast('已经乖乖放进背包啦 ˶>ᗜ<˶');
  await renderShop();
}

async function addToInventory(item, extra = {}) {
  const all = await getAllDB('inventory');
  const owner = extra.owner || 'user';
  const characterId = extra.characterId || '';

  const existing = all.find((record) => {
    return record &&
      record.recordType !== 'gift_record' &&
      record.source !== 'gift_record' &&
      record.owner !== 'gift_record' &&
      record.itemId === item.id &&
      (record.owner || 'user') === owner &&
      String(record.characterId || '') === String(characterId || '');
  });

  if (existing) {
    const updated = await setDB('inventory', existing.id, {
      ...existing,
      quantity: Number(existing.quantity || 0) + 1,
      itemName: item.name,
      itemDesc: item.description,
      itemPrice: Number(item.price) || 0,
      updatedAt: getNow()
    });
    if (!updated) return null;
    return existing.id;
  }

  const image = await getItemImage(item);
  const record = {
    id: generateId('inventory'),
    itemId: item.id,
    itemName: item.name,
    itemDesc: item.description,
    itemPrice: Number(item.price) || 0,
    itemImage: image,
    imageBase64: image,
    quantity: 1,
    owner,
    characterId,
    characterName: extra.characterName || '',
    source: extra.source || 'purchase',
    purchasedAt: getNow(),
    updatedAt: getNow()
  };

  const saved = await setDB('inventory', record.id, record);
  if (!saved) return null;
  return record.id;
}

async function renderInventory(list) {
  const items = getItems();
  const inventory = await getAllDB('inventory');
  const owned = inventory
    .filter((record) => record && record.recordType !== 'gift_record' && record.source !== 'gift_record' && record.owner !== 'gift_record' && Number(record.quantity) > 0)
    .map((record) => {
      const item = items.find((shopItem) => shopItem.id === record.itemId) || {
        id: record.itemId,
        name: record.itemName,
        description: record.itemDesc,
        price: record.itemPrice,
        effect: record.itemEffect || record.itemDesc
      };
      return item ? { ...record, item } : null;
    })
    .filter(Boolean);

  if (!owned.length) {
    list.appendChild(createEmptyState('背包还是空空的', "买到和收到的小东西都会放在这里 ⌯'ᵕ'⌯"));
    return;
  }

  for (const record of owned) {
    list.appendChild(await createInventoryRow(record));
  }
}

async function createInventoryRow(record) {
  const row = document.createElement('article');
  row.className = 'shop-inventory-row';

  const art = document.createElement('div');
  art.className = 'shop-item-art';
  await fillItemArt(art, record.item);

  if (!art.querySelector('img') && record.itemImage) {
    art.innerHTML = '';
    const img = document.createElement('img');
    img.src = record.itemImage;
    img.alt = '';
    art.appendChild(img);
  }

  const main = document.createElement('div');
  main.className = 'shop-inventory-main';

  const name = document.createElement('div');
  name.className = 'shop-inventory-name';
  name.textContent = record.item.name || record.itemName || '小物';

  const desc = document.createElement('div');
  desc.className = 'shop-inventory-desc';

  if (record.owner === 'character') {
    desc.textContent = `${record.characterName || 'TA'}收着这个小物：${record.item.effect || record.item.description || record.itemDesc || ''}`;
  } else if (record.source === 'gift_from_ai') {
    desc.textContent = `这是TA送给你的：${record.item.effect || record.item.description || record.itemDesc || ''}`;
  } else {
    desc.textContent = record.item.effect || record.item.description || record.itemDesc || '';
  }

  main.append(name, desc);

  const count = document.createElement('div');
  count.className = 'shop-inventory-count';
  count.textContent = `×${Number(record.quantity) || 0}`;

  row.append(art, main, count);
  return row;
}

async function renderCustomPanel(list) {
  const addCard = document.createElement('section');
  addCard.className = 'shop-editor-card';

  const title = document.createElement('div');
  title.className = 'shop-editor-title';
  title.textContent = '捏一个新商品';

  const help = document.createElement('div');
  help.className = 'shop-editor-help';
  help.textContent = '可以上传图片、写名字、改价格和文案。保存后会出现在商店里 ˵＞𖥦＜˵';

  const actions = document.createElement('div');
  actions.className = 'shop-editor-actions';

  const addButton = document.createElement('button');
  addButton.className = 'shop-buy-btn';
  addButton.type = 'button';
  addButton.append(createIcon('add', 15), document.createTextNode('新增小物'));
  addButton.addEventListener('click', addNewItem);

  actions.appendChild(addButton);
  addCard.append(title, help, actions);
  list.appendChild(addCard);

  const items = getItems();

  for (const item of items) {
    list.appendChild(await createEditorCard(item));
  }
}

async function createEditorCard(item) {
  const card = document.createElement('article');
  card.className = 'shop-editor-card';

  const head = document.createElement('div');
  head.className = 'shop-editor-head';

  const imageBox = document.createElement('div');
  imageBox.className = 'shop-editor-image';
  await fillItemArt(imageBox, item);

  const headMain = document.createElement('div');
  headMain.className = 'shop-item-main';

  const title = document.createElement('div');
  title.className = 'shop-editor-title';
  title.textContent = item.name;

  const help = document.createElement('div');
  help.className = 'shop-editor-help';
  help.textContent = item.locked ? '默认小物也可以改图和文案，但不会误删。' : '这是你自己添加的小物，可以自由整理。';

  const upload = document.createElement('button');
  upload.className = 'shop-upload-btn';
  upload.type = 'button';
  upload.append(createIcon('image', 15), document.createTextNode('换图片'));

  const file = document.createElement('input');
  file.className = 'shop-hidden-file';
  file.type = 'file';
  file.accept = 'image/*';

  upload.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const selected = file.files?.[0];
    if (!selected) return;

    const value = await fileToDataURL(selected);
    await setDB('blobs', getItemImageKey(item.id), {
      key: getItemImageKey(item.id),
      value,
      source: value,
      name: selected.name || '',
      type: selected.type || '',
      opacity: 100,
      updatedAt: getNow()
    });

    showToast('图片换好啦 >֊<');
    await renderShop();
  });

  headMain.append(title, help, upload, file);
  head.append(imageBox, headMain);

  const fields = document.createElement('div');
  fields.className = 'shop-editor-fields';

  const nameInput = createField('名字', item.name, 'input');
  const priceInput = createField('价格', String(item.price), 'input');
  const descInput = createField('介绍文案', item.description, 'textarea');
  const effectInput = createField('AI记忆文案，建议写第一人称', item.effect, 'textarea');

  fields.append(nameInput.wrap, priceInput.wrap, descInput.wrap, effectInput.wrap);

  const actions = document.createElement('div');
  actions.className = 'shop-editor-actions';

  const save = document.createElement('button');
  save.className = 'shop-buy-btn';
  save.type = 'button';
  save.append(createIcon('check', 15), document.createTextNode('保存'));

  save.addEventListener('click', async () => {
    const items = getItems();
    const next = items.map((shopItem) => {
      if (shopItem.id !== item.id) return shopItem;

      return normalizeShopItem({
        ...shopItem,
        name: nameInput.input.value.trim() || '未命名小物',
        price: Number(priceInput.input.value) || 0,
        description: descInput.input.value.trim(),
        effect: effectInput.input.value.trim(),
        updatedAt: getNow()
      });
    });

    saveItems(next);
    showToast("已经帮你收好啦 ⌯'ᵕ'⌯");
    await renderShop();
  });

  const clearImage = document.createElement('button');
  clearImage.className = 'shop-small-btn';
  clearImage.type = 'button';
  clearImage.append(createIcon('close', 15), document.createTextNode('清图片'));

  clearImage.addEventListener('click', async () => {
    await deleteDB('blobs', getItemImageKey(item.id));
    showToast('图片已经清掉啦');
    await renderShop();
  });

  actions.append(save, clearImage);

  if (!item.locked) {
    const remove = document.createElement('button');
    remove.className = 'shop-small-btn danger';
    remove.type = 'button';
    remove.append(createIcon('close', 15), document.createTextNode('删除'));

    remove.addEventListener('click', async () => {
      const ok = await showConfirm(`要删除「${item.name}」吗？`);
      if (!ok) return;

      saveItems(getItems().filter((shopItem) => shopItem.id !== item.id));
      await deleteDB('blobs', getItemImageKey(item.id));
      showToast('已经移走这个小物啦');
      await renderShop();
    });

    actions.appendChild(remove);
  }

  card.append(head, fields, actions);
  return card;
}

function createField(label, value, type) {
  const wrap = document.createElement('label');
  wrap.className = 'shop-field';

  const text = document.createElement('span');
  text.textContent = label;

  const input = type === 'textarea'
    ? document.createElement('textarea')
    : document.createElement('input');

  input.className = type === 'textarea' ? 'shop-textarea' : 'shop-input';
  input.value = value || '';

  if (type !== 'textarea') {
    input.type = label.includes('价格') ? 'number' : 'text';
  }

  wrap.append(text, input);
  return { wrap, input };
}

async function addNewItem() {
  const id = `custom-${generateId('shop')}`;
  const item = normalizeShopItem({
    id,
    name: '新来的小物',
    description: '这里可以写它的小故事。',
    price: 10,
    effect: '我记得这个新来的小物，它会让我想起你认真布置这里的样子。',
    moodEffect: 'happy',
    locked: false,
    createdAt: getNow(),
    updatedAt: getNow()
  });

  saveItems([item, ...getItems()]);
  showToast('新小物已经上架啦 ˶╹ꇴ╹˶');
  await renderShop();
}

function createEmptyState(titleText, textContent) {
  const empty = document.createElement('div');
  empty.className = 'shop-empty';

  const icon = document.createElement('div');
  icon.className = 'shop-empty-icon';
  icon.appendChild(createIcon('star', 26));

  const title = document.createElement('div');
  title.className = 'shop-empty-title';
  title.textContent = titleText;

  const text = document.createElement('div');
  text.className = 'shop-empty-text';
  text.textContent = textContent;

  empty.append(icon, title, text);
  return empty;
}

async function fillItemArt(element, item) {
  element.innerHTML = '';

  const image = await getItemImage(item);

  if (image) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = image;
    img.addEventListener('error', () => {
      element.innerHTML = '';
      element.appendChild(createItemSvg(item?.id || 'item'));
    });
    element.appendChild(img);
    return;
  }

  element.appendChild(createItemSvg(item?.id || 'item'));
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageFromRecord(record) {
  if (!record) return '';
  if (typeof record === 'string') return record.trim();

  const fields = ['value', 'source', 'data', 'image', 'iconImage', 'backgroundImage', 'imageBase64', 'itemImage', 'url', 'src'];
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function cssUrl(value) {
  return String(value || '').replace(/"/g, '\\"');
}

export function getShopItemsForAI() {
  return getItems().map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    effect: item.effect,
    moodEffect: item.moodEffect
  }));
}

export async function aiGiftToUser({ characterId, characterName = 'TA', itemId, message = '', note = '' } = {}) {
  const item = getItems().find((shopItem) => shopItem.id === itemId) || getItems()[0];

  if (!item) {
    return { ok: false, reason: 'no_item' };
  }

  if (!characterId) {
    return { ok: false, reason: 'no_character' };
  }

  const timestamp = getNow();
  const cleanNote = normalizeGiftNote(note || message);

  const paid = deductAiBalance(characterId, item.price, `购买礼物送给用户：${item.name}`, {
    category: 'gift',
    title: `送给用户 ${item.name}`,
    note: cleanNote,
    source: 'shop_gift',
    direction: 'ai_to_user',
    characterId,
    characterName,
    timestamp
  });

  if (!paid) {
    return { ok: false, reason: 'no_ai_balance' };
  }

  await addToInventory(item, {
    owner: 'user',
    source: 'gift_from_ai',
    characterId,
    characterName
  });

  const card = await writeGiftRecord({
    direction: 'ai_to_user',
    characterId,
    characterName,
    item,
    note: cleanNote,
    timestamp
  });

  await recordGiftMemory({
    characterId,
    role: 'assistant',
    source: '商店礼物',
    content: cleanNote || `我在小物商店里花 ¥${formatMoney(item.price)} 挑了「${item.name}」送给你。${item.effect || ''}`
  });

  window.dispatchEvent(new CustomEvent('shop-gift-created', {
    detail: { ...card }
  }));

  // 统一事件总线：shop:gift，payload 含 characterId/direction/itemName/itemId/note/characterName
  try {
    window.AppBus?.emit('shop:gift', { ...card });
  } catch (_) {}

  return { ok: true, item, card };
}

export async function userGiftToAI({ characterId, characterName = 'TA', itemId, note = '', message = '' } = {}) {
  const item = getItems().find((shopItem) => shopItem.id === itemId);

  if (!item) {
    showToast('这个小物暂时找不到啦 ᗜ ‸ ᗜ');
    return { ok: false, reason: 'no_item' };
  }

  if (getBalance() < item.price) {
    showToast('余额有点不够，礼物先抱一会儿 ˶╸▵╺˶');
    return { ok: false, reason: 'no_balance' };
  }

  const ok = await showConfirm(`要把「${item.name}」送给${characterName}吗？`);
  if (!ok) return { ok: false, reason: 'cancel' };

  const cleanNote = normalizeGiftNote(note || message);
  const timestamp = getNow();

  const paid = deductBalance(item.price, `送给${characterName} ${item.name}`);
  if (!paid) {
    showToast('余额不够啦');
    return { ok: false, reason: 'no_balance' };
  }

  await addToInventory(item, {
    owner: 'character',
    source: 'gift_from_user',
    characterId,
    characterName
  });

  const card = await writeGiftRecord({
    direction: 'user_to_ai',
    characterId,
    characterName,
    item,
    note: cleanNote || `用户把「${item.name}」送给了我。${item.effect || ''}`,
    timestamp
  });

  await recordGiftMemory({
    characterId,
    role: 'user',
    source: '商店礼物',
    content: `用户把「${item.name}」送给了我。${cleanNote ? `小纸条：${cleanNote}。` : ''}${item.effect || ''}`
  });

  window.dispatchEvent(new CustomEvent('shop-gift-created', {
    detail: { ...card }
  }));

  // 统一事件总线：shop:gift，payload 含 characterId/direction/itemName/itemId/note/characterName
  try {
    window.AppBus?.emit('shop:gift', { ...card });
  } catch (_) {}

  showToast('礼物已经送到TA手里啦 ๑˃ ᵕ ˂๑');
  return { ok: true, item, card };
}

async function writeGiftRecord({ direction, characterId, characterName, item, note = '', timestamp = getNow() }) {
  const card = await buildGiftCard({
    direction,
    characterId,
    characterName,
    item,
    note,
    timestamp
  });

  const record = {
    id: `gift_${generateId('record')}`,
    ...card,
    recordType: 'gift_record',
    owner: 'gift_record',
    source: 'gift_record',
    quantity: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await setDB('inventory', record.id, record);
  return card;
}

async function recordGiftMemory({ characterId, role, content, source }) {
  if (!characterId || !content) return null;

  try {
    return await window.AppBus.recordExternalInteraction({
      characterId,
      role,
      content,
      source,
      importance: 3
    });
  } catch (_) {
    return null;
  }
}

function createShopSvg() {
  const svg = createSvgBase(92, 92);
  svg.append(
    svgPath('M20 42h52v32a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V42z'),
    svgPath('M16 38l6-18h48l6 18'),
    svgPath('M22 20h48'),
    svgPath('M28 42v-6'),
    svgPath('M40 42v-6'),
    svgPath('M52 42v-6'),
    svgPath('M64 42v-6'),
    svgPath('M34 78V58a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v20'),
    svgPath('M26 50h12'),
    svgPath('M54 50h12')
  );
  return svg;
}

function createItemSvg(id) {
  const svg = createSvgBase(46, 46);
  const value = String(id || '');

  if (value.includes('tea')) {
    addSoftFill(svg, 'M12 19h16v9a8 8 0 0 1-16 0v-9z');
    svg.append(svgPath('M12 19h16v9a8 8 0 0 1-16 0v-9z'), svgPath('M28 22h3a4 4 0 0 1 0 8h-3'), svgPath('M15 13c1.5-2 1.5-4 0-6'), svgPath('M22 13c1.5-2 1.5-4 0-6'));
    return svg;
  }

  if (value.includes('flower')) {
    addSoftFill(svg, 'M23 23c-8-2-8-12 0-10 8-2 8 8 0 10z');
    svg.append(svgPath('M23 23v15'), svgPath('M23 23c-8-2-8-12 0-10 8-2 8 8 0 10z'), svgPath('M23 23c-6 5-13 0-8-6'), svgPath('M23 23c6 5 13 0 8-6'));
    return svg;
  }

  if (value.includes('cake')) {
    addSoftFill(svg, 'M10 23h26v12a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V23z');
    svg.append(svgPath('M10 23h26v12a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V23z'), svgPath('M13 17h20a3 3 0 0 1 3 3v3H10v-3a3 3 0 0 1 3-3z'), svgPath('M17 17v-5'), svgPath('M23 17v-5'), svgPath('M29 17v-5'));
    return svg;
  }

  if (value.includes('fish')) {
    addSoftFill(svg, 'M10 23c6-8 17-8 24 0-7 8-18 8-24 0z');
    svg.append(svgPath('M10 23c6-8 17-8 24 0-7 8-18 8-24 0z'), svgPath('M34 23l6-5v10l-6-5z'), svgPath('M18 23h.1'), svgPath('M24 18c2 3 2 7 0 10'));
    return svg;
  }

  if (value.includes('ball')) {
    addSoftFill(svg, 'M23 10a13 13 0 1 1 0 26 13 13 0 0 1 0-26z');
    svg.append(svgPath('M23 10a13 13 0 1 1 0 26 13 13 0 0 1 0-26z'), svgPath('M13 22c6 0 10-4 10-12'), svgPath('M23 36c0-7 4-11 13-12'));
    return svg;
  }

  if (value.includes('card') || value.includes('tarot') || value.includes('truth')) {
    addSoftFill(svg, 'M12 9h20a4 4 0 0 1 4 4v21H12a4 4 0 0 1-4-4V13a4 4 0 0 1 4-4z');
    svg.append(svgPath('M12 9h20a4 4 0 0 1 4 4v21H12a4 4 0 0 1-4-4V13a4 4 0 0 1 4-4z'), svgPath('M23 16l2 4 4.5.7-3.2 3.1.8 4.4-4.1-2.1-4.1 2.1.8-4.4-3.2-3.1 4.5-.7L23 16z'));
    return svg;
  }

  if (value.includes('ticket')) {
    addSoftFill(svg, 'M12 14h23v6a4 4 0 0 0 0 8v6H12v-6a4 4 0 0 0 0-8v-6z');
    svg.append(svgPath('M12 14h23v6a4 4 0 0 0 0 8v6H12v-6a4 4 0 0 0 0-8v-6z'), svgPath('M20 19h8'), svgPath('M20 25h6'), svgPath('M20 31h8'));
    return svg;
  }

  addSoftFill(svg, 'M13 11h20l4 10-14 17L9 21l4-10z');
  svg.append(svgPath('M13 11h20l4 10-14 17L9 21l4-10z'), svgPath('M9 21h28'), svgPath('M18 11l-2 10 7 17'), svgPath('M28 11l2 10-7 17'));
  return svg;
}

function createSvgBase(width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

function svgPath(d) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return path;
}

function addSoftFill(svg, d) {
  const path = svgPath(d);
  path.setAttribute('fill', 'var(--bg-card)');
  path.setAttribute('opacity', '0.55');
  svg.appendChild(path);
}

// 改了什么：礼物记录加 owner/source 隔离，背包查找和展示排除 gift_record；礼物卡片补齐 card/item/shopItem/image/price 字段，方便聊天小卡片读取商店图片和文案。
// 会不会影响其他文件：会让 apps/chat/thread-render.js 能显示更完整的礼物卡片；如果要礼物直接进入聊天记录，下一步需要改 apps/chat/thread-actions.js 或聊天入口监听 shop-gift-created。
// 更新记忆里该文件的导出函数：无变化。
// 依赖：../core/storage.js(getData,setData,generateId,getNow,getAllDB,setDB,getDB,deleteDB)；../core/ui.js(showToast,showConfirm,createIcon)；./wallet.js(getBalance,deductBalance,deductAiBalance)；通过 window.AppBus 统一写记忆（recordExternalInteraction）、发 shop:gift 事件
