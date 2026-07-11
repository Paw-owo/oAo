// apps/chat/thinking-chain.js
// imports:
//   无外部依赖，纯 DOM 组件

const THINKING_CARD_CLASS = 'chat-thinking-card';
const THINKING_BODY_CLASS = 'chat-thinking-body';
const THINKING_TEXT_CLASS = 'chat-thinking-text';
const THINKING_TOOLS_CLASS = 'chat-thinking-tools';
const THINKING_PREVIEW_CLASS = 'chat-thinking-preview';
const THINKING_PREVIEW_BTN_CLASS = 'chat-thinking-preview-btn';
const THINKING_PREVIEW_NODE_CLASS = 'chat-thinking-preview-node';
const THINKING_SHEET_MASK_CLASS = 'chat-thinking-sheet-mask';
const THINKING_SHEET_CLASS = 'chat-thinking-sheet';
const THINKING_SHEET_BODY_CLASS = 'chat-thinking-sheet-body';
const THINKING_SHEET_CARD_CLASS = 'chat-thinking-sheet-card';

const FIXED_SUMMARY_TEXT = '想了一小会';
const FIXED_SUMMARY_TEXT_RUNNING = '还在想想';
const THINKING_STYLE_ID = 'chat-thinking-chain-style-v6';
const MAX_CACHE_ENTRIES = 200;

const stateCache = new Map();
let activeSheetCloser = null;

export function hasThinkingChain(message) {
  if (!message) return false;
  if (message.role === 'user') return false;
  if (String(message.thinking || '').trim()) return true;
  if (collectTools(message).length > 0) return true;
  return false;
}

export function createThinkingCard(message, options = {}) {
  injectStyle();

  const roleName = String(options.roleName || options.characterName || options.name || 'TA').trim();
  const messageId = String(options.messageId || '').trim();
  const fingerprint = buildFingerprint(message);
  const isRunning = isMessageRunning(message);
  const stateKey = messageId ? `${messageId}:${fingerprint}` : '';

  const card = el('section', THINKING_CARD_CLASS);
  card.dataset.running = isRunning ? 'true' : 'false';

  const tools = collectTools(message);
  const thinkingText = String(message?.thinking || '').trim();

  if (thinkingText || tools.length) {
    card.appendChild(createPreview(message, {
      roleName,
      stateKey,
      isRunning,
      tools
    }));
  }

  const body = el('div', THINKING_BODY_CLASS);
  card.appendChild(body);
  return card;
}

function createPreview(message, options = {}) {
  const roleName = String(options.roleName || 'TA').trim();
  const stateKey = String(options.stateKey || '').trim();
  const isRunning = Boolean(options.isRunning);
  const tools = Array.isArray(options.tools) ? options.tools : collectTools(message);

  const wrap = el('div', THINKING_PREVIEW_CLASS);

  const thinkBtn = safeButton(THINKING_PREVIEW_BTN_CLASS, `${roleName}的思路`);
  thinkBtn.append(
    createBubbleThoughtIcon(),
    el('span', 'chat-thinking-preview-btn-text', isRunning ? FIXED_SUMMARY_TEXT_RUNNING : getThinkingPreviewText(message)),
    createTinyChevronIcon()
  );
  thinkBtn.addEventListener('click', () => {
    openThinkingSheet('think', message, {
      roleName,
      stateKey,
      isRunning,
      title: isRunning ? '还在想想' : '想了一小会'
    });
  });
  wrap.appendChild(thinkBtn);

  if (!tools.length) {
    return wrap;
  }

  const chain = el('div', THINKING_TOOLS_CLASS);

  tools.forEach((tool, index) => {
    const item = createToolNode(tool, index, message, {
      roleName,
      stateKey,
      isRunning
    });
    chain.appendChild(item);
  });

  wrap.appendChild(chain);
  return wrap;
}

function createToolNode(tool, index, message, options = {}) {
  const item = safeButton(THINKING_PREVIEW_NODE_CLASS, `查看第${index + 1}步`);
  const detail = buildToolDetailData(tool, index, message, options);

  const dot = el('span', 'chat-thinking-preview-dot');
  dot.dataset.status = detail.status;

  const iconWrap = el('span', 'chat-thinking-preview-icon');
  iconWrap.appendChild(createToolKindIcon(detail.icon));

  const textWrap = el('span', 'chat-thinking-preview-text-wrap');
  textWrap.append(
    el('span', 'chat-thinking-preview-title', detail.title),
    el('span', 'chat-thinking-preview-subtitle', detail.subtitle)
  );

  const arrow = el('span', 'chat-thinking-preview-arrow');
  arrow.appendChild(createTinyChevronIcon());

  item.append(dot, iconWrap, textWrap, arrow);

  item.addEventListener('click', () => {
    openThinkingSheet('tool', message, {
      tool,
      index,
      detail,
      roleName: options.roleName || 'TA',
      stateKey: options.stateKey || '',
      isRunning: options.isRunning || false
    });
  });

  return item;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function safeButton(className, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  if (label) btn.setAttribute('aria-label', label);
  return btn;
}

function openThinkingSheet(type, message, options = {}) {
  closeThinkingSheet();

  const oldBottomSheet = document.querySelector('.bottom-sheet');
  const oldSheetOverlay = document.querySelector('.sheet-overlay');
  const hiddenBottomSheet = oldBottomSheet || null;
  const hiddenSheetOverlay = oldSheetOverlay || null;

  if (hiddenBottomSheet) hiddenBottomSheet.style.display = 'none';
  if (hiddenSheetOverlay) hiddenSheetOverlay.style.display = 'none';

  const mask = el('div', THINKING_SHEET_MASK_CLASS);
  const sheet = el('section', THINKING_SHEET_CLASS);

  const handle = el('div', 'chat-thinking-sheet-handle');
  const head = el('div', 'chat-thinking-sheet-head');

  const closeBtn = safeButton('chat-thinking-sheet-close', '关闭');
  closeBtn.appendChild(createCloseIcon());

  const titleWrap = el('div', 'chat-thinking-sheet-title-wrap');
  titleWrap.appendChild(el('div', 'chat-thinking-sheet-title-pill', resolveSheetTitle(type, options)));

  head.append(closeBtn, titleWrap);

  const body = el('div', THINKING_SHEET_BODY_CLASS);

  if (type === 'think') {
    body.appendChild(createThinkingSheetContent(message, options));
  } else {
    body.appendChild(createToolSheetContent(message, options));
  }

  sheet.append(handle, head, body);
  document.body.append(mask, sheet);

  const restoreHiddenSheet = () => {
    if (hiddenBottomSheet) hiddenBottomSheet.style.display = '';
    if (hiddenSheetOverlay) hiddenSheetOverlay.style.display = '';
  };

  const close = () => {
    closeThinkingSheet();
  };

  closeBtn.addEventListener('click', close);
  mask.addEventListener('click', close);

  const escHandler = (event) => {
    if (event.key === 'Escape') {
      document.removeEventListener('keydown', escHandler);
      close();
    }
  };
  document.addEventListener('keydown', escHandler);

  activeSheetCloser = () => {
    mask.dataset.show = 'false';
    sheet.dataset.show = 'false';
    window.setTimeout(() => {
      mask.remove();
      sheet.remove();
      restoreHiddenSheet();
    }, 220);
    document.removeEventListener('keydown', escHandler);
    if (activeSheetCloser) activeSheetCloser = null;
  };

  requestAnimationFrame(() => {
    mask.dataset.show = 'true';
    sheet.dataset.show = 'true';
  });
}

function closeThinkingSheet() {
  if (typeof activeSheetCloser === 'function') {
    const closer = activeSheetCloser;
    activeSheetCloser = null;
    closer();
  }
}

function createThinkingSheetContent(message, options = {}) {
  const wrap = el('div', 'chat-thinking-sheet-stack');
  const card = el('section', THINKING_SHEET_CARD_CLASS);

  const intro = el('div', 'chat-thinking-sheet-intro');
  intro.append(
    createBubbleThoughtIcon(),
    el('span', 'chat-thinking-sheet-intro-text', options.isRunning ? '我还在慢慢整理这一句要怎么回。' : '这是我刚刚心里闪过的一点点思路。')
  );

  const text = String(message?.thinking || '').trim();
  const textBlock = el('div', 'chat-thinking-sheet-paragraph', text || '这一小会没有留下更多心里话。');

  card.append(intro, textBlock);
  wrap.appendChild(card);

  const tools = collectTools(message);
  if (tools.length) {
    const hint = el('div', 'chat-thinking-sheet-side-note', `顺手还做了 ${tools.length} 件小事。`);
    wrap.appendChild(hint);
  }

  return wrap;
}

function createToolSheetContent(message, options = {}) {
  const detail = options.detail || buildToolDetailData(options.tool, options.index || 0, message, options);
  const wrap = el('div', 'chat-thinking-sheet-stack');

  wrap.appendChild(createDetailCard('这一步在做什么', detail.summary));

  if (detail.query) {
    wrap.appendChild(createInfoCard('我拿到的内容', detail.query));
  }

  if (detail.result) {
    wrap.appendChild(createInfoCard(detail.resultLabel || '我处理出来的东西', detail.result));
  }

  if (detail.extraRows.length) {
    const metaCard = el('section', THINKING_SHEET_CARD_CLASS);
    const list = el('div', 'chat-thinking-sheet-info-list');
    detail.extraRows.forEach((row) => {
      list.appendChild(createInfoRow(row.label, row.value));
    });
    metaCard.appendChild(list);
    wrap.appendChild(metaCard);
  }

  if (detail.error) {
    wrap.appendChild(createInfoCard('这一步碰到的小状况', detail.error));
  }

  return wrap;
}

function createDetailCard(title, text) {
  const card = el('section', THINKING_SHEET_CARD_CLASS);
  card.append(
    el('div', 'chat-thinking-sheet-section-title', title),
    el('div', 'chat-thinking-sheet-paragraph', text || '这一段还没有更多内容。')
  );
  return card;
}

function createInfoCard(title, text) {
  const card = el('section', THINKING_SHEET_CARD_CLASS);
  card.append(
    el('div', 'chat-thinking-sheet-section-title', title),
    el('div', 'chat-thinking-sheet-content-box', text || '没有留下内容。')
  );
  return card;
}

function createInfoRow(label, value) {
  const row = el('div', 'chat-thinking-sheet-info-row');
  row.append(
    el('span', 'chat-thinking-sheet-info-label', label),
    el('span', 'chat-thinking-sheet-info-value', value || '没写')
  );
  return row;
}

function resolveSheetTitle(type, options = {}) {
  if (type === 'think') {
    return String(options.title || '想了一小会');
  }
  return String(options?.detail?.title || '悄悄做了点事');
}

function buildFingerprint(message) {
  const thinking = String(message?.thinking || '').trim();
  const summary = String(message?.thinkingSummary || '').trim();
  const tools = collectTools(message);
  const toolHash = tools.map((t) => `${t.name}:${t.status}:${String(t.result || '').slice(0, 40)}`).join('|');
  return hashString(`${summary}|${thinking}|${toolHash}`).slice(0, 12);
}

function hashString(text) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) % 1000000007;
  }
  return value.toString(36);
}

function getSavedCardState(key) {
  if (!key) return null;
  return stateCache.get(key) || null;
}

function saveCardState(key, patch) {
  if (!key) return;
  pruneCacheIfNeeded();
  const current = stateCache.get(key) || {};
  stateCache.set(key, { ...current, ...patch });
}

function pruneCacheIfNeeded() {
  if (stateCache.size < MAX_CACHE_ENTRIES) return;
  const keys = Array.from(stateCache.keys());
  const removeCount = Math.max(1, Math.floor(keys.length * 0.25));
  for (let index = 0; index < removeCount; index += 1) {
    stateCache.delete(keys[index]);
  }
}

function getThinkingPreviewText(message) {
  const custom = String(message?.thinkingSummary || '').trim();
  if (custom) return custom.length > 15 ? `${custom.slice(0, 15).trim()}…` : custom;
  const text = String(message?.thinking || '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 15 ? `${text.slice(0, 15).trim()}…` : text;
  return FIXED_SUMMARY_TEXT;
}

function isMessageRunning(message) {
  if (message?.isPending === true) return true;
  if (message?.isStreaming === true) return true;
  const status = normalizeText(message?.status || message?.streamStatus).toLowerCase();
  return ['streaming', 'thinking', 'running', 'loading', 'pending'].includes(status);
}

function collectTools(message) {
  const tools = [];
  normalizeToolCalls(message?.toolCalls).forEach((tool) => {
    tools.push({ ...tool, _source: 'tool' });
  });
  normalizeToolCalls(message?.memoryWrites).forEach((memory) => {
    tools.push({
      ...memory,
      name: resolveMemoryToolName(memory),
      status: memory.status || memory.state || 'done',
      result: memory.content || memory.summary || memory.text || '',
      detailSummary: memory.detailSummary || memory.summary || '',
      _source: 'memory'
    });
  });
  normalizeToolCalls(message?.grudgeWrites).forEach((grudge) => {
    tools.push({
      ...grudge,
      name: resolveGrudgeToolName(grudge),
      status: grudge.status || grudge.state || 'done',
      result: grudge.reason || grudge.content || grudge.text || '',
      detailSummary: grudge.detailSummary || grudge.summary || '',
      _source: 'grudge'
    });
  });
  return tools;
}

function resolveMemoryToolName(memory) {
  const raw = normalizeText(memory?.name || memory?.action || memory?.type || '').toLowerCase();
  if (/(删|删除|移除)/.test(raw)) return '轻轻删掉一条记忆';
  if (/(改|编辑|更新|修正)/.test(raw)) return '顺手改了改记忆';
  return '悄悄记下一笔';
}

function resolveGrudgeToolName(grudge) {
  const raw = normalizeText(grudge?.name || grudge?.action || grudge?.type || '').toLowerCase();
  if (/(删|删除|移除)/.test(raw)) return '把小本本翻掉一页';
  if (/(改|编辑|更新|修正)/.test(raw)) return '把小本本改了改';
  return '在小本本上画圈圈';
}

function resolveToolDisplayName(tool, index) {
  const source = String(tool?._source || 'tool').toLowerCase();
  const rawName = normalizeText(tool?.name || tool?.toolName || tool?.title || tool?.action).toLowerCase();

  if (source === 'memory') return resolveMemoryToolName(tool);
  if (source === 'grudge') return resolveGrudgeToolName(tool);

  if (/(mcp|外部工具|server|web.*tool)/.test(rawName)) return '叫了外部小工具';
  if (/(搜|搜索|search|上网|网页|web|资料)/.test(rawName)) return '去查了查';
  if (/(转账|付款|pay|红包)/.test(rawName)) return '递了一张小票据';
  if (/(礼物|gift)/.test(rawName)) return '递了一份小礼物';
  if (/(商店|购买|下单|buy|shop|小物)/.test(rawName)) return '去小物商店逛了逛';
  if (/(电话|通话|call|summary|总结)/.test(rawName)) return '把电话收成一小段记忆';
  if (/(主动消息|proactive)/.test(rawName)) return '想主动和你说句话';

  const name = normalizeText(tool?.name || tool?.toolName || tool?.title || tool?.action);
  return name || `第 ${index + 1} 步`;
}

function normalizeToolCalls(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === false) return [];
  if (typeof value === 'string') return value.trim() ? [{ name: value.trim(), result: value.trim() }] : [];
  return [value].filter(Boolean);
}

function getToolStatus(tool) {
  const status = normalizeText(tool?.status || tool?.state).toLowerCase();
  if (['running', 'loading', 'pending', 'calling', 'streaming'].includes(status)) return 'running';
  if (['error', 'failed', 'fail'].includes(status)) return 'error';
  return 'done';
}

function buildToolDetailData(tool, index, message, options = {}) {
  const source = String(tool?._source || inferToolSource(tool)).toLowerCase();
  const status = getToolStatus(tool);
  const action = detectActionType(tool, source);
  const query = normalizeToolField(tool?.arguments || tool?.input || tool?.params || tool?.query || tool?.payload || tool?.request);
  const result = normalizeToolField(tool?.result || tool?.output || tool?.content || tool?.summary || tool?.text || tool?.description);
  const error = normalizeToolField(tool?.error || tool?.message);
  const amount = normalizeAmount(tool);
  const targetName = normalizeText(tool?.characterName || tool?.targetName || tool?.receiverName || tool?.toName || tool?.memberName);
  const itemName = normalizeText(tool?.itemName || tool?.name || tool?.giftName || tool?.productName || tool?.title);
  const modelName = normalizeText(tool?.model || tool?.modelName);
  const endpointName = normalizeText(tool?.endpoint || tool?.server || tool?.provider || tool?.serviceName);

  const meta = TOOL_COPY_MAP[action] || TOOL_COPY_MAP.default;
  const title = resolveToolDisplayTitle(meta, tool, index, source, action, status);
  const subtitle = resolveToolSubtitle(meta, tool, { status, query, result, amount, targetName, itemName, endpointName });
  const summary = resolveToolSummary(meta, tool, { status, query, result, amount, targetName, itemName, endpointName });
  const resultLabel = resolveResultLabel(action, source);
  const extraRows = [];

  if (status === 'running') {
    extraRows.push({ label: '状态', value: '还在慢慢处理' });
  } else if (status === 'error') {
    extraRows.push({ label: '状态', value: '这一步卡了一下' });
  } else {
    extraRows.push({ label: '状态', value: '已经弄好啦' });
  }

  if (modelName) extraRows.push({ label: '模型', value: modelName });
  if (endpointName) extraRows.push({ label: '来源', value: endpointName });
  if (amount > 0) extraRows.push({ label: '金额', value: `¥${formatAmount(amount)}` });
  if (targetName) extraRows.push({ label: '对象', value: targetName });
  if (action === 'transfer' && itemName) extraRows.push({ label: '标题', value: itemName });
  if (['gift', 'shop_buy'].includes(action) && itemName) extraRows.push({ label: '小物', value: itemName });

  return {
    source,
    action,
    status,
    icon: meta.icon,
    title,
    subtitle,
    summary,
    query,
    result,
    resultLabel,
    error,
    extraRows
  };
}

function resolveToolDisplayTitle(meta, tool, index, source, action, status) {
  if (status === 'running' && meta.runningTitle) return meta.runningTitle;
  if (status === 'error' && meta.errorTitle) return meta.errorTitle;
  if (meta.titleBuilder) return meta.titleBuilder(tool, index);
  return meta.title || resolveToolDisplayName(tool, index);
}

function resolveToolSubtitle(meta, tool, context) {
  if (typeof meta.subtitleBuilder === 'function') {
    return meta.subtitleBuilder(tool, context);
  }
  if (context.status === 'running') {
    if (context.query) return summarizeText(context.query, 18);
    return '还在办这一步';
  }
  if (context.status === 'error') {
    return '这一步刚刚有点卡';
  }
  if (context.result) return summarizeText(context.result, 18);
  if (context.query) return summarizeText(context.query, 18);
  return meta.subtitle || '点开看看细节';
}

function resolveToolSummary(meta, tool, context) {
  if (typeof meta.summaryBuilder === 'function') {
    return meta.summaryBuilder(tool, context);
  }
  if (context.status === 'running') {
    return meta.runningSummary || '我正在悄悄做这一步，还没有完全收尾。';
  }
  if (context.status === 'error') {
    return meta.errorSummary || '这一步刚刚卡了一下，暂时没顺利走完。';
  }
  return meta.summary || '这一步已经处理好了。';
}

function resolveResultLabel(action, source) {
  if (source === 'memory') return '我记下了什么';
  if (source === 'grudge') return '我记到小本本里的内容';
  if (action === 'search') return '我翻到的内容';
  if (action === 'mcp') return '工具给我的结果';
  if (action === 'transfer') return '这张小卡片里写了什么';
  if (action === 'gift' || action === 'shop_buy') return '这份小礼物的内容';
  if (action === 'call_summary') return '我整理好的电话记忆';
  return '我处理出来的内容';
}

function normalizeToolField(value) {
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

function inferToolSource(tool) {
  const name = normalizeText(tool?.name || tool?.toolName || tool?.title || '').toLowerCase();
  if (name.includes('记忆')) return 'memory';
  if (name.includes('记仇') || name.includes('小本本')) return 'grudge';
  return 'tool';
}

function detectActionType(tool, source) {
  const name = normalizeText(tool?.name || tool?.toolName || tool?.title || tool?.action).toLowerCase();
  const query = normalizeText(tool?.arguments || tool?.input || tool?.params || tool?.query).toLowerCase();
  const result = normalizeText(tool?.result || tool?.output || tool?.content || tool?.summary || tool?.text).toLowerCase();
  const text = `${name}\n${query}\n${result}`;

  if (source === 'memory') {
    if (/(删|删除|移除)/.test(text)) return 'memory_delete';
    if (/(改|编辑|更新|修正)/.test(text)) return 'memory_edit';
    return 'memory_add';
  }
  if (source === 'grudge') {
    if (/(删|删除|移除|翻掉)/.test(text)) return 'grudge_delete';
    if (/(改|编辑|更新|修正)/.test(text)) return 'grudge_edit';
    return 'grudge_add';
  }
  if (/(mcp|tool|外部工具|server)/.test(text)) return 'mcp';
  if (/(搜|搜索|search|上网|网页|web|资料)/.test(text)) return 'search';
  if (/(转账|付款|pay|红包)/.test(text)) return 'transfer';
  if (/(礼物|gift)/.test(text)) return 'gift';
  if (/(商店|购买|下单|buy|shop|小物)/.test(text)) return 'shop_buy';
  if (/(电话|通话|call|summary|总结)/.test(text)) return 'call_summary';
  if (/(主动消息|proactive)/.test(text)) return 'proactive';
  return 'tool';
}

function normalizeAmount(tool) {
  const raw = Number(tool?.amount || tool?.price || tool?.transferAmount || tool?.itemPrice || 0);
  return Number.isFinite(raw) ? raw : 0;
}

function summarizeText(text, max = 20) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function normalizeText(value) {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value).replace(/\s+/g, ' ').trim();
    } catch (_) {
      return '';
    }
  }
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatAmount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(2);
}

// ═══════════════════════════════════════
// 【图标】
// ═══════════════════════════════════════

function createBubbleThoughtIcon() {
  const svg = createSvgBase();
  addPath(svg, 'M12 4.75a7.25 7.25 0 0 1 4.9 12.59c-.64.58-1.19 1.13-1.5 1.91H8.61c-.28-.75-.82-1.31-1.46-1.88A7.25 7.25 0 0 1 12 4.75Z');
  addPath(svg, 'M9.25 21h5.5');
  addPath(svg, 'M10.2 17.9h3.6');
  return svg;
}

function createTinyChevronIcon() {
  const svg = createSvgBase();
  addPath(svg, 'm9.5 6.8 5 5.2-5 5.2');
  return svg;
}

function createCloseIcon() {
  const svg = createSvgBase();
  addPath(svg, 'M6.5 6.5l11 11');
  addPath(svg, 'M17.5 6.5l-11 11');
  return svg;
}

function createToolKindIcon(name) {
  const svg = createSvgBase();

  if (name === 'search') {
    addCircle(svg, '11', '11', '5.25');
    addPath(svg, 'M15.2 15.2 19 19');
    return svg;
  }

  if (name === 'memory') {
    addPath(svg, 'M7 6.75h10a1.75 1.75 0 0 1 1.75 1.75v8.75A1.75 1.75 0 0 1 17 19H7A1.75 1.75 0 0 1 5.25 17.25V8.5A1.75 1.75 0 0 1 7 6.75Z');
    addPath(svg, 'M8.5 10h7');
    addPath(svg, 'M8.5 13.5h5.2');
    return svg;
  }

  if (name === 'memory-edit') {
    addPath(svg, 'M6.5 17.8 9.8 17l7.6-7.6a1.45 1.45 0 1 0-2-2L7.8 15l-.8 2.8Z');
    addPath(svg, 'M13.7 8.3l2 2');
    return svg;
  }

  if (name === 'memory-delete') {
    addPath(svg, 'M7.5 8.25h9');
    addPath(svg, 'M9.4 8.25V6.9a.9.9 0 0 1 .9-.9h3.4a.9.9 0 0 1 .9.9v1.35');
    addPath(svg, 'M8.3 8.25l.8 8.6a1.2 1.2 0 0 0 1.2 1.1h3.4a1.2 1.2 0 0 0 1.2-1.1l.8-8.6');
    return svg;
  }

  if (name === 'grudge') {
    addPath(svg, 'M12 18.5c-4.2-2.6-6.8-5-6.8-8.4A3.9 3.9 0 0 1 9.1 6c1 0 1.97.42 2.9 1.35C12.93 6.42 13.9 6 14.9 6a3.9 3.9 0 0 1 3.9 4.1c0 3.4-2.6 5.8-6.8 8.4Z');
    return svg;
  }

  if (name === 'transfer') {
    addCircle(svg, '12', '12', '6.5');
    addPath(svg, 'M12 8.4v7.2');
    addPath(svg, 'M9.6 10.2c.5-.9 1.35-1.35 2.4-1.35 1.28 0 2.2.58 2.2 1.65 0 .98-.78 1.5-2.02 1.8l-.36.08c-1.4.32-2.24.88-2.24 2.02 0 1.02.88 1.86 2.46 1.86 1.05 0 1.98-.38 2.62-1.2');
    return svg;
  }

  if (name === 'gift') {
    addPath(svg, 'M7 10h10v8.25A1.75 1.75 0 0 1 15.25 20h-6.5A1.75 1.75 0 0 1 7 18.25V10Z');
    addPath(svg, 'M5.5 10h13');
    addPath(svg, 'M12 10v10');
    addPath(svg, 'M9.4 7.4c0-1.05.78-1.9 1.75-1.9 1.2 0 1.78 1.02 1.78 2.5v2');
    addPath(svg, 'M14.6 7.4c0-1.05-.78-1.9-1.75-1.9-1.2 0-1.78 1.02-1.78 2.5v2');
    return svg;
  }

  if (name === 'shop') {
    addPath(svg, 'M6.5 9.2h11l-1 8.7a1.5 1.5 0 0 1-1.49 1.31H8.99A1.5 1.5 0 0 1 7.5 17.9l-1-8.7Z');
    addPath(svg, 'M8.5 9.2V8a3.5 3.5 0 0 1 7 0v1.2');
    addPath(svg, 'M10 12.1h4');
    return svg;
  }

  if (name === 'mcp') {
    addPath(svg, 'M5.75 7.25h12.5A1.5 1.5 0 0 1 19.75 8.75v6.5a1.5 1.5 0 0 1-1.5 1.5H5.75a1.5 1.5 0 0 1-1.5-1.5v-6.5a1.5 1.5 0 0 1 1.5-1.5Z');
    addPath(svg, 'm8.4 10.1-2 2 2 2');
    addPath(svg, 'M11.6 14.1h4');
    return svg;
  }

  if (name === 'call') {
    addPath(svg, 'M7.1 5.5h2.4l1.2 3-1.75 1.75a10 10 0 0 0 4.82 4.82l1.75-1.75 3 1.2v2.4c0 .9-.73 1.63-1.63 1.63-6.42 0-11.62-5.2-11.62-11.62 0-.9.73-1.63 1.63-1.63Z');
    return svg;
  }

  if (name === 'proactive') {
    addPath(svg, 'M12 5.5v13');
    addPath(svg, 'M7.5 10l4.5-4.5 4.5 4.5');
    return svg;
  }

  if (name === 'tool') {
    addCircle(svg, '12', '12', '2.6');
    addPath(svg, 'M12 4.7v2');
    addPath(svg, 'M12 17.3v2');
    addPath(svg, 'M19.3 12h-2');
    addPath(svg, 'M6.7 12h-2');
    addPath(svg, 'm17 7-1.4 1.4');
    addPath(svg, 'm8.4 15.6-1.4 1.4');
    addPath(svg, 'm17 17-1.4-1.4');
    addPath(svg, 'M8.4 8.4 7 7');
    return svg;
  }

  if (name === 'warning') {
    addPath(svg, 'M12 4.75 19 18.5H5L12 4.75Z');
    addPath(svg, 'M12 9.5v4');
    addCircle(svg, '12', '16.6', '0.55');
    return svg;
  }

  addPath(svg, 'M6.5 8.5h11');
  addPath(svg, 'M8.5 12h7');
  addPath(svg, 'M10.5 15.5h3');
  return svg;
}

function createSvgBase() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function addPath(svg, d) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
}

function addCircle(svg, cx, cy, r) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  node.setAttribute('cx', cx);
  node.setAttribute('cy', cy);
  node.setAttribute('r', r);
  svg.appendChild(node);
}

// ═══════════════════════════════════════
// 【工具文案映射】
// ═══════════════════════════════════════

const TOOL_COPY_MAP = {
  search: {
    icon: 'search',
    runningTitle: '去查了查',
    title: '去查了查',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在翻外面的资料，怕漏掉关键信息。';
      if (context.status === 'error') return '我本来想去外面找点资料，结果这一步刚刚卡了一下。';
      return '我先去外面补了一点资料，再回来把答案整理得更贴你。';
    }
  },
  mcp: {
    icon: 'mcp',
    runningTitle: '叫了外部小工具',
    title: '叫了外部小工具',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在让外部工具帮我办这一步，还没完全收回来。';
      if (context.status === 'error') return '我本来想让外部工具帮忙，结果它刚刚没接稳。';
      return '我借了一下外部小工具的手，把这一步悄悄办完了。';
    }
  },
  memory_add: {
    icon: 'memory',
    runningTitle: '正在记下一笔',
    title: '记下一小笔',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我觉得这件事以后可能还会用到，所以先记着。';
      if (context.status === 'error') return '我本来想把这件事记住，结果这一笔刚刚没落稳。';
      return '我把这次聊出来的重要点放进记忆里了，这样下次不用你再重说一遍。';
    }
  },
  memory_edit: {
    icon: 'memory-edit',
    runningTitle: '正在改记忆',
    title: '顺手改了改记忆',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把旧记录改得更准一点，免得以后用错。';
      if (context.status === 'error') return '我本来想把旧记录改准一点，结果这一步卡住了。';
      return '我把旧记忆里不够准的地方轻轻改好了，后面就不会别扭。';
    }
  },
  memory_delete: {
    icon: 'memory-delete',
    runningTitle: '正在删记忆',
    title: '轻轻删掉一条记忆',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把过时或者不准的旧记录收掉。';
      if (context.status === 'error') return '我本来想把不合适的旧记录删掉，结果这一页卡住了。';
      return '我把一条不再适合留下的旧记忆收走了，省得以后跑偏。';
    }
  },
  grudge_add: {
    icon: 'grudge',
    runningTitle: '正在写小本本',
    title: '在小本本上画圈圈',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我有一点点在意，所以先往小本本里放一笔。';
      if (context.status === 'error') return '我本来想把这件在意的事记到小本本里，结果刚刚卡了一下。';
      return '这件让我有点在意的事，我已经记到小本本里了。';
    }
  },
  grudge_edit: {
    icon: 'grudge',
    runningTitle: '正在改小本本',
    title: '把小本本改了改',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在整理小本本里的旧内容，让它更贴近现在的心情。';
      if (context.status === 'error') return '我本来想调整一下小本本里的内容，结果这一笔卡住了。';
      return '我把小本本里的旧内容理顺了一点，更贴近现在的心情。';
    }
  },
  grudge_delete: {
    icon: 'grudge',
    runningTitle: '正在翻掉一页',
    title: '把小本本翻掉一页',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把一件已经不想继续记着的事轻轻放下。';
      if (context.status === 'error') return '我本来想把这一页翻过去，结果刚刚没翻顺。';
      return '有一页我已经不想继续记着了，就轻轻翻过去啦。';
    }
  },
  transfer: {
    icon: 'transfer',
    runningTitle: '正在递小票据',
    title: '递了一张小票据',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在整理这张转账小卡片，准备把小心意递过去。';
      if (context.status === 'error') return '我本来想把这张小票据递过去，结果刚刚卡了一下。';
      return '我把这份转账小心意整理成卡片，方便你一眼看清。';
    }
  },
  gift: {
    icon: 'gift',
    runningTitle: '正在递小礼物',
    title: '递了一份小礼物',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把这份礼物的小卡片整理好。';
      if (context.status === 'error') return '我本来想把礼物递过去，结果这一步有点卡。';
      return '我把这份礼物的小卡片收拾好了，内容和小图也会一起带上。';
    }
  },
  shop_buy: {
    icon: 'shop',
    runningTitle: '正在逛小物商店',
    title: '去小物商店逛了逛',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在商店里挑东西，想看看哪一件更合适。';
      if (context.status === 'error') return '我本来想去商店里挑东西，结果这一趟刚刚卡住了。';
      return '我从小物商店里挑了合适的东西，顺手把卡片也整理好了。';
    }
  },
  call_summary: {
    icon: 'call',
    runningTitle: '正在整理电话余温',
    title: '把电话收成一小段记忆',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把刚刚通话里的情绪和重点收成一小段记忆。';
      if (context.status === 'error') return '我本来想把电话里的重点收一下，结果刚刚卡住了。';
      return '通话结束后，我把那一点点余温和重点收进了记忆里。';
    }
  },
  proactive: {
    icon: 'proactive',
    runningTitle: '想主动和你说话',
    title: '想主动和你说句话',
    summaryBuilder() {
      return '这是我自己想先开口的一小步，不是被硬推出来的。';
    }
  },
  tool: {
    icon: 'tool',
    runningTitle: '悄悄办点小事',
    title: '悄悄办点小事',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在把这一步慢慢办完。';
      if (context.status === 'error') return '这一步本来快弄好了，结果刚刚卡了一下。';
      return '我顺手把这一步办好了。';
    }
  },
  default: {
    icon: 'tool',
    title: '悄悄办点小事',
    summary: '我顺手把这一步办好了。'
  }
};

// ═══════════════════════════════════════
// 【样式注入】
// ═══════════════════════════════════════

function injectStyle() {
  const old = document.getElementById(THINKING_STYLE_ID);
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = THINKING_STYLE_ID;
  style.textContent = `
    .chat-thinking-card{
      width:100%;
      display:flex;
      flex-direction:column;
      gap:8px;
    }

    .chat-thinking-body{
      display:none;
    }

    .chat-thinking-preview{
      width:100%;
      display:flex;
      flex-direction:column;
      gap:10px;
    }

    .chat-thinking-preview-btn{
      width:fit-content;
      max-width:100%;
      min-height:38px;
      display:flex;
      align-items:center;
      gap:8px;
      padding:7px 12px;
      border:none;
      outline:none;
      border-radius:999px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 82%, transparent), var(--shadow-sm);
      font:inherit;
      font-size:13px;
      line-height:1.4;
      text-align:left;
      transition:all 200ms cubic-bezier(.34,1.56,.64,1);
      touch-action:manipulation;
    }

    .chat-thinking-preview-btn:active{
      transform:scale(.97);
    }

    .chat-thinking-preview-btn-text{
      min-width:0;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .chat-thinking-preview-btn > svg:first-child{
      width:15px;
      height:15px;
      flex:0 0 auto;
      color:var(--accent-dark);
    }

    .chat-thinking-preview-btn > svg:last-child,
    .chat-thinking-preview-arrow svg,
    .chat-thinking-sheet-close svg{
      width:14px;
      height:14px;
      flex:0 0 auto;
      color:var(--text-hint);
    }

    .chat-thinking-tools{
      position:relative;
      display:flex;
      flex-direction:column;
      gap:10px;
      padding-left:10px;
    }

    .chat-thinking-tools::before{
      content:"";
      position:absolute;
      left:19px;
      top:8px;
      bottom:8px;
      width:2px;
      border-radius:999px;
      background:color-mix(in srgb, var(--accent) 18%, transparent);
      opacity:.75;
    }

    .chat-thinking-preview-node{
      position:relative;
      width:100%;
      display:flex;
      align-items:center;
      gap:10px;
      padding:0;
      border:none;
      outline:none;
      background:transparent;
      font:inherit;
      text-align:left;
      transition:transform 200ms cubic-bezier(.34,1.56,.64,1);
      touch-action:manipulation;
    }

    .chat-thinking-preview-node:active{
      transform:scale(.985);
    }

    .chat-thinking-preview-dot{
      width:20px;
      height:20px;
      flex:0 0 auto;
      position:relative;
      border-radius:999px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
      z-index:1;
    }

    .chat-thinking-preview-dot::before{
      content:"";
      position:absolute;
      inset:5px;
      border-radius:999px;
      background:var(--accent-light);
    }

    .chat-thinking-preview-dot[data-status="running"]::before{
      background:var(--accent);
      animation:chatThinkingDotPulse 1.2s ease-in-out infinite;
    }

    .chat-thinking-preview-dot[data-status="error"]::before{
      background:color-mix(in srgb, var(--text-secondary) 78%, transparent);
    }

    .chat-thinking-preview-icon{
      width:24px;
      height:24px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:color-mix(in srgb, var(--bg-card) 90%, transparent);
      color:var(--accent-dark);
      box-shadow:var(--shadow-sm);
      position:relative;
      z-index:1;
    }

    .chat-thinking-preview-icon svg{
      width:14px;
      height:14px;
    }

    .chat-thinking-preview-text-wrap{
      flex:1;
      min-width:0;
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:10px;
      padding:10px 12px;
      border-radius:18px;
      background:var(--surface-muted);
      box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 84%, transparent), var(--shadow-sm);
    }

    .chat-thinking-preview-title{
      display:block;
      color:var(--text-primary);
      font-size:12.5px;
      font-weight:600;
      line-height:1.35;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      margin-bottom:2px;
    }

    .chat-thinking-preview-subtitle{
      display:block;
      color:var(--text-secondary);
      font-size:11.5px;
      line-height:1.4;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .chat-thinking-preview-arrow{
      width:18px;
      height:18px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
    }

    .chat-thinking-sheet-mask{
      position:fixed;
      inset:0;
      z-index:10040;
      background:color-mix(in srgb, var(--text-primary) 18%, transparent);
      opacity:0;
      pointer-events:none;
      transition:opacity 200ms ease;
    }

    .chat-thinking-sheet-mask[data-show="true"]{
      opacity:1;
      pointer-events:auto;
    }

    .chat-thinking-sheet{
      position:fixed;
      left:0;
      right:0;
      bottom:0;
      z-index:10041;
      width:100vw;
      height:50vh;
      display:flex;
      flex-direction:column;
      border-radius:28px 28px 0 0;
      background:color-mix(in srgb, var(--bg-card) 94%, transparent);
      backdrop-filter:blur(18px);
      box-shadow:var(--shadow-float);
      transform:translateY(108%);
      transition:transform 220ms cubic-bezier(.22,1,.36,1);
      overflow:hidden;
    }

    .chat-thinking-sheet[data-show="true"]{
      transform:translateY(0);
    }

    .chat-thinking-sheet-handle{
      width:42px;
      height:5px;
      flex:0 0 auto;
      margin:10px auto 8px;
      border-radius:999px;
      background:var(--accent-light);
    }

    .chat-thinking-sheet-head{
      flex:0 0 auto;
      display:flex;
      align-items:center;
      gap:10px;
      padding:0 16px 14px;
    }

    .chat-thinking-sheet-close{
      width:34px;
      height:34px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border:none;
      outline:none;
      border-radius:999px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms cubic-bezier(.34,1.56,.64,1);
      touch-action:manipulation;
    }

    .chat-thinking-sheet-close:active{
      transform:scale(.94);
    }

    .chat-thinking-sheet-title-wrap{
      flex:1;
      min-width:0;
      display:flex;
      justify-content:center;
      padding-right:34px;
    }

    .chat-thinking-sheet-title-pill{
      max-width:100%;
      padding:9px 16px;
      border-radius:999px;
      background:var(--surface-muted);
      box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 84%, transparent);
      color:var(--text-primary);
      font-size:14px;
      font-weight:600;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .chat-thinking-sheet-body{
      flex:1;
      min-height:0;
      overflow-y:auto;
      padding:0 16px calc(20px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling:touch;
    }

    .chat-thinking-sheet-stack{
      display:flex;
      flex-direction:column;
      gap:10px;
      padding-bottom:4px;
    }

    .chat-thinking-sheet-card{
      padding:14px;
      border-radius:22px;
      background:var(--bg-card);
      box-shadow:var(--shadow-card);
    }

    .chat-thinking-sheet-intro{
      display:flex;
      align-items:center;
      gap:8px;
      margin-bottom:10px;
      color:var(--text-secondary);
      font-size:12.5px;
      line-height:1.45;
    }

    .chat-thinking-sheet-intro svg{
      width:15px;
      height:15px;
      flex:0 0 auto;
      color:var(--accent-dark);
    }

    .chat-thinking-sheet-paragraph,
    .chat-thinking-sheet-content-box{
      color:var(--text-primary);
      font-size:13.5px;
      line-height:1.8;
      white-space:pre-wrap;
      word-break:break-word;
    }

    .chat-thinking-sheet-content-box{
      padding:12px;
      border-radius:18px;
      background:var(--surface-muted);
      box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 84%, transparent);
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.72;
    }

    .chat-thinking-sheet-section-title{
      margin-bottom:8px;
      color:var(--text-primary);
      font-size:13px;
      font-weight:600;
      line-height:1.4;
    }

    .chat-thinking-sheet-side-note{
      color:var(--text-hint);
      font-size:12px;
      line-height:1.5;
      padding:0 4px;
    }

    .chat-thinking-sheet-info-list{
      display:flex;
      flex-direction:column;
      gap:10px;
    }

    .chat-thinking-sheet-info-row{
      display:grid;
      grid-template-columns:72px minmax(0,1fr);
      gap:10px;
      align-items:start;
    }

    .chat-thinking-sheet-info-label{
      color:var(--text-hint);
      font-size:12px;
      line-height:1.45;
    }

    .chat-thinking-sheet-info-value{
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.55;
      word-break:break-word;
    }

    @keyframes chatThinkingDotPulse{
      0%,100%{transform:scale(.9);opacity:.6}
      50%{transform:scale(1.08);opacity:1}
    }

    @media(max-width:520px){
      .chat-thinking-preview-text-wrap{
        padding:10px 11px;
      }

      .chat-thinking-sheet-info-row{
        grid-template-columns:64px minmax(0,1fr);
      }
    }

    @media(prefers-reduced-motion:reduce){
      .chat-thinking-preview-btn,
      .chat-thinking-preview-node,
      .chat-thinking-sheet-mask,
      .chat-thinking-sheet,
      .chat-thinking-sheet-close,
      .chat-thinking-preview-dot[data-status="running"]::before{
        transition:none;
        animation:none;
      }
    }
  `;
  document.head.appendChild(style);
}
