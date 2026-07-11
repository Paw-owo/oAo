// imports:
// from ../core/storage.js import getData, setData, getDB, setDB, deleteDB, compressImage, getNow
// from ../core/ui.js import showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData,
  setData,
  getDB,
  setDB,
  deleteDB,
  compressImage,
  getNow
} from '../core/storage.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../core/ui.js';

const STYLE_ID = 'game-hub-styles';
const HUB_BG_KEY = 'app_bg_games';
const HUB_HERO_IMAGE_KEY = 'app_game_hero_image';
const HUB_PROFILE_KEY = 'app_game_hub_visual';
const GAME_VISUALS_KEY = 'app_game_visuals';
const CUSTOM_HTML_GAME_KEY = 'app_custom_html_game';
const BADGE_KEY = 'games_unread_count';

const GAMES = [
  {
    id: 'liars-tavern',
    name: '骗子酒馆',
    subtitle: '牌、骰子和谎话都在桌上',
    description: '混合扑克牌、骰子吹牛、酒馆质疑。进入后是一整套独立酒馆世界。',
    tone: '纸牌酒馆风',
    module: './games/liars-tavern.js',
    status: 'ready'
  },
  {
    id: 'custom-html',
    name: '单机小游戏',
    subtitle: '把自己的 HTML 小游戏放进来',
    description: '上传一个纯静态 HTML 小游戏，在这里全屏打开。',
    tone: '自定义小世界',
    module: '',
    status: 'ready',
    custom: true
  },
  {
    id: 'draw-guess',
    name: '你画我猜',
    subtitle: 'AI 灵魂画手上线',
    description: '5人局涂鸦猜梗，AI 画抽象题词，大家一起猜一起吐槽。',
    tone: '涂鸦杂志风',
    module: './games/draw-guess.js',
    status: 'ready'
  },
  {
    id: 'pet',
    name: '云养宠',
    subtitle: '一只小家伙在等你回来',
    description: '像素宠物、图片或 GIF 宠物，喂食、玩耍、说话都会真实记录。',
    tone: '细腻像素风',
    module: './games/pet.js',
    status: 'planned'
  },
  {
    id: 'tarot',
    name: '塔罗牌',
    subtitle: '把问题放在心里再翻牌',
    description: '留白、安静、神秘的塔罗小世界。',
    tone: '留白神秘风',
    module: './games/tarot.js',
    status: 'ready'
  },
  {
    id: 'script',
    name: '剧本杀',
    subtitle: '线索像纸页慢慢翻开',
    description: '纸感推理、人物关系、线索板和投票流程。',
    tone: '纸感推理风',
    module: './games/script.js',
    status: 'planned'
  },
  {
    id: 'werewolf',
    name: '狼人杀',
    subtitle: '身份藏在夜色里',
    description: '发言、投票、夜晚行动，适合多人 AI 角色局。',
    tone: '纸感推理风',
    module: './games/werewolf.js',
    status: 'planned'
  },
  {
    id: 'undercover',
    name: '谁是卧底',
    subtitle: '相似词语里藏着不同的人',
    description: '描述、观察、投票，每一轮都靠发言推进。',
    tone: '轻推理纸牌风',
    module: './games/undercover.js',
    status: 'planned'
  },
  {
    id: 'cards',
    name: '扑克牌',
    subtitle: '安静牌桌上的小胜负',
    description: '适合做成可视化出牌、摸牌、弃牌桌面。',
    tone: '纸牌桌面风',
    module: './games/cards.js',
    status: 'planned'
  },
  {
    id: 'truth',
    name: '真心话大冒险',
    subtitle: '把问题轻轻递过去',
    description: '转盘、抽卡、指定对象，适合轻松互动。',
    tone: '柔软像素风',
    module: './games/truth.js',
    status: 'ready'
  },
  {
    id: 'match',
    name: '配对',
    subtitle: '一点点靠近答案',
    description: '你猜 AI，AI 猜你，线索慢慢浮出来。',
    tone: '极简解谜风',
    module: './games/match.js',
    status: 'planned'
  }
];

let containerEl = null;
let rootEl = null;
let activeChild = null;
let hubProfile = {};
let gameVisuals = {};
let iconCache = {};
let heroImage = '';
let mounted = false;

export async function mount(container) {
  containerEl = container;
  mounted = true;

  injectStyles();

  rootEl = document.createElement('section');
  rootEl.className = 'game-hub-app';

  containerEl.innerHTML = '';
  containerEl.appendChild(rootEl);

  await loadHubData();
  await applyHubBackground();
  renderHub();
}

export function unmount() {
  mounted = false;
  hideBottomSheet();

  if (activeChild && typeof activeChild.unmount === 'function') {
    try {
      activeChild.unmount();
    } catch (_) {
      /* silent */
    }
  }

  activeChild = null;

  if (containerEl) {
    containerEl.innerHTML = '';
  }

  containerEl = null;
  rootEl = null;
}

async function loadHubData() {
  hubProfile = normalizeHubProfile(getData(HUB_PROFILE_KEY));
  gameVisuals = normalizeGameVisuals(getData(GAME_VISUALS_KEY));
  iconCache = {};
  heroImage = '';

  try {
    const heroRecord = await getDB('blobs', HUB_HERO_IMAGE_KEY);
    heroImage = heroRecord?.source || heroRecord?.value || heroRecord?.data || '';
  } catch (_) {
    heroImage = '';
  }

  await Promise.all(GAMES.map(async (game) => {
    try {
      const record = await getDB('blobs', `app_game_icon_${game.id}`);
      iconCache[game.id] = record?.source || record?.value || '';
    } catch (_) {
      iconCache[game.id] = '';
    }
  }));
}

function normalizeHubProfile(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : '异世界游戏厅',
    subtitle: typeof source.subtitle === 'string' && source.subtitle.trim()
      ? source.subtitle.trim()
      : '进去以后，就不是桌面了',
    updatedAt: source.updatedAt || ''
  };
}

function normalizeGameVisuals(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const next = {};

  GAMES.forEach((game) => {
    const item = source[game.id] && typeof source[game.id] === 'object' ? source[game.id] : {};
    next[game.id] = {
      name: typeof item.name === 'string' ? item.name : '',
      subtitle: typeof item.subtitle === 'string' ? item.subtitle : '',
      opacity: clamp(Number(item.opacity ?? 100), 20, 100),
      updatedAt: item.updatedAt || ''
    };
  });

  return next;
}

function saveHubProfile() {
  setData(HUB_PROFILE_KEY, hubProfile);
}

function saveGameVisuals() {
  setData(GAME_VISUALS_KEY, gameVisuals);
}

async function applyHubBackground() {
  if (!rootEl) return;

  try {
    const record = await getDB('blobs', HUB_BG_KEY);
    const image = record?.source || record?.value || record?.data || '';

    if (image) {
      rootEl.classList.add('has-bg');
      rootEl.style.setProperty('--hub-bg-image', `url("${escapeCssUrl(image)}")`);
      return;
    }
  } catch (_) {
    /* silent */
  }

  rootEl.classList.remove('has-bg');
  rootEl.style.removeProperty('--hub-bg-image');
}

function renderHub() {
  if (!rootEl) return;

  activeChild = null;

  rootEl.innerHTML = `
    <div class="hub-world-bg"></div>
    <div class="hub-ambient hub-ambient-one"></div>
    <div class="hub-ambient hub-ambient-two"></div>
    <div class="hub-shell">
      <header class="hub-nav">
        <button class="hub-icon-btn" data-action="back" aria-label="返回桌面"></button>
        <div class="hub-title-box">
          <div class="hub-title"></div>
          <div class="hub-subtitle"></div>
        </div>
        <button class="hub-icon-btn" data-action="customize" aria-label="个性化"></button>
      </header>

      <main class="hub-content">
        <section class="hub-hero">
          <div class="hub-hero-copy">
            <div class="hub-kicker">小世界入口</div>
            <h1 class="hub-hero-title"></h1>
            <p class="hub-hero-text"></p>
          </div>
          <button class="hub-hero-art" data-game="liars-tavern" aria-label="进入骗子酒馆"></button>
        </section>

        <section class="hub-grid-section">
          <div class="hub-section-head">
            <div>
              <div class="hub-section-title">挑一个地方躲一会儿</div>
              <div class="hub-section-note">每扇门后面都是单独的小世界</div>
            </div>
            <button class="hub-small-pill" data-action="clear-badge">清空提醒</button>
          </div>
          <div class="hub-game-grid"></div>
        </section>
      </main>
    </div>
  `;

  rootEl.querySelector('[data-action="back"]').appendChild(createIcon('back', 19));
  rootEl.querySelector('[data-action="customize"]').appendChild(createIcon('settings', 19));

  rootEl.querySelector('.hub-title').textContent = hubProfile.title;
  rootEl.querySelector('.hub-subtitle').textContent = hubProfile.subtitle;
  rootEl.querySelector('.hub-hero-title').textContent = getHeroTitle();
  rootEl.querySelector('.hub-hero-text').textContent = getHeroText();

  const heroArt = rootEl.querySelector('.hub-hero-art');
  if (heroImage) {
    const img = document.createElement('img');
    img.src = heroImage;
    img.alt = '';
    heroArt.classList.add('has-image');
    heroArt.appendChild(img);
  } else {
    heroArt.appendChild(createHubHeroSvg());
  }

  const grid = rootEl.querySelector('.hub-game-grid');
  GAMES.forEach((game) => {
    grid.appendChild(createGameCard(game));
  });

  bindHubEvents();
}

function bindHubEvents() {
  rootEl.querySelector('[data-action="back"]')?.addEventListener('click', () => {
    window.closeCurrentApp?.();
  });

  rootEl.querySelector('[data-action="customize"]')?.addEventListener('click', () => {
    openCustomizeSheet();
  });

  rootEl.querySelector('[data-action="clear-badge"]')?.addEventListener('click', () => {
    setData(BADGE_KEY, 0);
    window.refreshDesktopBadges?.();
    showToast('提醒清掉啦');
  });

  rootEl.querySelector('.hub-hero-art')?.addEventListener('click', () => {
    openGame('liars-tavern');
  });
}

function getHeroTitle() {
  const unread = Number(getData(BADGE_KEY) || 0);
  if (unread > 0) return '有个小世界在喊你';
  return '今晚想去哪里玩';
}

function getHeroText() {
  const unread = Number(getData(BADGE_KEY) || 0);
  if (unread > 0) return '宠物、牌桌或某个游戏可能留下了提醒。进去看看就好。';
  return '小游戏都收在这里。自己的 HTML 小游戏，也可以悄悄塞进来玩。';
}

function createGameCard(game) {
  const visual = gameVisuals[game.id] || {};
  const customName = visual.name || game.name;
  const customSubtitle = visual.subtitle || game.subtitle;
  const icon = iconCache[game.id] || '';
  const isReady = game.status === 'ready';

  const card = document.createElement('button');
  card.type = 'button';
  card.className = `hub-game-card hub-game-${game.id}`;
  card.dataset.game = game.id;

  card.innerHTML = `
    <div class="hub-game-art" style="opacity:${clamp(Number(visual.opacity ?? 100), 20, 100) / 100}"></div>
    <div class="hub-game-meta">
      <div class="hub-game-name"></div>
      <div class="hub-game-subtitle"></div>
      <div class="hub-game-desc"></div>
    </div>
    <div class="hub-game-bottom">
      <span class="hub-game-tone"></span>
      <span class="hub-game-status ${isReady ? 'ready' : ''}"></span>
    </div>
  `;

  const art = card.querySelector('.hub-game-art');
  if (icon) {
    const img = document.createElement('img');
    img.src = icon;
    img.alt = '';
    art.appendChild(img);
    art.classList.add('has-image');
  } else {
    art.appendChild(createGameGlyph(game.id));
  }

  card.querySelector('.hub-game-name').textContent = customName;
  card.querySelector('.hub-game-subtitle').textContent = customSubtitle;
  card.querySelector('.hub-game-desc').textContent = game.description;
  card.querySelector('.hub-game-tone').textContent = game.tone;
  card.querySelector('.hub-game-status').textContent = isReady ? '可进入' : '搭建中';

  card.addEventListener('click', () => openGame(game.id));

  return card;
}

async function openGame(gameId) {
  const game = GAMES.find((item) => item.id === gameId);
  if (!game || !containerEl) return;

  if (game.id === 'custom-html') {
    await openCustomHtmlGame(game);
    return;
  }

  try {
    const module = await import(game.module);

    if (!module || typeof module.mount !== 'function') {
      showToast('这个小世界还没接好');
      return;
    }

    activeChild = module;

    const childRoot = document.createElement('section');
    childRoot.className = 'game-child-host';

    containerEl.innerHTML = '';
    containerEl.appendChild(childRoot);

    module.mount(childRoot, {
      game,
      onBack: async () => {
        await returnToHub(module);
      }
    });
  } catch (_) {
    showToast('这个小世界还在搭建');
  }
}

async function returnToHub(moduleToUnmount = activeChild) {
  if (!mounted || !containerEl) return;

  if (moduleToUnmount && typeof moduleToUnmount.unmount === 'function') {
    try {
      moduleToUnmount.unmount();
    } catch (_) {
      /* silent */
    }
  }

  activeChild = null;

  rootEl = document.createElement('section');
  rootEl.className = 'game-hub-app';

  containerEl.innerHTML = '';
  containerEl.appendChild(rootEl);

  await loadHubData();
  await applyHubBackground();
  renderHub();
}

async function openCustomHtmlGame(game) {
  if (!containerEl) return;

  const childRoot = document.createElement('section');
  childRoot.className = 'custom-html-game';

  containerEl.innerHTML = '';
  containerEl.appendChild(childRoot);

  let record = null;

  try {
    record = await getDB('blobs', CUSTOM_HTML_GAME_KEY);
  } catch (_) {
    record = null;
  }

  renderCustomHtmlGame(childRoot, game, record);
}

function renderCustomHtmlGame(host, game, record) {
  const html = typeof record?.html === 'string'
    ? record.html
    : typeof record?.value === 'string'
      ? record.value
      : '';

  const name = record?.name || game.name;
  const updatedAt = record?.updatedAt || '';

  host.innerHTML = `
    <div class="custom-game-topbar">
      <button class="custom-game-btn" data-action="back" aria-label="返回"></button>
      <div class="custom-game-title-box">
        <div class="custom-game-title"></div>
        <div class="custom-game-subtitle"></div>
      </div>
      <button class="custom-game-btn" data-action="menu" aria-label="管理"></button>
    </div>

    <div class="custom-game-body"></div>
  `;

  host.querySelector('[data-action="back"]').appendChild(createIcon('back', 19));
  host.querySelector('[data-action="menu"]').appendChild(createIcon('settings', 19));

  host.querySelector('.custom-game-title').textContent = name;
  host.querySelector('.custom-game-subtitle').textContent = html
    ? `已装入小游戏${updatedAt ? ` · ${formatShortTime(updatedAt)}` : ''}`
    : '还没有上传 HTML 小游戏';

  const body = host.querySelector('.custom-game-body');

  if (html) {
    const iframe = document.createElement('iframe');
    iframe.className = 'custom-game-frame';
    iframe.title = name;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('marginwidth', '0');
    iframe.setAttribute('marginheight', '0');
    iframe.setAttribute('scrolling', 'auto');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups');
    iframe.srcdoc = html;
    body.appendChild(iframe);
  } else {
    body.appendChild(createCustomEmptyState());
  }

  host.querySelector('[data-action="back"]')?.addEventListener('click', () => {
    returnToHub(null);
  });

  host.querySelector('[data-action="menu"]')?.addEventListener('click', () => {
    openCustomHtmlSheet(host, game);
  });

  host.querySelector('[data-action="upload-empty"]')?.addEventListener('click', () => {
    uploadCustomHtmlGame(host, game);
  });
}

function createCustomEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'custom-game-empty';
  empty.innerHTML = `
    <div class="custom-game-empty-card">
      <div class="custom-game-empty-art"></div>
      <div class="custom-game-empty-title">这里可以放一个自己的小游戏</div>
      <div class="custom-game-empty-text">上传一个 .html 文件，就能在这里全屏打开。适合纯单机小游戏。</div>
      <button class="btn-primary" data-action="upload-empty">上传 HTML</button>
    </div>
  `;

  empty.querySelector('.custom-game-empty-art').appendChild(createGameGlyph('custom-html'));

  return empty;
}

function openCustomHtmlSheet(host, game) {
  const sheet = document.createElement('div');
  sheet.className = 'hub-sheet';

  sheet.innerHTML = `
    <div class="sheet-title">单机小游戏</div>
    <div class="sheet-description">上传一个完整 HTML 文件。它会存在本机，不需要后端。</div>
    <button class="btn-primary" data-action="upload"></button>
    <button class="btn-ghost" data-action="clear"></button>
  `;

  sheet.querySelector('[data-action="upload"]').append(
    createIcon('upload', 17),
    document.createTextNode('上传或替换 HTML')
  );

  sheet.querySelector('[data-action="clear"]').append(
    createIcon('clear', 17),
    document.createTextNode('清除已上传小游戏')
  );

  sheet.querySelector('[data-action="upload"]').addEventListener('click', async () => {
    hideBottomSheet();
    await uploadCustomHtmlGame(host, game);
  });

  sheet.querySelector('[data-action="clear"]').addEventListener('click', async () => {
    const ok = await showConfirm('要清除这个单机小游戏吗？');
    if (!ok) return;

    await deleteDB('blobs', CUSTOM_HTML_GAME_KEY);
    hideBottomSheet();

    showToast('小游戏已清除');
    renderCustomHtmlGame(host, game, null);
  });

  showBottomSheet(sheet);
}

async function uploadCustomHtmlGame(host, game) {
  const file = await pickHtmlFile();
  if (!file) return;

  try {
    const html = await readFileAsText(file);

    await setDB('blobs', CUSTOM_HTML_GAME_KEY, {
      key: CUSTOM_HTML_GAME_KEY,
      type: 'custom-html-game',
      name: file.name || 'custom-game.html',
      html,
      value: html,
      updatedAt: getNow()
    });

    const record = await getDB('blobs', CUSTOM_HTML_GAME_KEY);

    showToast('小游戏装进去啦');
    renderCustomHtmlGame(host, game, record);
  } catch (_) {
    showToast('HTML 没有读取成功');
  }
}

function pickHtmlFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.txt,text/html,text/plain';
    input.className = 'hidden';

    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });

    document.body.appendChild(input);
    input.click();
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));

    reader.readAsText(file);
  });
}

function openCustomizeSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'hub-sheet';

  sheet.innerHTML = `
    <div class="sheet-title">游戏厅外观</div>
    <div class="sheet-description">这里只改大厅。每个游戏进去后会有自己的世界。</div>

    <label class="form-row">
      <span>大厅名字</span>
      <input class="input-card" data-field="title" type="text" />
    </label>

    <label class="form-row">
      <span>大厅小字</span>
      <input class="input-card" data-field="subtitle" type="text" />
    </label>

    <div class="hub-sheet-actions">
      <button class="btn-ghost" data-action="upload-bg"></button>
      <button class="btn-ghost" data-action="clear-bg"></button>
    </div>

    <div class="hub-sheet-actions">
      <button class="btn-ghost" data-action="upload-hero"></button>
      <button class="btn-ghost" data-action="clear-hero"></button>
    </div>

    <div class="hub-sheet-list"></div>

    <button class="btn-primary" data-action="save">保存</button>
  `;

  const titleInput = sheet.querySelector('[data-field="title"]');
  const subtitleInput = sheet.querySelector('[data-field="subtitle"]');
  titleInput.value = hubProfile.title;
  subtitleInput.value = hubProfile.subtitle;

  const uploadBgBtn = sheet.querySelector('[data-action="upload-bg"]');
  uploadBgBtn.append(createIcon('upload', 17), document.createTextNode('上传大厅背景'));

  const clearBgBtn = sheet.querySelector('[data-action="clear-bg"]');
  clearBgBtn.append(createIcon('clear', 17), document.createTextNode('清除大厅背景'));

  const uploadHeroBtn = sheet.querySelector('[data-action="upload-hero"]');
  uploadHeroBtn.append(createIcon('upload', 17), document.createTextNode('上传大卡片图'));

  const clearHeroBtn = sheet.querySelector('[data-action="clear-hero"]');
  clearHeroBtn.append(createIcon('clear', 17), document.createTextNode('清除大卡片图'));

  const saveBtn = sheet.querySelector('[data-action="save"]');
  const list = sheet.querySelector('.hub-sheet-list');

  GAMES.forEach((game) => {
    list.appendChild(createVisualEditorRow(game));
  });

  uploadBgBtn.addEventListener('click', async () => {
    const file = await pickImageFile();
    if (!file) return;

    try {
      const value = await compressImage(file, 1800, 0.9);
      await setDB('blobs', HUB_BG_KEY, {
        key: HUB_BG_KEY,
        value,
        source: value,
        name: file.name || '',
        updatedAt: getNow()
      });
      await applyHubBackground();
      showToast('大厅背景换好了');
    } catch (_) {
      showToast('图片没有处理好');
    }
  });

  clearBgBtn.addEventListener('click', async () => {
    const ok = await showConfirm('要清除大厅背景吗？');
    if (!ok) return;

    await deleteDB('blobs', HUB_BG_KEY);
    await applyHubBackground();
    showToast('大厅背景已清除');
  });

  uploadHeroBtn.addEventListener('click', async () => {
    const file = await pickImageFile();
    if (!file) return;

    try {
      const value = await compressImage(file, 900, 0.9);
      await setDB('blobs', HUB_HERO_IMAGE_KEY, {
        key: HUB_HERO_IMAGE_KEY,
        value,
        source: value,
        name: file.name || '',
        updatedAt: getNow()
      });
      heroImage = value;
      showToast('大卡片图片换好了');
    } catch (_) {
      showToast('图片没有处理好');
    }
  });

  clearHeroBtn.addEventListener('click', async () => {
    const ok = await showConfirm('要清除顶部大卡片图片吗？');
    if (!ok) return;

    await deleteDB('blobs', HUB_HERO_IMAGE_KEY);
    heroImage = '';
    showToast('大卡片图片已清除');
  });

  saveBtn.addEventListener('click', async () => {
    hubProfile = {
      title: titleInput.value.trim() || '异世界游戏厅',
      subtitle: subtitleInput.value.trim() || '进去以后，就不是桌面了',
      updatedAt: getNow()
    };

    saveHubProfile();
    saveGameVisuals();
    hideBottomSheet();
    await loadHubData();
    renderHub();
    showToast('游戏厅收拾好了');
  });

  showBottomSheet(sheet);
}

function createVisualEditorRow(game) {
  const visual = gameVisuals[game.id] || {};
  const row = document.createElement('div');
  row.className = 'hub-visual-row';

  row.innerHTML = `
    <div class="hub-visual-preview"></div>
    <div class="hub-visual-fields">
      <input class="input-card" data-field="name" type="text" />
      <input class="input-card" data-field="subtitle" type="text" />
      <input class="input-card" data-field="opacity" type="number" min="20" max="100" />
      <div class="hub-visual-actions">
        <button class="btn-ghost" data-action="icon"></button>
        <button class="btn-ghost" data-action="clear"></button>
      </div>
    </div>
  `;

  const preview = row.querySelector('.hub-visual-preview');
  const icon = iconCache[game.id] || '';

  if (icon) {
    const img = document.createElement('img');
    img.src = icon;
    img.alt = '';
    preview.appendChild(img);
  } else {
    preview.appendChild(createGameGlyph(game.id));
  }

  const nameInput = row.querySelector('[data-field="name"]');
  const subtitleInput = row.querySelector('[data-field="subtitle"]');
  const opacityInput = row.querySelector('[data-field="opacity"]');

  nameInput.placeholder = game.name;
  nameInput.value = visual.name || '';

  subtitleInput.placeholder = game.subtitle;
  subtitleInput.value = visual.subtitle || '';

  opacityInput.value = clamp(Number(visual.opacity ?? 100), 20, 100);

  const iconBtn = row.querySelector('[data-action="icon"]');
  iconBtn.append(createIcon('upload', 16), document.createTextNode('图标'));

  const clearBtn = row.querySelector('[data-action="clear"]');
  clearBtn.append(createIcon('clear', 16), document.createTextNode('清除'));

  const syncVisual = () => {
    gameVisuals[game.id] = {
      name: nameInput.value.trim(),
      subtitle: subtitleInput.value.trim(),
      opacity: clamp(Number(opacityInput.value || 100), 20, 100),
      updatedAt: getNow()
    };
  };

  nameInput.addEventListener('input', syncVisual);
  subtitleInput.addEventListener('input', syncVisual);
  opacityInput.addEventListener('input', syncVisual);

  iconBtn.addEventListener('click', async () => {
    const file = await pickImageFile();
    if (!file) return;

    try {
      const value = await compressImage(file, 520, 0.88);
      await setDB('blobs', `app_game_icon_${game.id}`, {
        key: `app_game_icon_${game.id}`,
        value,
        source: value,
        name: file.name || '',
        updatedAt: getNow()
      });

      iconCache[game.id] = value;
      preview.innerHTML = '';

      const img = document.createElement('img');
      img.src = value;
      img.alt = '';
      preview.appendChild(img);

      syncVisual();
      showToast('图标换好了');
    } catch (_) {
      showToast('图标没有处理好');
    }
  });

  clearBtn.addEventListener('click', async () => {
    await deleteDB('blobs', `app_game_icon_${game.id}`);
    iconCache[game.id] = '';

    preview.innerHTML = '';
    preview.appendChild(createGameGlyph(game.id));

    nameInput.value = '';
    subtitleInput.value = '';
    opacityInput.value = 100;

    gameVisuals[game.id] = {
      name: '',
      subtitle: '',
      opacity: 100,
      updatedAt: getNow()
    };

    showToast('这一项已恢复');
  });

  return row;
}

function pickImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.className = 'hidden';

    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });

    document.body.appendChild(input);
    input.click();
  });
}

function createHubHeroSvg() {
  const svg = createSvg('0 0 140 140', 116);
  svg.classList.add('hub-hero-svg');

  svg.append(
    svgEl('path', { d: 'M30 98c12 10 27 15 40 15s28-5 40-15' }),
    svgEl('path', { d: 'M30 82h80' }),
    svgEl('rect', { x: '38', y: '36', width: '24', height: '38', rx: '8', transform: 'rotate(-9 50 55)' }),
    svgEl('rect', { x: '70', y: '32', width: '24', height: '42', rx: '8', transform: 'rotate(8 82 53)' }),
    svgEl('rect', { x: '56', y: '58', width: '24', height: '24', rx: '7' }),
    svgEl('path', { d: 'M62 65h.2M74 65h.2M68 76h.2' }),
    svgEl('path', { d: 'M96 42c9 8 10 20 2 30' }),
    svgEl('path', { d: 'M42 44c-8 7-9 17-3 27' })
  );

  return svg;
}

function createGameGlyph(gameId) {
  const svg = createSvg('0 0 80 80', 54);

  if (gameId === 'custom-html') {
    svg.append(
      svgEl('rect', { x: '15', y: '18', width: '50', height: '38', rx: '12' }),
      svgEl('path', { d: 'M23 30h34' }),
      svgEl('path', { d: 'M29 40l-6 5 6 5' }),
      svgEl('path', { d: 'M51 40l6 5-6 5' }),
      svgEl('path', { d: 'M43 37l-6 16' }),
      svgEl('path', { d: 'M31 64h18' })
    );
    return svg;
  }

  if (gameId === 'draw-guess') {
    svg.append(
      svgEl('path', { d: 'M18 58c12-18 19 9 30-8 7-11 10-20 18-16' }),
      svgEl('path', { d: 'M22 22h26' }),
      svgEl('path', { d: 'M28 30h16' }),
      svgEl('path', { d: 'M56 18l8 8-28 28-11 3 3-11 28-28z' }),
      svgEl('path', { d: 'M51 23l8 8' })
    );
    return svg;
  }

  if (gameId === 'liars-tavern') {
    svg.append(
      svgEl('path', { d: 'M16 58h48M24 58l6 12M56 58l-6 12' }),
      svgEl('rect', { x: '20', y: '24', width: '20', height: '30', rx: '7', transform: 'rotate(-8 30 39)' }),
      svgEl('rect', { x: '44', y: '23', width: '20', height: '30', rx: '7', transform: 'rotate(8 54 38)' }),
      svgEl('rect', { x: '32', y: '39', width: '18', height: '18', rx: '5' }),
      svgEl('path', { d: 'M37 44h.2M45 44h.2M41 52h.2' })
    );
    return svg;
  }

  if (gameId === 'pet') {
    svg.append(
      svgEl('path', { d: 'M24 36c0-14 8-22 16-22s16 8 16 22v10c0 12-7 20-16 20s-16-8-16-20V36z' }),
      svgEl('path', { d: 'M28 25l-9-9v18M52 25l9-9v18' }),
      svgEl('path', { d: 'M34 44h.2M46 44h.2M36 53c3 2 5 2 8 0' })
    );
    return svg;
  }

  if (gameId === 'tarot') {
    svg.append(
      svgEl('rect', { x: '25', y: '12', width: '30', height: '56', rx: '10' }),
      svgEl('path', { d: 'M40 25l5 10 11 2-8 8 2 12-10-6-10 6 2-12-8-8 11-2 5-10z' })
    );
    return svg;
  }

  if (gameId === 'script' || gameId === 'werewolf' || gameId === 'undercover') {
    svg.append(
      svgEl('path', { d: 'M24 12h24l12 12v44H24V12z' }),
      svgEl('path', { d: 'M48 12v14h12' }),
      svgEl('path', { d: 'M31 36h18M31 46h16M31 56h12' })
    );
    return svg;
  }

  svg.append(
    svgEl('rect', { x: '23', y: '16', width: '28', height: '42', rx: '9', transform: 'rotate(-8 37 37)' }),
    svgEl('rect', { x: '32', y: '20', width: '28', height: '42', rx: '9', transform: 'rotate(8 46 41)' }),
    svgEl('path', { d: 'M42 35l5-6 5 6-5 6-5-6z' })
  );

  return svg;
}

function createSvg(viewBox, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);

  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });

  return node;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function escapeCssUrl(value) {
  return String(value || '').replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '');
}

function formatShortTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${month}-${day} ${hour}:${minute}`;
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .game-hub-app {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      isolation: isolate;
    }

    .game-hub-app.has-bg {
      background-image: var(--hub-bg-image);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .hub-world-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: color-mix(in srgb, var(--bg-primary) 86%, var(--accent-light));
      pointer-events: none;
    }

    .game-hub-app.has-bg .hub-world-bg {
      background: color-mix(in srgb, var(--bg-primary) 62%, transparent);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .hub-ambient {
      position: absolute;
      z-index: 0;
      pointer-events: none;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent-light) 58%, transparent);
      filter: blur(34px);
      opacity: .56;
    }

    .hub-ambient-one {
      width: 190px;
      height: 190px;
      left: -54px;
      top: 70px;
    }

    .hub-ambient-two {
      width: 170px;
      height: 170px;
      right: -50px;
      top: 220px;
      background: color-mix(in srgb, var(--bg-card) 70%, transparent);
      opacity: .72;
    }

    .hub-shell {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .hub-nav {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 42px;
      align-items: center;
      gap: 12px;
      padding: 15px 20px 10px;
    }

    .hub-title-box {
      min-width: 0;
      text-align: center;
    }

    .hub-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hub-subtitle {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hub-icon-btn,
    .custom-game-btn {
      width: 42px;
      height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      color: var(--text-primary);
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .hub-icon-btn:active,
    .custom-game-btn:active,
    .hub-game-card:active,
    .hub-hero-art:active,
    .hub-small-pill:active,
    .hub-visual-row button:active,
    .hub-sheet-actions button:active,
    .custom-game-empty-card button:active {
      transform: scale(0.96);
    }

    .hub-content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 8px 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 22px;
      -webkit-overflow-scrolling: touch;
    }

    .hub-content::-webkit-scrollbar {
      display: none;
    }

    .hub-content {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .hub-hero {
      min-height: 230px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 118px;
      align-items: stretch;
      gap: 16px;
      padding: 22px;
      border-radius: 34px;
      background: color-mix(in srgb, var(--bg-card) 84%, transparent);
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
    }

    .hub-hero-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 10px;
    }

    .hub-kicker {
      color: var(--accent-dark);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .14em;
      line-height: 1.2;
    }

    .hub-hero-title {
      margin: 0;
      color: var(--text-primary);
      font-size: 30px;
      font-weight: 600;
      line-height: 1.08;
      letter-spacing: -0.04em;
    }

    .hub-hero-text {
      margin: 0;
      max-width: 32em;
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.65;
    }

    .hub-hero-art {
      min-width: 0;
      min-height: 164px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 30px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .hub-hero-art.has-image {
      background: var(--bg-card);
    }

    .hub-hero-art img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
    }

    .hub-grid-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .hub-section-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 14px;
      padding: 0 2px;
    }

    .hub-section-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .hub-section-note {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
    }

    .hub-small-pill {
      flex: 0 0 auto;
      min-height: 34px;
      padding: 0 12px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: 12px;
      transition: all 200ms ease;
    }

    .hub-game-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .hub-game-card {
      min-width: 0;
      min-height: 252px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      border-radius: 30px;
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: left;
      transition: all 200ms ease;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .hub-game-art {
      height: 106px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 25px;
      background: var(--surface-muted);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .hub-game-art.has-image {
      background: var(--bg-card);
    }

    .hub-game-art img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
    }

    .hub-game-meta {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .hub-game-name {
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hub-game-subtitle {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hub-game-desc {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .hub-game-bottom {
      margin-top: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--text-hint);
      font-size: 11px;
      line-height: 1.3;
    }

    .hub-game-tone {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hub-game-status {
      flex: 0 0 auto;
      padding: 5px 8px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-hint);
      box-shadow: var(--shadow-sm);
    }

    .hub-game-status.ready {
      color: var(--accent-dark);
      background: var(--accent-light);
    }

    .game-child-host {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
    }

    .custom-html-game {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      display: flex;
      flex-direction: column;
    }

    .custom-game-topbar {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 42px;
      align-items: center;
      gap: 12px;
      padding: 15px 20px 10px;
      background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      z-index: 2;
    }

    .custom-game-title-box {
      min-width: 0;
      text-align: center;
    }

    .custom-game-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .custom-game-subtitle {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .custom-game-body {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 0;
      position: relative;
    }

    .custom-game-frame {
      width: 100%;
      height: 100%;
      display: block;
      margin: 0;
      padding: 0;
      background: var(--bg-primary);
      outline-color: transparent;
      box-shadow: none;
      border-color: transparent;
    }

    .custom-game-empty {
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: color-mix(in srgb, var(--bg-primary) 88%, var(--accent-light));
    }

    .custom-game-empty-card {
      width: min(100%, 360px);
      min-height: 330px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 26px;
      border-radius: 34px;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      box-shadow: var(--shadow-md);
      text-align: center;
    }

    .custom-game-empty-art {
      width: 96px;
      height: 96px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 30px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .custom-game-empty-title {
      color: var(--text-primary);
      font-size: 18px;
      font-weight: 600;
      line-height: 1.4;
    }

    .custom-game-empty-text {
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
    }

    .hub-sheet {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .hub-sheet-actions,
    .hub-visual-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .hub-sheet-actions button,
    .hub-visual-actions button {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border-radius: 18px;
      transition: all 200ms ease;
    }

    .hub-sheet-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 4px 0;
    }

    .hub-visual-row {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 12px;
      padding: 12px;
      border-radius: 24px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .hub-visual-preview {
      width: 64px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 22px;
      background: var(--bg-card);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .hub-visual-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .hub-visual-fields {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .hub-visual-fields .input-card {
      min-height: 38px;
      border-radius: 16px;
    }

    .hidden {
      display: none !important;
    }

    @media (min-width: 720px) {
      .hub-game-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .hub-hero {
        grid-template-columns: minmax(0, 1fr) 180px;
      }

      .hub-hero-title {
        font-size: 36px;
      }
    }

    @media (max-width: 390px) {
      .hub-game-grid {
        grid-template-columns: 1fr;
      }

      .hub-hero {
        grid-template-columns: 1fr;
      }

      .hub-hero-art {
        min-height: 120px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../core/storage.js 的 getData/setData/getDB/setDB/deleteDB/compressImage/getNow；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon；动态依赖 ./games/*.js 的 mount(container,{onBack,game}) / unmount()
