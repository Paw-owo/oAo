// apps/chat/thread-settings.js
// imports:
//   from '../../core/storage.js': getData, setData, getDB, setDB, getAllDB, getByIndexDB, deleteDB, getNow, removeData
//   from '../../core/ui.js': createIcon, showToast

import {
  getData,
  setData,
  removeData,
  getDB,
  setDB,
  getAllDB,
  getByIndexDB,
  deleteDB,
  getNow
} from '../../core/storage.js';

import { createIcon, showToast } from '../../core/ui.js';
import { getApiPoolItems, getMergedPoolModels, getPoolGroups } from '../../core/api.js';

// ═══════════════════════════════════════
// 【基础状态】保存设置页运行时状态
// ═══════════════════════════════════════

const STYLE_ID = 'chat-thread-settings-style';

const DEFAULT_CHAT_CONFIG = {
  proactiveMode1Enabled: false,
  proactiveMode1Minutes: 30,
  proactiveMode2Enabled: false,
  proactiveMode2MinMinutes: 5,
  proactiveMode2MaxMinutes: 10,
  proactiveChance: 0.35,
  proactiveLastSentAt: null,
  proactiveAwaitingUserReply: false,
  proactiveNextCheckAt: null,
  readAt: null,
  memoryInjectLimit: 12,
  memoryCandidateLimit: 80,
  memoryAutoEnabled: true,
  memoryWriteIntensity: 'normal',
  memoryAllowEdit: true,
  memoryAllowDelete: true,
  autoTtsEnabled: false,
  ttsVoice: '',
  ttsModel: '',
  ttsSpeed: 1,
  voiceAutoplay: false,
  emojiDisabled: true
};

const DEFAULT_API_CONFIG = {
  useGlobal: true,
  poolGroup: 'all',
  model: '',
  temperature: 0.85,
  topP: 1,
  maxTokens: 1200,
  presencePenalty: 0,
  frequencyPenalty: 0,
  timeout: 45000,
  stream: true
};

const DEFAULT_VOICE_CONFIG = {
  useGlobal: true,
  provider: '',
  model: '',
  voice: '',
  voiceId: '',
  speed: 1
};

const state = {
  rootEl: null,
  mounted: false,
  characterId: '',
  character: null,
  appState: null,
  endpoints: [],
  models: [],
  userProfiles: [],
  worldbooks: [],
  poolModels: [],
  poolGroups: { paid: { name: '付费组' }, free: { name: '免费组' } },
  config: { ...DEFAULT_CHAT_CONFIG },
  saving: false
};

// ═══════════════════════════════════════
// 【公开接口】挂载和卸载设置页
// ═══════════════════════════════════════

export async function mountThreadSettings(containerEl, options = {}) {
  state.rootEl = containerEl;
  state.mounted = true;
  state.characterId = String(options.characterId || '').trim();
  state.appState = options.appState || null;
  state.saving = false;

  injectStyle();
  await loadData();
  render();
}

export function unmountThreadSettings() {
  state.mounted = false;

  if (state.rootEl) {
    state.rootEl.replaceChildren();
  }

  state.rootEl = null;
  state.characterId = '';
  state.character = null;
  state.appState = null;
  state.endpoints = [];
  state.models = [];
  state.userProfiles = [];
  state.worldbooks = [];
  state.poolModels = [];
  state.poolGroups = { paid: { name: '付费组' }, free: { name: '免费组' } };
  state.config = { ...DEFAULT_CHAT_CONFIG };
  state.saving = false;
}

// ═══════════════════════════════════════
// 【数据加载】读取角色、模型、记忆和聊天配置
// ═══════════════════════════════════════

async function loadData() {
  state.character = state.characterId ? await getDB('characters', state.characterId).catch(() => null) : null;
  state.config = getChatConfig();

  const settings = getData('app_settings') || {};
  const cloud = getData('cloud_models') || {};
  const endpoints = normalizeArray(settings.apiEndpoints || settings.endpoints || cloud.endpoints);
  const models = normalizeArray(settings.models || cloud.models);

  state.endpoints = endpoints;
  state.models = models;
  state.userProfiles = loadUserProfiles();
  state.worldbooks = normalizeArray(await getAllDB('worldbook').catch(() => []));
  state.poolModels = await getMergedPoolModels().catch(() => []);
  state.poolGroups = getPoolGroups();
}

function getChatConfig() {
  const stored = state.characterId ? getData(getChatConfigKey()) || {} : {};

  return {
    ...DEFAULT_CHAT_CONFIG,
    ...stored,
    proactiveMode1Minutes: clampNumber(stored.proactiveMode1Minutes || DEFAULT_CHAT_CONFIG.proactiveMode1Minutes, 1, 240),
    proactiveMode2MinMinutes: clampNumber(stored.proactiveMode2MinMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MinMinutes, 1, 240),
    proactiveMode2MaxMinutes: clampNumber(stored.proactiveMode2MaxMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MaxMinutes, 1, 240),
    proactiveChance: clampChance(stored.proactiveChance ?? DEFAULT_CHAT_CONFIG.proactiveChance),
    memoryInjectLimit: clampNumber(stored.memoryInjectLimit || DEFAULT_CHAT_CONFIG.memoryInjectLimit, 3, 80),
    memoryCandidateLimit: clampNumber(stored.memoryCandidateLimit || DEFAULT_CHAT_CONFIG.memoryCandidateLimit, 10, 300),
    ttsSpeed: clampFloat(stored.ttsSpeed || DEFAULT_CHAT_CONFIG.ttsSpeed, 0.5, 2, 1)
  };
}

function getChatConfigKey() {
  return `chat_${state.characterId}_config`;
}

function getWallpaperBlobKey() {
  return `app_bg_chat_${state.characterId}`;
}

function getWallpaperOpacityKey() {
  return `app_bg_chat_opacity_${state.characterId}`;
}

function loadUserProfiles() {
  const current = getData('user_profiles');
  const legacy = getData('app_user_profiles');
  const source = Array.isArray(current) && current.length
    ? current
    : Array.isArray(legacy)
      ? legacy
      : [];

  return source.filter(Boolean);
}

// ═══════════════════════════════════════
// 【主渲染】生成完整设置页面
// ═══════════════════════════════════════

function render() {
  if (!state.rootEl || !state.mounted) return;

  const page = el('section', 'thread-settings-page');
  page.append(
    createHeader(),
    createScroll()
  );

  state.rootEl.replaceChildren(page);
}

function createHeader() {
  const header = el('header', 'thread-settings-header');

  const back = iconButton('back', '返回');
  back.addEventListener('click', () => {
    if (typeof state.appState?.goThread === 'function') {
      state.appState.goThread({
        mode: 'private',
        characterId: state.characterId
      });
      return;
    }

    if (typeof state.appState?.back === 'function') {
      state.appState.back();
      return;
    }

    window.history.back();
  });

  const title = el('div', 'thread-settings-title-wrap');
  title.append(
    el('div', 'thread-settings-title', '聊天设置'),
    el('div', 'thread-settings-subtitle', state.character?.name ? `正在调整 ${state.character.name}` : '当前聊天')
  );

  const save = el('button', 'thread-settings-save', '已自动保存');
  save.type = 'button';
  save.disabled = true;

  header.append(back, title, save);
  return header;
}

function createScroll() {
  const scroll = el('main', 'thread-settings-scroll');

  scroll.append(
    createHeroCard(),
    createWallpaperSection(),
    createApiSection(),
    createMemorySection(),
    createProactiveSection(),
    createVoiceSection(),
    createReplySection(),
    createWorldbookSection(),
    createUserProfileSection(),
    createDangerSection()
  );

  return scroll;
}

function createHeroCard() {
  const heroCard = el('section', 'settings-card');

  const top = el('div', 'settings-hero-row');

  const avatar = el('span', 'settings-hero-avatar');
  const src = state.character?.avatar || '';

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.onerror = () => {
      avatar.textContent = getInitial(state.character?.name || 'A');
    };
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(state.character?.name || 'A');
  }

  const body = el('div', 'settings-hero-body');
  body.append(
    el('div', 'settings-card-title', state.character?.name || '当前 AI'),
    el('p', 'settings-card-desc', '这里控制 TA 在当前聊天里的模型、记忆、语音和回复习惯。')
  );

  top.append(avatar, body);
  heroCard.append(top);
  return heroCard;
}

// ═══════════════════════════════════════
// 【聊天壁纸】上传、清除、透明度
// ═══════════════════════════════════════

function createWallpaperSection() {
  const section = card('聊天壁纸', '给这个聊天单独换一张背景图');
  const blobKey = getWallpaperBlobKey();
  const opacityKey = getWallpaperOpacityKey();
  const opacity = Number(getData(opacityKey) ?? 100);

  const previewBox = el('div', 'thread-settings-wallpaper-preview');
  const previewInner = el('span', 'settings-image-preview');
  previewInner.append(safeIcon('image', 20));
  previewBox.append(previewInner);

  loadWallpaperPreview(previewInner, blobKey);

  section.append(previewBox);
  section.append(labelBlock('壁纸透明度', rangeBlock(opacity, 15, 100, 1, async (value, live) => {
    const num = Number(value);
    setData(opacityKey, num);
    const record = await getDB('blobs', blobKey).catch(() => null);
    if (record) {
      await setDB('blobs', blobKey, { ...record, opacity: num, updatedAt: getNow() }).catch(() => {});
    }
    if (!live) showToast('壁纸透明度保存啦');
  })));

  section.append(actionRow([
    actionBtn('upload', '上传壁纸', async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      const op = Number(getData(opacityKey) ?? 100);
      await setDB('blobs', blobKey, { key: blobKey, value: dataUrl, source: file.name, opacity: op, updatedAt: getNow() });
      setData(opacityKey, op);
      showToast('聊天壁纸换好啦');
      render();
    }),
    actionBtn('delete', '清除壁纸', async () => {
      const ok = await showSimpleConfirm('要清掉这张壁纸吗？');
      if (!ok) return;
      await deleteDB('blobs', blobKey).catch(() => {});
      removeData(opacityKey);
      showToast('壁纸清掉啦');
      render();
    })
  ]));

  return section;
}

async function loadWallpaperPreview(el, key) {
  const record = await getDB('blobs', key).catch(() => null);
  const image = record?.value || record?.image || '';

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    img.onerror = () => {
      el.innerHTML = '';
      el.append(safeIcon('image', 20));
      el.classList.remove('has-preview');
    };
    el.innerHTML = '';
    el.append(img);
    el.classList.add('has-preview');
  }
}

// ═══════════════════════════════════════
// 【API配置】入口式，点进弹窗选连接方式、分组、模型
// ═══════════════════════════════════════

function createApiSection() {
  const api = getApiConfig();
  const section = card('模型和连接', '控制这个 AI 怎么连到模型。');

  const statusText = api.useGlobal || api.poolGroup === 'all'
    ? '跟随轮换池'
    : `固定 · ${getGroupName(api.poolGroup)} · ${api.model || '未选模型'}`;

  const entry = el('button', 'settings-nav-item api-section-entry');
  entry.type = 'button';

  const mark = el('span', 'settings-row-icon');
  mark.append(safeIcon('settings', 20));

  const text = el('span', 'settings-row-text');
  text.append(el('strong', '', '连接方式'), el('small', '', statusText));

  const arrow = el('span', 'settings-arrow');
  arrow.append(safeIcon('chevron', 18));

  entry.append(mark, text, arrow);
  entry.addEventListener('click', () => openApiDetailSheet());

  section.append(entry);
  return section;
}

function getGroupName(groupKey) {
  return state.poolGroups[groupKey]?.name || (groupKey === 'paid' ? '付费组' : groupKey === 'free' ? '免费组' : '全部');
}

function getApiConfig() {
  const base = { ...DEFAULT_API_CONFIG, ...(state.character?.apiConfig || {}) };

  // 旧配置迁移：有 endpointId 没 poolGroup 的，默认按有 Key 归到付费组
  if (!base.poolGroup && base.endpointId) {
    return { ...base, poolGroup: 'paid', useGlobal: false };
  }

  if (!base.poolGroup || base.useGlobal) {
    return { ...base, useGlobal: true, poolGroup: 'all' };
  }

  return base;
}

function openApiDetailSheet() {
  const api = getApiConfig();
  let mode = api.useGlobal || api.poolGroup === 'all' ? 'global' : 'fixed';
  let poolGroup = api.poolGroup === 'all' ? 'paid' : (api.poolGroup || 'paid');
  let model = api.model || '';

  const overlay = el('div', 'settings-confirm-overlay');

  const cardEl = el('section', 'settings-confirm-card api-detail-card');

  cardEl.append(
    el('div', 'settings-confirm-title', '模型和连接'),
    el('div', 'settings-confirm-desc', '选完会自动保存，不会影响其他角色。')
  );

  const body = el('div', 'api-detail-body');

  // 模式选择
  const modeRow = el('div', 'api-detail-segment');
  const globalBtn = el('button', `api-detail-pill ${mode === 'global' ? 'active' : ''}`, '跟随轮换池');
  const fixedBtn = el('button', `api-detail-pill ${mode === 'fixed' ? 'active' : ''}`, '固定分组和模型');
  modeRow.append(globalBtn, fixedBtn);
  body.append(el('div', 'settings-label', '连接方式'), modeRow);

  // 固定选项容器
  const fixedBox = el('div', 'api-detail-fixed');
  body.append(fixedBox);

  function renderFixed() {
    fixedBox.innerHTML = '';

    // 分组选择
    const groupRow = el('div', 'api-detail-segment');
    const paidBtn = el('button', `api-detail-pill ${poolGroup === 'paid' ? 'active' : ''}`, state.poolGroups.paid?.name || '付费组');
    const freeBtn = el('button', `api-detail-pill ${poolGroup === 'free' ? 'active' : ''}`, state.poolGroups.free?.name || '免费组');
    groupRow.append(paidBtn, freeBtn);
    fixedBox.append(el('div', 'settings-label', '固定分组'), groupRow);

    paidBtn.addEventListener('click', () => {
      poolGroup = 'paid';
      model = '';
      renderFixed();
    });

    freeBtn.addEventListener('click', () => {
      poolGroup = 'free';
      model = '';
      renderFixed();
    });

    // 模型选择
    const groupEnabled = state.poolGroups[poolGroup]?.enabled !== false;
    if (!groupEnabled) {
      fixedBox.append(el('p', 'settings-note', `这个分组在全局设置里被关掉了，打开后才能用哦。`));
    }

    const modelLabel = el('div', 'settings-label', '模型');
    fixedBox.append(modelLabel);

    const modelInput = el('input', 'settings-input');
    modelInput.type = 'text';
    modelInput.placeholder = '例如 gpt-4o-mini，也可以从下面选';
    modelInput.value = model;

    modelInput.addEventListener('change', () => {
      model = modelInput.value.trim();
    });

    fixedBox.append(modelInput);

    // 可选模型列表
    const picker = createPoolModelPicker(model, (value) => {
      model = value;
      modelInput.value = value;
    });

    fixedBox.append(picker);
  }

  function renderBody() {
    fixedBox.style.display = mode === 'fixed' ? 'flex' : 'none';
    if (mode === 'fixed') renderFixed();
  }

  globalBtn.addEventListener('click', () => {
    mode = 'global';
    globalBtn.classList.add('active');
    fixedBtn.classList.remove('active');
    renderBody();
  });

  fixedBtn.addEventListener('click', () => {
    mode = 'fixed';
    fixedBtn.classList.add('active');
    globalBtn.classList.remove('active');
    renderBody();
  });

  renderBody();

  cardEl.append(body);

  // 底部按钮
  const actions = el('div', 'settings-confirm-actions');

  const cancel = el('button', 'settings-confirm-btn ghost', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => overlay.remove());

  const confirm = el('button', 'settings-confirm-btn primary', '保存');
  confirm.type = 'button';
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    confirm.textContent = '保存中...';

    const own = { ...DEFAULT_API_CONFIG, ...(state.character?.apiConfig || {}) };

    if (mode === 'global') {
      await updateCharacter({
        apiConfig: { ...own, useGlobal: true, poolGroup: 'all', endpointId: '', model: '' }
      });
    } else {
      await updateCharacter({
        apiConfig: { ...own, useGlobal: false, poolGroup, endpointId: '', model }
      });
    }

    overlay.remove();
    render();
  });

  actions.append(cancel, confirm);
  cardEl.append(actions);
  overlay.append(cardEl);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  document.body.append(overlay);
}

function createPoolModelPicker(current, onSelect) {
  const box = el('div', 'api-pool-model-picker');
  box.append(el('div', 'api-pool-model-title', '可选模型'));

  const models = state.poolModels.map((m) => m.name || m.key).filter(Boolean);

  if (!models.length) {
    box.append(el('p', 'settings-note', '轮换池里还没模型，先去设置里加接口吧。'));
    return box;
  }

  const list = el('div', 'api-pool-model-list');
  models.forEach((modelName) => {
    const btn = el('button', `api-pool-model-chip ${modelName === current ? 'active' : ''}`);
    btn.type = 'button';
    btn.append(el('span', '', modelName), el('small', '', modelName === current ? '正在用' : '点我选'));
    btn.addEventListener('click', () => {
      onSelect?.(modelName);
      Array.from(list.children).forEach((child) => child.classList.remove('active'));
      btn.classList.add('active');
      btn.querySelector('small').textContent = '正在用';
    });
    list.append(btn);
  });

  box.append(list);
  return box;
}

async function updateApiConfig(patch = {}) {
  const own = { ...DEFAULT_API_CONFIG, ...(state.character?.apiConfig || {}) };
  await updateCharacter({
    apiConfig: {
      ...own,
      ...patch,
      useGlobal: false
    }
  });
}

// ═══════════════════════════════════════
// 【记忆设置】控制记忆读取和自动写入权限
// ═══════════════════════════════════════

function createMemorySection() {
  const section = card('记忆', '控制 TA 能看多少记忆，以及能不能自己整理记忆。');

  section.append(
    labelBlock('带进聊天的记忆', rangeBlock(state.config.memoryInjectLimit, 3, 80, 1, (value) => updateChatConfig({ memoryInjectLimit: Math.round(Number(value)) }))),
    labelBlock('候选记忆范围', rangeBlock(state.config.memoryCandidateLimit, 10, 300, 5, (value) => updateChatConfig({ memoryCandidateLimit: Math.round(Number(value)) }))),
    switchRow('允许自动写记忆', state.config.memoryAutoEnabled !== false, (checked) => updateChatConfig({ memoryAutoEnabled: checked })),
    selectSettingBlock('写记忆强度', state.config.memoryWriteIntensity || 'normal', [
      ['low', '少记一点'],
      ['normal', '正常'],
      ['high', '多记一点']
    ], (value) => updateChatConfig({ memoryWriteIntensity: value })),
    switchRow('允许自己编辑记忆', state.config.memoryAllowEdit !== false, (checked) => updateChatConfig({ memoryAllowEdit: checked })),
    switchRow('允许自己删除记忆', state.config.memoryAllowDelete !== false, (checked) => updateChatConfig({ memoryAllowDelete: checked }))
  );

  return section;
}

// ═══════════════════════════════════════
// 【主动消息】控制离线和在线主动开口
// ═══════════════════════════════════════

function createProactiveSection() {
  const section = card('主动消息', 'TA 想你时，可以轻轻主动找你。');

  section.append(
    switchRow('离线一会儿主动问候', Boolean(state.config.proactiveMode1Enabled), (checked) => updateChatConfig({ proactiveMode1Enabled: checked })),
    labelBlock('离线等待时间', rangeBlock(state.config.proactiveMode1Minutes, 1, 240, 1, (value) => updateChatConfig({ proactiveMode1Minutes: Math.round(Number(value)) }))),
    switchRow('在线停留主动开口', Boolean(state.config.proactiveMode2Enabled), (checked) => updateChatConfig({ proactiveMode2Enabled: checked })),
    labelBlock('在线触发最小时间', rangeBlock(state.config.proactiveMode2MinMinutes, 1, 240, 1, (value) => updateChatConfig({
      proactiveMode2MinMinutes: Math.round(Number(value)),
      proactiveMode2MaxMinutes: Math.max(Math.round(Number(value)), state.config.proactiveMode2MaxMinutes)
    }))),
    labelBlock('在线触发最大时间', rangeBlock(state.config.proactiveMode2MaxMinutes, 1, 240, 1, (value) => updateChatConfig({
      proactiveMode2MaxMinutes: Math.max(Math.round(Number(value)), state.config.proactiveMode2MinMinutes)
    }))),
    labelBlock('主动概率', rangeBlock(state.config.proactiveChance, 0, 1, 0.05, (value) => updateChatConfig({ proactiveChance: Number(value) })))
  );

  return section;
}

// ═══════════════════════════════════════
// 【语音设置】控制 TTS、自动播放、语速和 Voice ID
// ═══════════════════════════════════════

function createVoiceSection() {
  const voice = getVoiceConfig();
  const followGlobal = voice.useGlobal !== false;
  const section = card('语音', '控制 TA 回复后怎么说话。');

  section.append(
    switchRow('跟随全局语音', followGlobal, async (checked) => {
      const own = { ...DEFAULT_VOICE_CONFIG, ...(state.character?.voiceConfig || {}) };
      if (checked) {
        await updateCharacter({ voiceConfig: { ...own, useGlobal: true } });
      } else {
        const settings = getData('app_settings') || {};
        const tts = settings.ttsGlobal || {};
        await updateCharacter({
          voiceConfig: {
            ...own,
            useGlobal: false,
            provider: tts.provider || own.provider || 'openai',
            voice: tts.voice || own.voice || 'alloy',
            voiceId: tts.voiceId || own.voiceId || '',
            model: tts.model || own.model || 'tts-1'
          }
        });
        await updateChatConfig({
          ttsVoice: tts.voice || own.voice || 'alloy',
          ttsModel: tts.model || own.model || 'tts-1'
        });
      }
    }),
    switchRow('AI 回复后自动朗读', Boolean(state.config.autoTtsEnabled), (checked) => updateChatConfig({ autoTtsEnabled: checked })),
    labelBlock('语音服务', inputRow('', voice.provider || '', '例如 openai / miniMax', (value) => updateVoiceConfig({ useGlobal: false, provider: value }))),
    labelBlock('语音模型', inputRow('', state.config.ttsModel || voice.model || '', '例如 tts-1 / speech-2.8-hd', async (value) => {
      updateChatConfig({ ttsModel: value });
      await updateVoiceConfig({ useGlobal: false, model: value });
    })),
    labelBlock('声音名', inputRow('', state.config.ttsVoice || voice.voice || '', '例如 alloy / nova', async (value) => {
      updateChatConfig({ ttsVoice: value });
      await updateVoiceConfig({ useGlobal: false, voice: value });
    })),
    labelBlock('Voice ID', inputRow('', voice.voiceId || '', '语音 ID，比如 MiniMax 的 voice_id', async (value) => {
      await updateVoiceConfig({ useGlobal: false, voiceId: value });
    })),
    labelBlock('语速', rangeBlock(state.config.ttsSpeed || voice.speed || 1, 0.5, 2, 0.05, async (value) => {
      const speed = Number(value);
      updateChatConfig({ ttsSpeed: speed });
      if (!followGlobal) {
        await updateVoiceConfig({ useGlobal: false, speed });
      }
    }))
  );

  return section;
}

function getVoiceConfig() {
  const base = { ...DEFAULT_VOICE_CONFIG, ...(state.character?.voiceConfig || {}) };

  if (base.useGlobal !== false) {
    const settings = getData('app_settings') || {};
    const tts = settings.ttsGlobal || {};
    return {
      ...base,
      useGlobal: true,
      provider: tts.provider || 'openai',
      model: tts.model || '',
      voice: tts.voice || '',
      voiceId: tts.voiceId || '',
      speed: Number(tts.speed) || 1
    };
  }

  return base;
}

async function updateVoiceConfig(patch = {}) {
  const own = { ...DEFAULT_VOICE_CONFIG, ...(state.character?.voiceConfig || {}) };
  await updateCharacter({
    voiceConfig: {
      ...own,
      ...patch
    }
  });
}

// ═══════════════════════════════════════
// 【回复表现】控制回复长度、模式、称呼和表情
// ═══════════════════════════════════════

function createReplySection() {
  const section = card('回复表现', '控制聊天看起来和说起来是什么感觉。');

  section.append(
    selectSettingBlock('对话样式', (getData('app_settings') || {}).bubbleMode === 'dialog' ? 'dialog' : 'bubble', [
      ['bubble', '气泡模式'],
      ['dialog', '对话模式']
    ], (value) => {
      const current = getData('app_settings') || {};
      setData('app_settings', { ...current, bubbleMode: value });
      showToast('保存好啦，返回聊天后生效');
    }),
    selectSettingBlock('回复长度', state.character?.replyLength || 'medium', [
      ['short', '短一点'],
      ['medium', '刚刚好'],
      ['long', '多说一点']
    ], (value) => updateCharacter({ replyLength: value })),
    labelBlock('TA 对你的称呼', inputRow('', state.character?.nicknameForUser || '', '留空就用你的档案名', (value) => updateCharacter({ nicknameForUser: value }))),
    labelBlock('主动消息风格', inputRow('', state.character?.proactiveStyle || '', '写一句你想要的感觉', (value) => updateCharacter({ proactiveStyle: value }))),
    switchRow('禁用表情符号', state.config.emojiDisabled !== false, (checked) => updateChatConfig({ emojiDisabled: checked })),
    labelBlock('额外回复要求', textareaRow('', state.character?.extraReplyRules || '', '比如：更黏人一点，但不要长篇说教。', (value) => updateCharacter({ extraReplyRules: value })))
  );

  return section;
}

// ═══════════════════════════════════════
// 【世界书】绑定当前 AI 的世界设定
// ═══════════════════════════════════════

function createWorldbookSection() {
  const ids = normalizeArray(state.character?.worldbookIds).map(String);
  const section = card('世界书', '控制 TA 会参考哪些世界设定。');

  section.append(
    selectSettingBlock('读取方式', state.character?.worldbookMode || 'bound_plus_global', [
      ['bound_plus_global', '绑定 + 全局'],
      ['only_bound', '只看绑定'],
      ['all', '全部可见']
    ], (value) => updateCharacter({ worldbookMode: value }))
  );

  if (!state.worldbooks.length) {
    section.append(el('p', 'settings-note', '还没有世界书，之后可以在世界书里新建。'));
    return section;
  }

  const shown = state.worldbooks.slice(0, 40);

  shown.forEach((book) => {
    section.append(switchRow(book.title || book.name || '未命名设定', ids.includes(String(book.id)), async (checked) => {
      const current = normalizeArray(state.character?.worldbookIds).map(String);
      const next = checked
        ? [...new Set([...current, String(book.id)])]
        : current.filter((item) => item !== String(book.id));
      await updateCharacter({ worldbookIds: next });
    }));
  });

  if (state.worldbooks.length > 40) {
    section.append(el('p', 'settings-note', `还有 ${state.worldbooks.length - 40} 条没显示，太多了先收着。`));
  }

  return section;
}

// ═══════════════════════════════════════
// 【用户档案】绑定当前 AI 看到的用户人设
// ═══════════════════════════════════════

function createUserProfileSection() {
  const section = card('你的档案', '控制 TA 眼里的你是谁。');

  section.append(
    selectSettingBlock('绑定档案', state.character?.userProfileId || '', [
      ['', '使用默认档案'],
      ['none', '不绑定档案'],
      ...state.userProfiles.map((item, index) => [
        String(item.id || index),
        item.name || item.nickname || item.title || `档案 ${index + 1}`
      ])
    ], (value) => updateCharacter({ userProfileId: value }))
  );

  return section;
}

// ═══════════════════════════════════════
// 【危险操作】删除当前聊天记录
// ═══════════════════════════════════════

function createDangerSection() {
  const section = card('危险操作', '这里会真的改数据，点之前想一下。');

  section.append(
    actionBtn('delete', '清空当前私聊', () => openClearMessagesConfirm())
  );

  return section;
}

// ═══════════════════════════════════════
// 【组件】卡片、开关、滑杆、输入、选择
// ═══════════════════════════════════════

function card(title, desc) {
  const node = el('div', 'settings-card');
  node.append(el('div', 'settings-card-title', title));
  if (desc) node.append(el('p', 'settings-card-desc', desc));
  return node;
}

function switchRow(label, initial, onChange) {
  const row = el('button', `settings-switch-row ${initial ? 'on' : ''}`);
  row.type = 'button';
  row.dataset.value = initial ? 'true' : 'false';
  row.append(el('span', '', label), el('i', 'settings-switch-dot'));

  row.addEventListener('click', () => {
    const next = row.dataset.value !== 'true';
    row.dataset.value = next ? 'true' : 'false';
    row.classList.toggle('on', next);
    onChange?.(next, row);
  });

  return row;
}

function labelBlock(label, content) {
  const box = el('div', 'settings-label-block');
  box.append(el('div', 'settings-label', label), content);
  return box;
}

function rangeBlock(value, min, max, step, onChange) {
  const row = el('div', 'settings-range-row');
  const input = el('input', 'settings-range');
  const num = el('span', 'settings-range-value', formatRangeValue(value, step));

  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  input.addEventListener('input', () => {
    num.textContent = formatRangeValue(input.value, step);
    onChange?.(input.value, true);
  });

  input.addEventListener('change', () => onChange?.(input.value, false));
  row.append(input, num);
  return row;
}

function formatRangeValue(value, step) {
  if (step < 1) return Number(value).toFixed(2);
  return String(Math.round(Number(value)));
}

function inputRow(label, value, placeholder, onChange) {
  const wrap = el('label', 'settings-field');
  const input = el('input', 'settings-input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder || '';
  if (label) wrap.append(el('span', '', label));
  wrap.append(input);

  input.addEventListener('change', async () => onChange?.(input.value.trim()));

  return wrap;
}

function textareaRow(label, value, placeholder, onChange) {
  const wrap = el('label', 'settings-field');
  const input = el('textarea', 'settings-input settings-textarea');
  input.value = value || '';
  input.placeholder = placeholder || '';
  input.rows = 4;
  if (label) wrap.append(el('span', '', label));
  wrap.append(input);

  input.addEventListener('change', async () => onChange?.(input.value.trim()));

  return wrap;
}

function selectSettingBlock(label, value, options, onChange) {
  const wrap = el('label', 'settings-field');
  const select = el('select', 'settings-input');

  options.forEach(([val, text]) => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = text;
    select.append(option);
  });

  select.value = value;
  wrap.append(el('span', '', label), select);

  select.addEventListener('change', () => onChange?.(select.value));

  return wrap;
}

function actionRow(buttons) {
  const row = el('div', 'settings-actions');
  buttons.forEach((btn) => row.append(btn));
  return row;
}

function actionBtn(icon, text, onClick) {
  const btn = el('button', 'settings-action-btn');
  btn.type = 'button';
  btn.append(safeIcon(icon, 17), el('span', '', text));

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  });

  return btn;
}

// ═══════════════════════════════════════
// 【确认弹窗】屏幕居中可爱圆角，颜色走全局变量
// ═══════════════════════════════════════

function openClearMessagesConfirm() {
  const overlay = el('div', 'settings-confirm-overlay');

  const confirmCard = el('section', 'settings-confirm-card');
  confirmCard.append(
    el('div', 'settings-confirm-title', '要清空这段聊天吗'),
    el('div', 'settings-confirm-desc', '只删消息，不删角色和记忆哦')
  );

  const actions = el('div', 'settings-confirm-actions');

  const cancel = el('button', 'settings-confirm-btn ghost', '还是算了');
  cancel.type = 'button';
  cancel.addEventListener('click', () => overlay.remove());

  const confirm = el('button', 'settings-confirm-btn primary', '清空吧');
  confirm.type = 'button';
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    confirm.textContent = '清空中...';
    await clearCurrentMessages();
    overlay.remove();
  });

  actions.append(cancel, confirm);
  confirmCard.append(actions);
  overlay.append(confirmCard);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  document.body.append(overlay);
}

function showSimpleConfirm(message) {
  return new Promise((resolve) => {
    const overlay = el('div', 'settings-confirm-overlay');
    const confirmCard = el('section', 'settings-confirm-card');
    confirmCard.append(el('div', 'settings-confirm-title', message));

    const actions = el('div', 'settings-confirm-actions');

    const cancel = el('button', 'settings-confirm-btn ghost', '取消');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { overlay.remove(); resolve(false); });

    const ok = el('button', 'settings-confirm-btn primary', '确定');
    ok.type = 'button';
    ok.addEventListener('click', () => { overlay.remove(); resolve(true); });

    actions.append(cancel, ok);
    confirmCard.append(actions);
    overlay.append(confirmCard);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) { overlay.remove(); resolve(false); }
    });

    document.body.append(overlay);
  });
}

// ═══════════════════════════════════════
// 【保存操作】保存角色配置和聊天配置
// ═══════════════════════════════════════

async function updateCharacter(patch = {}) {
  if (!state.characterId || !state.character) return;

  const next = {
    ...state.character,
    ...patch,
    updatedAt: getNow()
  };

  await setDB('characters', next);
  state.character = next;
  showToast('保存好啦');
}

function updateChatConfig(patch = {}) {
  if (!state.characterId) return;

  const current = getChatConfig();
  const next = {
    ...current,
    ...patch
  };

  if (Number(next.proactiveMode2MaxMinutes) < Number(next.proactiveMode2MinMinutes)) {
    next.proactiveMode2MaxMinutes = next.proactiveMode2MinMinutes;
  }

  if (Number(next.memoryCandidateLimit) < Number(next.memoryInjectLimit)) {
    next.memoryCandidateLimit = next.memoryInjectLimit;
  }

  state.config = next;
  setData(getChatConfigKey(), next);
  showToast('保存好啦');
}

async function clearCurrentMessages() {
  if (!state.characterId) return;

  const messages = normalizeArray(await getByIndexDB('messages', 'characterId', state.characterId).catch(() => []));

  await Promise.all(
    messages.map((message) => deleteDB('messages', message.id).catch(() => null))
  );

  const counts = getData('chat_unread_counts') || {};
  delete counts[state.characterId];
  setData('chat_unread_counts', counts);
  window.refreshDesktopBadges?.();

  showToast('聊天清空啦');
}

// ═══════════════════════════════════════
// 【文件工具】选择文件、读取
// ═══════════════════════════════════════

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════
// 【工具函数】图标、数值和 DOM
// ═══════════════════════════════════════

function iconButton(iconName, label) {
  const button = el('button', 'settings-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(safeIcon(iconName, 18));
  return button;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function clampFloat(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Number(number.toFixed(2))));
}

function clampChance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function safeIcon(name, size = 18) {
  try {
    const icon = createIcon(name, size);
    if (icon) return icon;
  } catch {}

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '4.5');
  svg.append(circle);

  return svg;
}

// ═══════════════════════════════════════
// 【样式】统一用 settings.js 风格，走全局 CSS 变量
// ═══════════════════════════════════════

function injectStyle() {
  const old = document.getElementById(STYLE_ID);
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .thread-settings-page{
      height:100%;
      min-height:0;
      display:flex;
      flex-direction:column;
      overflow:hidden;
      background:var(--bg-primary);
      color:var(--text-primary);
    }

    .thread-settings-header{
      flex:0 0 auto;
      min-height:68px;
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      padding:12px 20px 10px;
      background:var(--surface-glass);
      backdrop-filter:blur(18px);
      z-index:2;
    }

    .settings-icon-btn{
      width:46px;
      height:46px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:var(--motion);
    }

    .settings-icon-btn:active{
      transform:scale(var(--press-scale));
    }

    .thread-settings-title-wrap{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:2px;
    }

    .thread-settings-title{
      color:var(--text-primary);
      font-size:var(--font-size-title);
      font-weight:600;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-settings-subtitle{
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-settings-save{
      min-width:92px;
      height:40px;
      padding:0 14px;
      border-radius:16px;
      background:transparent;
      color:var(--text-secondary);
      font:inherit;
      font-size:var(--font-size-small);
      font-weight:500;
      transition:var(--motion);
      white-space:nowrap;
      flex:0 0 auto;
      cursor:default;
    }

    .thread-settings-save:disabled{
      opacity:0.7;
    }

    .thread-settings-scroll{
      flex:1 1 auto;
      min-height:0;
      overflow-y:auto;
      overflow-x:hidden;
      padding:14px 20px calc(32px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
    }

    .settings-card{
      border-radius:var(--radius-lg);
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
      padding:16px;
      margin-bottom:14px;
    }

    .settings-card-title{
      color:var(--text-primary);
      font-size:var(--font-size-title);
      font-weight:600;
      line-height:1.35;
    }

    .settings-card-desc{
      margin-top:6px;
      margin-bottom:12px;
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      line-height:1.55;
      white-space:pre-line;
    }

    .settings-nav-item{
      width:100%;
      min-height:62px;
      display:flex;
      align-items:center;
      gap:12px;
      padding:10px;
      border-radius:18px;
      background:transparent;
      color:var(--text-primary);
      text-align:left;
      transition:var(--motion);
    }

    .settings-nav-item:active{
      transform:scale(var(--press-scale));
    }

    .api-section-entry{
      margin-top:10px;
      background:var(--surface-muted);
    }

    .settings-row-icon{
      width:36px;
      height:36px;
      flex:0 0 36px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      border-radius:14px;
      background:var(--accent-light);
      color:var(--accent-dark);
    }

    .settings-row-text{
      flex:1;
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:2px;
    }

    .settings-row-text strong{
      color:var(--text-primary);
      font-size:var(--font-size-base);
      font-weight:600;
      line-height:1.35;
    }

    .settings-row-text small{
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      line-height:1.45;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .settings-arrow{
      flex:0 0 auto;
      color:var(--text-hint);
    }

    .settings-hero-row{
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      align-items:center;
      gap:14px;
    }

    .settings-hero-avatar{
      width:56px;
      height:56px;
      flex:0 0 56px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      border-radius:22px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:18px;
      font-weight:650;
    }

    .settings-hero-avatar img{
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .settings-hero-body{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:5px;
    }

    .settings-switch-row{
      width:100%;
      min-height:48px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:10px 12px;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:var(--font-size-base);
      transition:var(--motion);
      margin-top:10px;
    }

    .settings-switch-row:active{
      transform:scale(var(--press-scale));
    }

    .settings-switch-dot{
      position:relative;
      width:44px;
      height:26px;
      flex:0 0 44px;
      border-radius:999px;
      background:var(--bg-secondary);
      transition:var(--motion);
    }

    .settings-switch-dot::after{
      content:"";
      position:absolute;
      top:4px;
      left:4px;
      width:18px;
      height:18px;
      border-radius:999px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
      transition:var(--motion);
    }

    .settings-switch-row.on .settings-switch-dot{
      background:var(--accent);
    }

    .settings-switch-row.on .settings-switch-dot::after{
      transform:translateX(18px);
    }

    .settings-label-block{
      width:100%;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:10px 12px;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      margin-top:10px;
    }

    .settings-label{
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      font-weight:600;
      flex:0 0 auto;
      white-space:nowrap;
      margin-top:4px;
      margin-bottom:4px;
    }

    .settings-range-row{
      flex:1;
      min-width:0;
      display:flex;
      align-items:center;
      gap:10px;
    }

    .settings-range{
      flex:1;
      min-width:0;
      accent-color:var(--accent);
    }

    .settings-range-value{
      min-width:44px;
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      text-align:right;
    }

    .settings-field{
      width:100%;
      display:flex;
      flex-direction:column;
      gap:8px;
      padding:10px 12px;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      margin-top:10px;
    }

    .settings-field span{
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      font-weight:600;
    }

    .settings-input{
      width:100%;
      min-height:44px;
      padding:10px 12px;
      border-radius:15px;
      background:var(--bg-card);
      color:var(--text-primary);
      font-size:max(var(--font-size-base), 16px);
    }

    .settings-textarea{
      min-height:96px;
      resize:none;
      line-height:1.6;
    }

    .settings-actions{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin-top:10px;
    }

    .settings-action-btn{
      min-height:38px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:6px;
      padding:8px 12px;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:var(--font-size-small);
      transition:var(--motion);
    }

    .settings-action-btn:active{
      transform:scale(var(--press-scale));
    }

    .settings-note{
      margin:10px 0 0;
      padding:12px;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      line-height:1.55;
      white-space:pre-line;
    }

    .settings-image-preview{
      width:100%;
      height:132px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      border-radius:22px;
      background:var(--accent-light);
      color:var(--accent-dark);
      margin-bottom:10px;
    }

    .settings-image-preview.has-preview{
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
    }

    .settings-image-preview img{
      width:100%;
      height:100%;
      object-fit:cover;
      border-radius:inherit;
      display:block;
    }

    .api-detail-card{
      width:min(100%,420px);
      max-height:min(86vh,640px);
      display:flex;
      flex-direction:column;
      padding:22px 22px 18px;
      overflow:hidden;
    }

    .api-detail-body{
      flex:1 1 auto;
      min-height:0;
      overflow-y:auto;
      overflow-x:hidden;
      display:flex;
      flex-direction:column;
      gap:8px;
      margin:14px 0 4px;
      padding-right:4px;
    }

    .api-detail-segment{
      display:flex;
      gap:8px;
      margin-top:2px;
      flex-wrap:wrap;
    }

    .api-detail-pill{
      flex:1;
      min-width:120px;
      min-height:40px;
      padding:8px 12px;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      font-weight:500;
      transition:var(--motion);
    }

    .api-detail-pill.active{
      background:var(--accent-light);
      color:var(--accent-dark);
      font-weight:600;
    }

    .api-detail-pill:active{
      transform:scale(var(--press-scale));
    }

    .api-detail-fixed{
      display:flex;
      flex-direction:column;
      gap:8px;
      animation:settingsConfirmCardIn 200ms ease;
    }

    .api-pool-model-picker{
      margin-top:10px;
      padding:12px;
      border-radius:16px;
      background:var(--surface-muted);
      box-shadow:var(--shadow-sm);
    }

    .api-pool-model-title{
      margin-bottom:10px;
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      font-weight:600;
    }

    .api-pool-model-list{
      display:flex;
      gap:8px;
      overflow-x:auto;
      padding:2px 2px 8px;
      scrollbar-width:none;
      -webkit-overflow-scrolling:touch;
    }

    .api-pool-model-list::-webkit-scrollbar{
      display:none;
    }

    .api-pool-model-chip{
      min-width:148px;
      max-width:220px;
      min-height:58px;
      flex:0 0 auto;
      display:flex;
      flex-direction:column;
      align-items:flex-start;
      justify-content:center;
      gap:3px;
      padding:10px 12px;
      border:none;
      outline:none;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      text-align:left;
      box-shadow:var(--shadow-sm);
      transition:var(--motion);
    }

    .api-pool-model-chip:active{
      transform:scale(var(--press-scale));
    }

    .api-pool-model-chip.active{
      background:var(--accent-light);
      color:var(--accent-dark);
    }

    .api-pool-model-chip span{
      width:100%;
      overflow:hidden;
      font-size:var(--font-size-small);
      font-weight:600;
      line-height:1.3;
      text-overflow:ellipsis;
      white-space:nowrap;
    }

    .api-pool-model-chip small{
      color:var(--text-secondary);
      font-size:calc(var(--font-size-small) * 0.86);
      line-height:1.2;
    }

    .api-pool-model-chip.active small,
    .api-pool-model-chip.active span{
      color:var(--accent-dark);
    }

    .settings-confirm-overlay{
      position:fixed;
      inset:0;
      z-index:2147483000;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      background:var(--bg-overlay);
      color:var(--text-primary);
      animation:settingsConfirmIn 180ms ease;
    }

    .settings-confirm-card{
      width:min(100%,300px);
      padding:24px 22px 18px;
      border-radius:28px;
      background:var(--bg-card);
      box-shadow:var(--shadow-lg);
      text-align:center;
      animation:settingsConfirmCardIn 220ms ease;
    }

    .settings-confirm-title{
      color:var(--text-primary);
      font-size:var(--font-size-title);
      font-weight:600;
      line-height:1.4;
    }

    .settings-confirm-desc{
      margin-top:8px;
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      line-height:1.6;
    }

    .settings-confirm-actions{
      display:flex;
      flex-direction:column;
      gap:8px;
      margin-top:18px;
    }

    .settings-confirm-btn{
      width:100%;
      min-height:44px;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:14px;
      font-weight:600;
      transition:var(--motion);
    }

    .settings-confirm-btn.primary{
      background:var(--accent);
      color:var(--bubble-user-text);
    }

    .settings-confirm-btn:active{
      transform:scale(var(--press-scale));
    }

    .settings-confirm-btn:disabled{
      opacity:.6;
      pointer-events:none;
    }

    @keyframes settingsConfirmIn{
      from{ opacity:0 }
      to{ opacity:1 }
    }

    @keyframes settingsConfirmCardIn{
      from{ opacity:0; transform:scale(.92) translateY(8px) }
      to{ opacity:1; transform:scale(1) translateY(0) }
    }

    @media(max-width:430px){
      .thread-settings-header{
        padding-left:20px;
        padding-right:20px;
      }

      .thread-settings-scroll{
        padding-left:20px;
        padding-right:20px;
      }

      .settings-label-block{
        flex-direction:column;
        align-items:stretch;
        gap:8px;
      }

      .settings-label{
        white-space:normal;
      }

      .api-detail-card{
        width:min(100%,340px);
        padding:18px;
      }

      .settings-confirm-card{
        width:min(100%,280px);
        padding:22px 18px 16px;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .settings-icon-btn,
      .thread-settings-save,
      .settings-switch-row,
      .settings-switch-dot,
      .settings-switch-dot::after,
      .settings-action-btn,
      .settings-nav-item,
      .api-detail-pill,
      .api-pool-model-chip,
      .settings-confirm-btn,
      .settings-confirm-overlay,
      .settings-confirm-card{
        animation:none;
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：删除了重复定义的 createApiSection、getGroupName、getApiConfig、openApiDetailSheet、createPoolModelPicker、updateApiConfig 共 6 个函数（从第二个 createApiSection 注释块到第二个 updateApiConfig 结束）。同时把 openApiDetailSheet 里的局部变量 card 改名为 cardEl 避免与外层 card() 函数名冲突。
// 原来效果：JS 报 SyntaxError: Identifier 'createApiSection' has already been declared，设置页完全打不开。
// 现在效果：6 个函数只保留一份，设置页正常打开。openApiDetailSheet 里的 cardEl 不再与 card() 函数冲突。
// 会不会影响其他文件：不会。导出接口不变，依赖不变。
// 依赖：../../core/storage.js / ../../core/api.js(getApiPoolItems,getMergedPoolModels,getPoolGroups) / ../../core/ui.js(createIcon,showToast)
