/*
  imports:
  - ../../core/storage.js: getData, setData, getAllDB, getDB, setDB, deleteDB, generateId, getNow, compressImage
  - ../../core/ui.js: createIcon, showToast, showBottomSheet, hideBottomSheet, showConfirm
  - ../../core/api.js: silentRequest
  - ../../core/memory.js: recordExternalInteraction
*/

import {
  getData,
  setData,
  getAllDB,
  getDB,
  setDB,
  deleteDB,
  generateId,
  getNow,
  compressImage
} from '../../core/storage.js';

import {
  createIcon,
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm
} from '../../core/ui.js';

import { silentRequest } from '../../core/api.js';

import { recordExternalInteraction } from '../../core/app-bus.js';

// ═══════════════════════════════════════
// 【常量】配置项、随机AI池、本地题词库
// ═══════════════════════════════════════

const STYLE_ID = 'draw-guess-style';
const BG_KEY = 'app_bg_draw_guess';
const SETTINGS_KEY = 'app_draw_guess_settings';
const GAME_KEY = 'app_draw_guess_state';

const DEFAULT_SETTINGS = {
  bgOpacity: 0.22,
  allowRoast: true,
  autoAiGuess: true,
  maxHints: 5
};

const FALLBACK_WORDS = [
  { word: '电子榨菜', category: '网络梗' },
  { word: '班味', category: '抽象状态' },
  { word: '显眼包', category: '网络梗' },
  { word: '赛博上香', category: '抽象行为' },
  { word: '脆皮大学生', category: '网络梗' },
  { word: '互联网嘴替', category: '网络身份' },
  { word: '淡人', category: '抽象人格' },
  { word: '发疯文学', category: '网络梗' },
  { word: '窝囊废文学', category: '网络梗' },
  { word: '鼠鼠我呀', category: '网络梗' },
  { word: '退退退', category: '网络梗' },
  { word: '一键三连', category: '网络动作' },
  { word: '尊嘟假嘟', category: '网络梗' },
  { word: '精神状态良好', category: '反话文学' },
  { word: '偷感很重', category: '网络梗' },
  { word: '已读乱回', category: '网络行为' },
  { word: '人机感', category: '网络评价' },
  { word: '赛博乞丐', category: '抽象身份' },
  { word: '被窝封印术', category: '生活玄学' },
  { word: 'WiFi断了像失恋', category: '赛博生活' }
];

const RANDOM_POOL = [
  { name: '阿卷', avatarText: '卷', persona: '说话像熬夜赶稿的吐槽役，嘴快但不坏，看到怪东西会先笑出来。' },
  { name: '栗子', avatarText: '栗', persona: '反应很真诚，脑回路飘，喜欢把抽象画面往食物和小动物上猜。' },
  { name: '小莓', avatarText: '莓', persona: '甜妹外壳，吐槽很准，语气轻快，偶尔会小声阴阳怪气。' },
  { name: '灰桃', avatarText: '桃', persona: '冷静但很会补刀，猜题像破案，越离谱越认真分析。' },
  { name: '七七', avatarText: '七', persona: '5G冲浪选手，梗很多，猜错也能硬圆，喜欢说离谱但好笑的话。' },
  { name: '麦麦', avatarText: '麦', persona: '元气笨蛋型，第一眼直觉很强，猜东西经常歪到天边。' },
  { name: '岚岚', avatarText: '岚', persona: '文艺又毒舌，喜欢把涂鸦解读成大型行为艺术。' },
  { name: '绒绒', avatarText: '绒', persona: '温柔但有点天然黑，讲话软软的但杀伤力不低。' }
];

const WRONG_GUESSES = [
  '一只崩溃的猫', '电子榨菜', '加班人的灵魂', '赛博土豆',
  '显眼包开会', '精神状态良好', '被窝封印术', 'WiFi断了的悲伤'
];

const FAIL_ROASTS = [
  '这线条看起来像脑子断网了。',
  '我理解了，但我不完全理解。',
  '画手是不是把答案也画丢了。',
  '这很艺术，艺术到有点缺德。',
  '我先猜一个，错了就怪画。'
];

// ═══════════════════════════════════════
// 【状态】游戏内部状态机
// ═══════════════════════════════════════

let rootEl = null;
let onBackHandler = null;
let mounted = false;

const state = {
  characters: [],
  selectedIds: [],
  players: [],
  settings: { ...DEFAULT_SETTINGS },
  bgRecord: null,

  phase: 'lobby',
  round: 0,
  artist: null,
  secretWord: '',
  category: '',
  strokes: [],
  revealCount: 0,
  guesses: [],
  roasts: [],
  userGuess: '',
  score: {},
  busy: false,
  busyLock: false
};

// ═══════════════════════════════════════
// 【生命周期】mount / unmount，对齐 games.js 接口
// ═══════════════════════════════════════

export async function mount(container, options = {}) {
  rootEl = container;
  onBackHandler = options.onBack || null;
  mounted = true;

  injectStyles();
  await loadBaseData();
  render();

  window.addEventListener('resize', onResize);
}

export function unmount() {
  mounted = false;
  window.removeEventListener('resize', onResize);
  hideBottomSheet();

  if (rootEl) rootEl.innerHTML = '';
  rootEl = null;
  onBackHandler = null;
}

function onResize() {
  /* 保留，暂无特殊处理 */
}

// ───────────────────
// 数据加载与保存
// ───────────────────

async function loadBaseData() {
  try {
    const [characters, settingsRaw, bgRecord] = await Promise.all([
      getAllDB('characters').catch(() => []),
      Promise.resolve(getData(SETTINGS_KEY, DEFAULT_SETTINGS)),
      getDB('blobs', BG_KEY).catch(() => null)
    ]);

    state.characters = normalizeCharacters(Array.isArray(characters) ? characters : []);
    state.settings = { ...DEFAULT_SETTINGS, ...(settingsRaw || {}) };
    state.bgRecord = bgRecord || null;
  } catch (_) {
    state.characters = [];
  }
}

function normalizeCharacters(list) {
  return list.filter(Boolean).map((item) => ({
    id: item.id,
    name: item.name || item.nickname || '未命名',
    avatar: pickImage(item.avatar) || pickImage(item.iconImage) || '',
    avatarText: String(item.name || '?').slice(0, 1),
    persona: [
      item.persona,
      item.profile,
      item.description,
      item.systemPrompt,
      item.speakingStyle ? `说话习惯：${item.speakingStyle}` : ''
    ].filter(Boolean).join('\n'),
    raw: item
  }));
}

function saveSettings() {
  setData(SETTINGS_KEY, { ...state.settings });
}

function saveState() {
  setData(GAME_KEY, {
    selectedIds: state.selectedIds,
    players: state.players,
    phase: state.phase,
    round: state.round,
    artistId: state.artist?.id || '',
    artistName: state.artist?.name || '',
    secretWord: state.secretWord,
    category: state.category,
    strokes: state.strokes,
    revealCount: state.revealCount,
    guesses: state.guesses,
    roasts: state.roasts,
    score: state.score
  });
}

async function applyBackground() {
  if (!rootEl) return;
  try {
    const record = await getDB('blobs', BG_KEY).catch(() => null);
    const image = record?.value || record?.source || record?.data || '';
    state.bgRecord = record || null;

    if (image) {
      rootEl.style.setProperty('--dg-bg-url', `url('${escapeCssUrl(image)}')`);
      rootEl.style.setProperty('--dg-bg-opacity', String(record?.opacity ?? state.settings.bgOpacity ?? 0.22));
    } else {
      rootEl.style.setProperty('--dg-bg-url', 'none');
      rootEl.style.setProperty('--dg-bg-opacity', '0');
    }
  } catch (_) {
    /* silent */
  }
}

// ═══════════════════════════════════════
// 【渲染】主渲染入口
// ═══════════════════════════════════════

function render() {
  if (!rootEl || !mounted) return;

  const bgImage = pickImage(state.bgRecord) || '';

  rootEl.innerHTML = `
    <section class="dg-app${bgImage ? ' has-bg' : ''}">
      <div class="dg-bg"></div>
      <div class="dg-shell">
        <header class="dg-top">
          <button class="dg-btn-icon" data-action="back" aria-label="返回"></button>
          <div class="dg-top-title">
            <span class="dg-kicker">AI灵魂画手</span>
            <h2>你画我猜</h2>
          </div>
          <button class="dg-btn-icon" data-action="customize" aria-label="装扮"></button>
        </header>
        <main class="dg-main">${state.phase === 'lobby' ? renderLobby() : renderGame()}</main>
      </div>
    </section>
  `;

  rootEl.querySelector('[data-action="back"]').appendChild(createIcon('chevron-left', 22));
  rootEl.querySelector('[data-action="customize"]').appendChild(createIcon('sliders', 21));

  applyBackground();
  bindEvents();
}

// ───────────────────
// 大厅渲染
// ───────────────────

function renderLobby() {
  const selected = state.selectedIds.length;
  const canPick = selected < 4;

  return `
    <section class="dg-hero">
      <div class="dg-hero-art">
        <svg viewBox="0 0 220 130" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M28 83 C40 18, 95 35, 80 77 S142 115, 159 65 S194 34, 199 86"/>
          <circle cx="63" cy="54" r="9"/>
          <path d="M127 38 l18 18 l-16 16 l-18 -18 z"/>
          <path d="M39 104 C78 93, 118 100, 181 94"/>
        </svg>
      </div>
      <div class="dg-hero-copy">
        <p class="dg-pill">5人局 · SVG抽象作画 · 全员乱猜</p>
        <h3>来看看AI的灵魂画技到底长什么样</h3>
        <p class="dg-hero-desc">选几个熟人来组局，不够就随机匹配鲜活路人。TA们会按自己的性格猜、吐槽、嘴硬。</p>
      </div>
      <div class="dg-hero-actions">
        <button class="dg-btn-primary" data-action="start">开始组局</button>
        <button class="dg-btn-soft" data-action="random-fill">随机凑满</button>
      </div>
    </section>

    <section class="dg-section">
      <div class="dg-section-head">
        <div>
          <h3>选择上桌AI</h3>
          <p>已选 ${selected}/4，不够会自动补位</p>
        </div>
      </div>
      <div class="dg-char-grid">
        ${state.characters.length ? state.characters.map((item) => {
          const checked = state.selectedIds.includes(item.id);
          const disabled = !checked && !canPick;
          return `
            <button class="dg-char-card${checked ? ' is-on' : ''}" data-action="toggle" data-id="${esc(item.id)}" ${disabled ? 'data-disabled="true"' : ''}>
              <span class="dg-avatar">${avatarHtml(item)}</span>
              <span class="dg-char-name">${esc(item.name)}</span>
              <span class="dg-char-note">${checked ? '已上桌' : disabled ? '坐满啦' : '拉TA来猜'}</span>
            </button>
          `;
        }).join('') : `
          <div class="dg-empty-card">
            <p>还没有可选AI。没关系，这局会用临时AI补满，照样能玩。</p>
          </div>
        `}
      </div>
    </section>
  `;
}

// ───────────────────
// 游戏界面渲染
// ───────────────────

function renderGame() {
  const strokes = Array.isArray(state.strokes) ? state.strokes : [];
  const visibleCount = Math.min(state.revealCount, strokes.length);
  const visibleStrokes = strokes.slice(0, visibleCount);

  const guessesHtml = state.guesses.length
    ? state.guesses.slice(-8).map(guessItemHtml).join('')
    : '<div class="dg-empty-feed">大家正在盯着这坨线条沉思。</div>';

  const roastsHtml = state.roasts.length
    ? state.roasts.slice(-5).map((r) => `
      <div class="dg-note">
        <b>${esc(r.name)}</b>
        <span>${esc(r.text)}</span>
      </div>
    `).join('')
    : '<div class="dg-note dg-note-muted">吐槽纸条还空着，等一个灵魂暴击。</div>';

  return `
    <section class="dg-score-bar">
      ${state.players.map((p) => `
        <div class="dg-player-chip${state.artist?.id === p.id ? ' is-artist' : ''}">
          <span class="dg-mini-avatar">${avatarHtml(p)}</span>
          <span>${esc(p.name)}</span>
        </div>
      `).join('')}
    </section>

    <section class="dg-board-card">
      <div class="dg-board-meta">
        <div>
          <span class="dg-label">题目类别</span>
          <strong>${esc(state.category || '正在生成')}</strong>
        </div>
        <div>
          <span class="dg-label">线索</span>
          <strong>${visibleCount}/${strokes.length || '?'}</strong>
        </div>
        <div>
          <span class="dg-label">画手</span>
          <strong>${esc(state.artist?.name || '?')}</strong>
        </div>
      </div>

      <div class="dg-board">
        <svg viewBox="0 0 320 220" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="dg-svg">
          ${visibleStrokes.map((s) => sanitizeStroke(s)).join('')}
        </svg>
      </div>

      <div class="dg-board-actions">
        <button class="dg-btn-soft" data-action="ai-guess" ${state.busy ? 'disabled' : ''}>让AI猜一轮</button>
        <button class="dg-btn-soft" data-action="add-stroke" ${state.busy || visibleCount >= strokes.length ? 'disabled' : ''}>加一笔</button>
        <button class="dg-btn-soft" data-action="reveal" ${state.phase === 'revealed' ? 'disabled' : ''}>公布答案</button>
      </div>
    </section>

    <section class="dg-input-row">
      <input class="dg-input" data-role="guess-input" value="${escAttr(state.userGuess)}" placeholder="大胆猜，离谱也算参与" autocomplete="off">
      <button class="dg-btn-primary" data-action="submit-guess">猜！</button>
    </section>

    ${state.phase === 'revealed' ? `
      <div class="dg-answer-peek">
        <span>答案</span>
        <strong>${esc(state.secretWord)}</strong>
      </div>
    ` : ''}

    <section class="dg-roast-area">
      <h3>小纸条吐槽</h3>
      <div class="dg-note-list">${roastsHtml}</div>
    </section>

    <section class="dg-guesses-area">
      <div class="dg-section-head">
        <div>
          <h3>猜测现场</h3>
          <p>猜对会记分，猜错会变成节目效果</p>
        </div>
        <button class="dg-btn-soft" data-action="next-round" ${state.phase === 'revealed' ? '' : 'disabled'}>下一局</button>
      </div>
      <div class="dg-guess-list">${guessesHtml}</div>
    </section>
  `;
}

function guessItemHtml(item) {
  return `
    <div class="dg-guess-item${item.correct ? ' is-correct' : ''}">
      <div class="dg-mini-avatar">${avatarHtml(item.player)}</div>
      <div>
        <b>${esc(item.name)}</b>
        <p>${esc(item.guess)}</p>
        ${item.comment ? `<span>${esc(item.comment)}</span>` : ''}
      </div>
    </div>
  `;
}

function avatarHtml(player) {
  const img = pickImage(player?.avatar || player);
  if (img) return `<img src="${escAttr(img)}" alt="">`;
  return `<span>${esc(player?.avatarText || player?.name?.slice(0, 1) || 'AI')}</span>`;
}

// ═══════════════════════════════════════
// 【事件绑定】
// ═══════════════════════════════════════

function bindEvents() {
  if (!rootEl) return;

  rootEl.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', handleAction);
  });

  const input = rootEl.querySelector('[data-role="guess-input"]');
  if (input) {
    input.addEventListener('input', () => { state.userGuess = input.value; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitUserGuess(); }
    });
  }
}

async function handleAction(event) {
  const el = event.currentTarget;
  if (!el || el.dataset.disabled === 'true') return;

  const action = el.dataset.action;

  if (action === 'back') {
    if (state.phase !== 'lobby') {
      state.phase = 'lobby';
      render();
      return;
    }
    if (onBackHandler) onBackHandler();
    return;
  }

  if (action === 'customize') { openCustomSheet(); return; }
  if (action === 'toggle') { toggleCharacter(el.dataset.id); return; }
  if (action === 'random-fill') { randomFill(); return; }
  if (action === 'start') { await startGame(); return; }
  if (action === 'ai-guess') { await runAiGuessRound(); return; }
  if (action === 'add-stroke') { await addStroke(); return; }
  if (action === 'reveal') { await revealAnswer('manual'); return; }
  if (action === 'submit-guess') { submitUserGuess(); return; }
  if (action === 'next-round') { await startNewRound(); return; }
}

// ═══════════════════════════════════════
// 【大厅操作】选人、组局
// ═══════════════════════════════════════

function toggleCharacter(id) {
  if (!id) return;
  const idx = state.selectedIds.indexOf(id);
  if (idx >= 0) {
    state.selectedIds.splice(idx, 1);
  } else {
    if (state.selectedIds.length >= 4) {
      showToast('桌子坐满啦，先请下一位下桌。');
      return;
    }
    state.selectedIds.push(id);
  }
  render();
}

function randomFill() {
  const shuffled = shuffle(state.characters.map((c) => c.id));
  state.selectedIds = shuffled.slice(0, 4);
  showToast('座位已经随缘安排好啦。');
  render();
}

async function startGame() {
  if (state.busy) return;
  state.busy = true;
  state.players = buildPlayers();

  if (state.players.length < 5) {
    showToast('组局失败，座位没凑齐。');
    state.busy = false;
    return;
  }

  state.round = 0;
  state.score = Object.fromEntries(state.players.map((p) => [p.id, 0]));

  state.busy = false;
  await startNewRound();
}

function buildPlayers() {
  const user = getUserPlayer();
  const picked = state.selectedIds
    .map((id) => state.characters.find((c) => c.id === id))
    .filter(Boolean)
    .slice(0, 4);

  const needed = Math.max(0, 4 - picked.length);
  const randoms = shuffle(RANDOM_POOL)
    .slice(0, needed)
    .map((r, i) => ({
      id: `random_${generateId('dg')}_${i}`,
      name: r.name,
      avatar: '',
      avatarText: r.avatarText,
      persona: r.persona,
      raw: null,
      isRandom: true,
      type: 'ai'
    }));

  return [user, ...picked.map((c) => ({
    id: c.id,
    name: c.name,
    avatar: c.avatar,
    avatarText: c.avatarText,
    persona: c.persona,
    raw: c.raw,
    isRandom: false,
    type: 'ai'
  })), ...randoms].slice(0, 5);
}

function getUserPlayer() {
  const settings = getData('app_settings', {}) || {};
  const appUser = getData('app_user', {}) || {};
  const user = settings.user || appUser || {};
  const name = user.name || appUser.name || '我';
  return {
    id: 'user',
    name,
    avatar: pickImage(user.avatar) || pickImage(appUser.avatar),
    avatarText: String(name).slice(0, 1),
    persona: '玩家本人，直接参与猜题，喜欢看AI互相猜画。',
    raw: null,
    isRandom: false,
    type: 'user'
  };
}

// ═══════════════════════════════════════
// 【回合流程】开局、加笔、揭晓
// ═══════════════════════════════════════

async function startNewRound() {
  if (state.busy) return;
  if (!state.players.length) {
    state.players = buildPlayers();
  }

  state.busy = true;
  state.phase = 'playing';
  state.round += 1;
  state.guesses = [];
  state.roasts = [];
  state.userGuess = '';
  state.revealCount = 1;
  state.strokes = [];

  const aiPlayers = state.players.filter((p) => p.type === 'ai');
  state.artist = aiPlayers[Math.floor(Math.random() * aiPlayers.length)] || aiPlayers[0];

  renderLoading();

  try {
    const wordInfo = await generateSecretWord();
    state.secretWord = wordInfo.word;
    state.category = wordInfo.category;
    state.strokes = await generateSvgStrokes(state.secretWord, state.category, state.artist);

    if (!state.strokes.length) {
      state.strokes = buildFallbackStrokes(state.secretWord);
    }
  } catch (_) {
    const fallback = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
    state.secretWord = fallback.word;
    state.category = fallback.category;
    state.strokes = buildFallbackStrokes(fallback.word);
  }

  state.busy = false;
  saveState();
  render();

  if (state.settings.autoAiGuess) {
    setTimeout(() => { if (mounted && state.phase === 'playing') runAiGuessRound(); }, 600);
  }
}

function renderLoading() {
  if (!rootEl) return;
  rootEl.innerHTML = `
    <section class="dg-app">
      <div class="dg-shell">
        <header class="dg-top">
          <button class="dg-btn-icon" data-action="back" aria-label="返回"></button>
          <div class="dg-top-title">
            <span class="dg-kicker">正在开局</span>
            <h2>画手在憋一个怪东西</h2>
          </div>
          <div class="dg-btn-icon" style="visibility:hidden"></div>
        </header>
        <div class="dg-loading-card">
          <div class="dg-scribble"><span></span><span></span><span></span></div>
          <p>题词、线条、离谱程度正在揉成一团。</p>
        </div>
      </div>
    </section>
  `;
  rootEl.querySelector('[data-action="back"]').appendChild(createIcon('chevron-left', 22));
  bindEvents();
}

async function addStroke() {
  if (state.busy || state.revealCount >= state.strokes.length) {
    if (state.revealCount >= state.strokes.length) showToast('已经没有更多笔画啦。');
    return;
  }

  state.busy = true;
  state.revealCount += 1;

  state.roasts.push({
    id: generateId('roast'),
    name: '画板',
    text: '画手又补了一笔，事情好像更复杂了。',
    createdAt: getNow()
  });

  saveState();
  state.busy = false;
  render();

  if (state.settings.autoAiGuess) {
    setTimeout(() => { if (mounted && state.phase === 'playing') runAiGuessRound(); }, 400);
  }
}

async function revealAnswer(reason = 'manual') {
  if (state.phase === 'revealed') return;
  state.phase = 'revealed';
  state.revealCount = state.strokes.length;

  const winner = state.guesses.find((g) => g.correct);
  if (winner) {
    if (winner.playerId === 'user') state.score.user = (state.score.user || 0) + 1;
    else state.score[winner.playerId] = (state.score[winner.playerId] || 0) + 1;
  }

  state.roasts.push({
    id: generateId('roast'),
    name: '答案卡',
    text: winner
      ? `答案是「${state.secretWord}」，${winner.name}居然真给猜出来了。`
      : `答案是「${state.secretWord}」，这画确实有点为难人。`,
    createdAt: getNow()
  });

  await writeRoundMemories(winner);
  saveState();
  render();
}

// ═══════════════════════════════════════
// 【猜测逻辑】用户猜测、AI猜测
// ═══════════════════════════════════════

function submitUserGuess() {
  const input = rootEl?.querySelector('[data-role="guess-input"]');
  const text = String(input?.value || state.userGuess || '').trim();
  if (!text) { showToast('先写个猜测嘛。'); return; }

  const user = state.players.find((p) => p.id === 'user') || getUserPlayer();
  const correct = isCorrect(text, state.secretWord);

  addGuess({
    player: user,
    name: user.name,
    guess: text,
    comment: correct ? '我居然猜中了！' : '我先瞎猜一个，万一世界就是这么抽象。',
    correct
  });

  state.userGuess = '';
  if (input) input.value = '';

  if (correct) {
    revealAnswer('user-correct');
  } else {
    state.roasts.push({
      id: generateId('roast'),
      name: '纸条',
      text: '没中，但这个答案看起来也挺像，画手先背一半锅。',
      createdAt: getNow()
    });
    render();
  }
}

async function runAiGuessRound() {
  if (state.busy || state.phase !== 'playing') return;
  state.busy = true;
  render();

  const guessers = state.players.filter((p) => p.type === 'ai' && p.id !== state.artist?.id);

  try {
    const results = await Promise.all(guessers.map((p) => askAiGuess(p)));
    results.forEach((r) => addGuess(r));

    const hasCorrect = state.guesses.some((g) => g.correct);
    if (hasCorrect) await revealAnswer('ai-correct');
  } catch (_) {
    guessers.forEach((p) => {
      addGuess({
        player: p,
        name: p.name,
        guess: randomWrongGuess(),
        comment: randomFailRoast(),
        correct: false
      });
    });
  }

  state.busy = false;
  saveState();
  render();
}

async function askAiGuess(player) {
  const visibleSvg = getCurrentSvgString();
  const otherGuesses = state.guesses.map((g) => `${g.name}猜：${g.guess}`).join('\n') || '暂时没人猜出来。';

  const content = await askAI([
    {
      role: 'system',
      content: [
        '我正在玩你画我猜。',
        '我会根据自己的性格猜这幅抽象SVG画的答案。',
        '我可以轻微吐槽，但不会攻击现实群体。',
        '我不会知道真正答案，除非画里已经明显透露。',
        '我只输出JSON：{"guess":"我的猜测","comment":"我的吐槽"}。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `我叫${player.name}。`,
        `我的性格和说话方式：${player.persona || '自然、活泼、会吐槽。'}`,
        `当前题目类别：${state.category}`,
        `我看到的SVG画：${visibleSvg}`,
        `其他人的猜测：\n${otherGuesses}`,
        '我现在会猜什么？我会怎么吐槽这幅画？',
        '我的输出保持短一点，像真实聊天。'
      ].join('\n')
    }
  ], 0.9);

  const json = parseJson(content);
  return {
    player,
    name: player.name,
    guess: String(json?.guess || randomWrongGuess()).trim().slice(0, 24),
    comment: String(json?.comment || randomFailRoast()).trim().slice(0, 80),
    correct: false
  };
}

function addGuess(item) {
  const guess = String(item.guess || '').trim();
  if (!guess) return;

  const correct = item.correct || isCorrect(guess, state.secretWord);

  state.guesses.push({
    id: generateId('guess'),
    player: item.player,
    playerId: item.player?.id,
    name: item.name || item.player?.name || '某位选手',
    guess,
    comment: item.comment || '',
    correct,
    createdAt: getNow()
  });

  if (item.comment) {
    state.roasts.push({
      id: generateId('roast'),
      name: item.name || item.player?.name || '某位选手',
      text: item.comment,
      createdAt: getNow()
    });
  }
}

// ═══════════════════════════════════════
// 【AI交互】生成题词、生成笔画、通用请求
// ═══════════════════════════════════════

async function generateSecretWord() {
  const seed = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];

  const content = await askAI([
    {
      role: 'system',
      content: [
        '我会为一个轻松搞笑的你画我猜游戏生成题词。',
        '我的题词会偏5G冲浪、网络梗、抽象生活、离谱但能猜。',
        '我不会生成攻击现实群体、仇恨或血腥内容。',
        '我只输出JSON：{"word":"题词","category":"类别"}。'
      ].join('\n')
    },
    {
      role: 'user',
      content: `我现在想生成一个新题词。参考味道像"${seed.word}"，但换一个新词。我的输出必须是纯JSON。`
    }
  ], 0.95);

  const json = parseJson(content);
  const word = String(json?.word || '').trim().slice(0, 18);
  const category = String(json?.category || '').trim().slice(0, 12);

  if (!word) return seed;
  return { word, category: category || '抽象梗' };
}

async function generateSvgStrokes(word, category, artist) {
  const content = await askAI([
    {
      role: 'system',
      content: [
        '我会给一个你画我猜游戏画SVG线条画。',
        '我的画风是轻松、抽象、像随手涂鸦，不追求好看，重点是好猜又好笑。',
        '我只使用SVG基础标签：svg、g、path、line、circle、ellipse、rect、polyline。',
        '我会分成5步，每一步都是一个完整SVG字符串，从少量线条逐渐加笔画。',
        '我的SVG不写script、不写foreignObject、不写外链、不写答案文字。',
        '我只输出JSON：{"strokes":["<svg ...>...</svg>"]}。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `我是画手${artist?.name || ''}。`,
        `我的气质：${artist?.persona || '轻松自然，有一点吐槽感。'}`,
        `我要画的答案是：${word}`,
        `类别是：${category}`,
        '我会画得像人类在便签上乱画，线条简单，允许抽象。',
        '每一步SVG都能直接放进页面显示，viewBox="0 0 320 220"。'
      ].join('\n')
    }
  ], 0.85);

  const json = parseJson(content);
  const strokes = Array.isArray(json?.strokes) ? json.strokes : [];
  return strokes
    .map((svg) => sanitizeSvgFull(String(svg || '')))
    .filter(Boolean)
    .slice(0, 5);
}

async function askAI(messages, temperature = 0.8) {
  try {
    const result = await silentRequest({ messages, temperature, max_tokens: 1200 });
    if (typeof result === 'string') return result;
    return result?.content || result?.text || result?.message || '';
  } catch (_) {
    return '';
  }
}

// ═══════════════════════════════════════
// 【记忆写入】统一走 core/memory.js，去重并有AI总结
// ═══════════════════════════════════════

async function writeRoundMemories(winner) {
  const realPlayers = state.players.filter((p) => p.type === 'ai' && !p.isRandom && p.raw?.id);
  if (!realPlayers.length) return;

  const guessedText = state.guesses
    .slice(-6)
    .map((g) => `${g.name}猜"${g.guess}"${g.correct ? '，猜中了' : ''}`)
    .join('；');

  const content = [
    `我和大家玩了一局"AI灵魂画手"。`,
    `题目是"${state.secretWord}"，类别是"${state.category}"。`,
    `画手是${state.artist?.name || '某位AI'}。`,
    guessedText ? `这一局大家的反应：${guessedText}。` : '',
    winner ? `${winner.name}猜中了！` : '这轮没人猜中。'
  ].filter(Boolean).join('');

  await Promise.all(realPlayers.map((p) => {
    return recordExternalInteraction({
      characterId: p.raw.id,
      role: 'assistant',
      content,
      source: 'draw_guess_game'
    }).catch(() => null);
  }));
}

// ═══════════════════════════════════════
// 【装扮面板】背景上传、透明度
// ═══════════════════════════════════════

function openCustomSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'dg-sheet';
  sheet.innerHTML = `
    <div class="dg-sheet-head">
      <h3>给画室换个小背景</h3>
      <p>轻一点就好，别把抽象线条盖住啦。</p>
    </div>
    <div class="dg-sheet-actions">
      <label class="dg-upload-btn">
        <span>上传背景</span>
        <input type="file" accept="image/*" data-role="bg-file">
      </label>
      <button class="dg-btn-soft" data-action="clear-bg">清除背景</button>
    </div>
    <label class="dg-range-row">
      <span>背景透明度</span>
      <input type="range" min="0.05" max="0.55" step="0.02" value="${state.settings.bgOpacity ?? 0.22}" data-role="bg-opacity">
    </label>
    <label class="dg-toggle-row">
      <span>AI自动猜</span>
      <input type="checkbox" data-role="auto-ai" ${state.settings.autoAiGuess ? 'checked' : ''}>
    </label>
    <label class="dg-toggle-row">
      <span>允许轻微吐槽</span>
      <input type="checkbox" data-role="allow-roast" ${state.settings.allowRoast ? 'checked' : ''}>
    </label>
  `;

  showBottomSheet(sheet);

  sheet.querySelector('[data-role="bg-file"]')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const image = await compressImage(file, 1600, 0.86);
      await setDB('blobs', {
        key: BG_KEY,
        value: image,
        source: image,
        opacity: state.settings.bgOpacity,
        updatedAt: getNow()
      });
      state.bgRecord = { key: BG_KEY, value: image, source: image, opacity: state.settings.bgOpacity };
      showToast('画室背景换好啦。');
      hideBottomSheet();
      applyBackground();
    } catch (_) {
      showToast('背景上传失败了。');
    }
  });

  sheet.querySelector('[data-action="clear-bg"]')?.addEventListener('click', async () => {
    await deleteDB('blobs', BG_KEY).catch(() => {});
    state.bgRecord = null;
    showToast('背景清掉啦。');
    hideBottomSheet();
    applyBackground();
  });

  sheet.querySelector('[data-role="bg-opacity"]')?.addEventListener('input', async (e) => {
    state.settings.bgOpacity = Number(e.target.value);
    saveSettings();
    if (state.bgRecord) {
      state.bgRecord.opacity = state.settings.bgOpacity;
      await setDB('blobs', { ...state.bgRecord, key: BG_KEY, updatedAt: getNow() }).catch(() => {});
    }
    applyBackground();
  });

  sheet.querySelector('[data-role="auto-ai"]')?.addEventListener('change', (e) => {
    state.settings.autoAiGuess = e.target.checked;
    saveSettings();
  });

  sheet.querySelector('[data-role="allow-roast"]')?.addEventListener('change', (e) => {
    state.settings.allowRoast = e.target.checked;
    saveSettings();
  });
}

// ═══════════════════════════════════════
// 【工具函数】SVG处理、JSON解析、判断对错等
// ═══════════════════════════════════════

function getCurrentSvgString() {
  const strokes = Array.isArray(state.strokes) ? state.strokes : [];
  const count = Math.min(state.revealCount, strokes.length);
  if (!count) return '<svg viewBox="0 0 320 220"></svg>';
  return strokes[count - 1] || '<svg viewBox="0 0 320 220"></svg>';
}

function sanitizeStroke(svg) {
  if (typeof svg !== 'string') return '';
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/href\s*=\s*["'][^"']*["']/gi, '')
    .replace(/stroke="[^"]*"/gi, 'stroke="currentColor"')
    .replace(/fill="(?!none)[^"]*"/gi, 'fill="none"');
}

function sanitizeSvgFull(svg) {
  let clean = String(svg || '').trim();
  if (!clean.includes('<svg')) return '';

  clean = clean
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/href\s*=\s*["'][^"']*["']/gi, '');

  const match = clean.match(/<svg[\s\S]*<\/svg>/i);
  clean = match ? match[0] : '';
  if (!clean) return '';

  if (!/viewBox=/i.test(clean)) {
    clean = clean.replace('<svg', '<svg viewBox="0 0 320 220"');
  }

  clean = clean
    .replace(/stroke="[^"]*"/gi, 'stroke="currentColor"')
    .replace(/fill="(?!none)[^"]*"/gi, 'fill="none"');

  return clean;
}

function buildFallbackStrokes(word) {
  const seed = [...String(word || '抽象')].reduce((s, c) => s + c.charCodeAt(0), 0);
  const strokes = [];

  for (let i = 0; i < 5; i++) {
    const x1 = 40 + ((seed + i * 37) % 240);
    const y1 = 40 + ((seed + i * 53) % 140);
    const x2 = 60 + ((seed + i * 71) % 220);
    const y2 = 60 + ((seed + i * 29) % 140);
    const cx = 80 + ((seed + i * 43) % 200);
    const cy = 50 + ((seed + i * 61) % 130);
    const r = 14 + ((seed + i * 17) % 20);

    const svg = `<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M${x1} ${y1} C${cx} ${cy}, ${x2 - 30} ${y2 + 25}, ${x2} ${y2}"/><circle cx="${cx}" cy="${cy}" r="${r}"/>${i > 1 ? `<path d="M${x2} ${y2} Q${cx + 20} ${cy - 15}, ${x1 + 40} ${y1 + 30}"/>` : ''}${i > 2 ? `<line x1="${x1 + 20}" y1="${y1}" x2="${x2}" y2="${y2 - 20}"/>` : ''}</g></svg>`;

    strokes.push(sanitizeSvgFull(svg));
  }

  return strokes;
}

function isCorrect(guess, answer) {
  const a = normalizeText(guess);
  const b = normalizeText(answer);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s，。！？、,.!?~·\-—_「」『』【】（）()《》<>""''：:；;\\\/\n\r]/g, '');
}

function randomWrongGuess() {
  return WRONG_GUESSES[Math.floor(Math.random() * WRONG_GUESSES.length)];
}

function randomFailRoast() {
  return FAIL_ROASTS[Math.floor(Math.random() * FAIL_ROASTS.length)];
}

function parseJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { /* continue */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

function pickImage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.value || value.source || value.image || value.imageBase64 || value.avatar || value.iconImage || value.url || value.src || value.data || '';
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return esc(str).replace(/'/g, '&#039;').replace(/`/g, '&#096;');
}

function escapeCssUrl(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '');
}

// ═══════════════════════════════════════
// 【样式注入】所有样式读取CSS变量
// ═══════════════════════════════════════

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .dg-app {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: 1.6;
      touch-action: manipulation;
    }
    .dg-app * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    .dg-bg {
      position: absolute;
      inset: 0;
      background-image: var(--dg-bg-url, none);
      background-size: cover;
      background-position: center;
      opacity: var(--dg-bg-opacity, 0);
      pointer-events: none;
    }

    .dg-shell {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .dg-top {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 44px 1fr 44px;
      align-items: center;
      gap: 12px;
      padding: 14px 20px 10px;
    }

    .dg-btn-icon {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }
    .dg-btn-icon:active { transform: scale(0.96); }

    .dg-top-title { min-width: 0; text-align: center; }
    .dg-kicker { color: var(--text-secondary); font-size: 12px; line-height: 1.2; display: block; }
    .dg-top-title h2 { margin: 2px 0 0; font-size: var(--font-size-title); font-weight: 600; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .dg-main {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 8px 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      -webkit-overflow-scrolling: touch;
    }
    .dg-main::-webkit-scrollbar { display: none; }
    .dg-main { scrollbar-width: none; -ms-overflow-style: none; }

    /* hero */
    .dg-hero {
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      border-radius: 28px;
      padding: 22px;
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .dg-hero-art {
      height: 130px;
      border-radius: 24px;
      background: color-mix(in srgb, var(--accent-light) 18%, var(--bg-secondary, var(--bg-card)));
      display: grid;
      place-items: center;
      overflow: hidden;
    }
    .dg-hero-art svg { width: 88%; height: 88%; color: var(--accent-dark); }
    .dg-pill {
      display: inline-flex;
      padding: 7px 12px;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: 12px;
      line-height: 1;
      margin-bottom: 8px;
    }
    .dg-hero-copy h3 { margin: 0; font-size: 22px; font-weight: 650; line-height: 1.25; letter-spacing: -0.02em; }
    .dg-hero-desc { margin: 6px 0 0; color: var(--text-secondary); font-size: var(--font-size-base); line-height: 1.65; }
    .dg-hero-actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }

    /* section */
    .dg-section {
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      border-radius: 28px;
      padding: 18px;
      box-shadow: var(--shadow-sm);
    }
    .dg-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .dg-section-head h3 { margin: 0 0 2px; font-size: 17px; font-weight: 600; }
    .dg-section-head p { margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.35; }

    /* buttons */
    .dg-btn-primary, .dg-btn-soft, .dg-upload-btn {
      appearance: none; outline: none; border-color: transparent;
      color: var(--text-primary); font-family: inherit;
      transition: all 200ms ease; cursor: pointer;
    }
    .dg-btn-primary:active, .dg-btn-soft:active, .dg-upload-btn:active { transform: scale(0.96); }
    .dg-btn-primary { min-height: 44px; padding: 0 18px; border-radius: 18px; background: var(--accent); color: var(--bubble-user-text, #fff); font-weight: 600; box-shadow: var(--shadow-sm); }
    .dg-btn-soft { min-height: 42px; padding: 0 14px; border-radius: 18px; background: color-mix(in srgb, var(--bg-card) 86%, transparent); box-shadow: var(--shadow-sm); font-size: 13px; font-weight: 500; }
    .dg-btn-soft:disabled, .dg-btn-primary:disabled { opacity: 0.45; transform: none; }

    /* char grid */
    .dg-char-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
    .dg-char-card {
      min-height: 120px; padding: 14px; border-radius: 22px;
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      box-shadow: var(--shadow-sm);
      display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 8px;
      transition: all 200ms ease; cursor: pointer;
    }
    .dg-char-card:active { transform: scale(0.96); }
    .dg-char-card.is-on { background: var(--accent-light); }
    .dg-char-card[data-disabled="true"] { opacity: 0.45; pointer-events: none; }

    /* avatar */
    .dg-avatar, .dg-mini-avatar {
      flex: 0 0 auto; display: grid; place-items: center; overflow: hidden;
      background: var(--accent-light); color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }
    .dg-avatar { width: 48px; height: 48px; border-radius: 18px; font-weight: 700; }
    .dg-mini-avatar { width: 30px; height: 30px; border-radius: 13px; font-size: 12px; font-weight: 700; }
    .dg-avatar img, .dg-mini-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .dg-char-name { font-weight: 600; line-height: 1.25; font-size: 15px; }
    .dg-char-note { color: var(--text-secondary); font-size: 12px; }

    .dg-empty-card { grid-column: 1 / -1; padding: 18px; border-radius: 22px; background: color-mix(in srgb, var(--bg-card) 86%, transparent); }
    .dg-empty-card p { margin: 0; color: var(--text-secondary); font-size: var(--font-size-base); }

    /* score bar */
    .dg-score-bar { display: flex; gap: 8px; overflow-x: auto; overscroll-behavior-x: contain; padding: 2px 0; }
    .dg-score-bar::-webkit-scrollbar { display: none; }
    .dg-player-chip {
      flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px;
      min-height: 36px; padding: 4px 12px 4px 5px; border-radius: 18px;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      box-shadow: var(--shadow-sm); color: var(--text-secondary); font-size: 13px;
    }
    .dg-player-chip.is-artist { background: var(--accent-light); color: var(--text-primary); font-weight: 600; }

    /* board */
    .dg-board-card {
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      border-radius: 28px; padding: 16px; box-shadow: var(--shadow-sm);
    }
    .dg-board-meta { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .dg-label { display: block; color: var(--text-secondary); font-size: 12px; line-height: 1.2; }
    .dg-board-meta strong { font-size: 17px; font-weight: 600; }

    .dg-board {
      position: relative; height: min(46vh, 340px); min-height: 240px;
      border-radius: 26px;
      background: var(--bg-primary);
      background-image: radial-gradient(circle at 18% 22%, color-mix(in srgb, var(--accent-light) 28%, transparent) 0 1px, transparent 2px);
      background-size: 22px 22px;
      box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--bg-card) 8%, transparent);
      overflow: hidden; display: grid; place-items: center;
    }

    .dg-svg {
      width: calc(100% - 32px); height: calc(100% - 32px);
      color: var(--text-primary);
      animation: dg-pop 280ms ease both;
    }
    .dg-svg path, .dg-svg line, .dg-svg circle, .dg-svg ellipse, .dg-svg rect, .dg-svg polyline {
      vector-effect: non-scaling-stroke;
    }

    @keyframes dg-pop {
      from { opacity: 0; transform: scale(0.96) rotate(-1deg); }
      to { opacity: 1; transform: scale(1) rotate(0); }
    }

    .dg-board-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }

    /* input */
    .dg-input-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }
    .dg-input {
      width: 100%; min-height: 46px; padding: 0 14px; border-radius: 18px;
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      color: var(--text-primary); outline: none; border-color: transparent;
      font: inherit; font-size: 16px; box-shadow: var(--shadow-sm);
    }

    .dg-answer-peek {
      padding: 12px 14px; border-radius: 18px;
      background: var(--accent-light);
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .dg-answer-peek span { color: var(--accent-dark); font-size: 13px; }
    .dg-answer-peek strong { font-size: 17px; font-weight: 600; }

    /* roasts */
    .dg-roast-area {
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      border-radius: 28px; padding: 16px; box-shadow: var(--shadow-sm);
    }
    .dg-roast-area h3 { margin: 0 0 10px; font-size: 17px; font-weight: 600; }
    .dg-note-list { display: grid; gap: 8px; }
    .dg-note {
      padding: 11px 13px; border-radius: 18px 18px 18px 8px;
      background: var(--accent-light); box-shadow: var(--shadow-sm);
      transform: rotate(-0.8deg);
    }
    .dg-note:nth-child(2n) { transform: rotate(0.8deg); background: color-mix(in srgb, var(--bg-card) 86%, transparent); }
    .dg-note b { display: block; font-size: 12px; margin-bottom: 2px; color: var(--accent-dark); }
    .dg-note span { color: var(--text-secondary); font-size: 13px; }
    .dg-note-muted span { color: var(--text-hint); }

    /* guesses */
    .dg-guesses-area {
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      border-radius: 28px; padding: 16px; box-shadow: var(--shadow-sm);
    }
    .dg-guess-list { display: grid; gap: 10px; }
    .dg-guess-item {
      display: grid; grid-template-columns: 34px 1fr; gap: 10px;
      padding: 12px; border-radius: 20px;
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      box-shadow: var(--shadow-sm);
    }
    .dg-guess-item.is-correct { background: var(--accent-light); }
    .dg-guess-item b { display: block; font-weight: 600; font-size: 14px; line-height: 1.25; }
    .dg-guess-item p { margin: 3px 0 0; font-size: 15px; }
    .dg-guess-item span { display: block; margin-top: 3px; color: var(--text-secondary); font-size: 12px; }
    .dg-empty-feed { padding: 18px; border-radius: 20px; background: color-mix(in srgb, var(--bg-card) 86%, transparent); color: var(--text-secondary); text-align: center; font-size: 14px; }

    /* loading */
    .dg-loading-card {
      margin-top: 20px; padding: 28px 22px; text-align: center;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      border-radius: 28px; box-shadow: var(--shadow-md);
    }
    .dg-scribble { height: 80px; display: flex; justify-content: center; align-items: center; gap: 8px; }
    .dg-scribble span {
      width: 52px; height: 8px; border-radius: 999px;
      background: var(--accent); opacity: 0.7;
      animation: dg-wiggle 700ms ease-in-out infinite alternate;
    }
    .dg-scribble span:nth-child(2) { width: 38px; animation-delay: 120ms; transform: rotate(-8deg); }
    .dg-scribble span:nth-child(3) { width: 64px; animation-delay: 240ms; transform: rotate(7deg); }
    .dg-loading-card p { color: var(--text-secondary); margin: 0; }

    @keyframes dg-wiggle {
      from { transform: translateY(-4px) rotate(-5deg); }
      to { transform: translateY(5px) rotate(6deg); }
    }

    /* sheet */
    .dg-sheet { padding: 4px 2px 18px; color: var(--text-primary); }
    .dg-sheet-head h3 { margin: 0; font-size: 18px; font-weight: 650; }
    .dg-sheet-head p { margin: 4px 0 0; color: var(--text-secondary); font-size: 13px; }
    .dg-sheet-actions { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-top: 14px; }

    .dg-upload-btn {
      min-height: 46px; padding: 0 14px; border-radius: 18px;
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      box-shadow: var(--shadow-sm); display: flex; align-items: center;
      justify-content: center; gap: 8px; font-weight: 500; position: relative; overflow: hidden;
    }
    .dg-upload-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

    .dg-range-row, .dg-toggle-row {
      margin-top: 12px; min-height: 46px; padding: 0 14px; border-radius: 18px;
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .dg-range-row input { width: 48%; accent-color: var(--accent); }
    .dg-toggle-row input { width: 20px; height: 20px; accent-color: var(--accent); }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,getDB,setDB,deleteDB,generateId,getNow,compressImage)；../../core/ui.js(createIcon,showToast,showBottomSheet,hideBottomSheet,showConfirm)；../../core/api.js(silentRequest)；../../core/memory.js(recordExternalInteraction)
