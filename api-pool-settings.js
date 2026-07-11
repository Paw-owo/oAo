// apps/settings/api-pool-settings.js
// API 轮换池设置页：付费/免费分组管理、接口增删改查、测试
// imports:
//   from '../../core/api.js': getPoolGroups, setPoolGroups, getApiPoolItems, addPoolEndpoint, updatePoolEndpoint, deletePoolEndpoint, testPoolEndpoint, testAllPoolEndpoints
//   from '../../core/ui.js': showToast, showConfirm
//   from '../../core/storage.js': generateId, getNow

import {
  getPoolGroups,
  setPoolGroups,
  getApiPoolItems,
  addPoolEndpoint,
  updatePoolEndpoint,
  deletePoolEndpoint,
  testPoolEndpoint,
  testAllPoolEndpoints
} from '../../core/api.js';
import { showToast, showConfirm } from '../../core/ui.js';
import { generateId } from '../../core/storage.js';

let container = null;
let options = null;
let styleEl = null;
let items = [];
let groups = {};
let testingAll = false;

const STYLE_ID = 'api-pool-settings-style';

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
    .api-pool-host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .api-pool-actions {
      display: flex;
      gap: 8px;
    }

    .api-pool-actions button {
      flex: 1;
      height: 40px;
      border-radius: 14px;
      background: var(--accent);
      color: var(--bubble-user-text);
      font-size: var(--font-size-small);
      font-weight: 600;
      transition: var(--motion);
    }

    .api-pool-actions button:active {
      transform: var(--press-scale);
    }

    .api-pool-actions button.secondary {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .api-pool-group {
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .api-pool-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .api-pool-group-name {
      font-size: var(--font-size-title);
      font-weight: 600;
      color: var(--text-primary);
    }

    .api-pool-group-meta {
      font-size: var(--font-size-small);
      color: var(--text-secondary);
    }

    .api-pool-toggle {
      min-width: 48px;
      height: 28px;
      border-radius: 999px;
      background: var(--surface-muted);
      position: relative;
      transition: background 200ms ease;
      flex-shrink: 0;
    }

    .api-pool-toggle.on {
      background: var(--accent);
    }

    .api-pool-toggle::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: transform 200ms ease;
    }

    .api-pool-toggle.on::after {
      transform: translateX(20px);
    }

    .api-pool-endpoint {
      border-radius: 14px;
      background: var(--surface-muted);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .api-pool-endpoint-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .api-pool-endpoint-name {
      font-size: var(--font-size-base);
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .api-pool-status {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      flex-shrink: 0;
    }

    .api-pool-status.ok {
      background: color-mix(in srgb, #4caf50 18%, transparent);
      color: #2e7d32;
    }

    .api-pool-status.error {
      background: color-mix(in srgb, #ef5350 18%, transparent);
      color: #c62828;
    }

    .api-pool-status.idle {
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    .api-pool-status.testing {
      background: color-mix(in srgb, var(--accent) 20%, transparent);
      color: var(--accent-dark);
    }

    .api-pool-endpoint-url {
      font-size: var(--font-size-small);
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .api-pool-endpoint-model {
      font-size: var(--font-size-small);
      color: var(--text-secondary);
    }

    .api-pool-endpoint-error {
      font-size: var(--font-size-small);
      color: #c62828;
      line-height: 1.4;
      word-break: break-word;
    }

    .api-pool-endpoint-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }

    .api-pool-endpoint-actions button {
      height: 30px;
      padding: 0 10px;
      border-radius: 10px;
      background: var(--bg-card);
      color: var(--text-primary);
      font-size: 12px;
      transition: var(--motion);
    }

    .api-pool-endpoint-actions button:active {
      transform: var(--press-scale);
    }

    .api-pool-endpoint-actions button.danger {
      color: #c62828;
    }

    .api-pool-empty {
      text-align: center;
      padding: 16px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .api-pool-form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 10px;
    }

    .api-pool-form-field label {
      font-size: var(--font-size-small);
      color: var(--text-secondary);
      font-weight: 600;
    }

    .api-pool-form-field input,
    .api-pool-form-field textarea {
      width: 100%;
      padding: 8px 10px;
      border-radius: 12px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-family: inherit;
      border: none;
      outline: none;
    }

    .api-pool-form-group {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }

    .api-pool-form-group button {
      flex: 1;
      height: 36px;
      border-radius: 12px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      transition: var(--motion);
    }

    .api-pool-form-group button.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }
  `;
  document.head.appendChild(styleEl);
}

function removeStyle() {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

async function loadData() {
  groups = getPoolGroups();
  items = await getApiPoolItems();
}

function renderAll() {
  if (!container) return;
  container.replaceChildren();
  container.append(renderActions(), renderGroup('paid'), renderGroup('free'));
}

function renderActions() {
  const wrap = el('div', 'api-pool-actions');
  const addBtn = el('button', '', '新增接口');
  addBtn.addEventListener('click', () => openEditor(null));
  const testAllBtn = el('button', 'secondary', testingAll ? '测试中…' : '全部测试');
  testAllBtn.disabled = testingAll;
  testAllBtn.addEventListener('click', handleTestAll);
  wrap.append(addBtn, testAllBtn);
  return wrap;
}

function renderGroup(groupType) {
  const g = groups[groupType] || {};
  const groupItems = items.filter((item) => item.groupType === groupType);

  const wrap = el('div', 'api-pool-group');

  const header = el('div', 'api-pool-group-header');
  const info = el('div');
  info.append(
    el('div', 'api-pool-group-name', g.name || (groupType === 'paid' ? '付费组' : '免费组')),
    el('div', 'api-pool-group-meta', `${groupItems.length} 个接口 · ${g.enabled !== false ? '已启用' : '已关闭'}`)
  );
  const toggle = el('button', `api-pool-toggle ${g.enabled !== false ? 'on' : ''}`);
  toggle.addEventListener('click', () => {
    const next = getPoolGroups();
    next[groupType] = { ...next[groupType], enabled: !(g.enabled !== false) };
    setPoolGroups(next);
    groups = getPoolGroups();
    renderAll();
  });
  header.append(info, toggle);
  wrap.append(header);

  if (!groupItems.length) {
    wrap.append(el('div', 'api-pool-empty', groupType === 'paid' ? '还没有付费接口，测好后存进来吧' : '还没有免费接口，加一个试试'));
    return wrap;
  }

  groupItems.forEach((item) => wrap.append(renderEndpoint(item)));
  return wrap;
}

function renderEndpoint(item) {
  const wrap = el('div', 'api-pool-endpoint');

  const head = el('div', 'api-pool-endpoint-head');
  head.append(el('div', 'api-pool-endpoint-name', item.name || '未命名接口'));

  const status = el('span', `api-pool-status ${item.status === 'active' ? 'idle' : item.status === 'error' ? 'error' : 'idle'}`);
  if (item.status === 'active' && item.lastSuccessAt) status.className = 'api-pool-status ok';
  if (item.status === 'error') status.className = 'api-pool-status error';
  status.textContent = item.status === 'error' ? '异常' : (item.lastSuccessAt ? '正常' : '待测');
  head.append(status);
  wrap.append(head);

  if (item.endpoint) wrap.append(el('div', 'api-pool-endpoint-url', item.endpoint));
  const modelText = [item.model, ...(item.models || [])].filter(Boolean)[0] || '';
  if (modelText) wrap.append(el('div', 'api-pool-endpoint-model', `模型：${modelText}`));
  if (item.lastLatencyMs > 0) wrap.append(el('div', 'api-pool-endpoint-model', `延迟：${item.lastLatencyMs}ms`));
  if (item.lastErrorMessage) wrap.append(el('div', 'api-pool-endpoint-error', item.lastErrorMessage));

  const actions = el('div', 'api-pool-endpoint-actions');
  const testBtn = el('button', '', '测试');
  testBtn.addEventListener('click', () => handleTest(item.id, testBtn, status));
  const editBtn = el('button', '', '编辑');
  editBtn.addEventListener('click', () => openEditor(item));
  const delBtn = el('button', 'danger', '删除');
  delBtn.addEventListener('click', () => handleDelete(item));
  actions.append(testBtn, editBtn, delBtn);
  wrap.append(actions);

  return wrap;
}

async function handleTest(id, btn, statusEl) {
  const originalText = btn.textContent;
  btn.textContent = '测试中…';
  btn.disabled = true;
  statusEl.className = 'api-pool-status testing';
  statusEl.textContent = '测试中';
  try {
    const result = await testPoolEndpoint(id);
    if (result.ok) {
      showToast(`${result.latencyMs}ms 连接正常`);
    } else {
      showToast(result.message || '测试失败');
    }
  } catch (err) {
    showToast(String(err?.message || '测试出错'));
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    await loadData();
    renderAll();
  }
}

async function handleTestAll() {
  if (testingAll) return;
  testingAll = true;
  renderAll();
  try {
    const results = await testAllPoolEndpoints();
    const okCount = results.filter((r) => r.ok).length;
    showToast(`测试完成：${okCount}/${results.length} 正常`);
  } catch (err) {
    showToast(String(err?.message || '批量测试出错'));
  } finally {
    testingAll = false;
    await loadData();
    renderAll();
  }
}

async function handleDelete(item) {
  const ok = await showConfirm(`删除「${item.name || '未命名接口'}」？`);
  if (!ok) return;
  await deletePoolEndpoint(item.id);
  showToast('已删除');
  await loadData();
  renderAll();
  options?.onRefresh?.();
}

function openEditor(item) {
  const isEdit = !!item;
  const overlay = el('div', 'settings-sheet-overlay');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.3);';

  const sheet = el('div', 'settings-sheet');
  sheet.style.cssText = 'width:min(100%,460px);max-height:80vh;overflow-y:auto;border-radius:var(--radius-lg) var(--radius-lg) 0 0;background:var(--bg-card);padding:16px;display:flex;flex-direction:column;gap:10px;';

  sheet.append(el('div', 'settings-group-title', isEdit ? '编辑接口' : '新增接口'));

  const nameField = createField('接口名称', item?.name || '', '未命名接口');
  const urlField = createField('API 地址', item?.endpoint || '', 'https://api.example.com/v1');
  const keyField = createField('API Key（可留空）', (item?.keys || []).join('\n'), '多个 Key 换行分隔', true);
  const modelField = createField('主模型', item?.model || '', '例如 gpt-4o-mini');

  let selectedGroup = item?.groupType || 'paid';
  const groupWrap = el('div');
  groupWrap.append(el('label', 'api-pool-group-meta', '分组'));
  const groupBtns = el('div', 'api-pool-form-group');
  const paidBtn = el('button', selectedGroup === 'paid' ? 'active' : '', groups.paid?.name || '付费组');
  const freeBtn = el('button', selectedGroup === 'free' ? 'active' : '', groups.free?.name || '免费组');
  paidBtn.addEventListener('click', () => { selectedGroup = 'paid'; paidBtn.classList.add('active'); freeBtn.classList.remove('active'); });
  freeBtn.addEventListener('click', () => { selectedGroup = 'free'; freeBtn.classList.add('active'); paidBtn.classList.remove('active'); });
  groupBtns.append(paidBtn, freeBtn);
  groupWrap.append(groupBtns);

  sheet.append(nameField.wrap, urlField.wrap, keyField.wrap, modelField.wrap, groupWrap);

  const btnRow = el('div', 'api-pool-actions');
  const cancelBtn = el('button', 'secondary', '取消');
  cancelBtn.addEventListener('click', () => overlay.remove());
  const saveBtn = el('button', '', '保存');
  saveBtn.addEventListener('click', async () => {
    const name = nameField.input.value.trim() || '未命名接口';
    const endpoint = urlField.input.value.trim();
    const keyText = keyField.input.value.trim();
    const keys = keyText ? keyText.split('\n').map((k) => k.trim()).filter(Boolean) : [];
    const model = modelField.input.value.trim();

    if (!endpoint) { showToast('请填 API 地址'); return; }

    const payload = {
      groupType: selectedGroup,
      groupName: selectedGroup === 'free' ? (groups.free?.name || '免费组') : (groups.paid?.name || '付费组'),
      name,
      endpoint,
      provider: '',
      keys,
      model,
      models: item?.models || [],
      source: item?.source || '',
      status: 'active'
    };

    try {
      if (isEdit) {
        await updatePoolEndpoint(item.id, payload);
      } else {
        payload.id = generateId('pool');
        await addPoolEndpoint(payload);
      }
      showToast('已保存');
      overlay.remove();
      await loadData();
      renderAll();
      options?.onRefresh?.();
    } catch (err) {
      showToast(String(err?.message || '保存失败'));
    }
  });
  btnRow.append(cancelBtn, saveBtn);
  sheet.append(btnRow);

  overlay.append(sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}

function createField(label, value, placeholder, isTextarea) {
  const wrap = el('div', 'api-pool-form-field');
  wrap.append(el('label', '', label));
  const input = isTextarea ? el('textarea') : el('input');
  if (!isTextarea) input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder || '';
  if (isTextarea) input.rows = 2;
  wrap.append(input);
  return { wrap, input };
}

export async function mount(host, opts = {}) {
  container = host;
  options = opts;
  injectStyle();
  await loadData();
  renderAll();
}

export function unmount() {
  container = null;
  options = null;
  items = [];
  groups = {};
  testingAll = false;
  removeStyle();
}

export async function renderApiPoolSettings(opts = {}) {
  const host = el('div', 'api-pool-host settings-page');
  await mount(host, opts);
  return host;
}
