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

const STYLE_ID = 'truth-game-style';
const STATE_KEY = 'truth_game_state';
const BG_KEY = 'app_bg_truth_game';
const MAX_AI_PLAYERS = 10;

let hostEl = null;
let onBack = null;
let characters = [];
let selectedIds = [];
let mode = 'random';
let currentRound = null;
let history = [];
let mounted = false;

export async function mount(container, options = {}) {
  hostEl = container;
  onBack = typeof options.onBack === 'function' ? options.onBack : null;
  mounted = true;

  injectStyles();

  await loadData();
  render();
}

export function unmount() {
  mounted = false;
  hideBottomSheet();

  if (hostEl) {
    hostEl.innerHTML = '';
  }

  hostEl = null;
  onBack = null;
  characters = [];
  selectedIds = [];
  currentRound = null;
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
  selectedIds = Array.isArray(saved.selectedIds)
    ? saved.selectedIds.filter((id) => characters.some((item) => item.id === id)).slice(0, MAX_AI_PLAYERS)
    : [];

  mode = ['random', 'dice', 'draw', 'card'].includes(saved.mode) ? saved.mode : 'random';
  history = Array.isArray(saved.history) ? saved.history.slice(0, 20) : [];
}

function saveState() {
  setData(STATE_KEY, {
    selectedIds,
    mode,
    history: history.slice(0, 20),
    updatedAt: getNow()
  });
}

async function render() {
  if (!hostEl) return;

  hostEl.className = 'truth-game';
  hostEl.innerHTML = `
    <div class="truth-bg"></div>
    <div class="truth-soft truth-soft-one"></div>
    <div class="truth-soft truth-soft-two"></div>

    <div class="truth-shell">
      <header class="truth-topbar">
        <button class="truth-icon-btn" data-action="back" aria-label="返回"></button>
        <div class="truth-title-box">
          <div class="truth-title">真心话契约</div>
          <div class="truth-subtitle">输赢交给随机，谁也不能偷改结果</div>
        </div>
        <button class="truth-icon-btn" data-action="settings" aria-label="设置"></button>
      </header>

      <main class="truth-main">
        <section class="truth-stage">
          <div class="truth-stage-head">
            <div>
              <div class="truth-kicker">ROUND</div>
              <h1 class="truth-stage-title"></h1>
            </div>
            <div class="truth-mode-chip"></div>
          </div>

          <div class="truth-orbit">
            <div class="truth-orbit-ring">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div class="truth-center-card">
              <div class="truth-center-small">本局结果</div>
              <div class="truth-center-title"></div>
              <div class="truth-center-text"></div>
            </div>
          </div>

          <div class="truth-actions"></div>
        </section>

        <section class="truth-panel">
          <div class="truth-panel-head">
            <div>
              <div class="truth-panel-title">参与者</div>
              <div class="truth-panel-note"></div>
            </div>
            <button class="truth-pill" data-action="players">拉人</button>
          </div>
          <div class="truth-player-strip"></div>
        </section>

        <section class="truth-panel truth-history-panel">
          <div class="truth-panel-head">
            <div>
              <div class="truth-panel-title">小把柄</div>
              <div class="truth-panel-note">会写进记忆，之后私聊可以追问</div>
            </div>
            <button class="truth-pill" data-action="clear-history">清空</button>
          </div>
          <div class="truth-history-list"></div>
        </section>
      </main>
    </div>
  `;

  hostEl.querySelector('[data-action="back"]').appendChild(createIcon('back', 19));
  hostEl.querySelector('[data-action="settings"]').appendChild(createIcon('settings', 19));

  await applyBackground();
  renderStage();
  renderPlayers();
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
      hostEl.style.setProperty('--truth-bg-image', `url("${escapeCssUrl(image)}")`);
      return;
    }
  } catch (_) {
    /* silent */
  }

  hostEl.classList.remove('has-bg');
  hostEl.style.removeProperty('--truth-bg-image');
}

function renderStage() {
  if (!hostEl) return;

  const title = hostEl.querySelector('.truth-stage-title');
  const chip = hostEl.querySelector('.truth-mode-chip');
  const centerTitle = hostEl.querySelector('.truth-center-title');
  const centerText = hostEl.querySelector('.truth-center-text');
  const actions = hostEl.querySelector('.truth-actions');

  chip.textContent = getModeName(mode);

  if (!currentRound) {
    title.textContent = '先把人拉进来';
    centerTitle.textContent = selectedIds.length ? '可以开始了' : '还缺几个AI';
    centerText.textContent = selectedIds.length
      ? '每局会随机玩法、随机输家、随机真心话或大冒险。'
      : '从你创建的角色里选 1 到 10 个，大家一起玩。';

    actions.innerHTML = `
      <button class="truth-primary" data-action="start">开始这一局</button>
      <button class="truth-secondary" data-action="players">选择参与者</button>
    `;
    return;
  }

  title.textContent = currentRound.penalty === 'truth' ? '真心话来了' : '大冒险来了';
  centerTitle.textContent = `${currentRound.loserName} 输了`;
  centerText.textContent = `${getModeName(currentRound.mode)} · ${currentRound.resultText}`;

  const isAiLoser = currentRound.loserType === 'ai';

  if (!currentRound.prompt) {
    actions.innerHTML = isAiLoser
      ? `
        <textarea class="truth-input" data-field="prompt" placeholder="${currentRound.penalty === 'truth' ? '输入你要问TA的真心话' : '输入你要TA做的大冒险'}"></textarea>
        <button class="truth-primary" data-action="submit-ai-loser">交给TA</button>
      `
      : `
        <div class="truth-user-lost">
          <div class="truth-user-lost-title">这次是你输了</div>
          <div class="truth-user-lost-text">${currentRound.hostName} 会来出题或指定任务。</div>
        </div>
        <button class="truth-primary" data-action="ask-ai-host">让TA出题</button>
      `;
    return;
  }

  actions.innerHTML = `
    <div class="truth-result-card">
      <div class="truth-result-label">${currentRound.penalty === 'truth' ? '真心话' : '大冒险'}</div>
      <div class="truth-result-prompt"></div>
      <div class="truth-result-response"></div>
    </div>
    <button class="truth-primary" data-action="finish-round">记下这一局</button>
    <button class="truth-secondary" data-action="next-round">下一局</button>
  `;

  actions.querySelector('.truth-result-prompt').textContent = currentRound.prompt || '';
  actions.querySelector('.truth-result-response').textContent = currentRound.response || '等一个回应。';
}

function renderPlayers() {
  if (!hostEl) return;

  const note = hostEl.querySelector('.truth-panel-note');
  const strip = hostEl.querySelector('.truth-player-strip');

  const selected = getSelectedCharacters();
  note.textContent = `你 + ${selected.length} 个AI，最多 ${MAX_AI_PLAYERS} 个AI`;

  strip.innerHTML = '';
  strip.appendChild(createUserPill());

  selected.forEach((character) => {
    strip.appendChild(createCharacterPill(character));
  });

  if (!selected.length) {
    const empty = document.createElement('button');
    empty.type = 'button';
    empty.className = 'truth-add-player';
    empty.dataset.action = 'players';
    empty.innerHTML = `
      <span></span>
      <strong>拉几个AI进来</strong>
    `;
    empty.querySelector('span').appendChild(createPlusIcon(18));
    strip.appendChild(empty);
  }
}

function renderHistory() {
  if (!hostEl) return;

  const list = hostEl.querySelector('.truth-history-list');
  list.innerHTML = '';

  if (!history.length) {
    list.innerHTML = `<div class="truth-empty-history">还没有小把柄，先玩一局。</div>`;
    return;
  }

  history.slice(0, 8).forEach((item) => {
    const card = document.createElement('div');
    card.className = 'truth-history-card';
    card.innerHTML = `
      <div class="truth-history-top">
        <span></span>
        <small></small>
      </div>
      <div class="truth-history-text"></div>
    `;

    card.querySelector('span').textContent = `${item.loserName} · ${item.penalty === 'truth' ? '真心话' : '大冒险'}`;
    card.querySelector('small').textContent = formatShortTime(item.createdAt);
    card.querySelector('.truth-history-text').textContent = item.prompt || item.resultText || '';

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

  hostEl.querySelectorAll('[data-action="players"]').forEach((button) => {
    button.addEventListener('click', () => openPlayersSheet());
  });

  hostEl.querySelector('[data-action="start"]')?.addEventListener('click', () => {
    startRound();
  });

  hostEl.querySelector('[data-action="submit-ai-loser"]')?.addEventListener('click', () => {
    submitAiLoserPrompt();
  });

  hostEl.querySelector('[data-action="ask-ai-host"]')?.addEventListener('click', () => {
    askAiHostPrompt();
  });

  hostEl.querySelector('[data-action="finish-round"]')?.addEventListener('click', () => {
    finishRound();
  });

  hostEl.querySelector('[data-action="next-round"]')?.addEventListener('click', () => {
    currentRound = null;
    renderStage();
    bindEvents();
  });

  hostEl.querySelector('[data-action="clear-history"]')?.addEventListener('click', async () => {
    const ok = await showConfirm('要清空这些小把柄吗？记忆里已写入的不会删除。');
    if (!ok) return;

    history = [];
    saveState();
    renderHistory();
    showToast('这里清空啦');
  });
}

function startRound() {
  const selected = getSelectedCharacters();

  if (!selected.length) {
    showToast('先拉至少一个AI进来');
    openPlayersSheet();
    return;
  }

  const roundMode = mode === 'random' ? pickRandom(['dice', 'draw', 'card']) : mode;
  const penalty = pickRandom(['truth', 'dare']);
  const allPlayers = [
    { type: 'user', id: 'user', name: getUserName() },
    ...selected.map((item) => ({ type: 'ai', id: item.id, name: item.name }))
  ];

  const loser = decideLoser(allPlayers, roundMode);
  const host = pickHost(allPlayers, loser);

  currentRound = {
    id: generateId('truth_round'),
    mode: roundMode,
    penalty,
    loserType: loser.type,
    loserId: loser.id,
    loserName: loser.name,
    hostId: host.id,
    hostName: host.name,
    resultText: loser.resultText,
    prompt: '',
    response: '',
    memoryWritten: false,
    createdAt: getNow()
  };

  renderStage();
  bindEvents();
}

function decideLoser(players, roundMode) {
  if (roundMode === 'dice') {
    const rolled = players.map((player) => ({
      ...player,
      score: 1 + Math.floor(Math.random() * 6)
    }));

    const min = Math.min(...rolled.map((item) => item.score));
    const losers = rolled.filter((item) => item.score === min);
    const loser = pickRandom(losers);

    return {
      ...loser,
      resultText: rolled.map((item) => `${item.name} ${item.score}点`).join('，')
    };
  }

  if (roundMode === 'card') {
    const cards = players.map((player) => ({
      ...player,
      score: 1 + Math.floor(Math.random() * 13)
    }));

    const min = Math.min(...cards.map((item) => item.score));
    const losers = cards.filter((item) => item.score === min);
    const loser = pickRandom(losers);

    return {
      ...loser,
      resultText: cards.map((item) => `${item.name} ${getCardName(item.score)}`).join('，')
    };
  }

  const shuffled = shuffle(players);
  const loser = shuffled[0];

  return {
    ...loser,
    resultText: `抽签抽中了 ${loser.name}`
  };
}

function pickHost(players, loser) {
  const others = players.filter((item) => item.id !== loser.id);
  return pickRandom(others.length ? others : players);
}

async function submitAiLoserPrompt() {
  if (!currentRound || currentRound.loserType !== 'ai') return;

  const input = hostEl.querySelector('[data-field="prompt"]');
  const prompt = input?.value?.trim() || '';

  if (!prompt) {
    showToast('先写一点要问/要做的内容');
    return;
  }

  currentRound.prompt = prompt;
  currentRound.response = 'TA正在想怎么接住这一局。';
  renderStage();

  try {
    const character = characters.find((item) => item.id === currentRound.loserId);
    const response = await requestAiResponse(character, currentRound, prompt);
    currentRound.response = response || '我认下这一局。';
  } catch (_) {
    currentRound.response = '我认下这一局。';
  }

  await writeRoundMemory(currentRound);
  renderStage();
  bindEvents();
}

async function askAiHostPrompt() {
  if (!currentRound || currentRound.loserType !== 'user') return;

  const hostCharacter = characters.find((item) => item.id === currentRound.hostId);

  currentRound.prompt = `${currentRound.hostName} 正在出题。`;
  currentRound.response = '等TA把题递过来。';
  renderStage();

  try {
    const prompt = await requestAiHostPrompt(hostCharacter, currentRound);
    currentRound.prompt = prompt || getFallbackUserTask(currentRound.penalty, currentRound.hostName);
    currentRound.response = '你可以完成它，也可以把这件事先记下来。';
  } catch (_) {
    currentRound.prompt = getFallbackUserTask(currentRound.penalty, currentRound.hostName);
    currentRound.response = '你可以完成它，也可以把这件事先记下来。';
  }

  await writeRoundMemory(currentRound);
  renderStage();
  bindEvents();
}

async function finishRound() {
  if (!currentRound) return;

  await writeRoundMemory(currentRound);

  history.unshift({ ...currentRound });
  history = history.slice(0, 20);
  saveState();

  showToast('这一局记下来了');
  currentRound = null;

  renderStage();
  renderHistory();
  bindEvents();
}

async function requestAiResponse(character, round, prompt) {
  const name = character?.name || round.loserName;
  const persona = [
    character?.persona,
    character?.description,
    character?.systemPrompt,
    character?.speakingStyle
  ].filter(Boolean).join('\n');

  const messages = [
    {
      role: 'system',
      content: [
        `我现在就是${name}本人。`,
        persona ? `我的人设：\n${persona}` : '',
        '我正在玩多人真心话大冒险。',
        '输赢、玩法、惩罚类型都由前端随机决定，我不能否认结果，不能改结果。',
        '我必须使用第一人称"我"说话，就像 ChatAI 私聊里的自然回复。',
        '我不会说"他/她/TA会"，不写旁白，不写动作解说，不提系统规则。',
        '如果是真心话，我就用第一人称诚实回答。',
        '如果是大冒险，我就用第一人称接受、拒绝或给出符合人设的反应。',
        '回复要短，像现场直接说出来的话。'
      ].filter(Boolean).join('\n')
    },
    {
      role: 'user',
      content: [
        `本局玩法：${getModeName(round.mode)}`,
        `输家：我`,
        `惩罚：${round.penalty === 'truth' ? '真心话' : '大冒险'}`,
        `用户给我的内容：${prompt}`,
        '请用第一人称直接回应。'
      ].join('\n')
    }
  ];

  return silentRequest({ messages });
}

async function requestAiHostPrompt(character, round) {
  const name = character?.name || round.hostName;
  const persona = [
    character?.persona,
    character?.description,
    character?.systemPrompt,
    character?.speakingStyle
  ].filter(Boolean).join('\n');

  const messages = [
    {
      role: 'system',
      content: [
        `我现在就是${name}本人。`,
        persona ? `我的人设：\n${persona}` : '',
        '我正在玩多人真心话大冒险。',
        '用户输了，我要给用户出一道真心话或指定一个大冒险。',
        '我必须用第一人称语气，像我本人正在对用户说话。',
        '我只输出题目或任务本身，不解释，不旁白，不提系统规则。'
      ].filter(Boolean).join('\n')
    },
    {
      role: 'user',
      content: [
        `惩罚：${round.penalty === 'truth' ? '真心话' : '大冒险'}`,
        '请给用户出题。'
      ].join('\n')
    }
  ];

  return silentRequest({ messages });
}

// ═══════════════════════════════════════
// 【记忆写入】统一走 core/memory.js
// ═══════════════════════════════════════

async function writeRoundMemory(round) {
  if (!round || round.memoryWritten) return;

  const memoryTargets = [];

  if (round.loserType === 'ai') {
    memoryTargets.push(round.loserId);
  } else if (round.hostId && round.hostId !== 'user') {
    memoryTargets.push(round.hostId);
  }

  const uniqueTargets = [...new Set(memoryTargets)].filter(Boolean);

  await Promise.all(uniqueTargets.map(async (characterId) => {
    await recordExternalInteraction({
      characterId,
      role: 'assistant',
      content: buildMemoryContent(round),
      source: 'truth_game'
    }).catch(() => null);
  }));

  round.memoryWritten = true;
}

function buildMemoryContent(round) {
  if (round.loserType === 'ai') {
    return [
      `${round.loserName}在真心话大冒险里输了。`,
      `玩法是${getModeName(round.mode)}，惩罚是${round.penalty === 'truth' ? '真心话' : '大冒险'}。`,
      `用户给出的内容是："${round.prompt}"。`,
      `${round.loserName}用第一人称回应："${round.response}"。`,
      `这件事之后可以在私聊中自然提起。`
    ].join('');
  }

  return [
    `用户在真心话大冒险里输了。`,
    `${round.hostName}作为出题的人，给用户的${round.penalty === 'truth' ? '真心话' : '大冒险'}是："${round.prompt}"。`,
    `这件事之后可以在私聊中自然提起。`
  ].join('');
}

function openPlayersSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'truth-sheet';

  sheet.innerHTML = `
    <div class="sheet-title">拉人进局</div>
    <div class="sheet-description">最多选 ${MAX_AI_PLAYERS} 个AI，加上你自己一起玩。</div>
    <div class="truth-character-list"></div>
    <button class="btn-primary" data-action="save">就这些人</button>
  `;

  const list = sheet.querySelector('.truth-character-list');
  const temp = new Set(selectedIds);

  if (!characters.length) {
    list.innerHTML = `<div class="truth-sheet-empty">还没有角色。先去人设管理里创建一个AI吧。</div>`;
  }

  characters.forEach((character) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `truth-character-row ${temp.has(character.id) ? 'active' : ''}`;
    item.innerHTML = `
      <div class="truth-character-avatar"></div>
      <div class="truth-character-meta">
        <strong></strong>
        <span></span>
      </div>
    `;

    fillAvatar(item.querySelector('.truth-character-avatar'), character);
    item.querySelector('strong').textContent = character.name;
    item.querySelector('span').textContent = temp.has(character.id) ? '已在局里' : '点一下拉进来';

    item.addEventListener('click', () => {
      if (temp.has(character.id)) {
        temp.delete(character.id);
      } else {
        if (temp.size >= MAX_AI_PLAYERS) {
          showToast(`最多 ${MAX_AI_PLAYERS} 个AI`);
          return;
        }
        temp.add(character.id);
      }

      item.classList.toggle('active', temp.has(character.id));
      item.querySelector('span').textContent = temp.has(character.id) ? '已在局里' : '点一下拉进来';
    });

    list.appendChild(item);
  });

  sheet.querySelector('[data-action="save"]').addEventListener('click', () => {
    selectedIds = [...temp].slice(0, MAX_AI_PLAYERS);
    saveState();
    hideBottomSheet();
    renderPlayers();
    renderStage();
    bindEvents();
  });

  showBottomSheet(sheet);
}

function openSettingsSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'truth-sheet';

  sheet.innerHTML = `
    <div class="sheet-title">契约设置</div>
    <div class="sheet-description">随机结果只由前端决定，AI不能偷改。</div>

    <label class="truth-field">
      <span>玩法模式</span>
      <select class="input-card" data-field="mode">
        <option value="random">每局随机</option>
        <option value="dice">骰子最低输</option>
        <option value="draw">抽签抽中输</option>
        <option value="card">命运牌最小输</option>
      </select>
    </label>

    <div class="truth-sheet-actions">
      <button class="btn-ghost" data-action="upload-bg"></button>
      <button class="btn-ghost" data-action="clear-bg"></button>
    </div>

    <button class="btn-primary" data-action="save">保存设置</button>
  `;

  const select = sheet.querySelector('[data-field="mode"]');
  select.value = mode;

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
    const ok = await showConfirm('要清掉这个游戏背景吗？');
    if (!ok) return;

    await deleteDB('blobs', BG_KEY);
    await applyBackground();
    showToast('背景清掉啦');
  });

  sheet.querySelector('[data-action="save"]').addEventListener('click', () => {
    mode = select.value;
    saveState();
    hideBottomSheet();
    renderStage();
    showToast('设置收好啦');
  });

  showBottomSheet(sheet);
}

function createUserPill() {
  const pill = document.createElement('div');
  pill.className = 'truth-player-pill truth-user-pill';
  pill.innerHTML = `
    <div class="truth-avatar"></div>
    <span></span>
  `;

  pill.querySelector('.truth-avatar').textContent = getUserInitial();
  pill.querySelector('span').textContent = getUserName();

  return pill;
}

function createCharacterPill(character) {
  const pill = document.createElement('div');
  pill.className = 'truth-player-pill';
  pill.innerHTML = `
    <div class="truth-avatar"></div>
    <span></span>
  `;

  fillAvatar(pill.querySelector('.truth-avatar'), character);
  pill.querySelector('span').textContent = character.name;

  return pill;
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

function getSelectedCharacters() {
  return selectedIds
    .map((id) => characters.find((item) => item.id === id))
    .filter(Boolean);
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

function getAvatar(character) {
  const avatar = character?.avatar;

  if (typeof avatar === 'string') return avatar;
  if (avatar && typeof avatar === 'object') {
    return avatar.value || avatar.source || avatar.image || avatar.url || '';
  }

  return '';
}

function getUserName() {
  const settings = getData('app_settings') || {};
  const user = settings.user || getData('app_user') || {};
  return user.name || settings.userName || '你';
}

function getUserInitial() {
  return getUserName().slice(0, 1) || '你';
}

function getModeName(value) {
  const map = {
    random: '每局随机',
    dice: '骰子',
    draw: '抽签',
    card: '命运牌'
  };

  return map[value] || '随机';
}

function getCardName(score) {
  const names = {
    1: 'A',
    11: 'J',
    12: 'Q',
    13: 'K'
  };

  return names[score] || String(score);
}

function getFallbackUserTask(penalty, hostName) {
  if (penalty === 'truth') {
    return `${hostName}问你：刚刚那一瞬间，你最不想被谁看穿？`;
  }

  return `${hostName}指定你：下一次私聊时，先主动承认这局输了。`;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
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

function createPlusIcon(size = 18) {
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

  const pathOne = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathOne.setAttribute('d', 'M12 5v14');

  const pathTwo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathTwo.setAttribute('d', 'M5 12h14');

  svg.append(pathOne, pathTwo);
  return svg;
}
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .truth-game {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      isolation: isolate;
    }

    .truth-game.has-bg {
      background-image: var(--truth-bg-image);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .truth-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: color-mix(in srgb, var(--bg-primary) 88%, var(--accent-light));
      pointer-events: none;
    }

    .truth-game.has-bg .truth-bg {
      background: color-mix(in srgb, var(--bg-primary) 48%, transparent);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .truth-soft {
      position: absolute;
      z-index: 0;
      pointer-events: none;
      width: 180px;
      height: 180px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent-light) 52%, transparent);
      filter: blur(38px);
      opacity: .7;
      animation: truthFloat 7s ease-in-out infinite;
    }

    .truth-soft-one {
      top: 80px;
      left: -70px;
    }

    .truth-soft-two {
      right: -64px;
      bottom: 120px;
      animation-delay: -2s;
      background: color-mix(in srgb, var(--bg-card) 72%, transparent);
    }

    .truth-shell {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .truth-topbar {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 42px;
      align-items: center;
      gap: 12px;
      padding: 15px 20px 10px;
    }

    .truth-title-box {
      min-width: 0;
      text-align: center;
    }

    .truth-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.3;
    }

    .truth-subtitle {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .truth-icon-btn {
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

    .truth-main {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 8px 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      -webkit-overflow-scrolling: touch;
    }

    .truth-main::-webkit-scrollbar,
    .truth-player-strip::-webkit-scrollbar {
      display: none;
    }

    .truth-stage {
      min-height: 430px;
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

    .truth-stage-head,
    .truth-panel-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }

    .truth-kicker {
      color: var(--accent-dark);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .14em;
      line-height: 1.2;
    }

    .truth-stage-title {
      margin: 6px 0 0;
      color: var(--text-primary);
      font-size: 30px;
      font-weight: 600;
      line-height: 1.08;
      letter-spacing: -0.04em;
    }

    .truth-mode-chip,
    .truth-pill {
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

    .truth-orbit {
      position: relative;
      flex: 1;
      min-height: 190px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .truth-orbit-ring {
      position: absolute;
      width: 186px;
      height: 186px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent-light) 48%, transparent);
      opacity: .82;
      animation: truthSpin 12s linear infinite;
      box-shadow: var(--shadow-sm);
    }

    .truth-orbit-ring span {
      position: absolute;
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--accent-dark);
      opacity: .36;
      left: calc(50% - 4.5px);
      top: calc(50% - 4.5px);
    }

    .truth-orbit-ring span:nth-child(1) {
      transform: translateY(-82px);
    }

    .truth-orbit-ring span:nth-child(2) {
      transform: translateX(82px);
    }

    .truth-orbit-ring span:nth-child(3) {
      transform: translateY(82px);
    }

    .truth-orbit-ring span:nth-child(4) {
      transform: translateX(-82px);
    }

    .truth-center-card {
      position: relative;
      width: min(100%, 250px);
      min-height: 170px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 34px;
      padding: 24px;
      background: color-mix(in srgb, var(--bg-card) 92%, transparent);
      box-shadow: var(--shadow-lg);
      text-align: center;
    }

    .truth-center-small {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.4;
    }

    .truth-center-title {
      margin-top: 8px;
      color: var(--text-primary);
      font-size: 22px;
      font-weight: 600;
      line-height: 1.25;
    }

    .truth-center-text {
      margin-top: 10px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .truth-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .truth-primary,
    .truth-secondary {
      min-height: 48px;
      border-radius: 20px;
      padding: 0 16px;
      font-size: var(--font-size-base);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .truth-primary {
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
    }

    .truth-secondary {
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
    }

    .truth-input {
      width: 100%;
      min-height: 92px;
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

    .truth-user-lost,
    .truth-result-card {
      padding: 16px;
      border-radius: 24px;
      background: color-mix(in srgb, var(--bg-primary) 74%, transparent);
      box-shadow: var(--shadow-sm);
    }

    .truth-user-lost-title,
    .truth-result-label {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.4;
    }

    .truth-user-lost-text,
    .truth-result-prompt,
    .truth-result-response {
      margin-top: 8px;
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.7;
      white-space: pre-wrap;
    }

    .truth-result-response {
      color: var(--text-primary);
    }

    .truth-panel {
      padding: 16px;
      border-radius: 28px;
      background: color-mix(in srgb, var(--bg-card) 84%, transparent);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .truth-panel-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .truth-panel-note {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.4;
    }

    .truth-player-strip {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 2px;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .truth-player-pill,
    .truth-add-player {
      flex: 0 0 auto;
      width: 78px;
      min-height: 96px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 24px;
      background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
      box-shadow: var(--shadow-sm);
      color: var(--text-primary);
      gap: 8px;
      text-align: center;
      transition: all 200ms ease;
    }

    .truth-player-pill span,
    .truth-add-player strong {
      width: 100%;
      padding: 0 8px;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .truth-avatar,
    .truth-character-avatar {
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 17px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      font-size: 15px;
      font-weight: 600;
    }

    .truth-avatar img,
    .truth-character-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .truth-add-player span {
      width: 42px;
      height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 17px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .truth-history-list {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .truth-empty-history {
      padding: 18px;
      border-radius: 22px;
      background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.6;
      text-align: center;
    }

    .truth-history-card {
      padding: 13px;
      border-radius: 22px;
      background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
      box-shadow: var(--shadow-sm);
    }

    .truth-history-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
    }

    .truth-history-top small {
      flex: 0 0 auto;
      color: var(--text-hint);
      font-size: 11px;
      font-weight: 400;
    }

    .truth-history-text {
      margin-top: 6px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .truth-sheet {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .truth-character-list {
      max-height: 48vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 2px;
      -webkit-overflow-scrolling: touch;
    }

    .truth-character-row {
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

    .truth-character-row.active {
      background: var(--accent-light);
    }

    .truth-character-meta {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .truth-character-meta strong {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .truth-character-meta span,
    .truth-sheet-empty {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
    }

    .truth-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.4;
    }

    .truth-sheet-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .truth-sheet-actions button {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border-radius: 18px;
      transition: all 200ms ease;
    }

    .truth-icon-btn:active,
    .truth-pill:active,
    .truth-primary:active,
    .truth-secondary:active,
    .truth-player-pill:active,
    .truth-add-player:active,
    .truth-character-row:active,
    .truth-sheet-actions button:active {
      transform: scale(0.96);
    }

    .hidden {
      display: none !important;
    }

    @keyframes truthFloat {
      0%, 100% { transform: translate3d(0, 0, 0); }
      50% { transform: translate3d(12px, -16px, 0); }
    }

    @keyframes truthSpin {
      to { transform: rotate(360deg); }
    }

    @media (min-width: 720px) {
      .truth-main {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr);
        align-items: start;
      }

      .truth-stage {
        grid-row: span 2;
      }

      .truth-stage-title {
        font-size: 36px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,getDB,setDB,deleteDB,generateId,getNow,compressImage)；../../core/ui.js(createIcon,showToast,showBottomSheet,hideBottomSheet,showConfirm)；../../core/api.js(silentRequest)；../../core/memory.js(recordExternalInteraction)
