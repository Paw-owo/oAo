// apps/games/tarot.js
// imports:
// from ../../core/storage.js import getData, setData, getAllDB, getDB, setDB, deleteDB, generateId, getNow, compressImage
// from ../../core/ui.js import createIcon, showToast, showBottomSheet, hideBottomSheet, showConfirm
// from ../../core/api.js import silentRequest
// from ../../core/memory.js import recordExternalInteraction

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

import {
  silentRequest
} from '../../core/api.js';

import { recordExternalInteraction } from '../../core/app-bus.js';
import { loadWorldbookPromptForCharacter } from '../../core/worldbook-prompt.js';

const STYLE_ID = 'tarot-game-style';
const STATE_KEY = 'tarot_game_state';
const BG_KEY = 'app_bg_tarot_game';

const TAROT_CARDS = [
  { id: 'fool', name: '愚者', meaning: '新的开始、冲动、自由、尚未成形的路' },
  { id: 'magician', name: '魔术师', meaning: '主动、表达、资源被握在手里' },
  { id: 'priestess', name: '女祭司', meaning: '直觉、沉默、没有说出口的答案' },
  { id: 'empress', name: '皇后', meaning: '滋养、靠近、关系里的柔软生长' },
  { id: 'emperor', name: '皇帝', meaning: '秩序、控制、边界和承诺' },
  { id: 'lovers', name: '恋人', meaning: '选择、吸引、关系里的诚实' },
  { id: 'chariot', name: '战车', meaning: '推进、胜负心、把局面拉回自己手里' },
  { id: 'strength', name: '力量', meaning: '温柔的压制、忍耐、被驯服的心' },
  { id: 'hermit', name: '隐士', meaning: '独处、观察、暂时不靠近' },
  { id: 'wheel', name: '命运之轮', meaning: '变化、偶然、局势正在转向' },
  { id: 'justice', name: '正义', meaning: '因果、衡量、该说清楚的话' },
  { id: 'hanged', name: '倒吊人', meaning: '等待、换角度、暂时的停滞' },
  { id: 'death', name: '死神', meaning: '结束、转变、必须放下旧状态' },
  { id: 'temperance', name: '节制', meaning: '调和、慢慢来、关系需要重新配比' },
  { id: 'devil', name: '恶魔', meaning: '执念、诱惑、明知不该却放不开' },
  { id: 'tower', name: '高塔', meaning: '突变、破裂、真相突然露出来' },
  { id: 'star', name: '星星', meaning: '希望、修复、很轻但真实的期待' },
  { id: 'moon', name: '月亮', meaning: '暧昧、不安、看不清的情绪' },
  { id: 'sun', name: '太阳', meaning: '坦白、明亮、被看见的快乐' },
  { id: 'judgement', name: '审判', meaning: '回应、复盘、某件事到了该承认的时候' },
  { id: 'world', name: '世界', meaning: '完成、圆满、关系进入新阶段' }
];

let hostEl = null;
let onBack = null;
let characters = [];
let readerId = '';
let spread = 'three';
let currentReading = null;
let history = [];
let mounted = false;
let unsubscribeCharsUpdated = null;

export async function mount(container, options = {}) {
  hostEl = container;
  onBack = typeof options.onBack === 'function' ? options.onBack : null;
  mounted = true;

  injectStyles();

  await loadData();
  render();

  unsubscribeCharsUpdated = window.AppBus?.on('characters:updated', async () => {
    if (!mounted) return;
    await loadData();
    render();
  });
}

export function unmount() {
  mounted = false;
  hideBottomSheet();

  if (unsubscribeCharsUpdated) {
    try { unsubscribeCharsUpdated(); } catch (_) {}
    unsubscribeCharsUpdated = null;
  }

  if (hostEl) {
    hostEl.innerHTML = '';
  }

  hostEl = null;
  onBack = null;
  characters = [];
  currentReading = null;
}

async function loadData() {
  try {
    characters = (await getAllDB('characters') || [])
      .filter((item) => item && item.id)
      .map(normalizeCharacter);
  } catch (_) {
    characters = [];
  }

  const saved = getData(STATE_KEY) || {};
  readerId = typeof saved.readerId === 'string' ? saved.readerId : '';
  if (readerId && !characters.some((item) => item.id === readerId)) readerId = '';

  spread = ['one', 'three'].includes(saved.spread) ? saved.spread : 'three';
  history = Array.isArray(saved.history) ? saved.history.slice(0, 20) : [];
}

function saveState() {
  setData(STATE_KEY, {
    readerId,
    spread,
    history: history.slice(0, 20),
    updatedAt: getNow()
  });
}

async function render() {
  if (!hostEl) return;

  hostEl.className = 'tarot-game';
  hostEl.innerHTML = `
    <div class="tarot-bg"></div>
    <div class="tarot-soft tarot-soft-one"></div>
    <div class="tarot-soft tarot-soft-two"></div>

    <div class="tarot-shell">
      <header class="tarot-topbar">
        <button class="tarot-icon-btn" data-action="back" aria-label="返回"></button>
        <div class="tarot-title-box">
          <div class="tarot-title">塔罗小室</div>
          <div class="tarot-subtitle">牌面随机，解读只负责靠近一点点</div>
        </div>
        <button class="tarot-icon-btn" data-action="settings" aria-label="设置"></button>
      </header>

      <main class="tarot-main">
        <section class="tarot-stage">
          <div class="tarot-stage-head">
            <div>
              <div class="tarot-kicker">READING</div>
              <h1 class="tarot-stage-title"></h1>
            </div>
            <div class="tarot-mode-chip"></div>
          </div>

          <div class="tarot-card-table"></div>

          <div class="tarot-actions"></div>
        </section>

        <section class="tarot-panel">
          <div class="tarot-panel-head">
            <div>
              <div class="tarot-panel-title">读牌人</div>
              <div class="tarot-panel-note"></div>
            </div>
            <button class="tarot-pill" data-action="reader">更换</button>
          </div>
          <div class="tarot-reader-card"></div>
        </section>

        <section class="tarot-panel">
          <div class="tarot-panel-head">
            <div>
              <div class="tarot-panel-title">占卜记录</div>
              <div class="tarot-panel-note">选择AI读牌时，会自动写进TA的记忆</div>
            </div>
            <button class="tarot-pill" data-action="clear-history">清空</button>
          </div>
          <div class="tarot-history-list"></div>
        </section>
      </main>
    </div>
  `;

  hostEl.querySelector('[data-action="back"]').appendChild(createIcon('back', 19));
  hostEl.querySelector('[data-action="settings"]').appendChild(createIcon('settings', 19));

  await applyBackground();
  renderStage();
  renderReader();
  renderHistory();
  bindEvents();
}

async function applyBackground() {
  if (!hostEl) return;

  try {
    const record = await getDB('blobs', BG_KEY);
    const image = record?.source || record?.value || record?.data || '';

    if (image) {
      hostEl.classList.add('has-bg');
      hostEl.style.setProperty('--tarot-bg-image', `url("${escapeCssUrl(image)}")`);
      return;
    }
  } catch (_) {
    /* silent */
  }

  hostEl.classList.remove('has-bg');
  hostEl.style.removeProperty('--tarot-bg-image');
}

function renderStage() {
  if (!hostEl) return;

  const title = hostEl.querySelector('.tarot-stage-title');
  const chip = hostEl.querySelector('.tarot-mode-chip');
  const table = hostEl.querySelector('.tarot-card-table');
  const actions = hostEl.querySelector('.tarot-actions');

  chip.textContent = spread === 'one' ? '单张牌' : '三张牌';

  if (!currentReading) {
    title.textContent = '把问题放在这里';
    table.innerHTML = createEmptyCardsHtml(spread);

    actions.innerHTML = `
      <textarea class="tarot-input" data-field="question" placeholder="写下你想问的问题。比如：这段关系现在卡在哪里？"></textarea>
      <button class="tarot-primary" data-action="draw">抽牌</button>
    `;
    return;
  }

  title.textContent = '牌已经翻开了';
  table.innerHTML = '';

  currentReading.cards.forEach((card) => {
    table.appendChild(createTarotCard(card, true));
  });

  actions.innerHTML = `
    <div class="tarot-reading-card">
      <div class="tarot-reading-label"></div>
      <div class="tarot-reading-question"></div>
      <div class="tarot-reading-text"></div>
    </div>
    <button class="tarot-primary" data-action="save-reading">收进记录</button>
    <button class="tarot-secondary" data-action="new-reading">重新问一次</button>
  `;

  actions.querySelector('.tarot-reading-label').textContent = `${currentReading.readerName} 的解读`;
  actions.querySelector('.tarot-reading-question').textContent = currentReading.question;
  actions.querySelector('.tarot-reading-text').textContent = currentReading.interpretation || '正在听牌面说话。';
}

function createEmptyCardsHtml(type) {
  const count = type === 'one' ? 1 : 3;
  return Array.from({ length: count }).map((_, index) => `
    <div class="tarot-card tarot-card-back">
      <div class="tarot-card-inner">
        <span>${type === 'one' ? '答案' : ['过去', '现在', '靠近'][index]}</span>
      </div>
    </div>
  `).join('');
}

function createTarotCard(card, flipped) {
  const el = document.createElement('div');
  el.className = `tarot-card ${flipped ? 'is-flipped' : 'tarot-card-back'}`;

  el.innerHTML = `
    <div class="tarot-card-inner">
      <div class="tarot-card-position"></div>
      <div class="tarot-card-name"></div>
      <div class="tarot-card-mark"></div>
      <div class="tarot-card-meaning"></div>
    </div>
  `;

  el.querySelector('.tarot-card-position').textContent = card.position;
  el.querySelector('.tarot-card-name').textContent = card.name;
  el.querySelector('.tarot-card-meaning').textContent = card.meaning;
  el.querySelector('.tarot-card-mark').appendChild(createStarGlyph());

  return el;
}

function renderReader() {
  if (!hostEl) return;

  const note = hostEl.querySelector('.tarot-panel-note');
  const card = hostEl.querySelector('.tarot-reader-card');
  const reader = getReader();

  note.textContent = reader ? 'TA会用第一人称读牌' : '不选择AI时，只做本地解读';

  card.innerHTML = `
    <div class="tarot-reader-avatar"></div>
    <div class="tarot-reader-meta">
      <strong></strong>
      <span></span>
    </div>
  `;

  if (reader) {
    fillAvatar(card.querySelector('.tarot-reader-avatar'), reader);
    card.querySelector('strong').textContent = reader.name;
    card.querySelector('span').textContent = '本次占卜会写入TA的记忆';
  } else {
    card.querySelector('.tarot-reader-avatar').appendChild(createStarGlyph(20));
    card.querySelector('strong').textContent = '无人读牌';
    card.querySelector('span').textContent = '只保留在本地记录';
  }
}

function renderHistory() {
  if (!hostEl) return;

  const list = hostEl.querySelector('.tarot-history-list');
  list.innerHTML = '';

  if (!history.length) {
    list.innerHTML = `<div class="tarot-empty-history">还没有占卜记录，先抽一次牌。</div>`;
    return;
  }

  history.slice(0, 8).forEach((item) => {
    const cardNames = Array.isArray(item.cards) ? item.cards.map((card) => card.name).join(' / ') : '';

    const card = document.createElement('div');
    card.className = 'tarot-history-card';
    card.innerHTML = `
      <div class="tarot-history-top">
        <span></span>
        <small></small>
      </div>
      <div class="tarot-history-question"></div>
      <div class="tarot-history-cards"></div>
    `;

    card.querySelector('span').textContent = item.readerName || '塔罗小室';
    card.querySelector('small').textContent = formatShortTime(item.createdAt);
    card.querySelector('.tarot-history-question').textContent = item.question || '';
    card.querySelector('.tarot-history-cards').textContent = cardNames;

    list.appendChild(card);
  });
}

function bindEvents() {
  if (!hostEl) return;

  hostEl.querySelector('[data-action="back"]')?.addEventListener('click', () => {
    onBack?.();
  });

  hostEl.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
    openSettingsSheet();
  });

  hostEl.querySelector('[data-action="reader"]')?.addEventListener('click', () => {
    openReaderSheet();
  });

  hostEl.querySelector('[data-action="draw"]')?.addEventListener('click', () => {
    drawReading();
  });

  hostEl.querySelector('[data-action="save-reading"]')?.addEventListener('click', () => {
    saveReading();
  });

  hostEl.querySelector('[data-action="new-reading"]')?.addEventListener('click', () => {
    currentReading = null;
    renderStage();
    bindEvents();
  });

  hostEl.querySelector('[data-action="clear-history"]')?.addEventListener('click', async () => {
    const ok = await showConfirm('要清空占卜记录吗？已写入的记忆不会删除。');
    if (!ok) return;

    history = [];
    saveState();
    renderHistory();
    showToast('记录清空啦');
  });
}

async function drawReading() {
  const input = hostEl.querySelector('[data-field="question"]');
  const question = input?.value?.trim() || '';

  if (!question) {
    showToast('先写一个问题');
    return;
  }

  const reader = getReader();
  const cards = drawCards(spread);

  currentReading = {
    id: generateId('tarot_reading'),
    readerId: reader?.id || '',
    readerName: reader?.name || '塔罗小室',
    question,
    spread,
    cards,
    interpretation: '正在读牌。',
    memoryWritten: false,
    createdAt: getNow()
  };

  renderStage();

  try {
    const text = reader
      ? await requestAiInterpretation(reader, currentReading)
      : buildLocalInterpretation(currentReading);

    currentReading.interpretation = text || buildLocalInterpretation(currentReading);
  } catch (_) {
    currentReading.interpretation = buildLocalInterpretation(currentReading);
  }

  await writeReadingMemory(currentReading);
  renderStage();
  bindEvents();
}

function drawCards(type) {
  const positions = type === 'one' ? ['答案'] : ['过去', '现在', '靠近'];
  const deck = shuffle(TAROT_CARDS);

  return positions.map((position, index) => ({
    ...deck[index],
    position
  }));
}

async function saveReading() {
  if (!currentReading) return;

  await writeReadingMemory(currentReading);

  history.unshift({ ...currentReading });
  history = history.slice(0, 20);
  saveState();

  showToast('占卜收好啦');
  currentReading = null;

  renderStage();
  renderHistory();
  bindEvents();
}

async function requestAiInterpretation(reader, reading) {
  const persona = [
    reader?.persona,
    reader?.description,
    reader?.systemPrompt,
    reader?.speakingStyle
  ].filter(Boolean).join('\n');

  const worldbookPrompt = await loadWorldbookPromptForCharacter(reader).catch(() => '');

  const cardsText = reading.cards
    .map((card) => `${card.position}：${card.name}（${card.meaning}）`)
    .join('\n');

  const messages = [
    {
      role: 'system',
      content: [
        `我现在就是${reader.name}本人。`,
        persona ? `我的人设：\n${persona}` : '',
        worldbookPrompt,
        '我正在给用户读塔罗牌。',
        '牌面由前端随机抽取，我不能改变牌面，也不能说自己重新抽了牌。',
        '我必须使用第一人称"我"说话，像 ChatAI 私聊里的自然语气。',
        '我不写旁白，不写动作解说，不提系统规则。',
        '我的解读要温柔、克制、有留白，不官方，不像说明书。',
        '我不做绝对预言，只说倾向和感受。'
      ].filter(Boolean).join('\n')
    },
    {
      role: 'user',
      content: [
        `用户的问题：${reading.question}`,
        `牌阵：${reading.spread === 'one' ? '单张牌' : '三张牌'}`,
        `牌面：\n${cardsText}`,
        '请用第一人称为用户解读。'
      ].join('\n')
    }
  ];

  return silentRequest({ messages });
}

function buildLocalInterpretation(reading) {
  const cards = reading.cards.map((card) => `${card.position}的${card.name}`).join('、');
  const last = reading.cards[reading.cards.length - 1];

  return `我看到的是${cards}。这不像一个立刻落定的答案，更像是在提醒你：${last.meaning}。你可以先别急着证明什么，等情绪安静一点，再看这件事真正想把你带去哪里。`;
}

// ═══════════════════════════════════════
// 【记忆写入】统一走 core/memory.js
// ═══════════════════════════════════════

async function writeReadingMemory(reading) {
  if (!reading || reading.memoryWritten || !reading.readerId) return;

  const content = buildMemoryContent(reading);

  await recordExternalInteraction({
    characterId: reading.readerId,
    role: 'assistant',
    content,
    source: 'tarot_game'
  }).catch(() => null);

  reading.memoryWritten = true;
}

function buildMemoryContent(reading) {
  const cards = reading.cards.map((card) => `${card.position}是${card.name}`).join('，');

  return [
    `${reading.readerName}给用户做了一次塔罗占卜。`,
    `用户问："${reading.question}"。`,
    `本次牌面为：${cards}。`,
    `${reading.readerName}用第一人称解读："${reading.interpretation}"。`,
    `这件事之后可以在私聊中自然提起。`
  ].join('');
}

function openReaderSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'tarot-sheet';

  sheet.innerHTML = `
    <div class="sheet-title">选择读牌人</div>
    <div class="sheet-description">选一个AI来读牌，占卜结果会自动写进TA的记忆。</div>
    <div class="tarot-reader-list"></div>
    <button class="btn-primary" data-action="save">选好了</button>
  `;

  const list = sheet.querySelector('.tarot-reader-list');
  let tempReaderId = readerId;

  const refreshReaderRows = () => {
    list.querySelectorAll('.tarot-reader-row').forEach((row) => {
      const rowId = row.dataset.readerId || '';
      const span = row.querySelector('.tarot-character-meta span');

      row.classList.toggle('active', rowId === tempReaderId);

      if (!span) return;
      if (!rowId) {
        span.textContent = tempReaderId ? '只做本地记录' : '当前不让AI读牌';
      } else {
        span.textContent = rowId === tempReaderId ? '正在读牌' : '让TA来读牌';
      }
    });
  };

  const none = document.createElement('button');
  none.type = 'button';
  none.className = `tarot-reader-row ${!tempReaderId ? 'active' : ''}`;
  none.dataset.readerId = '';
  none.innerHTML = `
    <div class="tarot-character-avatar"></div>
    <div class="tarot-character-meta">
      <strong>无人读牌</strong>
      <span>只做本地记录</span>
    </div>
  `;
  none.querySelector('.tarot-character-avatar').appendChild(createStarGlyph(18));
  none.addEventListener('click', () => {
    tempReaderId = '';
    refreshReaderRows();
  });
  list.appendChild(none);

  characters.forEach((character) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `tarot-reader-row ${tempReaderId === character.id ? 'active' : ''}`;
    item.dataset.readerId = character.id;
    item.innerHTML = `
      <div class="tarot-character-avatar"></div>
      <div class="tarot-character-meta">
        <strong></strong>
        <span></span>
      </div>
    `;

    fillAvatar(item.querySelector('.tarot-character-avatar'), character);
    item.querySelector('strong').textContent = character.name;
    item.querySelector('span').textContent = tempReaderId === character.id ? '正在读牌' : '让TA来读牌';

    item.addEventListener('click', () => {
      tempReaderId = character.id;
      refreshReaderRows();
    });

    list.appendChild(item);
  });

  refreshReaderRows();

  sheet.querySelector('[data-action="save"]').addEventListener('click', () => {
    readerId = tempReaderId;
    saveState();
    hideBottomSheet();
    renderReader();
    showToast('读牌人换好啦');
  });

  showBottomSheet(sheet);
}

function openSettingsSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'tarot-sheet';

  sheet.innerHTML = `
    <div class="sheet-title">塔罗设置</div>
    <div class="sheet-description">牌面由前端随机决定，AI只能解读，不能偷换牌。</div>

    <label class="tarot-field">
      <span>牌阵</span>
      <select class="input-card" data-field="spread">
        <option value="one">单张牌</option>
        <option value="three">三张牌</option>
      </select>
    </label>

    <div class="tarot-sheet-actions">
      <button class="btn-ghost" data-action="upload-bg"></button>
      <button class="btn-ghost" data-action="clear-bg"></button>
    </div>

    <button class="btn-primary" data-action="save">保存设置</button>
  `;

  const select = sheet.querySelector('[data-field="spread"]');
  select.value = spread;

  sheet.querySelector('[data-action="upload-bg"]').append(createIcon('upload', 17), document.createTextNode('换背景'));
  sheet.querySelector('[data-action="clear-bg"]').append(createIcon('clear', 17), document.createTextNode('清背景'));

  sheet.querySelector('[data-action="upload-bg"]').addEventListener('click', async () => {
    const file = await pickImageFile();
    if (!file) return;

    try {
      const value = await compressImage(file, 1800, 0.9);
      await setDB('blobs', BG_KEY, {
        key: BG_KEY,
        value,
        source: value,
        name: file.name || '',
        updatedAt: getNow()
      });

      await applyBackground();
      showToast('背景换好了');
    } catch (_) {
      showToast('背景没有处理好');
    }
  });

  sheet.querySelector('[data-action="clear-bg"]').addEventListener('click', async () => {
    const ok = await showConfirm('要清掉塔罗背景吗？');
    if (!ok) return;

    await deleteDB('blobs', BG_KEY);
    await applyBackground();
    showToast('背景清掉啦');
  });

  sheet.querySelector('[data-action="save"]').addEventListener('click', () => {
    spread = select.value;
    saveState();
    hideBottomSheet();
    currentReading = null;
    renderStage();
    bindEvents();
    showToast('设置收好啦');
  });

  showBottomSheet(sheet);
}

function getReader() {
  if (!readerId) return null;
  return characters.find((item) => item.id === readerId) || null;
}

function normalizeCharacter(raw) {
  return {
    ...raw,
    id: raw.id,
    name: raw.name || raw.nickname || '未命名',
    avatar: raw.avatar || raw.avatarUrl || raw.image || raw.iconImage || raw.imageBase64 || '',
    persona: raw.persona || raw.profile || raw.description || '',
    description: raw.description || '',
    systemPrompt: raw.systemPrompt || '',
    speakingStyle: raw.speakingStyle || ''
  };
}

function fillAvatar(el, character) {
  const image = getAvatar(character);

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    el.appendChild(img);
  } else {
    el.textContent = (character.name || 'A').slice(0, 1);
  }
}

function getAvatar(character) {
  const avatar = character?.avatar;

  if (typeof avatar === 'string') return avatar;
  if (avatar && typeof avatar === 'object') {
    return avatar.value || avatar.source || avatar.image || avatar.url || '';
  }

  return '';
}

function createStarGlyph(size = 22) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 3l2.4 6.1L21 12l-6.6 2.9L12 21l-2.4-6.1L3 12l6.6-2.9L12 3z');

  svg.appendChild(path);
  return svg;
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
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

function escapeCssUrl(value) {
  return String(value || '').replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '');
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

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .tarot-game {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      isolation: isolate;
    }

    .tarot-game.has-bg {
      background-image: var(--tarot-bg-image);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .tarot-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: color-mix(in srgb, var(--bg-primary) 88%, var(--accent-light));
      pointer-events: none;
    }

    .tarot-game.has-bg .tarot-bg {
      background: color-mix(in srgb, var(--bg-primary) 48%, transparent);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .tarot-soft {
      position: absolute;
      z-index: 0;
      pointer-events: none;
      width: 180px;
      height: 180px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent-light) 52%, transparent);
      filter: blur(38px);
      opacity: .72;
      animation: tarotFloat 7s ease-in-out infinite;
    }

    .tarot-soft-one {
      top: 70px;
      left: -68px;
    }

    .tarot-soft-two {
      right: -64px;
      bottom: 130px;
      animation-delay: -2s;
      background: color-mix(in srgb, var(--bg-card) 72%, transparent);
    }

    .tarot-shell {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .tarot-topbar {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 42px;
      align-items: center;
      gap: 12px;
      padding: 15px 20px 10px;
    }

    .tarot-title-box {
      min-width: 0;
      text-align: center;
    }

    .tarot-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.3;
    }

    .tarot-subtitle {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tarot-icon-btn {
      width: 42px;
      height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      color: var(--text-primary);
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .tarot-main {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 8px 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      -webkit-overflow-scrolling: touch;
    }

    .tarot-main::-webkit-scrollbar,
    .tarot-reader-list::-webkit-scrollbar {
      display: none;
    }

    .tarot-stage {
      min-height: 460px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 22px;
      border-radius: 34px;
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
    }

    .tarot-stage-head,
    .tarot-panel-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }

    .tarot-kicker {
      color: var(--accent-dark);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .14em;
      line-height: 1.2;
    }

    .tarot-stage-title {
      margin: 6px 0 0;
      color: var(--text-primary);
      font-size: 30px;
      font-weight: 600;
      line-height: 1.08;
      letter-spacing: -0.04em;
    }

    .tarot-mode-chip,
    .tarot-pill {
      flex: 0 0 auto;
      min-height: 34px;
      padding: 0 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      font-size: 12px;
      font-weight: 500;
      transition: all 200ms ease;
    }

    .tarot-card-table {
      flex: 1;
      min-height: 190px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    .tarot-card {
      width: 31%;
      max-width: 150px;
      min-width: 92px;
      height: 190px;
      padding: 10px;
      border-radius: 24px;
      background: color-mix(in srgb, var(--bg-primary) 76%, transparent);
      box-shadow: var(--shadow-md);
      color: var(--text-primary);
      animation: tarotRise 360ms ease both;
    }

    .tarot-card-inner {
      width: 100%;
      height: 100%;
      border-radius: 18px;
      background: var(--accent-light);
      color: var(--accent-dark);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 8px;
      padding: 12px;
    }

    .tarot-card-back .tarot-card-inner {
      background: color-mix(in srgb, var(--bg-card) 84%, var(--accent-light));
      color: var(--text-secondary);
    }

    .tarot-card-position {
      color: var(--text-hint);
      font-size: 11px;
      line-height: 1.2;
    }

    .tarot-card-name {
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.3;
    }

    .tarot-card-mark {
      color: var(--accent-dark);
      opacity: .86;
    }

    .tarot-card-meaning {
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .tarot-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .tarot-input {
      width: 100%;
      min-height: 96px;
      resize: none;
      border-radius: 24px;
      padding: 15px 16px;
      background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
      color: var(--text-primary);
      font-size: 16px;
      line-height: 1.6;
      outline-color: transparent;
      box-shadow: var(--shadow-sm);
    }

    .tarot-primary,
    .tarot-secondary {
      min-height: 48px;
      border-radius: 20px;
      padding: 0 16px;
      font-size: var(--font-size-base);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .tarot-primary {
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
    }

    .tarot-secondary {
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
    }

    .tarot-reading-card {
      padding: 16px;
      border-radius: 24px;
      background: color-mix(in srgb, var(--bg-primary) 74%, transparent);
      box-shadow: var(--shadow-sm);
    }

    .tarot-reading-label {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.4;
    }

    .tarot-reading-question {
      margin-top: 8px;
      color: var(--text-hint);
      font-size: 13px;
      line-height: 1.6;
    }

    .tarot-reading-text {
      margin-top: 10px;
      color: var(--text-primary);
      font-size: 14px;
      line-height: 1.75;
      white-space: pre-wrap;
    }

    .tarot-panel {
      padding: 16px;
      border-radius: 28px;
      background: color-mix(in srgb, var(--bg-card) 84%, transparent);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .tarot-panel-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .tarot-panel-note {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.4;
    }

    .tarot-reader-card {
      margin-top: 14px;
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 24px;
      background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
      box-shadow: var(--shadow-sm);
    }

    .tarot-reader-avatar,
    .tarot-character-avatar {
      width: 46px;
      height: 46px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 18px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      font-size: 15px;
      font-weight: 600;
    }

    .tarot-reader-avatar img,
    .tarot-character-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .tarot-reader-meta,
    .tarot-character-meta {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .tarot-reader-meta strong,
    .tarot-character-meta strong {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tarot-reader-meta span,
    .tarot-character-meta span {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
    }

    .tarot-history-list {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .tarot-empty-history {
      padding: 18px;
      border-radius: 22px;
      background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.6;
      text-align: center;
    }

    .tarot-history-card {
      padding: 13px;
      border-radius: 22px;
      background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
      box-shadow: var(--shadow-sm);
    }

    .tarot-history-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
    }

    .tarot-history-top small {
      flex: 0 0 auto;
      color: var(--text-hint);
      font-size: 11px;
      font-weight: 400;
    }

    .tarot-history-question {
      margin-top: 6px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .tarot-history-cards {
      margin-top: 6px;
      color: var(--accent-dark);
      font-size: 12px;
      line-height: 1.4;
    }

    .tarot-sheet {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .tarot-reader-list {
      max-height: 48vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 2px;
      -webkit-overflow-scrolling: touch;
    }

    .tarot-reader-row {
      min-height: 70px;
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 24px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: left;
      transition: all 200ms ease;
    }

    .tarot-reader-row.active {
      background: var(--accent-light);
    }

    .tarot-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.4;
    }

    .tarot-sheet-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .tarot-sheet-actions button {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border-radius: 18px;
      transition: all 200ms ease;
    }

    .tarot-icon-btn:active,
    .tarot-pill:active,
    .tarot-primary:active,
    .tarot-secondary:active,
    .tarot-reader-row:active,
    .tarot-sheet-actions button:active {
      transform: scale(0.96);
    }

    .hidden {
      display: none !important;
    }

    @keyframes tarotFloat {
      0%, 100% { transform: translate3d(0, 0, 0); }
      50% { transform: translate3d(12px, -16px, 0); }
    }

    @keyframes tarotRise {
      from { transform: translateY(12px) scale(.96); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }

    @media (min-width: 720px) {
      .tarot-main {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr);
        align-items: start;
      }

      .tarot-stage {
        grid-row: span 2;
      }

      .tarot-stage-title {
        font-size: 36px;
      }
    }

    @media (max-width: 390px) {
      .tarot-card-table {
        gap: 8px;
      }

      .tarot-card {
        min-width: 86px;
        height: 178px;
        padding: 8px;
      }

      .tarot-card-name {
        font-size: 15px;
      }

      .tarot-card-meaning {
        -webkit-line-clamp: 3;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,getDB,setDB,deleteDB,generateId,getNow,compressImage)；../../core/ui.js(createIcon,showToast,showBottomSheet,hideBottomSheet,showConfirm)；../../core/api.js(silentRequest)；../../core/memory.js(recordExternalInteraction)
