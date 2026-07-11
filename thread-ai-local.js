// apps/chat/thread-ai-local.js
// 三层回退总管：用户API → 硅基流动 → 本地关键词匹配
// 启动时自动往数据库塞默认人设"初一"
// imports:
//   from '../../core/storage.js': getData, setData, getDB, setDB, getAllDB, generateId, getNow, getByIndexDB
//   from '../../core/local-chat.js': DEFAULT_CHARACTER, WELCOME_MESSAGES, generateLocalReply, requestSiliconFlowReply

import {
  getData,
  setData,
  getDB,
  setDB,
  getAllDB,
  generateId,
  getNow,
  getByIndexDB
} from '../../core/storage.js';

import {
  DEFAULT_CHARACTER,
  WELCOME_MESSAGES,
  generateLocalReply,
  requestSiliconFlowReply
} from '../../core/local-chat.js';

// ═══════════════════════════════════════
// 【启动种子】首次打开自动塞入默认人设
// ═══════════════════════════════════════

export async function seedDefaultCharacter() {
  try {
    const existing = await getDB('characters', DEFAULT_CHARACTER.id).catch(() => null);

    if (!existing) {
      const now = getNow();
      const character = {
        ...DEFAULT_CHARACTER,
        id: DEFAULT_CHARACTER.id,
        createdAt: now,
        updatedAt: now
      };
      await setDB('characters', character);
    }

    const existingMessages = await getByIndexDB('messages', 'characterId', DEFAULT_CHARACTER.id).catch(() => []);
    const hasMessages = Array.isArray(existingMessages) && existingMessages.length > 0;

    if (!hasMessages) {
      const now = getNow();
      const welcome = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];

      const message = {
        id: generateId('msg'),
        role: 'assistant',
        content: welcome,
        type: 'text',
        characterId: DEFAULT_CHARACTER.id,
        groupId: '',
        characterName: DEFAULT_CHARACTER.name,
        characterAvatar: DEFAULT_CHARACTER.avatar || '',
        thinking: '新来了一个人，我要怎么打招呼呢。',
        thinkingSummary: '在想怎么打招呼',
        toolCalls: [],
        isPending: false,
        isStopped: false,
        status: 'done',
        timestamp: now,
        createdAt: now,
        updatedAt: now
      };

      await setDB('messages', message);
    }
  } catch (error) {
    console.warn('[thread-ai-local] seed failed:', error?.message);
  }
}

// ═══════════════════════════════════════
// 【API检测】用户是否配了可用的在线API
// ═══════════════════════════════════════

function hasUserAPI() {
  try {
    const settings = getData('app_settings') || {};
    const endpoints = Array.isArray(settings.apiEndpoints) ? settings.apiEndpoints : [];
    const defaultId = settings.defaultApiEndpointId || '';

    if (defaultId) {
      const found = endpoints.find((ep) => String(ep.id) === defaultId && ep.apiKey);
      if (found) return true;
    }

    return endpoints.some((ep) => ep.apiKey && ep.enabled !== false);
  } catch (_) {
    return false;
  }
}

// ═══════════════════════════════════════
// 【回退入口】三层回退：用户API → 硅基流动 → 本地
// ═══════════════════════════════════════

export async function tryLocalOrSiliconFlowReply(state, options = {}) {
  if (!state) return null;

  const character = state.character;
  if (!character?.useLocalChat) return null;

  if (hasUserAPI()) return null;

  const characterId = character?.id || state.characterId;
  const messages = options.messages || state.messages || [];
  const userName = options.userName || '小朋友';
  const signal = options.signal;

  // ── 第二层：硅基流动 ──
  try {
    const siliconResult = await requestSiliconFlowReply(character, messages, userName, signal);
    if (siliconResult && siliconResult.content) {
      return siliconResult;
    }
  } catch (_) {
    // 硅基流动失败，继续往下走
  }

  // ── 第三层：本地关键词匹配 ──
  const localResult = generateLocalReply({
    messages,
    userName,
    characterName: character?.name || '初一'
  });

  return localResult;
}

// 依赖：../../core/storage.js(getData,setData,getDB,setDB,getAllDB,generateId,getNow,getByIndexDB)；../../core/local-chat.js(DEFAULT_CHARACTER,WELCOME_MESSAGES,generateLocalReply,requestSiliconFlowReply)

