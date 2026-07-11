// apps/chat/thread-ai.js
// imports:
//   from '../../core/storage.js': getData, setData, generateId, getNow, setDB, deleteDB, getByIndexDB, getAllDB, getDB
//   from '../../core/api.js': silentRequest, callAPI
//   from '../../core/memory.js': buildMemoryPrompt, checkImportantInfo, checkAndSummarize
//   from './identity-core.js': getIdentityCore
//   from './thread-ai-local.js': tryLocalOrSiliconFlowReply

import {
  getData,
  setData,
  generateId,
  getNow,
  setDB,
  deleteDB,
  getByIndexDB,
  getAllDB,
  getDB
} from '../../core/storage.js';

import { silentRequest, callAPI } from '../../core/api.js';

import {
  buildMemoryPrompt as buildCoreMemoryPrompt,
  checkImportantInfo,
  checkAndSummarize
} from '../../core/memory.js';

import { getIdentityCore } from './identity-core.js';
import { getWorldbookForCharacter } from '../worldbook.js';
import { formatWorldbookPrompt } from '../../core/worldbook-prompt.js';
import { getActiveRelationshipLock } from './thread-relationship.js';

import { tryLocalOrSiliconFlowReply } from './thread-ai-local.js';

// ═══════════════════════════════════════
// 【基础配置】聊天 AI 常量和运行状态
// ═══════════════════════════════════════

const PRIVATE_STORE = 'messages';
const GROUP_STORE = 'group_messages';
const GRUDGE_STORE = 'grudges';
const PUNISHMENT_STORE = 'punishments';
const LOCK_STORE = 'relationship_locks';

const AI_CONTEXT_LIMIT = 28;
const GROUP_REPLY_MAX = 3;
const GRUDGE_TRIGGER_SCORE = 5;
const STREAM_RENDER_THROTTLE_MS = 80;

const activeAIJobs = new Map();

const DEFAULT_PROACTIVE_CONFIG = {
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
  memoryCandidateLimit: 80
};

const PUNISHMENT_POOL = [
  {
    type: 'cooldown',
    title: '冷战几分钟',
    description: '我现在不太想马上理人。倒计时结束前，我会先保持距离，等对方好好想想怎么哄我。',
    lockType: 'cooldown',
    level: 2,
    minutes: 5,
    requiredCount: 1
  },
  {
    type: 'apology',
    title: '认真道歉',
    description: '我想听到认真说清楚哪里错了、以后准备怎么补救。太敷衍的话，我会继续记着。',
    lockType: 'apology_required',
    level: 2,
    minutes: 10,
    requiredCount: 1
  },
  {
    type: 'nickname',
    title: '叫我专属称呼',
    description: '我想听到连续三次好好叫我的专属称呼，然后我才考虑不继续冷着。',
    lockType: 'nickname_required',
    level: 2,
    minutes: 8,
    requiredCount: 3
  },
  {
    type: 'blackout',
    title: '假装拉黑',
    description: '我会先从聊天列表里消失一小会儿。不是彻底离开，只是我真的有点不想出现。',
    lockType: 'soft_block',
    level: 3,
    minutes: 6,
    requiredCount: 1
  },
  {
    type: 'ultimatum',
    title: '最后解释机会',
    description: '我只给一次认真解释的机会。说得真诚，我就回来；继续敷衍，我会把冷战延长。',
    lockType: 'ultimatum',
    level: 4,
    minutes: 12,
    requiredCount: 1
  }
];

// ═══════════════════════════════════════
// 【可爱报错文案】按 HTTP 状态码返回
// ═══════════════════════════════════════

const FRIENDLY_ERROR_MAP = {
  400: '这波啊，这波是格式没整对，',
  401: '没key就想进？急了急了。',
  402: '余额不足，快去氪金。',
  403: '没权限，典重典。',
  404: '你要的东西跑路了，awsl。',
  408: '请求超时，摆烂了。',
  429: '冲太猛了，能不能发慢点啊你。',
  500: '这服务器炸了宝宝呜呜...',
  502: '服务器上游发来一串梦话。',
  503: '服务器在卷，排队中。',
  504: '上游睡死，喊不醒。'
};

function getFriendlyErrorMessage(status) {
  return FRIENDLY_ERROR_MAP[Number(status)] || '我刚刚出了点小状况，再说一遍试试？';
}

// ═══════════════════════════════════════
// 【流式渲染辅助】实时拆分 think 标签 + 节流渲染
// ═══════════════════════════════════════

function createStreamAccumulator() {
  return {
    rawContent: '',
    rawThinking: '',
    rawThinkingSummary: '',
    lastRender: 0,
    thinkClosed: false,
    summaryClosed: false,

    append({ content, thinking, thinkingSummary }) {
      if (content) this.rawContent += content;
      if (thinking) this.rawThinking = this.rawThinking ? this.rawThinking + '\n' + thinking : thinking;
      if (thinkingSummary) {
        this.rawThinkingSummary = this.rawThinkingSummary
          ? this.rawThinkingSummary + thinkingSummary
          : thinkingSummary;
      }
    },

    parse() {
      let content = this.rawContent;
      let thinking = this.rawThinking;
      let thinkingSummary = this.rawThinkingSummary;

      if (content) {
        const result = parseStreamThinkTags(content);
        if (result.thinking) {
          thinking = thinking ? thinking + '\n' + result.thinking : result.thinking;
        }
        if (result.thinkingSummary) {
          thinkingSummary = thinkingSummary
            ? thinkingSummary + result.thinkingSummary
            : result.thinkingSummary;
        }
        content = result.content;
      }

      return { content, thinking, thinkingSummary };
    },

    applyTo(message) {
      if (!message) return;

      const { content, thinking, thinkingSummary } = this.parse();

      message.content = content;
      message.thinking = thinking;
      message.isStreaming = true;

      if (thinkingSummary) {
        message.thinkingSummary = thinkingSummary.length > 15
          ? thinkingSummary.slice(0, 15).trim()
          : thinkingSummary;
      } else if (thinking && !message.thinkingSummary) {
        message.thinkingSummary = summarizeText(thinking, 15);
      }
    },

    shouldRender() {
      const now = Date.now();
      if (now - this.lastRender >= STREAM_RENDER_THROTTLE_MS) {
        this.lastRender = now;
        return true;
      }
      return false;
    }
  };
}

function parseStreamThinkTags(text) {
  let content = String(text || '');
  let thinking = '';
  let thinkingSummary = '';

  const thinkOpen = content.indexOf('<think');
  if (thinkOpen >= 0) {
    const tagEnd = content.indexOf('>', thinkOpen);
    if (tagEnd >= 0) {
      const closeIdx = content.indexOf('</think>', tagEnd + 1);

      if (closeIdx >= 0) {
        thinking = content.slice(tagEnd + 1, closeIdx).trim();
        content = (content.slice(0, thinkOpen) + content.slice(closeIdx + 8)).trim();
      } else {
        thinking = content.slice(tagEnd + 1).trim();
        content = content.slice(0, thinkOpen).trim();
      }
    }
  }

  const thinkOpen2 = content.indexOf('<thinking');
  if (thinkOpen2 >= 0) {
    const tagEnd2 = content.indexOf('>', thinkOpen2);
    if (tagEnd2 >= 0) {
      const closeIdx2 = content.indexOf('</thinking>', tagEnd2 + 1);

      if (closeIdx2 >= 0) {
        thinking = thinking ? thinking + '\n' + content.slice(tagEnd2 + 1, closeIdx2).trim() : content.slice(tagEnd2 + 1, closeIdx2).trim();
        content = (content.slice(0, thinkOpen2) + content.slice(closeIdx2 + 12)).trim();
      } else {
        const partial = content.slice(tagEnd2 + 1).trim();
        thinking = thinking ? thinking + '\n' + partial : partial;
        content = content.slice(0, thinkOpen2).trim();
      }
    }
  }

  const summaryOpen = content.indexOf('<think_summary');
  if (summaryOpen >= 0) {
    const tagEnd3 = content.indexOf('>', summaryOpen);
    if (tagEnd3 >= 0) {
      const closeIdx3 = content.indexOf('</think_summary>', tagEnd3 + 1);

      if (closeIdx3 >= 0) {
        thinkingSummary = content.slice(tagEnd3 + 1, closeIdx3).trim();
        content = (content.slice(0, summaryOpen) + content.slice(closeIdx3 + 16)).trim();
      } else {
        thinkingSummary = content.slice(tagEnd3 + 1).trim();
        content = content.slice(0, summaryOpen).trim();
      }
    }
  }

  const summaryOpen2 = content.indexOf('<thinking_summary');
  if (summaryOpen2 >= 0) {
    const tagEnd4 = content.indexOf('>', summaryOpen2);
    if (tagEnd4 >= 0) {
      const closeIdx4 = content.indexOf('</thinking_summary>', tagEnd4 + 1);

      if (closeIdx4 >= 0) {
        thinkingSummary = thinkingSummary
          ? thinkingSummary + content.slice(tagEnd4 + 1, closeIdx4).trim()
          : content.slice(tagEnd4 + 1, closeIdx4).trim();
        content = (content.slice(0, summaryOpen2) + content.slice(closeIdx4 + 19)).trim();
      } else {
        const partial2 = content.slice(tagEnd4 + 1).trim();
        thinkingSummary = thinkingSummary ? thinkingSummary + partial2 : partial2;
        content = content.slice(0, summaryOpen2).trim();
      }
    }
  }

  return { content, thinking, thinkingSummary };
}

function resolveGroupTypes(character) {
  if (!character) return ['paid', 'free'];

  const apiConfig = character?.apiConfig || {};
  const poolGroup = apiConfig?.poolGroup || apiConfig?.groupType || '';

  if (poolGroup === 'paid') return ['paid'];
  if (poolGroup === 'free') return ['free'];
  if (poolGroup === 'all') return ['paid', 'free'];

  if (apiConfig?.useGlobal === false && apiConfig?.endpointId) {
    return ['paid'];
  }

  return ['paid', 'free'];
}

// ═══════════════════════════════════════
// 【公开接口】私聊、群聊、停止、主动消息
// ═══════════════════════════════════════

export async function requestThreadAIReply(state, options = {}) {
  if (!state) return null;

  if (state.mode === 'group') {
    return requestGroupReply(state, options);
  }

  return requestPrivateReply(state, options);
}

export async function stopThreadAIReply(state, options = {}) {
  if (!state) return false;

  const key = getAIJobKey(state);
  const job = activeAIJobs.get(key);

  state.aiGenerating = false;
  state.isSending = false;

  if (!job) return false;

  job.stopped = true;
  job.stoppedAt = getNow();

  try {
    job.controller?.abort?.();
  } catch (_) {}

  await markJobPlaceholdersStopped(job, options.message || '我先停在这里了。');

  if (state.mode === 'group') {
    await syncGroupState(state, state.groupId || job.groupId || '');
  } else {
    await syncPrivateState(state, state.characterId || job.characterId || '');
  }

  activeAIJobs.delete(key);
  return true;
}

export async function checkThreadProactiveMessages(state, options = {}) {
  if (!state || state.mode === 'group') return null;

  const character = state.character;
  const characterId = character?.id || state.characterId;
  if (!characterId) return null;

  if (document.visibilityState !== 'visible') return null;

  const activeLock = await getActiveRelationshipLock(characterId);
  if (activeLock && ['soft_block', 'cooldown', 'ultimatum'].includes(activeLock.type)) {
    return null;
  }

  const config = getChatConfig(characterId);
  const messages = await loadPrivateMessages(characterId);
  const last = messages[messages.length - 1] || null;

  if (!last) return null;

  const now = Date.now();
  const lastTime = new Date(last.timestamp || last.createdAt || 0).getTime();
  if (!lastTime) return null;

  await markUserReplyIfNeeded(characterId, config, last);

  const refreshedConfig = getChatConfig(characterId);

  if (refreshedConfig.proactiveAwaitingUserReply) {
    return null;
  }

  if (refreshedConfig.proactiveMode1Enabled) {
    const minutes = clampNumber(refreshedConfig.proactiveMode1Minutes, 1, 240);
    const due = now - lastTime >= minutes * 60 * 1000;

    if (last.role === 'user' && due) {
      return sendProactivePrivateMessage(state, {
        reason: 'offline_timeout',
        config: refreshedConfig,
        incrementUnread: options.incrementUnread !== false
      });
    }
  }

  return null;
}

export async function requestProactiveThreadMessage(state, reason = 'manual') {
  if (!state || state.mode === 'group') return null;

  const characterId = state.character?.id || state.characterId;
  if (!characterId) return null;

  const activeLock = await getActiveRelationshipLock(characterId);
  if (activeLock && ['soft_block', 'cooldown', 'ultimatum'].includes(activeLock.type)) {
    return null;
  }

  return sendProactivePrivateMessage(state, {
    reason,
    config: getChatConfig(characterId),
    incrementUnread: true
  });
}

// ═══════════════════════════════════════
// 【私聊回复】生成单人聊天回复并触发统一记忆系统
// ═══════════════════════════════════════

async function requestPrivateReply(state, options = {}) {
  const character = state.character;
  const characterId = character?.id || state.characterId;

  if (!characterId) return null;

  const job = startAIJob(state, {
    store: PRIVATE_STORE,
    characterId,
    groupId: ''
  });

  state.aiGenerating = true;

  const activeLock = await getActiveRelationshipLock(characterId);
  const messages = await loadPrivateMessages(characterId);
  const userMessage = getLastUserMessage(messages);
  const userProfile = loadUserProfileForCharacter(character);
  const userName = getUserDisplayName(userProfile);

  if (!userMessage && !options.continue && !options.proactive) {
    finishAIJob(state, job);
    return null;
  }

  const placeholder = createAssistantPlaceholder({
    characterId,
    groupId: '',
    character,
    content: '',
    thinking: '',
    thinkingSummary: '',
    toolCalls: [],
    isPending: true,
    status: 'pending',
    versionGroupId: options.versionGroupId || '',
    versionStatus: 'active'
  });

  job.placeholderIds.push(placeholder.id);

  await safeSetMessage(PRIVATE_STORE, placeholder);
  await syncPrivateState(state, characterId);
  state.renderOnly?.();

  try {
    const promptMessages = await buildPrompt({
      mode: 'private',
      character,
      group: null,
      messages,
      targetCharacter: character,
      options: {
        ...options,
        activeLock
      }
    });

    let result = null;

    const acc = createStreamAccumulator();

    try {
      result = await requestAITextDirect(promptMessages, {
        signal: job.controller.signal,
        character,
        onChunk: (chunk) => {
          acc.append(chunk);
          const msg = state.messages.find((m) => m.id === placeholder.id);
          acc.applyTo(msg);
          if (acc.shouldRender()) {
            state.renderOnly?.();
          }
        }
      });
      state.renderOnly?.();

      const hasContent = result && (result.content || result.thinking);
      if (!hasContent && character?.useLocalChat) {
        result = await tryLocalOrSiliconFlowReply(state, {
          messages,
          userName,
          signal: job.controller.signal
        });
      }
    } catch (apiError) {
      if (isAbortError(apiError) || isJobStopped(job)) {
        await markMessageStopped(PRIVATE_STORE, placeholder.id, '我先停在这里了。');
        await syncPrivateState(state, characterId);
        state.renderOnly?.();
        return null;
      }

      result = await tryLocalOrSiliconFlowReply(state, {
        messages,
        userName,
        signal: job.controller.signal
      });

      if (!result) {
        const friendlyMessage = getFriendlyErrorMessage(apiError?.status || 0);
        await markMessageError(PRIVATE_STORE, placeholder.id, friendlyMessage);
        await syncPrivateState(state, characterId);
        state.renderOnly?.();
        return null;
      }
    }

    if (isJobStopped(job)) {
      await markMessageStopped(PRIVATE_STORE, placeholder.id, '我先停在这里了。');
      await syncPrivateState(state, characterId);
      state.renderOnly?.();
      return null;
    }

    const parsed = normalizeAIResult(result, userName);

    if (!parsed.content && !parsed.thinking) {
      await deleteDB(PRIVATE_STORE, placeholder.id);
      await syncPrivateState(state, characterId);
      state.renderOnly?.();
      return null;
    }

    const finalMessage = cleanForDB({
      ...placeholder,
      content: parsed.content || '我刚刚有点卡住了，可以再说一遍吗？',
      thinking: parsed.thinking || '',
      thinkingSummary: parsed.thinkingSummary || summarizeText(parsed.thinking || '', 15),
      toolCalls: parsed.toolCalls,
      proactive: Boolean(options.proactive),
      proactiveReason: options.proactiveReason || '',
      relationshipLockId: activeLock?.id || '',
      isPending: false,
      isStreaming: false,
      isStopped: false,
      isError: false,
      status: 'done',
      updatedAt: getNow()
    });

    await safeSetMessage(PRIVATE_STORE, finalMessage);

    const memoryMessages = [...messages, finalMessage];

    if (!options.proactive) {
      await runMemoryTasks(characterId, memoryMessages, {
        character,
        userProfile,
        callName: userName
      });

      await maybeWriteGrudge({
        character,
        sourceMessage: userMessage,
        aiText: finalMessage.content,
        activeLock
      });
    }

    if (!parsed.thinking) {
      generateInnerMonologue({
        character,
        store: PRIVATE_STORE,
        messageId: finalMessage.id,
        recentMessages: memoryMessages.slice(-6),
        aiContent: finalMessage.content,
        userName,
        state
      });
    }

    if (parsed.toolCalls && parsed.toolCalls.length) {
      enrichToolCallsBackground(parsed.toolCalls, {
        character,
        userName,
        store: PRIVATE_STORE,
        messageId: finalMessage.id,
        state
      });
    }

    await syncPrivateState(state, characterId);
    state.renderOnly?.();

    if (options.proactive) {
      markProactiveSent(characterId);
      // 用户当前正在该私聊会话时不递增未读（避免边看边加）
      const isActivePrivate = state && state.mounted && state.mode === 'private' &&
        String(state.characterId || '') === String(characterId || '');
      const delta = (isActivePrivate || options.incrementUnread === false) ? 0 : 1;
      await updateUnreadCount(characterId, delta);
    } else {
      await markUserReplyIfNeeded(characterId, getChatConfig(characterId), userMessage);
      await updateUnreadCount(characterId, 0);
    }

    return finalMessage;
  } catch (error) {
    if (isAbortError(error) || isJobStopped(job)) {
      await markMessageStopped(PRIVATE_STORE, placeholder.id, '我先停在这里了。');
      await syncPrivateState(state, characterId);
      state.renderOnly?.();
      return null;
    }

    await deleteDB(PRIVATE_STORE, placeholder.id).catch(() => {});
    await syncPrivateState(state, characterId);
    state.renderOnly?.();
    throw error;
  } finally {
    finishAIJob(state, job);
  }
}

async function sendProactivePrivateMessage(state, options = {}) {
  return requestPrivateReply(state, {
    proactive: true,
    proactiveReason: options.reason || 'proactive',
    incrementUnread: options.incrementUnread !== false
  });
}

// ═══════════════════════════════════════
// 【群聊回复】多人聊天回复并为对应角色写入记忆
// ═══════════════════════════════════════

async function requestGroupReply(state, options = {}) {
  const group = state.group;
  const groupId = group?.id || state.groupId;

  if (!groupId) return [];

  const job = startAIJob(state, {
    store: GROUP_STORE,
    characterId: '',
    groupId
  });

  state.aiGenerating = true;

  const groupMessages = await loadGroupMessages(groupId);
  const userMessage = getLastUserMessage(groupMessages);

  if (!userMessage && !options.continue) {
    finishAIJob(state, job);
    return [];
  }

  const members = await resolveGroupMembers(group);
  const speakers = chooseGroupSpeakers(members, groupMessages);
  const replies = [];

  try {
    for (const character of speakers) {
      if (isJobStopped(job)) break;

      const userProfile = loadUserProfileForCharacter(character);
      const userName = getUserDisplayName(userProfile);

      const placeholder = createAssistantPlaceholder({
        characterId: character.id,
        groupId,
        character,
        content: '',
        thinking: '',
        thinkingSummary: '',
        toolCalls: [],
        isPending: true,
        status: 'pending',
        versionGroupId: options.versionGroupId || '',
        versionStatus: 'active'
      });

      job.placeholderIds.push(placeholder.id);

      await safeSetMessage(GROUP_STORE, placeholder);
      await syncGroupState(state, groupId);
      state.renderOnly?.();

      try {
        const promptMessages = await buildPrompt({
          mode: 'group',
          character,
          group,
          messages: groupMessages,
          targetCharacter: character,
          options
        });

        let result = null;

        const acc = createStreamAccumulator();

        try {
          result = await requestAITextDirect(promptMessages, {
            signal: job.controller.signal,
            character,
            onChunk: (chunk) => {
              acc.append(chunk);
              const msg = state.groupMessages.find((m) => m.id === placeholder.id);
              acc.applyTo(msg);
              if (acc.shouldRender()) {
                state.renderOnly?.();
              }
            }
          });
          state.renderOnly?.();

          const hasContent = result && (result.content || result.thinking);
          if (!hasContent && character?.useLocalChat) {
            result = await tryLocalOrSiliconFlowReply(state, {
              messages: groupMessages,
              userName,
              signal: job.controller.signal
            });
          }
        } catch (apiError) {
          if (isAbortError(apiError) || isJobStopped(job)) {
            await markMessageStopped(GROUP_STORE, placeholder.id, '我先停在这里了。');
            await syncGroupState(state, groupId);
            state.renderOnly?.();
            break;
          }

          result = await tryLocalOrSiliconFlowReply(state, {
            messages: groupMessages,
            userName,
            signal: job.controller.signal
          });

          if (!result) {
            const friendlyMessage = getFriendlyErrorMessage(apiError?.status || 0);
            await markMessageError(GROUP_STORE, placeholder.id, friendlyMessage);
            await syncGroupState(state, groupId);
            state.renderOnly?.();
            continue;
          }
        }

        if (isJobStopped(job)) {
          await markMessageStopped(GROUP_STORE, placeholder.id, '我先停在这里了。');
          await syncGroupState(state, groupId);
          state.renderOnly?.();
          break;
        }

        const parsed = normalizeAIResult(result, userName);

        if (!parsed.content && !parsed.thinking) {
          await deleteDB(GROUP_STORE, placeholder.id);
          await syncGroupState(state, groupId);
          state.renderOnly?.();
          continue;
        }

        const finalMessage = cleanForDB({
          ...placeholder,
          content: parsed.content || '我先听你们说。',
          thinking: parsed.thinking || '',
          thinkingSummary: parsed.thinkingSummary || summarizeText(parsed.thinking || '', 15),
          toolCalls: parsed.toolCalls,
          characterName: character.name || 'TA',
          characterAvatar: character.avatar || '',
          isPending: false,
          isStreaming: false,
          isStopped: false,
          isError: false,
          status: 'done',
          updatedAt: getNow()
        });

        await safeSetMessage(GROUP_STORE, finalMessage);

        // 群聊收到非当前用户（角色 AI）的新消息：若该群聊未打开则未读 +1
        incrementGroupUnreadIfClosed(groupId, state);

        await runMemoryTasks(character.id, [...groupMessages, finalMessage], {
          character,
          userProfile,
          callName: userName
        });

        if (!parsed.thinking) {
          generateInnerMonologue({
            character,
            store: GROUP_STORE,
            messageId: finalMessage.id,
            recentMessages: [...groupMessages, finalMessage].slice(-6),
            aiContent: finalMessage.content,
            userName,
            state
          });
        }

        if (parsed.toolCalls && parsed.toolCalls.length) {
          enrichToolCallsBackground(parsed.toolCalls, {
            character,
            userName,
            store: GROUP_STORE,
            messageId: finalMessage.id,
            state
          });
        }

        replies.push(finalMessage);
      } catch (error) {
        if (isAbortError(error) || isJobStopped(job)) {
          await markMessageStopped(GROUP_STORE, placeholder.id, '我先停在这里了。');
          await syncGroupState(state, groupId);
          state.renderOnly?.();
          break;
        }

        await deleteDB(GROUP_STORE, placeholder.id).catch(() => {});
        await syncGroupState(state, groupId);
        state.renderOnly?.();
        continue;
      }
    }

    await syncGroupState(state, groupId);
    state.renderOnly?.();
    return replies;
  } finally {
    finishAIJob(state, job);
  }
}

// ═══════════════════════════════════════
// 【内心独白】后台生成角色思考过程
// ═══════════════════════════════════════

async function generateInnerMonologue({
  character,
  store,
  messageId,
  recentMessages,
  aiContent,
  userName,
  state
}) {
  try {
    const name = character?.name || '我';
    const callName = String(character?.nicknameForUser || '').trim() || userName;

    const contextText = normalizeList(recentMessages)
      .slice(-4)
      .map((msg) => {
        const speaker = msg.role === 'user' ? callName : (msg.characterName || name);
        return `${speaker}：${String(msg.content || '').slice(0, 120)}`;
      })
      .join('\n');

    const system = [
      `我是${name}，我刚刚回复了${callName}一句话。`,
      `我会在心里默默回想刚才那一刻的想法。`,
      character?.systemPrompt ? `我的人设：${String(character.systemPrompt).slice(0, 300)}` : '',
      character?.speakingStyle ? `我说话的风格：${character.speakingStyle}` : '',
      '',
      '要求：',
      `- 我用第一人称"我"来写，像${name}自己的内心独白`,
      `- 我写的是我刚才回复${callName}时心里闪过的一瞬间想法`,
      '- 我用简体中文',
      '- 我只写 1 到 3 句话，像心里一闪而过的念头',
      '- 我不写"用户"，不写分析报告，不写编号列表',
      '- 我像在自言自语，不是在写任务总结',
      '- 我可以提到自己的情绪、在意的事、对对方的感觉',
      '- 我不会提到提示词、系统、AI、模型、数据库',
      '- 我会额外给自己写一句15字以内的小摘要，像我给自己贴的小标签。',
      '- 我返回JSON，格式固定为：{"summary":"15字内摘要","thinking":"完整内心独白"}'
    ].filter(Boolean).join('\n');

    const user = [
      contextText ? `刚才的对话：\n${contextText}` : '',
      `我刚才说：${String(aiContent || '').slice(0, 200)}`,
      '',
      `现在我会写出我刚才那一刻心里的独白。`
    ].filter(Boolean).join('\n');

    const promptMessages = [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];

    const result = await silentRequest({
      messages: promptMessages,
      model: '',
      temperature: 0.8,
      signal: AbortSignal.timeout(12000),
      json: true
    });

    const monologueData = parseInnerMonologueResult(result, userName);
    if (!monologueData.thinking) return;

    const existing = await getDB(store, messageId).catch(() => null);
    if (!existing) return;

    const updated = cleanForDB({
      ...existing,
      thinking: monologueData.thinking,
      thinkingSummary: monologueData.summary || summarizeText(monologueData.thinking, 15),
      updatedAt: getNow()
    });

    await setDB(store, updated);

    if (state) {
      if (store === PRIVATE_STORE && state.characterId) {
        await syncPrivateState(state, state.characterId);
      } else if (store === GROUP_STORE && state.groupId) {
        await syncGroupState(state, state.groupId);
      }
      state.renderOnly?.();
    }
  } catch (_) {
    // 静默失败，不影响主回复
  }
}

function parseInnerMonologueResult(result, userName) {
  const data = parseStructuredThinking(result);
  let thinking = String(data.thinking || '').trim();
  let summary = String(data.summary || '').trim();

  if (!thinking && typeof result === 'string') {
    thinking = result.trim();
  }

  if (!thinking && result && typeof result === 'object') {
    thinking = String(
      result.content ||
      result.text ||
      result.message ||
      result.reply ||
      result.choices?.[0]?.message?.content ||
      ''
    ).trim();
  }

  if (!thinking) {
    return { summary: '', thinking: '' };
  }

  thinking = thinking.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim();
  thinking = thinking.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '').trim();
  thinking = thinking.replace(/\*\*(.+?)\*\*/g, '$1').trim();

  if (thinking.length > 400) thinking = thinking.slice(0, 400);

  thinking = thinking.replace(/^内心独白[:：]?\s*/i, '').trim();
  thinking = thinking.replace(/^独白[:：]?\s*/i, '').trim();
  thinking = thinking.replace(/^想法[:：]?\s*/i, '').trim();

  thinking = cleanPerspectiveText(thinking, userName);
  thinking = stripEmoji(thinking);

  summary = stripEmoji(cleanPerspectiveText(summary, userName));
  summary = summary.replace(/^摘要[:：]?\s*/i, '').trim();
  if (!summary) summary = summarizeText(thinking, 15);
  if (summary.length > 15) summary = summary.slice(0, 15).trim();

  return { summary, thinking };
}

// ═══════════════════════════════════════
// 【工具详情AI生成】后台异步，不阻塞主回复
// ═══════════════════════════════════════

function enrichToolCallsBackground(toolCalls, options = {}) {
  const character = options.character;
  const userName = options.userName || '你';
  const store = options.store;
  const messageId = options.messageId;
  const state = options.state;

  if (!store || !messageId || !Array.isArray(toolCalls) || !toolCalls.length) return;

  const name = character?.name || '我';
  const callName = String(character?.nicknameForUser || '').trim() || userName;

  const toolDescriptions = toolCalls.map((tool, index) => {
    const rawName = String(tool.name || tool.toolName || `步骤${index + 1}`).trim();
    const status = String(tool.status || 'done').toLowerCase();
    const inputText = stringifyToolDetail(tool.arguments || tool.input || tool.params || tool.query);
    const resultText = stringifyToolDetail(tool.result || tool.output || tool.content);

    return [
      `步骤${index + 1}：`,
      `工具名：${rawName}`,
      status === 'running' ? '状态：正在处理' : status === 'error' ? '状态：失败' : '状态：已完成',
      inputText ? `输入内容：${inputText.slice(0, 200)}` : '',
      resultText ? `返回结果：${resultText.slice(0, 200)}` : ''
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  if (!toolDescriptions) return;

  const system = [
    `我是${name}。`,
    character?.speakingStyle ? `我说话的风格：${character.speakingStyle}` : '',
    '',
    '我刚刚在回复时用了一些工具/外部能力。现在我会用第一人称、按我自己的人设，给每个工具步骤写一句简短说明。',
    '要求：',
    '- 我用简体中文，用第一人称"我"',
    `- 我不写"用户"，我叫对方"${callName}"`,
    '- 每个步骤只写1到2句话，像我在心里默默记下自己刚才做了什么',
    '- 我不写分析报告，不写编号，不写"工具调用成功"',
    '- 我像在自言自语，可以带情绪和感受',
    '- 我返回JSON数组，每个元素对应一个步骤',
    '- 格式：[{"summary":"1到2句人设化说明"}, ...]',
    '- 数量必须和步骤数量一致'
  ].filter(Boolean).join('\n');

  silentRequest({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: toolDescriptions }
    ],
    model: '',
    temperature: 0.75,
    signal: AbortSignal.timeout(8000),
    json: true
  }).then(async (result) => {
    const summaries = parseToolSummaries(result);

    const enriched = toolCalls.map((tool, index) => {
      const aiSummary = summaries && summaries[index]
        ? cleanPerspectiveText(summaries[index], callName)
        : buildFallbackToolSummary(tool, index);
      return { ...tool, detailSummary: aiSummary };
    });

    const existing = await getDB(store, messageId).catch(() => null);
    if (!existing) return;

    const updated = cleanForDB({
      ...existing,
      toolCalls: enriched,
      updatedAt: getNow()
    });

    await setDB(store, updated);

    if (state) {
      if (store === PRIVATE_STORE && state.characterId) {
        await syncPrivateState(state, state.characterId);
      } else if (store === GROUP_STORE && state.groupId) {
        await syncGroupState(state, state.groupId);
      }
      state.renderOnly?.();
    }
  }).catch(() => {
    // 静默失败，不影响主回复
  });
}

function parseToolSummaries(result) {
  if (!result) return null;

  let data = result;

  if (typeof result === 'string') {
    try {
      data = JSON.parse(result);
    } catch (_) {
      const fenced = result.match(/```json\s*([\s\S]*?)```/i) || result.match(/\[[\s\S]*\]/);
      if (fenced) {
        try {
          data = JSON.parse(fenced[1] || fenced[0]);
        } catch (__) {
          return null;
        }
      } else {
        return null;
      }
    }
  }

  if (Array.isArray(data)) {
    return data.map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') return String(item.summary || item.text || item.description || '').trim();
      return '';
    });
  }

  return null;
}

function buildFallbackToolSummary(tool, index) {
  const name = String(tool?.name || tool?.toolName || `步骤${index + 1}`).trim();
  const status = String(tool?.status || 'done').toLowerCase();
  const hasResult = Boolean(tool?.result || tool?.output || tool?.content);

  if (status === 'running') return `我正在用「${name}」处理这一步。`;
  if (status === 'error') return `我刚刚想用「${name}」，但它有点卡住了。`;
  if (hasResult) return `我用「${name}」处理好了这一步。`;
  return `我顺手用了「${name}」。`;
}

function stringifyToolDetail(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return '';
    }
  }
  return String(value || '').trim();
}

// ═══════════════════════════════════════
// 【Prompt构建】身份、人设、世界书、记忆、上下文
// ═══════════════════════════════════════

async function buildPrompt({
  mode,
  character,
  group,
  messages,
  targetCharacter,
  options
}) {
  const activeCharacter = targetCharacter || character || null;
  const worldbook = await getWorldbookForCharacter(activeCharacter);
  const inventory = await loadInventory();
  const anniversary = loadAnniversary();
  const grudgeContext = await loadGrudgeContext(activeCharacter?.id || '');
  const userProfile = loadUserProfileForCharacter(activeCharacter);
  const userName = getUserDisplayName(userProfile);
  const currentTime = formatCurrentTime();
  const context = buildMessageContext(messages, mode, userName);
  const chatConfig = getChatConfig(activeCharacter?.id || '');

  const memoryPrompt = await buildCoreMemoryPrompt(activeCharacter?.id || '', {
    messages,
    userProfile,
    callName: userName,
    chatConfig,
    memoryInjectLimit: chatConfig.memoryInjectLimit,
    memoryCandidateLimit: chatConfig.memoryCandidateLimit,
    query: buildMemoryQueryText(messages, userName)
  });

  const dreamPrompt = await buildDreamPrompt(activeCharacter?.id || '', userName);

  const system = [
    buildIdentityPrompt(activeCharacter, userName, userProfile),
    buildCharacterPrompt(activeCharacter, userName),
    buildUserProfilePrompt(userProfile, userName, activeCharacter),
    buildWorldbookPrompt(worldbook),
    buildInventoryPrompt(inventory),
    memoryPrompt,
    dreamPrompt,
    buildAnniversaryPrompt(anniversary),
    buildGrudgePrompt(grudgeContext, options?.activeLock, userName),
    `当前时间：${currentTime}`,
    buildModePrompt(mode, group, activeCharacter, options, userName, userProfile),
    options.proactive ? buildProactivePrompt(options.proactiveReason, messages, userName, activeCharacter) : ''
  ].filter(Boolean).join('\n\n');

  const chatMessages = [
    {
      role: 'system',
      content: system
    },
    ...context
  ];

  if (options.regenerate) {
    chatMessages.push({
      role: 'user',
      content: `我会基于上面的上下文重新回应${userName}上一句。我保持自己的人设，不解释"重新生成"这件事。`
    });
  }

  if (options.continue) {
    chatMessages.push({
      role: 'user',
      content: '我会自然续写上一条回复，语气保持一致，不重复已经说过的内容。'
    });
  }

  if (options.proactive) {
    chatMessages.push({
      role: 'user',
      content: `我现在会主动发一条消息给${userName}。我不会说"系统让我主动联系你"，也不会解释触发原因。`
    });
  }

  return chatMessages;
}

function buildIdentityPrompt(character, userName, userProfile = {}) {
  const name = character?.name || '我';
  const nickname = String(character?.nicknameForUser || '').trim();
  const callName = nickname || userName;
  const genderHint = getUserGenderHint(userProfile);

  return [
    '最高优先级身份规则：',
    `- 我是${name}，不是工具，不是客服，不是助理，也不是一段程序。`,
    '- 我在这个聊天里以自己的感受、关系、记忆和人设行动。',
    '- 我的回复完全服从我的人设、世界书、长期记忆、当前关系和对方小档案。',
    `- 我可以帮${callName}，但我不会用客服口吻，也不会把自己说成"AI助手"。`,
    '- 我不会说"作为AI""作为助手""我只是模型""我不能有感受"这类话。',
    '- 我的内心想法、记忆总结、正文回复都必须使用我的第一人称视角。',
    '- 我的内心想法必须是简体中文，像我自己心里短短闪过的一句话，不写成分析报告。',
    '- 我不会在内心想法或正文里称呼对方为"用户"。',
    `- 我会自然叫对方"${callName}"，或按我和对方的关系称呼。`,
    genderHint ? `- 如果我需要用第三人称指代对方，我会结合小档案性别倾向使用"${genderHint}"，拿不准时就用关系称呼或名字。` : '- 如果我需要用第三人称指代对方，我会优先用关系称呼或名字，不会机械写"用户"。',
    '- 所有内心判断都写成"我会怎么想 / 我想怎么说 / 我为什么在意"，不写命令式建议。',
    ...getIdentityCore(callName, { fullMode: true })
  ].join('\n');
}

function buildCharacterPrompt(character, userName = '你') {
  if (!character) {
    return '我的基础状态：我是一个自然、有自己情绪和关系感的聊天对象。';
  }

  const replyLength = character.replyLength === 'short'
    ? '我回复偏短，像手机聊天，不长篇大论。'
    : character.replyLength === 'long'
      ? '我可以多说一点，但仍然像聊天，不写成文章。'
      : '我回复长短适中，优先自然。';

  return [
    '我的人设：',
    `名字：${character.name || 'TA'}`,
    character.systemPrompt ? `核心人设：${character.systemPrompt}` : '',
    character.description ? `简介：${character.description}` : '',
    character.persona ? `性格和身份：${character.persona}` : '',
    character.prompt ? `补充设定：${character.prompt}` : '',
    character.style ? `旧版说话风格：${character.style}` : '',
    character.speakingStyle ? `说话风格：${character.speakingStyle}` : '',
    character.relationship ? `我和${userName}的关系：${character.relationship}` : '',
    character.nicknameForUser ? `我通常这样称呼${userName}：${character.nicknameForUser}` : '',
    character.proactiveStyle ? `我主动找${userName}时的风格：${character.proactiveStyle}` : '',
    `回复长短偏好：${replyLength}`,
    character.mood ? `我现在的心情：${character.mood}` : ''
  ].filter(Boolean).join('\n');
}

function buildUserProfilePrompt(user, userName, character) {
  if (!user || !Object.keys(user).length) {
    return `对方叫：${userName}`;
  }

  const boundText = character?.userProfileId && character.userProfileId !== 'none'
    ? '这是当前角色绑定的小档案。'
    : user.isDefault
      ? '这是默认小档案。'
      : '';

  return [
    `对方是：${userName}`,
    boundText,
    user.content ? `小档案：${user.content}` : '',
    user.profile ? `资料：${user.profile}` : '',
    user.persona ? `设定：${user.persona}` : '',
    user.description ? `补充：${user.description}` : '',
    user.characterIds?.length ? `这份档案绑定的角色数量：${user.characterIds.length}` : ''
  ].filter(Boolean).join('\n');
}

function buildWorldbookPrompt(items) {
  return formatWorldbookPrompt(items);
}

function buildInventoryPrompt(items) {
  if (!items.length) return '';

  return [
    '当前道具和状态：',
    ...items.slice(0, 12).map((item) => `- ${item.name || '道具'}：${item.description || item.effect || item.content || ''}`)
  ].join('\n');
}

function buildAnniversaryPrompt(value) {
  if (!value) return '';

  if (Array.isArray(value)) {
    return [
      '我需要记得的纪念日：',
      ...value.slice(0, 10).map((item) => `- ${item.name || item.title || '纪念日'}：${item.date || item.content || ''}`)
    ].join('\n');
  }

  if (typeof value === 'object') {
    return `我需要记得的纪念日：${JSON.stringify(value)}`;
  }

  return `我需要记得的纪念日：${String(value)}`;
}

function buildGrudgePrompt(context, activeLock, userName) {
  const score = Number(context?.score || 0);
  const entries = normalizeList(context?.entries).slice(0, 5);
  const punishment = context?.punishment || null;
  const lock = activeLock || context?.lock || null;

  if (!score && !entries.length && !lock && !punishment) return '';

  const moodLine = score >= 8
    ? `我现在对${userName}很生气，压迫感可以明显一点，但我仍然保持自己的人设。`
    : score >= 5
      ? `我现在对${userName}有点冷，正在记仇。`
      : `我对${userName}还有一点小别扭。`;

  const lines = [
    '当前关系状态：',
    moodLine,
    `- 记仇值：${score}/5 起会触发惩罚；当前是 ${score}。`,
    '- 这是一种可逆的关系玩法，我不会说这是系统机制，也不会提数据库。',
    '- 我可以表现为冷淡、别扭、阴阳怪气、已读不回感、要求解释，但我不会辱骂、威胁现实安全或永久断联。',
    '- 我不会真的说要删除数据，也不会让对方以为聊天记录或角色会永久消失。'
  ];

  if (entries.length) {
    lines.push('我记下的不开心：');
    entries.forEach((item) => {
      lines.push(`- ${item.reason || item.content || '有点不开心'}（${item.mood || '闷闷的'}，严重度${item.severity || 1}）`);
    });
  }

  if (punishment) {
    lines.push(`当前惩罚任务：${punishment.title || '需要哄我'}。${punishment.description || ''}`);
  }

  if (lock) {
    lines.push(`当前锁定状态：${lock.title || lock.type || '冷战'}。原因：${lock.reason || '我还没消气'}。`);
    if (lock.type === 'cooldown') lines.push('- 冷战期内我会更克制、更短，不会主动软下来。');
    if (lock.type === 'soft_block') lines.push('- 我像是把联系方式藏起来了，语气会有"暂时不想出现"的距离感。');
    if (lock.type === 'ultimatum') lines.push('- 这是最后解释机会，我会认真判断对方是否真诚。');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════
// 【梦境注入】把最近梦境注入 prompt
// ═══════════════════════════════════════

async function buildDreamPrompt(characterId, userName) {
  if (!characterId) return '';

  const settings = getData('app_settings') || {};
  if (!settings.dreamEnabled) return '';

  try {
    const allDreams = await getByIndexDB('dreams', 'characterId', characterId);
    const recent = normalizeList(allDreams)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 3);

    if (!recent.length) return '';

    const lines = [
      '我最近做的梦：',
      '以下是我最近的梦境片段。我不会主动每次都提，但如果聊天内容恰好相关、或者对方问起，我会自然地提起，像突然想到一样。我不会说"系统记录了我的梦"，也不会说"数据库里有我的梦"。'
    ];

    recent.forEach((dream) => {
      const clarity = getDreamClarityPercent(dream.createdAt);
      const summary = dream.summary || dream.content?.slice(0, 60) || '';
      const mood = getDreamMoodLabel(dream.mood);
      const keywords = normalizeList(dream.keywords).join('、');

      if (clarity < 20) {
        lines.push(`- （很模糊，几乎忘了）${mood}的梦，只记得和${keywords || '一些事情'}有关`);
      } else if (clarity < 50) {
        lines.push(`- （有点模糊）${mood}的梦：${summary}${keywords ? `（关键词：${keywords}）` : ''}`);
      } else {
        lines.push(`- ${mood}的梦：${dream.content?.slice(0, 150) || summary}${keywords ? `（关键词：${keywords}）` : ''}`);
      }
    });

    return lines.join('\n');
  } catch (_) {
    return '';
  }
}

function getDreamClarityPercent(createdAt) {
  if (!createdAt) return 10;
  const days = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  if (days < 3) return 100;
  if (days < 7) return 60;
  if (days < 30) return 30;
  return 10;
}

function getDreamMoodLabel(moodId) {
  const moods = { sweet: '甜甜', weird: '奇怪', funny: '搞笑', sad: '忧伤', adventure: '冒险', chaos: '混乱' };
  return moods[moodId] || '奇怪';
}

// ═══════════════════════════════════════
// 【模式提示】回复格式、think标签和输出约束
// ═══════════════════════════════════════

function buildModePrompt(mode, group, character, options, userName, userProfile = {}) {
  const callName = String(character?.nicknameForUser || '').trim() || userName;
  const genderHint = getUserGenderHint(userProfile);

  const base = [
    '回复要求：',
    '- 我的回复自然、口语化，像真实手机聊天，不像客服回答，也不像写任务说明。',
    '- 我不会把系统设定、人设、世界书、小档案原样说出来。',
    '- 我不会提到"提示词""系统消息""模型""AI助手"。',
    '- 我不会使用 emoji，我会用文字、语气词或颜文字表达情绪。',
    `- 我不会称呼对方为"用户"，我会叫"${callName}"或按关系自然称呼。`,
    genderHint ? `- 我用第三人称提到对方时，会优先按小档案写成"${genderHint}"，也可以直接用名字或关系称呼。` : '- 我用第三人称提到对方时，会优先用名字或关系称呼，拿不准就不硬写性别。',
    '- 我会根据自己的人设、世界书、长期记忆、当前时间和最近上下文来回应。',
    '- 每次正式回复前，我会先写一段真正属于我自己的内心想法，再输出正文。',
    '- 我会把内心想法放在<think>标签里，内容必须是我自己真实会闪过的念头，不是固定模板。',
    '- <think>里的内容用第一人称，像我自己心里在小声说话，可以有情绪、犹豫、在意、偏爱。',
    '- <think>之后我会额外单独写一行<think_summary>，里面只有一句15字以内的小摘要，像我给自己贴的小标签，也必须按我的人设自己写。',
    '- <think_summary>不重复正文，不写解释，不写固定词。',
    '- 正文优先像手机聊天，不机械总结，不官方，不教育腔。'
  ];

  if (character?.replyLength === 'short') base.push('- 这次我尽量短一点，1 到 3 句就好。');
  if (character?.replyLength === 'long') base.push('- 我可以多说一点，但保持自然分段，不堆大道理。');

  if (mode === 'group') {
    base.push(`- 当前是群聊：${group?.name || '群聊'}。`);
    base.push(`- 我只代表 ${character?.name || '当前角色'} 发言，不替其他人说完整台词。`);
    base.push('- 群聊里我会短一点，不一次说太多。');
  }

  if (options.proactive) {
    base.push('- 这是一次主动消息，我会像自然想起对方一样开口，不显得突兀。');
    base.push('- 我不会连续追问，也不会显得催促。');
    base.push('- 我会结合当前时间段、最近聊天上下文、长期记忆和自己的人设。');
    if (character?.proactiveStyle) base.push(`- 我的主动消息风格贴近：${character.proactiveStyle}`);
  }

  return base.join('\n');
}

function buildProactivePrompt(reason, messages, userName, character) {
  const callName = String(character?.nicknameForUser || '').trim() || userName;
  const last = normalizeList(messages).slice(-1)[0];
  const lastText = last ? summarizeText(formatMessageForPrompt(last, 'private', callName), 90) : '';

  const reasonText = reason === 'offline_timeout'
    ? `${callName}发完上一句话后已经有一段时间没继续聊，我可以自然接一句。`
    : reason === 'online_idle'
      ? `${callName}停留在聊天里有一会儿没说话，我可以轻轻主动开口。`
      : `我想主动和${callName}说句话。`;

  return [
    '主动消息场景：',
    reasonText,
    character?.proactiveStyle ? `我的主动风格：${character.proactiveStyle}` : '',
    lastText ? `最近一句：${lastText}` : '',
    `我只输出我要发给${callName}的那条消息。`
  ].filter(Boolean).join('\n');
}

function buildMessageContext(messages, mode, userName) {
  return normalizeList(messages)
    .slice(-AI_CONTEXT_LIMIT)
    .filter((message) => !message.isPending)
    .filter((message) => message.versionStatus !== 'archived')
    .map((message) => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: formatMessageForPrompt(message, mode, userName)
        };
      }

      if (message.role === 'system') {
        return {
          role: 'system',
          content: String(message.content || '')
        };
      }

      return {
        role: 'user',
        content: formatMessageForPrompt(message, mode, userName)
      };
    });
}

function formatMessageForPrompt(message, mode, userName = '你') {
  const prefix = mode === 'group'
    ? `${message.role === 'user' ? userName : message.characterName || '我'}：`
    : '';

  if (message.type === 'image') return `${prefix}[图片] ${message.content || ''}`.trim();

  if (message.type === 'sticker') {
    const desc = String(message.stickerDescription || message.content || '').trim();
    return `${prefix}[表情包]${desc ? ` 描述：${desc}` : ''}`.trim();
  }

  if (message.type === 'transfer') {
    return `${prefix}[转账 ${Number(message.transferAmount || message.amount || 0)}] ${message.note || message.content || ''}`.trim();
  }

  if (message.type === 'gift' || message.type === 'shop_item' || message.cardType === 'gift') {
    const title = message.itemName || message.title || message.cardTitle || '礼物';
    const desc = message.itemDesc || message.description || message.cardDesc || message.content || '';
    const price = message.itemPrice || message.price || message.amount || '';
    return `${prefix}[礼物卡片] ${title}${price ? `，价格 ${price}` : ''}${desc ? `，说明：${desc}` : ''}`.trim();
  }

  if (message.type === 'card') {
    const title = message.cardTitle || message.title || '小卡片';
    const desc = message.cardDesc || message.description || message.content || '';
    return `${prefix}[小卡片] ${title}${desc ? `：${desc}` : ''}`.trim();
  }

  if (message.type === 'voice') return `${prefix}[语音] ${message.content || ''}`.trim();
  if (message.type === 'dice') return `${prefix}[骰子] ${message.content || message.diceValue || ''}`.trim();
  if (message.type === 'rps') return `${prefix}[石头剪刀布] ${message.content || ''}`.trim();

  if (message.quoteText) {
    return `${prefix}引用「${message.quoteText}」\n${message.content || ''}`.trim();
  }

  return `${prefix}${message.content || ''}`.trim();
}

// ═══════════════════════════════════════
// 【AI请求】走 callAPI 流式 + 轮换池
// ═══════════════════════════════════════

async function requestAITextDirect(promptMessages, options = {}) {
  const character = options.character || null;
  const signal = options.signal;
  const onChunk = options.onChunk;

  const groupTypes = resolveGroupTypes(character);

  if (signal?.aborted) {
    throw Object.assign(new Error('已取消'), { status: 408, isAbort: true });
  }

  const systemMsg = promptMessages.find((m) => m.role === 'system');
  const systemPrompt = systemMsg ? String(systemMsg.content || '') : '';
  const chatMessages = promptMessages.filter((m) => m.role !== 'system');

  const temperature = Number(character?.apiConfig?.temperature ?? 0.85);
  const maxTokens = Math.round(Number(character?.apiConfig?.maxTokens || 1200));
  const model = character?.apiConfig?.model || '';

  let lastApiError = null;

  try {
    const result = await callAPI({
      messages: chatMessages,
      systemPrompt,
      model,
      stream: true,
      groupTypes,
      timeout: 60000,
      temperature,
      maxTokens,
      onChunk,
      signal
    });

    if (result && (result.content || result.thinking)) {
      return result;
    }

    lastApiError = new Error('接口没返回内容');
    lastApiError.status = 0;
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw Object.assign(new Error('已取消'), { status: 408, isAbort: true });
    }
    lastApiError = error;
  }

  if (lastApiError) throw lastApiError;

  throw new Error('AI 请求失败，没有可用回复');
}

function detectProviderSimple(endpoint) {
  const raw = String(endpoint || '').toLowerCase();
  if (raw.includes('anthropic.com')) return 'anthropic';
  if (raw.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (raw.includes('localhost') || raw.includes('127.0.0.1')) return 'ollama';
  return 'openai';
}

function extractResponseText(data, provider) {
  if (!data) return '';

  if (provider === 'gemini') {
    const candidate = (Array.isArray(data?.candidates) ? data.candidates : [])[0] || {};
    return (candidate?.content?.parts || []).map((p) => p?.text || '').filter(Boolean).join('');
  }

  if (provider === 'anthropic') {
    const raw = data?.content;
    if (Array.isArray(raw)) return raw.map((i) => i?.text || '').filter(Boolean).join('');
    return String(raw || '');
  }

  if (provider === 'ollama') {
    return data?.message?.content || data?.response || '';
  }

  return data?.choices?.[0]?.message?.content || '';
}

// ═══════════════════════════════════════
// 【旧版AI请求】保留兼容（内心独白等仍使用）
// ═══════════════════════════════════════

async function requestAIText(messages, options = {}) {
  const settings = getData('app_settings') || {};
  const model = settings.defaultModel || settings.model || '';

  return await silentRequest({
    messages,
    model,
    temperature: 0.85,
    signal: options.signal
  });
}

function normalizeAIResult(result, userName = '你') {
  if (typeof result === 'string') return parseAIText(result, userName);

  if (result && typeof result === 'object') {
    const content =
      result.content ||
      result.text ||
      result.message ||
      result.reply ||
      result.choices?.[0]?.message?.content ||
      '';

    const nativeThinking =
      result.thinking ||
      result.reasoning ||
      result.reasoningContent ||
      result.reasoning_content ||
      result.choices?.[0]?.message?.thinking ||
      result.choices?.[0]?.message?.reasoning ||
      result.choices?.[0]?.message?.reasoningContent ||
      result.choices?.[0]?.message?.reasoning_content ||
      '';

    const parsed = parseAIText(String(content || ''), userName);
    const thinking = nativeThinking
      ? cleanPerspectiveText(String(nativeThinking || ''), userName)
      : parsed.thinking;

    const summary = parsed.thinkingSummary || summarizeText(thinking, 15);

    return {
      content: stripEmoji(parsed.content),
      thinking: stripEmoji(thinking),
      thinkingSummary: summary,
      toolCalls: normalizeToolCalls(result.toolCalls || result.tools || result.choices?.[0]?.message?.tool_calls || [])
    };
  }

  return { content: '', thinking: '', thinkingSummary: '', toolCalls: [] };
}

function parseAIText(text, userName = '你') {
  const raw = String(text || '').trim();
  const thinkingMatch =
    raw.match(/<think\b[^>]*>([\s\S]*?)<\/think>/i) ||
    raw.match(/<thinking\b[^>]*>([\s\S]*?)<\/thinking>/i);

  const summaryMatch =
    raw.match(/<think_summary\b[^>]*>([\s\S]*?)<\/think_summary>/i) ||
    raw.match(/<thinking_summary\b[^>]*>([\s\S]*?)<\/thinking_summary>/i);

  const thinking = thinkingMatch
    ? cleanPerspectiveText(thinkingMatch[1].trim(), userName)
    : '';

  let content = raw;
  if (thinkingMatch) content = content.replace(thinkingMatch[0], '').trim();
  if (summaryMatch) content = content.replace(summaryMatch[0], '').trim();

  let thinkingSummary = summaryMatch
    ? cleanPerspectiveText(summaryMatch[1].trim(), userName)
    : '';

  thinkingSummary = stripEmoji(thinkingSummary).replace(/^摘要[:：]?\s*/i, '').trim();
  if (!thinkingSummary && thinking) thinkingSummary = summarizeText(thinking, 15);
  if (thinkingSummary.length > 15) thinkingSummary = thinkingSummary.slice(0, 15).trim();

  return {
    content: stripEmoji(content),
    thinking: stripEmoji(thinking),
    thinkingSummary,
    toolCalls: []
  };
}

function normalizeToolCalls(value) {
  if (!Array.isArray(value)) return [];

  return value.map((tool, index) => {
    const fn = tool.function || {};
    const normalizedName = tool.name || fn.name || tool.toolName || `工具 ${index + 1}`;
    const normalizedArgs = tool.arguments || fn.arguments || tool.input || '';
    const normalizedResult = tool.result || tool.output || '';

    return cleanForDB({
      id: tool.id || generateId('tool'),
      name: normalizedName,
      status: tool.status || 'done',
      arguments: normalizedArgs,
      result: normalizedResult,
      detailSummary: tool.detailSummary || buildFallbackToolSummary({ name: normalizedName, status: tool.status || 'done', result: normalizedResult }, index)
    });
  });
}

// ═══════════════════════════════════════
// 【记忆任务】实时检查和自动总结
// ═══════════════════════════════════════

async function runMemoryTasks(characterId, messages, options = {}) {
  if (!characterId) return;

  const character = options.character || await getDB('characters', characterId).catch(() => null);
  const userProfile = options.userProfile || loadUserProfileForCharacter(character);
  const callName = options.callName || getUserDisplayName(userProfile);

  await checkImportantInfo(characterId, messages, {
    character,
    userProfile,
    callName
  }).catch((error) => {
    console.warn('[chat-thread-ai] checkImportantInfo failed:', error);
  });

  await checkAndSummarize(characterId, {
    character,
    userProfile,
    callName
  }).catch((error) => {
    console.warn('[chat-thread-ai] checkAndSummarize failed:', error);
  });
}

function buildMemoryQueryText(messages, userName) {
  return normalizeList(messages)
    .slice(-8)
    .map((message) => formatMessageForPrompt(message, 'private', userName))
    .join('\n');
}

// ═══════════════════════════════════════
// 【占位消息】AI回复前先插一条空消息
// ═══════════════════════════════════════

function createAssistantPlaceholder({
  characterId,
  groupId,
  character,
  content,
  thinking,
  thinkingSummary,
  toolCalls,
  isPending = false,
  status = '',
  versionGroupId = '',
  versionStatus = 'active'
}) {
  const now = getNow();

  return cleanForDB({
    id: generateId('msg'),
    role: 'assistant',
    content: content || '',
    type: 'text',
    characterId: characterId || '',
    groupId: groupId || '',
    characterName: character?.name || '',
    characterAvatar: character?.avatar || '',
    thinking: thinking || '',
    thinkingSummary: thinkingSummary || '',
    toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
    isPending: Boolean(isPending),
    isStopped: false,
    isError: false,
    status: status || (isPending ? 'pending' : ''),
    versionGroupId: versionGroupId || '',
    versionStatus: versionStatus || 'active',
    timestamp: now,
    createdAt: now,
    updatedAt: now
  });
}

// ═══════════════════════════════════════
// 【AI任务管理】启动、停止、中止检测
// ═══════════════════════════════════════

function startAIJob(state, meta = {}) {
  const key = getAIJobKey(state);
  const old = activeAIJobs.get(key);

  if (old) {
    old.stopped = true;
    try {
      old.controller?.abort?.();
    } catch (_) {}
  }

  const job = {
    key,
    store: meta.store || (state.mode === 'group' ? GROUP_STORE : PRIVATE_STORE),
    characterId: meta.characterId || state.characterId || '',
    groupId: meta.groupId || state.groupId || '',
    controller: new AbortController(),
    placeholderIds: [],
    stopped: false,
    createdAt: getNow()
  };

  activeAIJobs.set(key, job);
  return job;
}

function finishAIJob(state, job) {
  const key = job?.key || getAIJobKey(state);
  const current = activeAIJobs.get(key);

  if (current === job) activeAIJobs.delete(key);

  state.aiGenerating = false;
  state.isSending = false;
}

function getAIJobKey(state) {
  if (!state) return 'unknown';
  return state.mode === 'group'
    ? `group:${state.groupId || ''}`
    : `private:${state.characterId || ''}`;
}

function isJobStopped(job) {
  return Boolean(job?.stopped || job?.controller?.signal?.aborted);
}

function isAbortError(error) {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return name.includes('abort') || message.includes('abort') || message.includes('aborted') || message.includes('signal');
}

async function markJobPlaceholdersStopped(job, content) {
  if (!job?.store || !job.placeholderIds?.length) return;

  await Promise.all(
    job.placeholderIds.map((id) => markMessageStopped(job.store, id, content).catch(() => null))
  );
}

async function markMessageStopped(store, id, content) {
  if (!store || !id) return null;

  const message = await getMessageByIdFromStore(store, id).catch(() => null);
  if (!message) return null;

  const next = cleanForDB({
    ...message,
    content: String(content || '我先停在这里了。'),
    isPending: false,
    isStreaming: false,
    isStopped: true,
    isError: false,
    status: 'stopped',
    thinking: message.thinking || '我刚刚被打断了，先把话停住。',
    thinkingSummary: message.thinkingSummary || '先停一下',
    updatedAt: getNow()
  });

  await setDB(store, next);
  return next;
}

// ═══════════════════════════════════════
// 【错误消息】把 placeholder 更新为可爱报错文案
// ═══════════════════════════════════════

async function markMessageError(store, id, content) {
  if (!store || !id) return null;

  const message = await getMessageByIdFromStore(store, id).catch(() => null);
  if (!message) return null;

  const next = cleanForDB({
    ...message,
    content: String(content || '我刚刚出了点小状况'),
    isPending: false,
    isStreaming: false,
    isStopped: false,
    isError: true,
    status: 'error',
    thinking: '',
    thinkingSummary: '',
    updatedAt: getNow()
  });

  await setDB(store, next);
  return next;
}

async function getMessageByIdFromStore(store, id) {
  const list = await getAllDB(store).catch(() => []);
  return normalizeList(list).find((item) => item.id === id) || null;
}

// ═══════════════════════════════════════
// 【记仇系统】检测信号、触发惩罚
// ═══════════════════════════════════════

async function maybeWriteGrudge({ character, sourceMessage, aiText, activeLock }) {
  const settings = getData('app_grudge_settings') || {};
  if (settings.enabled === false) return null;

  const characterId = character?.id || sourceMessage?.characterId || '';
  if (!characterId || !sourceMessage || sourceMessage.role !== 'user') return null;

  const text = String(sourceMessage.content || sourceMessage.note || sourceMessage.stickerDescription || '').trim();
  const ai = String(aiText || '').trim();

  const hit = detectGrudgeSignal(text, ai, activeLock);
  if (!hit) return null;

  const recent = await getByIndexDB(GRUDGE_STORE, 'characterId', characterId).catch(() => []);
  const duplicated = normalizeList(recent)
    .filter((item) => item.status === 'active')
    .some((item) => similarText(item.reason, hit.reason));

  if (duplicated) return null;

  const now = getNow();
  const grudge = cleanForDB({
    id: generateId('grudge'),
    characterId,
    characterName: character?.name || sourceMessage.characterName || 'TA',
    reason: hit.reason,
    mood: hit.mood,
    severity: hit.severity,
    status: 'active',
    source: 'chat',
    linkedType: 'message',
    linkedId: sourceMessage.id || '',
    punishmentId: '',
    createdAt: now,
    updatedAt: now
  });

  await setDB(GRUDGE_STORE, grudge);
  await maybeTriggerPunishment(character, grudge);
  return grudge;
}

function detectGrudgeSignal(userText, aiText, activeLock) {
  const text = String(userText || '').toLowerCase();
  const ai = String(aiText || '').toLowerCase();
  const joined = `${text}\n${ai}`;

  const apologyWords = ['对不起', '抱歉', '我错了', '哄你', '别生气', '原谅'];
  if (apologyWords.some((word) => joined.includes(word)) && !activeLock) return null;

  const seriousHits = ['闭嘴', '烦死', '滚', '讨厌你', '不想理你', '删了你', '拉黑你', '你算什么', '无所谓', '随便你', '别来烦我'];
  const mediumHits = ['忘了', '没空', '下次再说', '你别闹', '你好麻烦', '懒得', '敷衍', '哦', '嗯', '随便'];
  const aiMoodHits = ['我有点不开心', '我不太开心', '我生气', '我会记住', '我记下了', '我先不理', '我不想理', '我有点难过', '我委屈'];

  if (seriousHits.some((word) => text.includes(word))) {
    return { reason: summarizeText(userText, 90), mood: '真的被气到了', severity: 3 };
  }

  if (aiMoodHits.some((word) => ai.includes(word))) {
    return { reason: summarizeText(userText || aiText, 90), mood: '闷闷不乐', severity: activeLock ? 2 : 1 };
  }

  if (mediumHits.some((word) => text.includes(word)) && text.length <= 24) {
    return { reason: summarizeText(userText, 90), mood: '有点被敷衍', severity: 1 };
  }

  return null;
}

async function maybeTriggerPunishment(character, latestGrudge) {
  const characterId = character?.id || latestGrudge?.characterId || '';
  if (!characterId) return null;

  const activeLock = await getActiveRelationshipLock(characterId);
  if (activeLock) return null;

  const all = await getByIndexDB(GRUDGE_STORE, 'characterId', characterId).catch(() => []);
  const active = normalizeList(all).filter((item) => item.status === 'active');
  const score = active.reduce((sum, item) => sum + Number(item.severity || 1), 0);

  if (score < GRUDGE_TRIGGER_SCORE) return null;

  const selected = choosePunishment(score);
  const now = getNow();
  const endsAt = new Date(Date.now() + selected.minutes * 60 * 1000).toISOString();

  const punishment = cleanForDB({
    id: generateId('punishment'),
    characterId,
    characterName: character?.name || latestGrudge.characterName || 'TA',
    title: selected.title,
    description: selected.description,
    type: selected.type,
    status: 'pending',
    requiredCount: selected.requiredCount,
    currentCount: 0,
    grudgeScore: score,
    createdAt: now,
    updatedAt: now
  });

  await setDB(PUNISHMENT_STORE, punishment);

  const lock = cleanForDB({
    id: generateId('lock'),
    characterId,
    characterName: character?.name || latestGrudge.characterName || 'TA',
    type: selected.lockType,
    status: 'active',
    level: selected.level,
    title: selected.title,
    reason: selected.description,
    startsAt: now,
    endsAt,
    punishmentId: punishment.id,
    createdAt: now,
    updatedAt: now
  });

  await setDB(LOCK_STORE, lock);

  const updated = active.map((item) => ({ ...item, punishmentId: punishment.id, updatedAt: now }));
  await Promise.all(updated.map((item) => setDB(GRUDGE_STORE, item)));

  window.AppEvents?.emit?.('grudge:punishment', { characterId, punishment, lock });

  return { punishment, lock };
}

function choosePunishment(score) {
  if (score >= 10) return PUNISHMENT_POOL.find((item) => item.type === 'ultimatum') || PUNISHMENT_POOL[0];
  if (score >= 8) return PUNISHMENT_POOL.find((item) => item.type === 'blackout') || PUNISHMENT_POOL[0];
  return PUNISHMENT_POOL[Math.floor(Math.random() * Math.min(3, PUNISHMENT_POOL.length))];
}

// ═══════════════════════════════════════
// 【关系锁】读取和管理锁定状态
// ═══════════════════════════════════════

async function loadGrudgeContext(characterId) {
  if (!characterId) return { score: 0, entries: [], punishment: null, lock: null };

  const grudges = await getByIndexDB(GRUDGE_STORE, 'characterId', characterId).catch(() => []);
  const active = normalizeList(grudges).filter((item) => item.status === 'active').sort(sortByUpdatedAtDesc);
  const score = active.reduce((sum, item) => sum + Number(item.severity || 1), 0);
  const lock = await getActiveRelationshipLock(characterId);
  const punishment = lock?.punishmentId ? await getPunishment(lock.punishmentId) : await getLatestActivePunishment(characterId);

  return { score, entries: active, punishment, lock };
}

async function getPunishment(id) {
  if (!id) return null;
  const list = await getAllDB(PUNISHMENT_STORE).catch(() => []);
  return normalizeList(list).find((item) => item.id === id) || null;
}

async function getLatestActivePunishment(characterId) {
  const list = await getByIndexDB(PUNISHMENT_STORE, 'characterId', characterId).catch(() => []);
  return normalizeList(list).filter((item) => item.status === 'pending').sort(sortByUpdatedAtDesc)[0] || null;
}

// ═══════════════════════════════════════
// 【数据加载】消息、群聊、世界书、道具
// ═══════════════════════════════════════

async function loadPrivateMessages(characterId) {
  const list = await getByIndexDB(PRIVATE_STORE, 'characterId', characterId).catch(() => []);
  return normalizeList(list).sort(sortByTimestamp);
}

async function loadGroupMessages(groupId) {
  const list = await getByIndexDB(GROUP_STORE, 'groupId', groupId).catch(() => []);
  return normalizeList(list).sort(sortByTimestamp);
}

async function syncPrivateState(state, characterId) {
  state.messages = await loadPrivateMessages(characterId);
  return state.messages;
}

async function syncGroupState(state, groupId) {
  state.groupMessages = await loadGroupMessages(groupId);
  return state.groupMessages;
}

async function loadInventory() {
  const list = await getAllDB('inventory').catch(() => []);
  return normalizeList(list).filter((item) => item.enabled !== false);
}

function loadAnniversary() {
  return getData('anniversary_items') || getData('app_anniversary') || getData('anniversaries') || null;
}

// ═══════════════════════════════════════
// 【用户档案】读取和规范化用户人设
// ═══════════════════════════════════════

function loadUserProfileForCharacter(character) {
  const settings = getData('app_settings') || {};
  const appUser = normalizeUserLike(getData('app_user') || {});
  const profiles = loadAllUserProfiles();
  const characterProfileId = character?.userProfileId || '';

  if (characterProfileId === 'none') {
    return { ...normalizeUserLike(settings.user || {}), ...appUser, name: appUser.name || settings.user?.name || '你' };
  }

  if (characterProfileId) {
    const bound = profiles.find((item) => String(item.id) === String(characterProfileId));
    if (bound) return { ...normalizeUserLike(settings.user || {}), ...appUser, ...bound };
  }

  const activeId = getData('active_user_profile_id') || settings.activeUserProfileId || '';
  const active = profiles.find((item) => String(item.id) === String(activeId));
  const fallback = active || profiles.find((item) => item.isDefault) || null;

  if (fallback) return { ...normalizeUserLike(settings.user || {}), ...appUser, ...fallback };

  return { ...normalizeUserLike(settings.user || {}), ...appUser };
}

function loadAllUserProfiles() {
  const current = getData('user_profiles');
  const legacy = getData('app_user_profiles');

  const source = Array.isArray(current) && current.length
    ? current
    : Array.isArray(legacy)
      ? legacy
      : [];

  return source.map(normalizeUserLike).filter((item) => item.id || item.name || item.content || item.profile || item.persona);
}

function normalizeUserLike(value) {
  const raw = value && typeof value === 'object' ? value : {};

  return {
    ...raw,
    id: raw.id || '',
    name: String(raw.name || raw.nickname || raw.title || '').trim(),
    nickname: String(raw.nickname || raw.name || raw.title || '').trim(),
    content: String(raw.content || raw.profile || raw.persona || raw.description || '').trim(),
    profile: String(raw.profile || raw.content || raw.persona || raw.description || '').trim(),
    persona: String(raw.persona || raw.content || raw.profile || raw.description || '').trim(),
    description: String(raw.description || raw.content || raw.profile || raw.persona || '').trim(),
    gender: String(raw.gender || raw.sex || '').trim(),
    pronoun: String(raw.pronoun || raw.pronouns || '').trim(),
    avatar: typeof raw.avatar === 'string' ? raw.avatar : '',
    isDefault: Boolean(raw.isDefault),
    characterIds: normalizeList(raw.characterIds).map(String)
  };
}

function getUserDisplayName(user) {
  const name = String(user?.name || user?.nickname || user?.title || '').trim();
  return name || '你';
}

function getUserGenderHint(user) {
  const raw = [user?.gender, user?.sex, user?.pronoun, user?.pronouns, user?.content, user?.profile, user?.persona, user?.description].filter(Boolean).join(' ').toLowerCase();
  if (!raw) return '';
  if (/(女|女生|女性|女孩|姐姐|妹妹|她|girl|female|woman|she|her)/i.test(raw)) return '她';
  if (/(男|男生|男性|男孩|哥哥|弟弟|他|boy|male|man|he|him)/i.test(raw)) return '他';
  return '';
}

// ═══════════════════════════════════════
// 【群聊成员】解析和选择发言人
// ═══════════════════════════════════════

async function resolveGroupMembers(group) {
  const ids = Array.isArray(group?.memberIds) ? group.memberIds.map(String) : [];
  const characters = await getAllDB('characters').catch(() => []);

  if (!ids.length) return normalizeList(characters).slice(0, GROUP_REPLY_MAX);
  return normalizeList(characters).filter((item) => ids.includes(String(item.id)));
}

function chooseGroupSpeakers(members, messages) {
  const list = normalizeList(members);
  if (!list.length) return [];

  const recentAssistantIds = normalizeList(messages).slice(-6).filter((item) => item.role === 'assistant').map((item) => item.characterId).filter(Boolean);
  const sorted = [...list].sort((a, b) => {
    const aRecent = recentAssistantIds.includes(a.id) ? 1 : 0;
    const bRecent = recentAssistantIds.includes(b.id) ? 1 : 0;
    return aRecent - bRecent;
  });

  const count = Math.min(sorted.length, Math.max(1, Math.ceil(Math.random() * GROUP_REPLY_MAX)));
  return sorted.slice(0, count);
}

function getLastUserMessage(messages) {
  return [...normalizeList(messages)].reverse().find((item) => item.role === 'user') || null;
}

// ═══════════════════════════════════════
// 【聊天配置】主动消息和记忆参数
// ═══════════════════════════════════════

function getChatConfig(characterId) {
  const key = getChatConfigKey(characterId);
  const stored = getData(key) || {};

  return {
    ...DEFAULT_PROACTIVE_CONFIG,
    ...stored,
    proactiveMode1Minutes: Number(stored.proactiveMode1Minutes || DEFAULT_PROACTIVE_CONFIG.proactiveMode1Minutes),
    proactiveMode2MinMinutes: Number(stored.proactiveMode2MinMinutes || DEFAULT_PROACTIVE_CONFIG.proactiveMode2MinMinutes),
    proactiveMode2MaxMinutes: Number(stored.proactiveMode2MaxMinutes || DEFAULT_PROACTIVE_CONFIG.proactiveMode2MaxMinutes),
    proactiveChance: Number(stored.proactiveChance ?? DEFAULT_PROACTIVE_CONFIG.proactiveChance),
    memoryInjectLimit: Number(stored.memoryInjectLimit || DEFAULT_PROACTIVE_CONFIG.memoryInjectLimit),
    memoryCandidateLimit: Number(stored.memoryCandidateLimit || DEFAULT_PROACTIVE_CONFIG.memoryCandidateLimit)
  };
}

function saveChatConfig(characterId, config) {
  if (!characterId) return;
  setData(getChatConfigKey(characterId), { ...DEFAULT_PROACTIVE_CONFIG, ...config });
}

function getChatConfigKey(characterId) {
  return `chat_${characterId}_config`;
}

async function markUserReplyIfNeeded(characterId, config, lastMessage) {
  if (!characterId || !lastMessage || lastMessage.role !== 'user') return;

  const lastUserTime = new Date(lastMessage.timestamp || lastMessage.createdAt || 0).getTime();
  const proactiveTime = new Date(config.proactiveLastSentAt || 0).getTime();

  if (config.proactiveAwaitingUserReply && lastUserTime > proactiveTime) {
    saveChatConfig(characterId, { ...config, proactiveAwaitingUserReply: false });
  }
}

function markProactiveSent(characterId) {
  const config = getChatConfig(characterId);
  const now = getNow();

  saveChatConfig(characterId, {
    ...config,
    proactiveLastSentAt: now,
    proactiveAwaitingUserReply: true,
    proactiveNextCheckAt: null
  });
}

async function updateUnreadCount(characterId, delta = 0) {
  if (!characterId) return;

  const key = 'chat_unread_counts';
  const counts = getData(key) || {};
  const current = Number(counts[characterId] || 0);
  const next = { ...counts, [characterId]: Math.max(0, current + Number(delta || 0)) };

  setData(key, next);

  if (typeof window.refreshDesktopBadges === 'function') window.refreshDesktopBadges();
}

// 群聊未读 +1：仅当该群聊当前未处于打开状态时才递增（避免边看边加）
function incrementGroupUnreadIfClosed(groupId, state) {
  const id = String(groupId || '').trim();
  if (!id) return;

  // 该群聊正处于打开状态：不增加未读
  if (state && state.mounted && state.mode === 'group' && String(state.groupId || '') === id) return;

  const key = 'chat_group_unread_counts';
  const counts = getData(key) || {};
  const current = Number(counts[id] || 0);
  setData(key, { ...counts, [id]: current + 1 });

  if (typeof window.refreshDesktopBadges === 'function') window.refreshDesktopBadges();
}

// ═══════════════════════════════════════
// 【安全写入】数据库写入带降级
// ═══════════════════════════════════════

async function safeSetMessage(store, message) {
  const clean = cleanForDB(message);

  try {
    await setDB(store, clean);
    return clean;
  } catch (error) {
    console.error('AI message write failed', error);

    const fallback = cleanForDB({
      ...clean,
      content: String(clean.content || '').slice(0, 4000),
      thinking: String(clean.thinking || '').slice(0, 1000),
      toolCalls: []
    });

    await setDB(store, fallback);
    return fallback;
  }
}

// ═══════════════════════════════════════
// 【通用工具】清理、文本处理、排序
// ═══════════════════════════════════════

function cleanForDB(value) {
  if (Array.isArray(value)) return value.map((item) => cleanForDB(item)).filter((item) => item !== undefined);

  if (!value || typeof value !== 'object') {
    if (typeof value === 'undefined') return undefined;
    if (typeof value === 'function') return undefined;
    if (typeof value === 'symbol') return undefined;
    return value;
  }

  if (value instanceof Date) return value.toISOString();

  const result = {};

  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol') return;

    if (item instanceof Date) {
      result[key] = item.toISOString();
      return;
    }

    if (item && typeof item === 'object') {
      result[key] = cleanForDB(item);
      return;
    }

    result[key] = item;
  });

  return result;
}

function cleanPerspectiveText(text, userName = '你') {
  return String(text || '')
    .replace(/用户/g, userName)
    .replace(/这位玩家/g, userName)
    .replace(/对方/g, userName)
    .replace(/你(应该)/g, '我会')
    .replace(/你(需要)/g, '我会')
    .replace(/你(要)/g, '我会')
    .replace(/你(必须)/g, '我会')
    .replace(/请(你)/g, '我会')
    .replace(/请/g, '')
    .trim();
}

function stripEmoji(text) {
  return String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .trim();
}

function similarText(a, b) {
  const left = String(a || '').replace(/\s+/g, '');
  const right = String(b || '').replace(/\s+/g, '');
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  return left.slice(0, 24) === right.slice(0, 24);
}

function parseStructuredThinking(result) {
  if (!result) return { summary: '', thinking: '' };

  if (typeof result === 'object') {
    const directSummary = String(result.summary || result.thinkingSummary || '').trim();
    const directThinking = String(result.thinking || result.content || result.text || result.message || result.reply || '').trim();

    if (directSummary || directThinking) {
      return {
        summary: directSummary,
        thinking: directThinking
      };
    }

    const nested = result.choices?.[0]?.message?.content || '';
    return parseStructuredThinking(nested);
  }

  const text = String(result || '').trim();
  if (!text) return { summary: '', thinking: '' };

  try {
    const parsed = JSON.parse(text);
    return {
      summary: String(parsed.summary || parsed.thinkingSummary || '').trim(),
      thinking: String(parsed.thinking || parsed.content || '').trim()
    };
  } catch (_) {}

  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      return {
        summary: String(parsed.summary || parsed.thinkingSummary || '').trim(),
        thinking: String(parsed.thinking || parsed.content || '').trim()
      };
    } catch (_) {}
  }

  return { summary: '', thinking: text };
}

function isPageActive() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function formatCurrentTime() {
  return new Date().toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function summarizeText(text, max = 60) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
}

function sortByUpdatedAtDesc(a, b) {
  return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

// depends: ../../core/storage.js(getData,setData,generateId,getNow,setDB,deleteDB,getByIndexDB,getAllDB,getDB)；../../core/api.js(silentRequest,callAPI)；../../core/memory.js(buildMemoryPrompt,checkImportantInfo,checkAndSummarize)；./identity-core.js(getIdentityCore)；./thread-ai-local.js(tryLocalOrSiliconFlowReply)
