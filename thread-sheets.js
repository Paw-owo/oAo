// ═══════════════════════════════════════
// 【模块】工具详情页 - 快捷回复/心情/接龙可编辑 + 转账/语音文字/清上下文/MCP
// ═══════════════════════════════════════
// imports from storage.js: getData, setData, getNow
// imports from ui.js: createIcon, showBottomSheet, hideBottomSheet, showToast
// imports from thread-actions.js: sendThreadMessage, sendTransferMessage
// imports from thread-relationship.js: openRelationshipLockSheet
// ═══════════════════════════════════════

import { getData, setData, getNow } from '../../core/storage.js';
import { createIcon, showBottomSheet, hideBottomSheet, showToast } from '../../core/ui.js';
import { sendThreadMessage, sendTransferMessage } from './thread-actions.js';
import { openRelationshipLockSheet } from './thread-relationship.js';

const SHEET_STYLE_ID = 'chat-thread-sheets-style';

// ═══════════════════════════════════════
// 【数据读写】快捷回复/心情/接龙统一结构
// ═══════════════════════════════════════

function loadList(key) {
  const raw = getData(key);
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

function saveList(key, list) {
  setData(key, list.filter(Boolean));
}

// ═══════════════════════════════════════
// 【快捷回复】可编辑列表，点标题直接发出去
// ═══════════════════════════════════════

export function openQuickReplySheet(state, options = {}) {
  injectStyle();
  renderEditableSheet(state, options, {
    title: '快捷回复',
    desc: '自定义常用指令，点一下就发出去。',
    emptyTip: '还没有快捷回复，点"添加"开始吧~',
    storageKey: 'chat_quick_replies',
    sendLabel: '发出去',
  });
}

// ═══════════════════════════════════════
// 【心情】可编辑列表，点标题直接发出去
// ═══════════════════════════════════════

export function openMoodSheet(state, options = {}) {
  injectStyle();
  renderEditableSheet(state, options, {
    title: '心情',
    desc: '告诉AI你现在想要什么感觉。',
    emptyTip: '还没有心情卡片，点"添加"开始吧~',
    storageKey: 'chat_mood_options',
    sendLabel: '发出去',
  });
}

// ═══════════════════════════════════════
// 【接龙】可编辑列表，点标题直接发出去
// ═══════════════════════════════════════

export function openRelaySheet(state, options = {}) {
  injectStyle();
  renderEditableSheet(state, options, {
    title: '接龙',
    desc: '自定义接龙内容，点一下就把话题丢出去。',
    emptyTip: '还没有接龙内容，点"添加"开始吧~',
    storageKey: 'chat_relay_presets',
    sendLabel: '发出去',
  });
}

// ═══════════════════════════════════════
// 【统一编辑列表渲染】快捷回复/心情/接龙共用
// ═══════════════════════════════════════

function renderEditableSheet(state, options, config) {
  const { title, desc, emptyTip, storageKey, sendLabel } = config;
  const sheet = el('div', 'thread-sheet-wrap');

  const head = el('div', 'thread-sheet-head');

  if (options.onBackToTools) {
    const backBtn = el('button', 'thread-sheet-back-btn');
    backBtn.type = 'button';
    backBtn.setAttribute('aria-label', '返回消息');
    backBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    backBtn.addEventListener('click', options.onBackToTools);
    head.appendChild(backBtn);
  }

  const headText = el('div', 'thread-sheet-head-text');
  headText.append(
    el('div', 'thread-sheet-title', title),
    el('div', 'thread-sheet-desc', desc)
  );
  head.append(headText);
  sheet.append(head);

  const toolbar = el('div', 'editable-toolbar');

  const editBtn = el('button', 'editable-toolbar-btn', '编辑');
  const deleteBtn = el('button', 'editable-toolbar-btn', '删除');
  const addBtn = el('button', 'editable-toolbar-btn primary', '添加');

  let mode = 'view';
  let items = loadList(storageKey);

  function rerender() {
    renderEditableSheet(state, options, config);
  }

  function refreshList() {
    listWrap.innerHTML = '';
    if (!items.length) {
      listWrap.append(createEmptyTip(emptyTip));
      return;
    }

    items.forEach((item, index) => {
      const card = el('div', 'editable-card');
      if (mode === 'delete') card.classList.add('is-delete-mode');
      if (mode === 'edit') card.classList.add('is-edit-mode');

      if (mode === 'delete') {
        const delBtn = el('button', 'editable-card-del');
        delBtn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>';
        delBtn.addEventListener('click', function() {
          items.splice(index, 1);
          saveList(storageKey, items);
          refreshList();
        });
        card.appendChild(delBtn);
      }

      const titleEl = el('div', 'editable-card-title', item.title || '无标题');
      const contentPreview = el('div', 'editable-card-content');

      if (mode === 'edit') {
        titleEl.style.cursor = 'pointer';
        titleEl.addEventListener('click', function() {
          openEditItemSheet(state, options, config, items, index, rerender);
        });
        contentPreview.textContent = item.content || '点击编辑内容...';
        contentPreview.style.cursor = 'pointer';
        contentPreview.addEventListener('click', function() {
          openEditItemSheet(state, options, config, items, index, rerender);
        });
      } else {
        contentPreview.textContent = item.content ? (item.content.length > 50 ? item.content.slice(0, 50) + '...' : item.content) : '暂无内容';
      }

      card.append(titleEl, contentPreview);

      if (mode === 'view') {
        card.style.cursor = 'pointer';
        card.addEventListener('click', async function() {
          const text = item.content || item.title || '';
          if (!text) {
            showToast('没有可发送的内容');
            return;
          }
          if (options.containerEl) {
            if (typeof options.onBack === 'function') options.onBack();
          } else {
            hideBottomSheet();
          }
          await sendThreadMessage(state, text, { triggerAI: true });
        });
      }

      listWrap.appendChild(card);
    });
  }

  function refreshToolbar() {
    editBtn.classList.toggle('is-active', mode === 'edit');
    deleteBtn.classList.toggle('is-active', mode === 'delete');
  }

  editBtn.addEventListener('click', function() {
    mode = mode === 'edit' ? 'view' : 'edit';
    refreshToolbar();
    refreshList();
  });

  deleteBtn.addEventListener('click', function() {
    mode = mode === 'delete' ? 'view' : 'delete';
    refreshToolbar();
    refreshList();
  });

  addBtn.addEventListener('click', function() {
    openAddItemSheet(state, options, config, items, rerender);
  });

  toolbar.append(editBtn, deleteBtn, addBtn);
  sheet.append(toolbar);

  const listWrap = el('div', 'editable-list');
  refreshList();
  sheet.append(listWrap);

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【添加条目】底部抽屉填标题+内容
// ═══════════════════════════════════════

function openAddItemSheet(state, options, config, items, rerender) {
  const addSheet = el('div', 'thread-sheet-wrap');

  const head = el('div', 'thread-sheet-head');
  head.append(
    el('div', 'thread-sheet-title', '添加' + config.title),
    el('div', 'thread-sheet-desc', '给这条起个标题，再写具体内容。')
  );
  addSheet.append(head);

  const form = el('section', 'thread-sheet-form');

  const titleField = el('div', 'thread-sheet-field');
  titleField.append(el('div', 'thread-sheet-field-title', '标题'));
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'thread-sheet-input';
  titleInput.placeholder = '例如：ai自检';
  titleInput.autocomplete = 'off';
  titleInput.setAttribute('spellcheck', 'false');
  titleField.append(titleInput);

  const contentField = el('div', 'thread-sheet-field');
  contentField.append(el('div', 'thread-sheet-field-title', '内容'));
  const contentInput = document.createElement('textarea');
  contentInput.className = 'thread-sheet-textarea';
  contentInput.placeholder = '例如：请检查你当前的记忆状态，汇报给我。';
  contentInput.rows = 3;
  contentInput.autocomplete = 'off';
  contentInput.setAttribute('spellcheck', 'false');
  contentField.append(contentInput);

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('取消', 'ghost');
  cancel.addEventListener('click', function() {
    if (options.containerEl) {
      rerender();
    } else {
      hideBottomSheet();
    }
  });

  const confirm = actionButton('确认添加', 'primary');
  confirm.addEventListener('click', function() {
    const t = titleInput.value.trim();
    const c = contentInput.value.trim();
    if (!t && !c) {
      showToast('至少写点内容吧~');
      return;
    }
    items.push({ title: t || '未命名', content: c || '' });
    saveList(config.storageKey, items);
    showToast('已添加~');
    if (options.containerEl) {
      rerender();
    } else {
      hideBottomSheet();
    }
  });

  actions.append(cancel, confirm);
  form.append(titleField, contentField, actions);
  addSheet.append(form);

  if (options.containerEl) {
    options.containerEl.innerHTML = '';
    options.containerEl.appendChild(addSheet);
    return;
  }

  showBottomSheet(addSheet);
}

// ═══════════════════════════════════════
// 【编辑条目】底部抽屉修改标题+内容
// ═══════════════════════════════════════

function openEditItemSheet(state, options, config, items, index, rerender) {
  const item = items[index] || { title: '', content: '' };
  const editSheet = el('div', 'thread-sheet-wrap');

  const head = el('div', 'thread-sheet-head');
  head.append(
    el('div', 'thread-sheet-title', '编辑' + config.title),
    el('div', 'thread-sheet-desc', '修改这条的标题和内容。')
  );
  editSheet.append(head);

  const form = el('section', 'thread-sheet-form');

  const titleField = el('div', 'thread-sheet-field');
  titleField.append(el('div', 'thread-sheet-field-title', '标题'));
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'thread-sheet-input';
  titleInput.value = item.title || '';
  titleInput.autocomplete = 'off';
  titleInput.setAttribute('spellcheck', 'false');
  titleField.append(titleInput);

  const contentField = el('div', 'thread-sheet-field');
  contentField.append(el('div', 'thread-sheet-field-title', '内容'));
  const contentInput = document.createElement('textarea');
  contentInput.className = 'thread-sheet-textarea';
  contentInput.value = item.content || '';
  contentInput.rows = 3;
  contentInput.autocomplete = 'off';
  contentInput.setAttribute('spellcheck', 'false');
  contentField.append(contentInput);

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('取消', 'ghost');
  cancel.addEventListener('click', function() {
    if (options.containerEl) {
      rerender();
    } else {
      hideBottomSheet();
    }
  });

  const confirm = actionButton('保存修改', 'primary');
  confirm.addEventListener('click', function() {
    const t = titleInput.value.trim();
    const c = contentInput.value.trim();
    if (!t && !c) {
      showToast('至少写点内容吧~');
      return;
    }
    items[index] = { title: t || '未命名', content: c || '' };
    saveList(config.storageKey, items);
    showToast('已保存~');
    if (options.containerEl) {
      rerender();
    } else {
      hideBottomSheet();
    }
  });

  actions.append(cancel, confirm);
  form.append(titleField, contentField, actions);
  editSheet.append(form);

  if (options.containerEl) {
    options.containerEl.innerHTML = '';
    options.containerEl.appendChild(editSheet);
    return;
  }

  showBottomSheet(editSheet);
}

// ═══════════════════════════════════════
// 【转账】发转账小卡片
// ═══════════════════════════════════════

export function openTransferSheet(state, options = {}) {
  injectStyle();

  const preset = {
    amount: Number(options.amount || 0) || 0,
    note: String(options.note || '').trim(),
    title: String(options.title || '转账小心意').trim(),
    description: String(options.description || '').trim()
  };

  const sheet = el('div', 'thread-sheet-wrap');
  const form = el('section', 'thread-sheet-form');

  const amountInput = numberInput('金额', '输入一个大于 0 的数。', preset.amount || 10, 0.01, 999999, 1);
  const noteInput = textInput('备注', '例如：今天的奶茶。', preset.note || '');
  const titleInput = textInput('标题', '卡片上显示什么名字。', preset.title);
  const descInput = textareaInput('说明', '卡片上的一句小字。', preset.description || '');

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('先不发', 'ghost');
  cancel.addEventListener('click', () => {
    if (options.containerEl) {
      if (typeof options.onBack === 'function') options.onBack();
    } else {
      hideBottomSheet();
    }
  });

  const send = actionButton('发出去', 'primary');
  send.addEventListener('click', async () => {
    const amount = clampMoney(amountInput.input.value);
    const note = String(noteInput.input.value || '').trim();
    const title = String(titleInput.input.value || '').trim() || '转账小心意';
    const description = String(descInput.input.value || '').trim() || note || `转账 ¥${formatAmount(amount)}`;

    if (!(amount > 0)) {
      showToast('金额要大于 0');
      return;
    }

    if (!options.containerEl) hideBottomSheet();
    await sendTransferMessage(state, amount, note, {
      title,
      description,
      triggerAI: true
    });
  });

  actions.append(cancel, send);
  form.append(
    amountInput.wrap,
    noteInput.wrap,
    titleInput.wrap,
    descInput.wrap,
    actions
  );

  sheet.append(
    createSheetHead('转账', '发一张会进聊天里的小卡片。', options),
    form
  );

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【清上下文】减少当前聊天可见上下文
// ═══════════════════════════════════════

export function openClearContextSheet(state, options = {}) {
  injectStyle();

  const visibleCount = Number(state?.visibleCount || 12);
  const sheet = el('div', 'thread-sheet-wrap');

  const wrap = el('section', 'thread-sheet-card');
  wrap.append(
    el('div', 'thread-sheet-note', `当前会显示最近 ${visibleCount} 条。`)
  );

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'thread-sheet-slider';
  slider.min = '4';
  slider.max = '40';
  slider.step = '1';
  slider.value = String(clampNumber(visibleCount, 4, 40));

  const valueText = el('div', 'thread-sheet-slider-value', `最近 ${slider.value} 条`);

  slider.addEventListener('input', () => {
    valueText.textContent = `最近 ${slider.value} 条`;
  });

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('取消', 'ghost');
  cancel.addEventListener('click', () => {
    if (options.containerEl) {
      if (typeof options.onBack === 'function') options.onBack();
    } else {
      hideBottomSheet();
    }
  });

  const save = actionButton('确定', 'primary');
  save.addEventListener('click', async () => {
    const next = clampNumber(slider.value, 4, 40);
    state.visibleCount = next;
    setData(getVisibleCountKey(state), next);

    if (!options.containerEl) hideBottomSheet();

    if (typeof options.onChange === 'function') {
      await options.onChange(next);
      return;
    }

    if (typeof state?.reloadAndRender === 'function') {
      await state.reloadAndRender();
    }
    showToast('已经收好了');
  });

  actions.append(cancel, save);
  wrap.append(slider, valueText, actions);
  sheet.append(createSheetHead('清上下文', '把聊天缩短一点。', options), wrap);

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【MCP】工具入口占位抽屉
// ═══════════════════════════════════════

export function openMcpSheet(state, options = {}) {
  injectStyle();

  const sheet = el('div', 'thread-sheet-wrap');
  const list = normalizeArray(options.items || getData('chat_mcp_tools') || []);

  sheet.append(
    createSheetHead('MCP', '这里放外部工具入口。', options),
    list.length
      ? createChipGrid(list.map((item) => ({
          title: String(item.title || item.name || '工具').trim(),
          desc: String(item.desc || item.description || '').trim(),
          icon: String(item.icon || 'web')
        })), async (item) => {
          if (!options.containerEl) hideBottomSheet();
          if (typeof item.onClick === 'function') {
            await item.onClick(state, item);
            return;
          }
          showToast('这个工具还没接上');
        }, '还没有工具。')
      : createEmptyTip('这里还没有接入外部工具。')
  );

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【语音文字】发一条可当作语音文字的消息
// ═══════════════════════════════════════

export function openVoiceTextSheet(state, options = {}) {
  injectStyle();

  const sheet = el('div', 'thread-sheet-wrap');
  const form = el('section', 'thread-sheet-form');

  const textInputEl = textareaInput('文字', '这里先手动输入要发的话。', String(options.text || '').trim() || '');
  const noteInput = textInput('备注', '可不填。', String(options.note || '').trim() || '');

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('先不发', 'ghost');
  cancel.addEventListener('click', () => {
    if (options.containerEl) {
      if (typeof options.onBack === 'function') options.onBack();
    } else {
      hideBottomSheet();
    }
  });

  const send = actionButton('发出去', 'primary');
  send.addEventListener('click', async () => {
    const text = String(textInputEl.input.value || '').trim();
    const note = String(noteInput.input.value || '').trim();

    if (!text) {
      showToast('先写点内容吧');
      return;
    }

    if (!options.containerEl) hideBottomSheet();
    await sendThreadMessage(state, text, {
      type: 'voice',
      note,
      triggerAI: true
    });
  });

  actions.append(cancel, send);
  form.append(textInputEl.wrap, noteInput.wrap, actions);

  sheet.append(
    createSheetHead('语音文字', '先写成文字发出去，之后再看要不要做成语音。', options),
    form
  );

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【关系锁入口】统一转给关系锁抽屉
// ═══════════════════════════════════════

export function openRelationshipSheet(state, options = {}) {
  return openRelationshipLockSheet(state, {
    ...options,
    containerEl: options.containerEl || null,
    onBack: options.onBack || null
  });
}

// ═══════════════════════════════════════
// 【渲染分发】有容器就渲染进去，没有就开抽屉
// ═══════════════════════════════════════

function renderSheet(sheet, containerEl) {
  if (containerEl) {
    containerEl.replaceChildren(sheet);
    return;
  }
  showBottomSheet(sheet);
}

// ═══════════════════════════════════════
// 【公共工具】标题、输入、卡片和按钮
// ═══════════════════════════════════════

function createSheetHead(title, desc, sheetOptions) {
  const head = el('div', 'thread-sheet-head');

  if (sheetOptions?.onBackToTools) {
    const backBtn = el('button', 'thread-sheet-back-btn');
    backBtn.type = 'button';
    backBtn.setAttribute('aria-label', '返回消息');
    backBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    backBtn.addEventListener('click', sheetOptions.onBackToTools);
    head.appendChild(backBtn);
  }

  const headText = el('div', 'thread-sheet-head-text');
  headText.append(
    el('div', 'thread-sheet-title', title || ''),
    el('div', 'thread-sheet-desc', desc || '')
  );
  head.append(headText);
  return head;
}

function createChipGrid(items, onPick, emptyText) {
  const wrap = el('div', 'thread-chip-grid');
  if (!items.length) {
    wrap.append(createEmptyTip(emptyText || '没有内容。'));
    return wrap;
  }
  items.forEach((item) => {
    const button = el('button', 'thread-chip-card');
    button.type = 'button';
    const icon = el('span', 'thread-chip-icon');
    icon.appendChild(createIcon(item.icon || 'message', 18));
    const text = el('span', 'thread-chip-text');
    text.append(
      el('span', 'thread-chip-title', item.title || ''),
      el('span', 'thread-chip-desc', item.desc || '')
    );
    button.append(icon, text);
    button.addEventListener('click', async () => { await onPick?.(item); });
    wrap.append(button);
  });
  return wrap;
}

function createEmptyTip(text) {
  return el('div', 'thread-sheet-empty', text || '');
}

function textInput(title, desc, value) {
  const wrap = el('section', 'thread-sheet-field');
  wrap.append(el('div', 'thread-sheet-field-title', title || ''), el('div', 'thread-sheet-field-desc', desc || ''));
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'thread-sheet-input';
  input.value = String(value || '');
  input.autocomplete = 'off';
  input.setAttribute('spellcheck', 'false');
  wrap.append(input);
  return { wrap, input };
}

function textareaInput(title, desc, value) {
  const wrap = el('section', 'thread-sheet-field');
  wrap.append(el('div', 'thread-sheet-field-title', title || ''), el('div', 'thread-sheet-field-desc', desc || ''));
  const input = document.createElement('textarea');
  input.className = 'thread-sheet-textarea';
  input.value = String(value || '');
  input.rows = 3;
  input.autocomplete = 'off';
  input.setAttribute('spellcheck', 'false');
  wrap.append(input);
  return { wrap, input };
}

function numberInput(title, desc, value, min, max, step) {
  const wrap = el('section', 'thread-sheet-field');
  wrap.append(el('div', 'thread-sheet-field-title', title || ''), el('div', 'thread-sheet-field-desc', desc || ''));
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'thread-sheet-input';
  input.value = String(value ?? 0);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step || 1);
  wrap.append(input);
  return { wrap, input };
}

function actionButton(text, kind = 'ghost') {
  const button = el('button', `thread-sheet-btn ${kind}`);
  button.type = 'button';
  button.textContent = text || '';
  return button;
}

function getVisibleCountKey(state) {
  if (!state?.characterId) return 'chat_visible_count_default';
  return `chat_${state.characterId}_visible_count`;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function clampMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Number(number.toFixed(2)));
}

function formatAmount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(2);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}
// ═══════════════════════════════════════
// 【样式】底部抽屉、卡片、按钮、编辑列表
// ═══════════════════════════════════════

function injectStyle() {
  // 修复：先删旧标签再创建新的，避免 CSS 修改不生效
  const old = document.getElementById(SHEET_STYLE_ID);
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = SHEET_STYLE_ID;
  style.textContent = `
    .thread-sheet-wrap{padding:6px 20px 20px;color:var(--text-primary)}
    .thread-sheet-head{display:flex;align-items:center;gap:10px;margin-bottom:16px}
    .thread-sheet-head-text{min-width:0;flex:1}
    .thread-sheet-back-btn{width:36px;height:36px;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;border:none;outline:none;border-radius:var(--radius-md);background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm);transition:all 200ms ease}
    .thread-sheet-back-btn:active{transform:scale(.94)}
    .thread-sheet-back-btn svg{width:18px;height:18px}
    .thread-sheet-title{color:var(--text-primary);font-size:17px;font-weight:600;line-height:1.35}
    .thread-sheet-desc{margin-top:4px;color:var(--text-secondary);font-size:13px;line-height:1.55}
    .thread-sheet-card,.thread-sheet-form{padding:14px;border-radius:24px;background:var(--bg-card);box-shadow:var(--shadow-sm)}
    .thread-chip-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .thread-chip-card{min-height:74px;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;padding:12px;border-radius:18px;background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);text-align:left;transition:all 200ms ease}
    .thread-chip-card:active,.thread-sheet-btn:active{transform:scale(.96)}
    .thread-chip-icon{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:14px;background:var(--bg-card);color:var(--accent);box-shadow:var(--shadow-sm)}
    .thread-chip-text{min-width:0;display:flex;flex-direction:column;gap:4px}
    .thread-chip-title{color:var(--text-primary);font-size:14px;font-weight:600;line-height:1.35;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .thread-chip-desc{color:var(--text-secondary);font-size:12px;line-height:1.45;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .thread-sheet-empty{padding:16px 12px;border-radius:18px;background:var(--surface-muted);color:var(--text-secondary);font-size:13px;line-height:1.6;text-align:center}
    .thread-sheet-field{margin-top:12px;display:flex;flex-direction:column;gap:8px}
    .thread-sheet-field-title{color:var(--text-primary);font-size:14px;font-weight:600;line-height:1.35}
    .thread-sheet-field-desc{color:var(--text-secondary);font-size:12px;line-height:1.5}
    .thread-sheet-input,.thread-sheet-textarea{width:100%;border-radius:18px;background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);font:inherit;font-size:16px;line-height:1.6;-webkit-appearance:none;appearance:none}
    .thread-sheet-input{min-height:44px;padding:0 12px}
    .thread-sheet-textarea{min-height:96px;padding:11px 12px;resize:none}
    .thread-sheet-slider{width:100%;margin-top:12px;accent-color:var(--accent)}
    .thread-sheet-slider-value{margin-top:8px;color:var(--text-hint);font-size:12px;line-height:1.4}
    .thread-sheet-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
    .thread-sheet-btn{min-height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:16px;box-shadow:var(--shadow-sm);font:inherit;font-size:14px;font-weight:600;transition:all 200ms ease}
    .thread-sheet-btn.ghost{background:var(--bg-card);color:var(--text-secondary)}
    .thread-sheet-btn.primary{background:var(--accent);color:var(--bubble-user-text)}
    .editable-toolbar{display:flex;gap:8px;margin-bottom:12px}
    .editable-toolbar-btn{flex:1;height:36px;border-radius:12px;background:var(--bg-card);color:var(--text-secondary);font-size:13px;font-weight:500;border:none;cursor:pointer;transition:all 200ms ease;box-shadow:var(--shadow-sm)}
    .editable-toolbar-btn:active{transform:scale(0.95)}
    .editable-toolbar-btn.is-active{background:var(--accent);color:var(--bubble-user-text)}
    .editable-toolbar-btn.primary{background:var(--accent);color:var(--bubble-user-text)}
    .editable-list{display:flex;flex-direction:column;gap:10px;max-height:50vh;overflow-y:auto;padding-bottom:8px}
    .editable-card{position:relative;padding:14px 16px;border-radius:18px;background:var(--bg-card);box-shadow:var(--shadow-sm);transition:all 200ms ease;overflow:hidden}
    .editable-card:active{transform:scale(0.98)}
    .editable-card.is-delete-mode{padding-left:40px}
    .editable-card.is-edit-mode{padding-bottom:16px}
    .editable-card-title{font-size:15px;font-weight:600;color:var(--text-primary);line-height:1.4;margin-bottom:4px}
    .editable-card-content{font-size:13px;color:var(--text-secondary);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .editable-card-del{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:24px;height:24px;border-radius:50%;background:rgba(255,80,80,0.12);color:rgb(255,80,80);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:all 0.2s ease}
    .editable-card-del:active{transform:translateY(-50%) scale(0.9)}
    @media(max-width:430px){.thread-chip-grid{grid-template-columns:1fr}.thread-sheet-actions{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){.thread-chip-card,.thread-sheet-btn,.thread-sheet-back-btn,.editable-card,.editable-toolbar-btn{transition:none}}
  `;
  document.head.appendChild(style);
}

// 改了什么：injectStyle 函数开头从"if (document.getElementById(SHEET_STYLE_ID)) return"改为"const old = ...; if (old) old.remove()"，先删旧标签再创建新的。
// 原来效果：工具详情页 CSS 修改后永远不生效。
// 现在效果：每次调用都先清理旧标签再写入新样式。
// 会不会影响其他文件：不会。导出接口不变，依赖不变。
// 依赖：../../core/storage.js(getData,setData,getNow)；../../core/ui.js(createIcon,showBottomSheet,hideBottomSheet,showToast)；./thread-actions.js(sendThreadMessage,sendTransferMessage)；./thread-relationship.js(openRelationshipLockSheet)
