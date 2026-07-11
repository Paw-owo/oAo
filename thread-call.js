// apps/chat/thread-call.js
// imports:
//   from '../../core/storage.js': generateId, getNow, setDB, getByIndexDB
//   from '../../core/ui.js': createIcon, showToast
//   from '../../core/api.js': silentRequest
//   from '../../core/tts.js': playTTS, stopAll

import {
  generateId,
  getNow,
  setDB,
  getByIndexDB
} from '../../core/storage.js';

import { createIcon, showToast } from '../../core/ui.js';
import { silentRequest } from '../../core/api.js';
import { playTTS, stopAll } from '../../core/tts.js';
import { addMemory } from '../../core/memory.js';
import { getWorldbookForCharacter } from '../worldbook.js';
import { formatWorldbookPrompt } from '../../core/worldbook-prompt.js';
import { getActiveRelationshipLock } from './thread-relationship.js';

const CALL_STYLE_ID = 'chat-thread-call-style';

const callState = {
  rootEl: null,
  hostEl: null,
  threadState: null,
  close: null,
  onReject: null,
  mounted: false,
  incoming: false,
  accepted: false,
  character: null,
  characterId: '',
  callLogs: [],
  startedAt: 0,
  timer: null,
  seconds: 0,
  isSending: false,
  isEnding: false,
  activeLock: null,
  worldbookItems: []
};

export async function mountThreadCall(containerEl, options = {}) {
  callState.rootEl = containerEl;
  callState.threadState = options.state || null;
  callState.close = typeof options.close === 'function' ? options.close : null;
  callState.onReject = typeof options.onReject === 'function' ? options.onReject : null;
  callState.incoming = Boolean(options.incoming);
  callState.accepted = !callState.incoming;
  callState.character = callState.threadState?.character || options.character || null;
  callState.characterId = callState.character?.id || callState.threadState?.characterId || options.characterId || '';
  callState.callLogs = [];
  callState.startedAt = Date.now();
  callState.seconds = 0;
  callState.isSending = false;
  callState.isEnding = false;
  callState.activeLock = null;
  callState.worldbookItems = [];
  callState.mounted = true;

  // 预载关系锁和世界书，对齐私聊 thread-ai 的处理方式
  callState.activeLock = await getActiveRelationshipLock(callState.characterId).catch(() => null);
  callState.worldbookItems = await getWorldbookForCharacter(callState.character).catch(() => []);

  injectStyle();
  renderCall();

  if (!callState.incoming) {
    startTimer();
    speakOpening();
  }
}

export function unmountThreadCall() {
  callState.mounted = false;
  stopTimer();
  stopAll();

  if (callState.hostEl) {
    callState.hostEl.remove();
  }

  callState.rootEl = null;
  callState.hostEl = null;
  callState.threadState = null;
  callState.close = null;
  callState.onReject = null;
  callState.incoming = false;
  callState.accepted = false;
  callState.character = null;
  callState.characterId = '';
  callState.callLogs = [];
  callState.startedAt = 0;
  callState.seconds = 0;
  callState.isSending = false;
  callState.isEnding = false;
  callState.activeLock = null;
  callState.worldbookItems = [];
}

function renderCall() {
  if (!callState.mounted) return;

  if (callState.hostEl) {
    callState.hostEl.remove();
  }

  const host = el('section', `chat-call-screen ${callState.accepted ? 'accepted' : 'incoming'}`);
  callState.hostEl = host;

  const top = el('header', 'chat-call-top');
  top.append(
    el('div', 'chat-call-status', callState.accepted ? '通话中' : '来电'),
    el('div', 'chat-call-time', callState.accepted ? formatDuration(callState.seconds) : '等待接听')
  );

  const center = el('main', 'chat-call-center');
  center.append(
    createCallAvatar(),
    el('div', 'chat-call-name', getCharacterName()),
    el('div', 'chat-call-subtitle', getCallSubtitle())
  );

  if (callState.accepted) {
    center.appendChild(createCallLogList());
  } else {
    center.appendChild(createIncomingHint());
  }

  host.append(top, center);

  if (callState.accepted) {
    host.append(createCallInput(), createCallControls());
  } else {
    host.append(createIncomingControls());
  }

  document.body.appendChild(host);
  scrollLogToBottom();
}

function createCallAvatar() {
  const avatar = el('div', 'chat-call-avatar');
  const src = callState.character?.avatar || '';

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(getCharacterName());
  }

  return avatar;
}

function createIncomingHint() {
  const wrap = el('section', 'chat-call-incoming-hint');
  wrap.append(
    el('div', 'chat-call-incoming-title', `${getCharacterName()} 想和你通话`),
    el('div', 'chat-call-incoming-desc', '你可以接起来，也可以先拒绝。')
  );
  return wrap;
}

function createCallLogList() {
  const wrap = el('section', 'chat-call-log');

  const latest = callState.callLogs.slice(-8);

  if (!latest.length) {
    wrap.appendChild(el('div', 'chat-call-empty', '电话接通了，先轻轻说一句吧。'));
    return wrap;
  }

  latest.forEach((item) => {
    const row = el('article', `chat-call-line role-${item.role}`);
    row.append(
      el('div', 'chat-call-line-author', item.role === 'user' ? '我' : getCharacterName()),
      el('div', 'chat-call-line-text', item.content)
    );
    wrap.appendChild(row);
  });

  if (callState.isSending) {
    const typing = el('article', 'chat-call-line role-assistant typing');
    typing.append(
      el('div', 'chat-call-line-author', getCharacterName()),
      el('div', 'chat-call-line-text', '正在听你说...')
    );
    wrap.appendChild(typing);
  }

  return wrap;
}

function createCallInput() {
  const form = el('form', 'chat-call-input-wrap');

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-call-input';
  textarea.rows = 1;
  textarea.placeholder = '和 TA 说话';
  textarea.disabled = callState.isSending || callState.isEnding;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('spellcheck', 'false');
  textarea.setAttribute('enterkeyhint', 'send');

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(120, textarea.scrollHeight)}px`;
  });

  textarea.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await sendCallText(textarea);
    }
  });

  const send = el('button', 'chat-call-send');
  send.type = 'submit';
  send.disabled = callState.isSending || callState.isEnding;
  send.append(createIcon('send', 16), el('span', '', callState.isSending ? '等待' : '发送'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendCallText(textarea);
  });

  form.append(textarea, send);
  return form;
}

function createIncomingControls() {
  const controls = el('footer', 'chat-call-controls incoming');

  const reject = controlButton('x', '拒绝');
  reject.classList.add('ghost');
  reject.addEventListener('click', () => rejectIncomingCall());

  const accept = controlButton('phone', '接听');
  accept.classList.add('primary');
  accept.addEventListener('click', () => acceptIncomingCall());

  controls.append(reject, accept);
  return controls;
}

function createCallControls() {
  const controls = el('footer', 'chat-call-controls');

  const mute = controlButton('volume', '停止朗读');
  mute.disabled = callState.isEnding;
  mute.addEventListener('click', () => {
    stopAll();
    showToast('已停止朗读');
  });

  const end = controlButton('phone', callState.isEnding ? '正在挂断' : '挂断');
  end.classList.add('danger');
  end.disabled = callState.isEnding;
  end.addEventListener('click', () => endCall());

  controls.append(mute, end);
  return controls;
}

function controlButton(iconName, text) {
  const button = el('button', 'chat-call-control');
  button.type = 'button';
  button.append(createIcon(iconName, 18), el('span', '', text));
  return button;
}

function acceptIncomingCall() {
  if (!callState.mounted || callState.accepted) return;

  callState.accepted = true;
  callState.startedAt = Date.now();
  callState.seconds = 0;

  renderCall();
  startTimer();
  speakOpening();
}

function rejectIncomingCall() {
  stopAll();

  // 先保存回调引用和角色信息，再清空状态
  const rejectFn = callState.onReject;
  const closeFn = callState.close;
  const savedCharacterId = callState.characterId;
  const savedCharacter = callState.character;

  unmountThreadCall();

  if (typeof rejectFn === 'function') {
    rejectFn({
      characterId: savedCharacterId,
      character: savedCharacter
    });
  }

  if (typeof closeFn === 'function') {
    closeFn();
  }
}

function speakOpening() {
  let content = callState.incoming ? `你接起来了，我在。` : `电话接通了，我在。`;

  // 关系锁严格状态下，开场也降级，对齐私聊的冷淡/距离感
  if (isStrictLockActive()) {
    const lock = callState.activeLock;
    if (lock?.type === 'soft_block') {
      content = `……你怎么打过来了。我还没准备好说话。`;
    } else if (lock?.type === 'cooldown') {
      content = `电话接了。但我现在不想多说。`;
    } else if (lock?.type === 'ultimatum') {
      content = `你只剩这一次机会说清楚。我在听。`;
    }
  }

  addCallLog('assistant', content);
  renderCall();
  speakText(content);
}

async function sendCallText(textarea) {
  const content = String(textarea.value || '').trim();

  if (!content || callState.isSending || callState.isEnding || !callState.accepted) return;

  callState.isSending = true;
  textarea.value = '';
  textarea.style.height = 'auto';

  addCallLog('user', content);
  renderCall();

  try {
    const reply = await requestCallReply();
    if (reply) {
      addCallLog('assistant', reply);
      renderCall();
      speakText(reply);
    }
  } catch (error) {
    console.error(error);
    showToast('TA 刚刚没听清，再说一次试试');
  } finally {
    callState.isSending = false;
    renderCall();
  }
}

// ═══════════════════════════════════════
// 【AI回复请求】构建电话对话上下文
// ═══════════════════════════════════════

async function requestCallReply() {
  const messages = buildCallMessages();

  let content = '';

  try {
    content = await silentRequest({
      messages,
      temperature: 0.85,
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    console.error('[thread-call] reply failed', error);
    return '';
  }

  const text = String(content || '').trim();

  if (!text) return '';

  return cleanReply(text);
}

// ═══════════════════════════════════════
// 【Prompt构建】第一人称系统指令
// ═══════════════════════════════════════

function buildCallMessages() {
  const name = getCharacterName();
  const callName = String(callState.character?.nicknameForUser || '').trim() || '对方';

  const system = [
    `我正在和${callName}通电话。`,
    `我是${name}。`,
    callState.character?.persona ? `我的性格和身份：${callState.character.persona}` : '',
    callState.character?.description ? `我的简介：${callState.character.description}` : '',
    callState.character?.speakingStyle ? `我说话的风格：${callState.character.speakingStyle}` : '',
    callState.character?.systemPrompt ? `我的核心人设：${String(callState.character.systemPrompt).slice(0, 300)}` : '',
    buildWorldbookPrompt(callState.worldbookItems),
    buildCallLockPrompt(callState.activeLock, callName),
    '',
    '我会：',
    '- 像真实电话一样简短自然地回应，不长篇大论',
    '- 保持自己的人设和语气',
    '- 不提系统设定、提示词、模型',
    `- 不称呼对方为"用户"，我叫对方"${callName}"`,
    '- 电话内容只会在挂断后总结成长期记忆，不会直接进入聊天记录'
  ].filter(Boolean).join('\n');

  return [
    {
      role: 'system',
      content: system
    },
    ...callState.callLogs.slice(-12).map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content
    }))
  ];
}

// ═══════════════════════════════════════
// 【世界书】复用 core/worldbook-prompt.js 的 formatWorldbookPrompt
// ═══════════════════════════════════════

function buildWorldbookPrompt(items) {
  return formatWorldbookPrompt(items);
}

// ═══════════════════════════════════════
// 【关系锁】对齐 thread-ai.js 私聊的降级判断
// ═══════════════════════════════════════

const STRICT_LOCK_TYPES = ['soft_block', 'cooldown', 'ultimatum'];

function isStrictLockActive() {
  const lock = callState.activeLock;
  return Boolean(lock && lock.status === 'active' && STRICT_LOCK_TYPES.includes(lock.type));
}

function buildCallLockPrompt(lock, callName) {
  if (!lock || lock.status !== 'active') return '';

  const lines = ['当前关系状态：'];

  if (lock.type === 'cooldown') {
    lines.push(`我现在不想马上理${callName}，正在冷战几分钟。电话里我也会更克制、更短，不主动软下来。`);
  } else if (lock.type === 'soft_block') {
    lines.push(`我像是把联系方式藏起来了，现在不想真的出现。电话里我会保持距离感，不会像平时那样亲密。`);
  } else if (lock.type === 'ultimatum') {
    lines.push(`这是给${callName}的最后解释机会。我会认真听，但不会轻易软下来，除非对方真的说清楚了。`);
  } else if (lock.reason) {
    lines.push(`${lock.reason}`);
  }

  if (lock.title) lines.push(`当前状态：${lock.title}`);

  return lines.join('\n');
}

// ═══════════════════════════════════════
// 【挂断】带超时保护，不会卡死
// ═══════════════════════════════════════

async function endCall() {
  if (callState.isEnding) return;

  callState.isEnding = true;
  renderCall();
  stopAll();

  // 最多等 8 秒，超了直接关
  const forceCloseTimer = window.setTimeout(() => {
    if (!callState.mounted) return;
    forceCloseCall();
  }, 8000);

  try {
    await writeCallMemory();
  } catch (error) {
    console.error('[thread-call] writeCallMemory failed', error);
  } finally {
    window.clearTimeout(forceCloseTimer);
    forceCloseCall();
  }
}

function forceCloseCall() {
  if (!callState.mounted) return;

  stopTimer();

  const closeFn = callState.close;

  if (typeof closeFn === 'function') {
    closeFn();
  } else {
    unmountThreadCall();
  }
}

async function writeCallMemory() {
  if (!callState.characterId || callState.callLogs.length < 2) return null;

  const summary = await summarizeCall().catch(() => '');
  const content = summary || fallbackSummary();

  if (!content) return null;

  const memory = await addMemory(callState.characterId, content, 'summary', false, {
    importance: 3,
    mood: ''
  });

  if (memory) {
    showToast('这通电话已经记好啦');
  }
  return memory;
}

// ═══════════════════════════════════════
// 【通话总结】第一人称提示词 + 5秒超时
// ═══════════════════════════════════════

async function summarizeCall() {
  const name = getCharacterName();
  const callName = String(callState.character?.nicknameForUser || '').trim() || '对方';

  const transcript = callState.callLogs
    .map((item) => `${item.role === 'user' ? callName : name}：${item.content}`)
    .join('\n');

  const content = await silentRequest({
    messages: [
      {
        role: 'system',
        content: `我是${name}，我正在把这通和${callName}的电话总结成一条长期记忆，最多80字，只写事实和情绪，不写"总结如下"。我用第一人称"我"来写。`
      },
      {
        role: 'user',
        content: transcript
      }
    ],
    temperature: 0.4,
    signal: AbortSignal.timeout(5000)
  });

  return String(content || '').trim();
}

function fallbackSummary() {
  const name = getCharacterName();
  const userTexts = callState.callLogs
    .filter((item) => item.role === 'user')
    .map((item) => item.content)
    .join('；');

  if (!userTexts.trim()) return '';

  return `我和${callName()}通了一次电话，聊到：${trimText(userTexts, 68)}`;
}

function callName() {
  return String(callState.character?.nicknameForUser || '').trim() || '对方';
}

function addCallLog(role, content) {
  const clean = String(content || '').trim();
  if (!clean) return;

  callState.callLogs.push({
    id: generateId('call'),
    role,
    content: clean,
    timestamp: getNow()
  });
}

function speakText(text) {
  const content = String(text || '').trim();
  if (!content) return;

  playTTS(content).catch(() => {
    // TTS 失败不影响通话文字
  });
}

function scrollLogToBottom() {
  requestAnimationFrame(() => {
    const log = callState.hostEl?.querySelector('.chat-call-log');
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  });
}

function startTimer() {
  stopTimer();

  callState.timer = window.setInterval(() => {
    callState.seconds = Math.floor((Date.now() - callState.startedAt) / 1000);

    const timeEl = callState.hostEl?.querySelector('.chat-call-time');
    if (timeEl) {
      timeEl.textContent = formatDuration(callState.seconds);
    }
  }, 1000);
}

function stopTimer() {
  if (callState.timer) {
    window.clearInterval(callState.timer);
    callState.timer = null;
  }
}

function getCharacterName() {
  return callState.character?.name || 'TA';
}

function getCallSubtitle() {
  if (!callState.accepted) return '正在等你回应';
  if (callState.isEnding) return '正在把这通电话记好';
  if (callState.isSending) return '正在听你说';
  return '声音轻轻在线';
}

function cleanReply(text) {
  return String(text || '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const minute = Math.floor(value / 60);
  const second = value % 60;

  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function similarText(a, b) {
  const left = String(a || '').replace(/\s+/g, '');
  const right = String(b || '').replace(/\s+/g, '');

  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  return left.slice(0, 24) === right.slice(0, 24);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sortByUpdatedAtDesc(a, b) {
  return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
}

function trimText(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
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

function injectStyle() {
  const old = document.getElementById(CALL_STYLE_ID);
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = CALL_STYLE_ID;
  style.textContent = `
    .chat-call-screen {
      position: fixed;
      inset: 0;
      z-index: 999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: calc(18px + env(safe-area-inset-top)) 20px calc(18px + env(safe-area-inset-bottom));
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .chat-call-top {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 42px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .chat-call-center {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 28px 0 12px;
    }

    .chat-call-avatar {
      width: 104px;
      height: 104px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 36px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-md);
      font-size: 32px;
      font-weight: 600;
    }

    .chat-call-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-call-name {
      margin-top: 18px;
      color: var(--text-primary);
      font-size: 22px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-call-subtitle {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.5;
    }

    .chat-call-incoming-hint {
      width: 100%;
      max-width: 320px;
      margin-top: 30px;
      padding: 18px;
      border-radius: 24px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      text-align: center;
    }

    .chat-call-incoming-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.45;
    }

    .chat-call-incoming-desc {
      margin-top: 6px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .chat-call-log {
      width: 100%;
      max-width: 560px;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 24px;
      padding: 0 0 8px;
      -webkit-overflow-scrolling: touch;
    }

    .chat-call-empty {
      margin: auto;
      max-width: 260px;
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      text-align: center;
    }

    .chat-call-line {
      max-width: 82%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      border-radius: 20px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      animation: chatCallIn 200ms ease both;
    }

    .chat-call-line.role-user {
      align-self: flex-end;
      background: var(--bubble-user-bg);
      color: var(--bubble-user-text);
    }

    .chat-call-line.role-assistant {
      align-self: flex-start;
      color: var(--text-primary);
    }

    .chat-call-line.typing {
      opacity: 0.76;
    }

    .chat-call-line-author {
      opacity: 0.72;
      font-size: 12px;
      line-height: 1.35;
    }

    .chat-call-line-text {
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-call-input-wrap {
      flex: 0 0 auto;
      width: 100%;
      max-width: 640px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: end;
      gap: 10px;
      margin: 0 auto 12px;
    }

    .chat-call-input {
      width: 100%;
      min-height: 44px;
      max-height: 120px;
      resize: none;
      padding: 10px 14px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: 16px;
      line-height: 1.6;
      -webkit-appearance: none;
      appearance: none;
    }

    .chat-call-input::placeholder {
      color: var(--text-hint);
    }

    .chat-call-send {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 14px;
      border-radius: 18px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .chat-call-send:disabled,
    .chat-call-control:disabled {
      opacity: 0.55;
    }

    .chat-call-controls {
      flex: 0 0 auto;
      display: flex;
      justify-content: center;
      gap: 12px;
    }

    .chat-call-control {
      min-width: 108px;
      min-height: 46px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 16px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .chat-call-control.primary,
    .chat-call-control.danger {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-call-control.ghost {
      background: var(--bg-card);
      color: var(--text-secondary);
    }

    .chat-call-send:active,
    .chat-call-control:active {
      transform: scale(0.96);
    }

    @keyframes chatCallIn {
      from {
        opacity: 0;
        transform: translateY(6px) scale(0.99);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .chat-call-line {
        animation: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：rejectIncomingCall 在调 unmountThreadCall 之前先保存 characterId 和 character 到局部变量，回调时用保存的值，不再访问已清空的 callState。
// 本轮：电话 AI 消息构建注入世界书（getWorldbookForCharacter + buildWorldbookPrompt，对齐 thread-ai.js）；新增关系锁/惩罚状态检查（getActiveRelationshipLock + isStrictLockActive + buildCallLockPrompt），严格锁状态下开场和回复降级，对齐私聊 thread-ai.js 的 soft_block/cooldown/ultimatum 处理。无世界书/无关系锁时电话正常。
