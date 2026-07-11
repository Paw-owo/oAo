// apps/chat/thread-relationship.js
// imports:
//   from '../../core/storage.js': getDB, setDB, getByIndexDB, getNow
//   from '../../core/ui.js': createIcon, showBottomSheet, hideBottomSheet

import {
  getDB,
  setDB,
  getByIndexDB,
  getNow
} from '../../core/storage.js';

import { createIcon, showBottomSheet, hideBottomSheet } from '../../core/ui.js';

const RELATIONSHIP_STYLE_ID = 'chat-thread-relationship-style';

// ═══════════════════════════════════════
// 【数据加载】读取当前角色的关系锁定状态
// ═══════════════════════════════════════

export async function loadRelationshipState(state) {
  if (!state || state.mode === 'group' || !state.characterId) {
    setRelationshipState(state, null, null);
    return null;
  }

  const locks = normalizeArray(await getByIndexDB('relationship_locks', 'characterId', state.characterId).catch(() => []))
    .filter((item) => item?.status === 'active')
    .sort(sortByUpdatedAtDesc);

  const now = Date.now();
  let activeLock = null;

  for (const lock of locks) {
    const endsAt = new Date(lock.endsAt || 0).getTime();

    if (endsAt && endsAt <= now) {
      await setDB('relationship_locks', {
        ...lock,
        status: 'expired',
        updatedAt: getNow()
      });
      continue;
    }

    activeLock = lock;
    break;
  }

  let punishment = null;

  if (activeLock?.punishmentId) {
    punishment = await getDB('punishments', activeLock.punishmentId).catch(() => null);
  }

  setRelationshipState(state, activeLock, punishment);
  return activeLock;
}

// ═══════════════════════════════════════
// 【公共读取】读取角色当前有效关系锁（过期则改 expired）
// 供 thread-ai / thread-call / list 等复用，消除重复定义
// ═══════════════════════════════════════

export async function getActiveRelationshipLock(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return null;

  const locks = normalizeArray(await getByIndexDB('relationship_locks', 'characterId', id).catch(() => []))
    .filter((item) => item?.status === 'active')
    .sort(sortByUpdatedAtDesc);

  const now = Date.now();

  for (const lock of locks) {
    const endsAt = new Date(lock.endsAt || 0).getTime();

    if (endsAt && endsAt <= now) {
      await setDB('relationship_locks', {
        ...lock,
        status: 'expired',
        updatedAt: getNow()
      }).catch(() => null);
      continue;
    }

    return lock;
  }

  return null;
}

function setRelationshipState(state, lock, punishment) {
  if (!state) return;
  state.relationshipLock = lock || null;
  state.relationshipPunishment = punishment || null;
}

// ═══════════════════════════════════════
// 【状态判断】判断当前是否锁定、锁定类型和严格锁定
// ═══════════════════════════════════════

export function getRelationshipLockLevel(state) {
  const lock = state?.relationshipLock;
  if (!lock || lock.status !== 'active') return '';
  return String(lock.type || '');
}

export function isRelationshipLocked(state) {
  return Boolean(getRelationshipLockLevel(state));
}

export function isStrictRelationshipLocked(state) {
  return ['cooldown', 'soft_block', 'ultimatum'].includes(getRelationshipLockLevel(state));
}

export function getRelationshipLockText(stateOrLock) {
  const { lock, punishment } = resolveLockAndPunishment(stateOrLock);
  if (!lock) return '';

  const left = getLockLeftText(lock);
  const base = lock.reason || punishment?.description || '先给 TA 一点时间。';

  if (left) return `${base} ${left}`;
  return base;
}

export function getRelationshipStatusText(state) {
  const lock = state?.relationshipLock;

  if (!lock) return '';

  if (lock.type === 'soft_block') return 'TA 暂时躲起来了';
  if (lock.type === 'cooldown') return 'TA 现在有点冷';
  if (lock.type === 'ultimatum') return '等你认真解释';

  return 'TA 还在闹别扭';
}

// ═══════════════════════════════════════
// 【锁定输入栏】渲染聊天底部的锁定提示条
// ═══════════════════════════════════════

export function createRelationshipLockBar(state, options = {}) {
  injectStyle();

  const lock = state?.relationshipLock || {};
  const wrap = el('section', 'chat-relationship-lock-bar');

  const icon = el('span', 'chat-relationship-lock-icon');
  icon.appendChild(createIcon(lock.type === 'soft_block' ? 'ban' : 'lock', 18));

  const text = el('span', 'chat-relationship-lock-text');
  text.append(
    el('span', 'chat-relationship-lock-title', lock.title || 'TA 现在有点不想说话'),
    el('span', 'chat-relationship-lock-desc', getRelationshipLockText(state))
  );

  const action = el('button', 'chat-relationship-lock-action');
  action.type = 'button';
  action.textContent = '看一下';
  action.addEventListener('click', () => {
    openRelationshipLockSheet(state, options);
  });

  wrap.append(icon, text, action);
  return wrap;
}

// ═══════════════════════════════════════
// 【锁定弹窗】底部抽屉展示原因和剩余时间
// ═══════════════════════════════════════

export function openRelationshipLockSheet(state, options = {}) {
  injectStyle();

  const lock = state?.relationshipLock || {};
  const punishment = state?.relationshipPunishment || {};
  const sheet = el('div', 'chat-lock-sheet');

  const head = createMiniHead(
    lock.title || 'TA 正在闹别扭',
    '这不是永久拉黑，只是 TA 现在还没完全消气。',
    options
  );

  const card = el('section', 'chat-lock-card');
  card.append(
    el('div', 'chat-lock-card-title', punishment.title || lock.title || '需要一点哄哄'),
    el('div', 'chat-lock-card-desc', punishment.description || lock.reason || '等一小会儿，或者认真想想怎么哄 TA。'),
    el('div', 'chat-lock-card-time', getLockLeftText(lock) || '现在可以继续试试。')
  );

  const actions = el('div', 'chat-mini-actions');

  const close = el('button', 'chat-mini-btn ghost', '先等等');
  close.type = 'button';
  close.addEventListener('click', () => hideBottomSheet());

  const refresh = el('button', 'chat-mini-btn primary', '刷新状态');
  refresh.type = 'button';
  refresh.addEventListener('click', async () => {
    hideBottomSheet();

    if (typeof options.onRefresh === 'function') {
      await options.onRefresh();
      return;
    }

    if (typeof state?.reloadAndRender === 'function') {
      await state.reloadAndRender();
    }
  });

  actions.append(close, refresh);
  sheet.append(head, card, actions);
  showBottomSheet(sheet);
}

function getLockLeftText(lock) {
  const endsAt = new Date(lock?.endsAt || 0).getTime();
  if (!endsAt) return '';

  const diff = Math.max(0, endsAt - Date.now());
  if (!diff) return '已经可以刷新看看啦。';

  const minutes = Math.ceil(diff / 60000);
  return `大约还要 ${minutes} 分钟。`;
}

// ═══════════════════════════════════════
// 【通用组件】标题、按钮和节点创建
// ═══════════════════════════════════════

function createMiniHead(title, subtitle, sheetOptions) {
  const head = el('div', 'chat-mini-head');

  if (sheetOptions?.onBackToTools) {
    const backBtn = el('button', 'chat-sheet-back-btn');
    backBtn.type = 'button';
    backBtn.setAttribute('aria-label', '返回小工具箱');
    backBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    backBtn.addEventListener('click', sheetOptions.onBackToTools);
    head.appendChild(backBtn);
  }

  const textWrap = el('div', 'chat-mini-head-text');
  textWrap.append(
    el('div', 'chat-mini-title', title || ''),
    el('div', 'chat-mini-subtitle', subtitle || '')
  );
  head.append(textWrap);
  return head;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【工具函数】排序和数组兼容
// ═══════════════════════════════════════

function sortByUpdatedAtDesc(a, b) {
  return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveLockAndPunishment(stateOrLock) {
  if (!stateOrLock || typeof stateOrLock !== 'object') {
    return { lock: null, punishment: null };
  }

  const hasStateKeys = Object.prototype.hasOwnProperty.call(stateOrLock, 'relationshipLock')
    || Object.prototype.hasOwnProperty.call(stateOrLock, 'relationshipPunishment');

  if (hasStateKeys) {
    return {
      lock: stateOrLock.relationshipLock || null,
      punishment: stateOrLock.relationshipPunishment || null
    };
  }

  return {
    lock: stateOrLock,
    punishment: null
  };
}

// ═══════════════════════════════════════
// 【样式】关系锁定提示条和底部弹窗
// ═══════════════════════════════════════

function injectStyle() {
  // 修复：先删旧标签再创建新的，避免 CSS 修改不生效
  const old = document.getElementById(RELATIONSHIP_STYLE_ID);
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = RELATIONSHIP_STYLE_ID;
  style.textContent = `
    .chat-relationship-lock-bar{
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:10px;
      padding:12px;
      border-radius:20px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      animation:chatRelationshipIn 200ms ease both;
    }

    .chat-relationship-lock-icon{
      width:38px;
      height:38px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--accent);
      box-shadow:var(--shadow-sm);
    }

    .chat-relationship-lock-text{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:3px;
    }

    .chat-relationship-lock-title{
      color:var(--text-primary);
      font-size:14px;
      font-weight:600;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .chat-relationship-lock-desc{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.45;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .chat-relationship-lock-action{
      min-height:34px;
      padding:0 12px;
      border-radius:999px;
      background:var(--accent);
      color:var(--bubble-user-text);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:12px;
      transition:all 200ms ease;
    }

    .chat-relationship-lock-action:active{
      transform:scale(.96);
    }

    .chat-lock-sheet{
      padding:6px 20px 20px;
    }

    .chat-lock-card{
      padding:14px;
      border-radius:18px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
    }

    .chat-lock-card-title{
      color:var(--text-primary);
      font-size:14px;
      font-weight:600;
      line-height:1.35;
    }

    .chat-lock-card-desc{
      margin-top:6px;
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.6;
    }

    .chat-lock-card-time{
      margin-top:10px;
      color:var(--text-hint);
      font-size:12px;
      line-height:1.45;
    }

    .chat-mini-head{
      display:flex;
      align-items:center;
      gap:10px;
      margin-bottom:16px;
    }

    .chat-mini-head-text{
      min-width:0;
      flex:1;
    }

    .chat-sheet-back-btn{
      width:36px;
      height:36px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border:none;
      outline:none;
      border-radius:var(--radius-md);
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
    }

    .chat-sheet-back-btn:active{
      transform:scale(.94);
    }

    .chat-sheet-back-btn svg{
      width:18px;
      height:18px;
    }

    .chat-mini-title{
      color:var(--text-primary);
      font-size:var(--font-size-title);
      font-weight:600;
      line-height:1.35;
    }

    .chat-mini-subtitle{
      margin-top:4px;
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      line-height:1.5;
    }

    .chat-mini-actions{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
      margin-top:14px;
    }

    .chat-mini-btn{
      min-height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:14px;
      transition:all 200ms ease;
    }

    .chat-mini-btn:active{
      transform:scale(.96);
    }

    .chat-mini-btn.primary{
      background:var(--accent);
      color:var(--bubble-user-text);
    }

    .chat-mini-btn.ghost{
      background:var(--bg-card);
      color:var(--text-secondary);
    }

    @keyframes chatRelationshipIn{
      from{
        opacity:0;
        transform:translateY(6px);
      }

      to{
        opacity:1;
        transform:translateY(0);
      }
    }

    @media(max-width:430px){
      .chat-relationship-lock-bar{
        grid-template-columns:auto minmax(0,1fr);
      }

      .chat-relationship-lock-action{
        grid-column:1/-1;
        width:100%;
      }

      .chat-mini-actions{
        grid-template-columns:1fr;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .chat-relationship-lock-bar{
        animation:none;
      }

      .chat-relationship-lock-action,
      .chat-mini-btn,
      .chat-sheet-back-btn{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：injectStyle 函数开头从"if (document.getElementById(RELATIONSHIP_STYLE_ID)) return"改为"const old = ...; if (old) old.remove()"，先删旧标签再创建新的。
// 原来效果：关系锁样式修改后永远不生效。
// 现在效果：每次调用都先清理旧标签再写入新样式。
// 会不会影响其他文件：不会。导出接口不变，依赖不变。
// 依赖：../../core/storage.js(getDB,setDB,getByIndexDB,getNow)；../../core/ui.js(createIcon,showBottomSheet,hideBottomSheet)
