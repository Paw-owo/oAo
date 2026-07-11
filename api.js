// core/api.js
// imports: getData, setData, getAllDB, setDB, deleteDB, getNow, generateId from './storage.js'
// exports: streamMessage, silentRequest, fetchModels, smartModelsUrl, buildHeaders, parseErrorResponse, getFallbackSources, callAPI, getMergedPoolModels, testPoolEndpoint, testAllPoolEndpoints, addPoolEndpoint, updatePoolEndpoint, deletePoolEndpoint, getApiPoolItems, getPoolGroups, setPoolGroups

import { getData, setData, getAllDB, setDB, deleteDB, getNow, generateId } from './storage.js';

const DEFAULT_TIMEOUT = 60000;
const PAID_TIMEOUT = 10000;
const FREE_TIMEOUT = 60000;
const FREE_HINT_THRESHOLD = 60000;
const ANTHROPIC_VERSION = '2023-06-01';
const API_POOL_MIGRATED_KEY = 'app_api_pool_migrated';
const API_POOL_LAST_SUCCESS_KEY = 'app_api_pool_last_success';
const API_POOL_GROUPS_KEY = 'app_api_pool_groups';

const DEFAULT_GROUPS = {
  paid: { id: 'paid', name: '付费组', type: 'paid', enabled: true },
  free: { id: 'free', name: '免费组', type: 'free', enabled: true }
};

const MODEL_ALIAS_RULES = [
  { label: 'gpt-4o', keywords: ['gpt-4o', 'gpt4o'] },
  { label: 'gpt-4o-mini', keywords: ['gpt-4o-mini', 'gpt4o-mini'] },
  { label: 'gpt-oss-120b', keywords: ['gpt-oss-120b'] },
  { label: 'gpt-oss-20b', keywords: ['gpt-oss-20b'] },
  { label: 'claude-3.5-haiku', keywords: ['claude-3-5-haiku', 'claude-3.5-haiku'] },
  { label: 'claude-3.5-sonnet', keywords: ['claude-3-5-sonnet', 'claude-3.5-sonnet'] },
  { label: 'claude-3.7-sonnet', keywords: ['claude-3-7-sonnet', 'claude-3.7-sonnet'] },
  { label: 'gemini-2.5-flash', keywords: ['gemini-2.5-flash'] },
  { label: 'gemini-2.5-flash-lite', keywords: ['gemini-2.5-flash-lite'] },
  { label: 'gemini-2.5-pro', keywords: ['gemini-2.5-pro'] },
  { label: 'deepseek-v3', keywords: ['deepseek-v3', 'deepseek/chat', 'deepseek-chat'] },
  { label: 'deepseek-r1', keywords: ['deepseek-r1'] },
  { label: 'qwen3-32b', keywords: ['qwen3-32b', 'qwen/qwen3-32b'] },
  { label: 'qwen3.6-27b', keywords: ['qwen3.6-27b', 'qwen/qwen3.6-27b'] },
  { label: 'qwen3.5-397b', keywords: ['qwen3.5-397b', 'qwen/qwen3.5-397b-a17b'] },
  { label: 'llama-3.3-70b', keywords: ['llama-3.3-70b', 'meta-llama-3.3-70b-instruct', 'meta-llama/llama-3.3-70b-instruct'] },
  { label: 'mistral-small-3.1', keywords: ['mistral-small-3.1-24b', 'mistral-small-3.1-24b-instruct'] }
];

const ANONYMOUS_SOURCES = [
  {
    id: 'anon_llm7',
    name: 'LLM7',
    endpoint: 'https://api.llm7.io/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'deepseek-v3-0324', 'deepseek-r1-0528', 'gemini-2.5-flash-lite', 'qwen2.5-coder-32b', 'mistral-small-3.1-24b'],
    rateLimit: '30次/分钟',
    description: '免Key直连，30+模型'
  },
  {
    id: 'anon_ovhcloud',
    name: 'OVHcloud',
    endpoint: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    model: 'Qwen/Qwen3.5-397B-A17B',
    models: ['Qwen/Qwen3.5-397B-A17B', 'Meta-Llama-3_3-70B-Instruct', 'Qwen/Qwen3.6-27B', 'Qwen/Qwen3-32B', 'Mistral-Small-3.1-24B-Instruct'],
    rateLimit: '2次/分钟',
    description: '免Key直连，欧盟机房'
  }
];

// ═══════════════════════════════════════
// 【Toast 通知】
// ═══════════════════════════════════════

function notifyApiError(message) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('api:error', { detail: message }));
    }
  } catch (error) {
    console.warn(message, error);
  }
}

function notifyRetry(sourceName) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(`这个接口没接上，正在换 ${sourceName} 试试`);
    }
  } catch {}
}

function notifyApiInfo(msg) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(msg);
    }
  } catch {}
}

function notifyPoolHint(msg) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(msg);
    }
  } catch {}
}

// ═══════════════════════════════════════
// 【URL 处理】
// ═══════════════════════════════════════

function normalizeEndpointUrl(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

function urlHasPathKeyword(url, keyword) {
  try {
    return new URL(url).pathname.toLowerCase().includes(keyword.toLowerCase());
  } catch {
    return url.toLowerCase().includes(keyword.toLowerCase());
  }
}

function urlHasV1(url) {
  try {
    return new URL(url).pathname.toLowerCase().includes('/v1');
  } catch {
    return url.toLowerCase().includes('/v1');
  }
}

function smartChatUrl(base, provider) {
  if (provider === 'anthropic') {
    if (urlHasPathKeyword(base, '/messages')) return base;
    if (urlHasV1(base)) return base + '/messages';
    return base + '/v1/messages';
  }
  if (provider === 'ollama') {
    if (urlHasPathKeyword(base, '/api/chat')) return base;
    return base + '/api/chat';
  }
  if (urlHasPathKeyword(base, '/chat/completions')) return base;
  if (urlHasV1(base)) return base + '/chat/completions';
  return base + '/v1/chat/completions';
}

export function smartModelsUrl(base, provider) {
  if (provider === 'ollama') {
    if (urlHasPathKeyword(base, '/api/tags')) return base;
    return base + '/api/tags';
  }
  if (urlHasPathKeyword(base, '/models')) return base;
  if (urlHasV1(base)) return base + '/models';
  return base + '/v1/models';
}

function smartGeminiUrl(base, model, apiKey, stream = false) {
  const cleanModel = String(model || '').trim();
  if (!cleanModel) throw new Error('请先选择模型');
  let origin = base.replace(/\/+$/, '');
  const fullPattern = stream
    ? /\/v1beta\/models\/[^/]+:streamGenerateContent/i
    : /\/v1beta\/models\/[^/]+:generateContent/i;
  if (fullPattern.test(origin)) {
    if (apiKey) {
      const url = new URL(origin);
      url.searchParams.set('key', apiKey);
      if (stream) url.searchParams.set('alt', 'sse');
      return url.toString();
    }
    return origin;
  }
  origin = origin.replace(/\/v1beta\/models\/?$/i, '').replace(/\/v1beta\/?$/i, '').replace(/\/+$/, '');
  const action = stream ? 'streamGenerateContent' : 'generateContent';
  const url = new URL(`${origin}/v1beta/models/${encodeURIComponent(cleanModel)}:${action}`);
  if (apiKey) url.searchParams.set('key', apiKey);
  if (stream) url.searchParams.set('alt', 'sse');
  return url.toString();
}

// ═══════════════════════════════════════
// 【配置读取】
// ═══════════════════════════════════════

function getSettings() {
  const settings = getData('app_settings') || {};
  const apiEndpoints = Array.isArray(settings.apiEndpoints) ? settings.apiEndpoints : [];
  return {
    defaultApiEndpointId: settings.defaultApiEndpointId || '',
    defaultModel: settings.defaultModel || '',
    ttsGlobal: settings.ttsGlobal || { provider: 'openai', apiKey: '', endpoint: '' },
    mcpServers: Array.isArray(settings.mcpServers) ? settings.mcpServers : [],
    bubbleMode: settings.bubbleMode === 'dialog' ? 'dialog' : 'bubble',
    fontSize: Number(settings.fontSize) || 15,
    user: settings.user || { name: '', avatar: '' },
    widgets: settings.widgets || { time: true, weather: true, anniversary: true },
    apiEndpoints
  };
}

function detectProvider(endpoint) {
  const raw = String(endpoint || '').toLowerCase();
  if (raw.includes('anthropic.com')) return 'anthropic';
  if (raw.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (raw.includes('localhost') || raw.includes('127.0.0.1')) return 'ollama';
  return 'openai';
}

function findEndpoint(endpointId = '') {
  const settings = getSettings();
  const targetId = endpointId || settings.defaultApiEndpointId;
  const endpoint = settings.apiEndpoints.find((item) => item.id === targetId) || settings.apiEndpoints[0] || null;
  if (!endpoint || !endpoint.endpoint) throw new Error('请先配置 API 端点');
  const normalizedEndpoint = normalizeEndpointUrl(endpoint.endpoint);
  if (!/^https?:\/\//i.test(normalizedEndpoint)) throw new Error('API 端点必须以 http 或 https 开头');
  const provider = (endpoint.provider || '').trim().toLowerCase() || detectProvider(normalizedEndpoint);
  return {
    id: endpoint.id || '',
    name: endpoint.name || '',
    endpoint: normalizedEndpoint,
    apiKey: endpoint.apiKey || '',
    provider,
    model: endpoint.model || settings.defaultModel || '',
    modelList: Array.isArray(endpoint.modelList) ? endpoint.modelList : [],
    source: endpoint.source || ''
  };
}

// ═══════════════════════════════════════
// 【轮换池底座】
// ═══════════════════════════════════════

export function getPoolGroups() {
  const saved = getData(API_POOL_GROUPS_KEY) || {};
  return {
    paid: { ...DEFAULT_GROUPS.paid, ...(saved.paid || {}) },
    free: { ...DEFAULT_GROUPS.free, ...(saved.free || {}) }
  };
}

export function setPoolGroups(groups) {
  const current = getPoolGroups();
  const next = {
    paid: { ...DEFAULT_GROUPS.paid, ...current.paid, ...(groups?.paid || {}) },
    free: { ...DEFAULT_GROUPS.free, ...current.free, ...(groups?.free || {}) }
  };
  setData(API_POOL_GROUPS_KEY, next);
}

async function ensureApiPoolMigrated() {
  const migrated = getData(API_POOL_MIGRATED_KEY);
  if (migrated === true) return;
  const all = await getAllDB('api_pool').catch(() => []);
  if (Array.isArray(all) && all.length) {
    setData(API_POOL_MIGRATED_KEY, true);
    return;
  }
  const settings = getSettings();
  const oldEndpoints = Array.isArray(settings.apiEndpoints) ? settings.apiEndpoints : [];
  if (!oldEndpoints.length) {
    setData(API_POOL_MIGRATED_KEY, true);
    return;
  }
  const now = getNow();
  const groups = getPoolGroups();
  for (const item of oldEndpoints) {
    const source = item?.source || '';
    const groupType = source === 'free' || source === 'anonymous' ? 'free' : 'paid';
    const keyText = String(item.apiKey || '').trim();
    const keys = keyText ? [keyText] : [];
    await setDB('api_pool', {
      id: item.id || generateId('pool'),
      groupType,
      groupName: groups[groupType]?.name || (groupType === 'paid' ? '付费组' : '免费组'),
      name: item.name || '未命名接口',
      endpoint: normalizeEndpointUrl(item.endpoint || ''),
      provider: item.provider || detectProvider(item.endpoint || ''),
      keys,
      model: item.model || '',
      models: Array.isArray(item.modelList) ? [...new Set(item.modelList.filter(Boolean))] : [],
      source,
      status: 'active',
      lastSuccessAt: '',
      lastErrorAt: '',
      lastErrorMessage: '',
      lastLatencyMs: 0,
      createdAt: item.createdAt || now,
      updatedAt: now
    });
  }
  setData(API_POOL_MIGRATED_KEY, true);
}

export async function getApiPoolItems() {
  await ensureApiPoolMigrated();
  const list = await getAllDB('api_pool').catch(() => []);
  return Array.isArray(list) ? list.map(normalizePoolItem) : [];
}

function getPoolLastSuccess() {
  return getData(API_POOL_LAST_SUCCESS_KEY) || { paid: '', free: '' };
}

function setPoolLastSuccess(groupType, id) {
  const current = getPoolLastSuccess();
  setData(API_POOL_LAST_SUCCESS_KEY, { ...current, [groupType]: id || '' });
}

function normalizePoolItem(item) {
  const endpoint = normalizeEndpointUrl(item?.endpoint || '');
  const provider = item?.provider || detectProvider(endpoint);
  const keys = Array.isArray(item?.keys)
    ? item.keys.map((k) => String(k || '').trim()).filter(Boolean)
    : String(item?.apiKey || '').trim() ? [String(item.apiKey).trim()] : [];
  return {
    id: item?.id || generateId('pool'),
    groupType: item?.groupType === 'free' ? 'free' : 'paid',
    groupName: String(item?.groupName || '').trim() || (item?.groupType === 'free' ? '免费组' : '付费组'),
    name: String(item?.name || '').trim() || '未命名接口',
    endpoint,
    provider,
    keys,
    model: String(item?.model || '').trim(),
    models: Array.isArray(item?.models) ? [...new Set(item.models.map((m) => String(m || '').trim()).filter(Boolean))] : [],
    source: item?.source || '',
    status: item?.status || 'active',
    lastSuccessAt: item?.lastSuccessAt || '',
    lastErrorAt: item?.lastErrorAt || '',
    lastErrorMessage: item?.lastErrorMessage || '',
    lastLatencyMs: Number(item?.lastLatencyMs || 0),
    createdAt: item?.createdAt || '',
    updatedAt: item?.updatedAt || ''
  };
}

function buildPoolCandidateSources(items, options = {}) {
  const { model = '', groupTypes = [] } = options;
  const lastSuccess = getPoolLastSuccess();
  const preferredId = lastSuccess[groupTypes[0]] || '';

  const sourceItems = normalizeGroupItems(items, groupTypes);

  const normalized = sourceItems
    .map(normalizePoolItem)
    .filter((item) => item.endpoint && item.status !== 'disabled')
    .flatMap((item) => {
      const keyList = item.groupType === 'free' ? [item.keys[0] || ''] : (item.keys.length ? item.keys : ['']);
      return keyList.map((key, index) => ({
        id: `${item.id}__${index}`,
        poolId: item.id,
        groupType: item.groupType,
        groupName: item.groupName,
        name: item.name,
        endpoint: item.endpoint,
        provider: item.provider,
        apiKey: key,
        model: model || item.model || '',
        models: item.models,
        source: item.source || '',
        sortBoost: item.id === preferredId ? 100 : 0,
        isAnonymous: item.source === 'anonymous',
        isUser: item.groupType === 'paid'
      }));
    });

  return normalized.sort((a, b) => b.sortBoost - a.sortBoost);
}

function normalizeGroupItems(items, groupTypes) {
  const list = Array.isArray(items) ? items : [];
  if (!Array.isArray(groupTypes) || !groupTypes.length) return list;

  const groups = getPoolGroups();
  const enabledTypes = ['paid', 'free'].filter((type) => groups[type]?.enabled !== false);

  return list.filter((item) => {
    if (groupTypes.includes(item?.groupType)) return true;
    if (groupTypes.includes('all')) return enabledTypes.includes(item?.groupType);
    return false;
  });
}

function normalizeModelAlias(modelName) {
  const raw = String(modelName || '').trim().toLowerCase();
  if (!raw) return '';
  const hit = MODEL_ALIAS_RULES.find((rule) => rule.keywords.some((keyword) => raw.includes(keyword)));
  return hit ? hit.label : raw;
}

export async function getMergedPoolModels() {
  const items = await getApiPoolItems();
  const map = new Map();
  items.map(normalizePoolItem).forEach((item) => {
    const allModels = [...item.models, item.model].filter(Boolean);
    allModels.forEach((modelName) => {
      const key = normalizeModelAlias(modelName) || modelName;
      if (!map.has(key)) {
        map.set(key, { key, name: modelName, aliases: [modelName], sources: [item.id] });
        return;
      }
      const current = map.get(key);
      if (!current.aliases.includes(modelName)) current.aliases.push(modelName);
      if (!current.sources.includes(item.id)) current.sources.push(item.id);
    });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function markPoolSourceSuccess(source, latencyMs) {
  if (!source?.poolId) return;
  const list = await getApiPoolItems();
  const target = list.find((item) => String(item.id) === String(source.poolId));
  if (!target) return;
  const now = getNow();
  await setDB('api_pool', {
    ...target,
    status: 'active',
    lastSuccessAt: now,
    lastErrorAt: target.lastErrorAt || '',
    lastErrorMessage: '',
    lastLatencyMs: Number(latencyMs || 0),
    updatedAt: now
  });
  setPoolLastSuccess(source.groupType || 'paid', source.poolId);
}

async function markPoolSourceError(source, message, latencyMs = 0) {
  if (!source?.poolId) return;
  const list = await getApiPoolItems();
  const target = list.find((item) => String(item.id) === String(source.poolId));
  if (!target) return;
  const now = getNow();
  await setDB('api_pool', {
    ...target,
    status: 'error',
    lastErrorAt: now,
    lastErrorMessage: String(message || '').trim(),
    lastLatencyMs: Number(latencyMs || 0),
    updatedAt: now
  });
}

// ═══════════════════════════════════════
// 【轮换池增删改查】
// ═══════════════════════════════════════

export async function addPoolEndpoint(data) {
  const normalized = normalizePoolItem({
    ...data,
    id: data?.id || generateId('pool'),
    createdAt: getNow(),
    updatedAt: getNow()
  });
  await setDB('api_pool', normalized);
  return normalized;
}

export async function updatePoolEndpoint(id, data) {
  const items = await getApiPoolItems();
  const target = items.find((item) => String(item.id) === String(id));
  if (!target) return null;
  const updated = normalizePoolItem({ ...target, ...data, id, updatedAt: getNow() });
  await setDB('api_pool', updated);
  return updated;
}

export async function deletePoolEndpoint(id) {
  await deleteDB('api_pool', id);
  return true;
}

// ═══════════════════════════════════════
// 【Fallback 源管理】
// ═══════════════════════════════════════

export function getFallbackSources() {
  const settings = getSettings();
  const freeEndpoints = settings.apiEndpoints.filter((api) => api.source === 'free' && api.apiKey);
  const sources = [];
  freeEndpoints.forEach((ep) => {
    sources.push({
      id: ep.id, name: ep.name || '免费API', endpoint: ep.endpoint, model: ep.model,
      apiKey: ep.apiKey, provider: ep.provider || detectProvider(ep.endpoint),
      isUser: false, isAnonymous: false
    });
  });
  ANONYMOUS_SOURCES.forEach((anon) => {
    sources.push({
      id: anon.id, name: anon.name, endpoint: anon.endpoint, model: anon.model,
      apiKey: '', provider: 'openai', isUser: false, isAnonymous: true
    });
  });
  return sources;
}

function getAvailableSources(endpointId = '') {
  const sources = [];
  try {
    const ep = findEndpoint(endpointId);
    sources.push({
      id: ep.id, name: ep.name || '我的API', endpoint: ep.endpoint,
      apiKey: ep.apiKey, model: ep.model, provider: ep.provider,
      isUser: true, isAnonymous: false
    });
  } catch {}
  const settings = getSettings();
  const usedIds = new Set(sources.map((s) => s.id));
  settings.apiEndpoints
    .filter((api) => api.source === 'free' && api.apiKey && !usedIds.has(api.id))
    .forEach((ep) => {
      usedIds.add(ep.id);
      sources.push({
        id: ep.id, name: ep.name || '免费API', endpoint: ep.endpoint,
        apiKey: ep.apiKey, model: ep.model, provider: ep.provider || detectProvider(ep.endpoint),
        isUser: false, isAnonymous: false
      });
    });
  ANONYMOUS_SOURCES
    .filter((anon) => !usedIds.has(anon.id))
    .forEach((anon) => {
      sources.push({
        id: anon.id, name: anon.name, endpoint: anon.endpoint,
        apiKey: '', model: anon.model, provider: 'openai',
        isUser: false, isAnonymous: true
      });
    });
  return sources;
}

// ═══════════════════════════════════════
// 【错误分类】
// ═══════════════════════════════════════

function getStatusFromError(error) {
  if (typeof error?.status === 'number') return error.status;
  const message = String(error?.message || '');
  const statusMatch = message.match(/HTTP\s*(\d+)/i);
  if (statusMatch) return Number(statusMatch[1]);
  if (error?.name === 'AbortError') return 408;
  if (error?.isNetworkError) return 0;
  return 0;
}

function isBrowserBlockedError(error) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return error.name === 'TypeError'
    || message.includes('failed to fetch')
    || message.includes('load failed')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('cors');
}

function createNetworkError(error, source) {
  const message = source?.isUser
    ? '这个中转站被浏览器拦住啦，可能没开放跨域访问（CORS）。换支持网页直连的中转站会更稳。'
    : '网络没牵上小手，连接失败啦';
  const next = new Error(message);
  next.name = error?.name || 'NetworkError';
  next.cause = error;
  next.status = 0;
  next.isNetworkError = true;
  next.sourceName = source?.name || '';
  return next;
}

function shouldStopOnUserError(status, source) {
  if (!source?.isUser) return false;
  if (status === 0) return true;
  if (status === 400) return true;
  if (status === 401) return true;
  if (status === 403) return true;
  if (status === 404) return true;
  return false;
}

function isRetryableError(status, hasKey, source) {
  if (shouldStopOnUserError(status, source)) return false;
  if (status === 0) return true;
  if (status === 408) return true;
  if (status === 429 || status === 503) return true;
  if (status >= 500) return true;
  if ((status === 401 || status === 403) && !hasKey) return true;
  return false;
}

// ═══════════════════════════════════════
// 【重试引擎】
// ═══════════════════════════════════════

async function tryWithFallback({ sources, buildFn, onSwitch, onReset }) {
  if (!sources.length) throw new Error('没有可用的 API 接口');
  let lastError = null;
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    try {
      return await buildFn(source);
    } catch (error) {
      const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, source) : error;
      const status = getStatusFromError(normalizedError);
      const hasKey = Boolean(source.apiKey);
      lastError = normalizedError;
      if (i < sources.length - 1 && isRetryableError(status, hasKey, source)) {
        onReset?.();
        const nextSource = sources[i + 1];
        onSwitch?.(nextSource?.name || '备用接口');
        continue;
      }
      throw normalizedError;
    }
  }
  throw lastError || new Error('所有 API 接口都不可用');
}

// ═══════════════════════════════════════
// 【超时控制】
// ═══════════════════════════════════════

function createTimeoutController(timeout = DEFAULT_TIMEOUT, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeout) || DEFAULT_TIMEOUT);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  return { controller, timer };
}

// ═══════════════════════════════════════
// 【请求构建】
// ═══════════════════════════════════════

export function buildHeaders(apiKey, provider = 'openai') {
  const headers = { 'Content-Type': 'application/json' };
  if (provider === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = ANTHROPIC_VERSION;
    return headers;
  }
  if (provider !== 'ollama' && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const role = ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user';
  const content = typeof message.content === 'string' ? message.content : '';
  if (!content.trim()) return null;
  return { role, content };
}

function buildMessages(messages = [], systemPrompt = '') {
  const normalizedMessages = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];
  if (!systemPrompt || !String(systemPrompt).trim()) return normalizedMessages;
  return [{ role: 'system', content: String(systemPrompt) }, ...normalizedMessages];
}

function buildOpenAIRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const body = { model, messages: buildMessages(messages, systemPrompt), stream };
  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
  return body;
}

function buildAnthropicMessages(messages = [], systemPrompt = '') {
  const normalized = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];
  return {
    system: String(systemPrompt || '').trim(),
    messages: normalized
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: [{ type: 'text', text: m.content }] }))
  };
}

function buildAnthropicRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const { system, messages: anthropicMessages } = buildAnthropicMessages(messages, systemPrompt);
  const body = { model, messages: anthropicMessages, stream };
  if (system) body.system = system;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
  return body;
}

function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return { text: item };
      if (!item || typeof item !== 'object') return null;
      return item.text ? { text: item.text } : null;
    }).filter(Boolean);
  }
  if (content && typeof content === 'object' && content.text) return [{ text: content.text }];
  return [];
}

function buildGeminiContents(messages = [], systemPrompt = '') {
  const normalized = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];
  const contents = normalized
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toGeminiParts(m.content) }))
    .filter((m) => m.parts.length);
  return {
    systemInstruction: systemPrompt ? { parts: [{ text: String(systemPrompt) }] } : undefined,
    contents
  };
}

function buildGeminiRequestBody({ messages, systemPrompt, temperature, maxTokens }) {
  const { systemInstruction, contents } = buildGeminiContents(messages, systemPrompt);
  const body = { contents, generationConfig: {} };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.generationConfig.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) body.generationConfig.maxOutputTokens = maxTokens;
  return body;
}

function buildOllamaRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const body = { model, messages: buildMessages(messages, systemPrompt), stream };
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.options = { ...(body.options || {}), temperature };
  }
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    body.options = { ...(body.options || {}), num_predict: maxTokens };
  }
  return body;
}

function buildRequestContext({ endpointConfig, model, systemPrompt, messages, stream, temperature, maxTokens }) {
  const provider = endpointConfig.provider || 'openai';
  const requestModel = model || endpointConfig.model;
  const base = endpointConfig.endpoint;
  if (provider !== 'gemini' && !requestModel) throw new Error('请先选择模型');
  if (provider === 'openai') {
    return { provider, url: smartChatUrl(base, 'openai'), headers: buildHeaders(endpointConfig.apiKey, provider), body: buildOpenAIRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens }) };
  }
  if (provider === 'anthropic') {
    return { provider, url: smartChatUrl(base, 'anthropic'), headers: buildHeaders(endpointConfig.apiKey, provider), body: buildAnthropicRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens }) };
  }
  if (provider === 'gemini') {
    return { provider, url: smartGeminiUrl(base, requestModel, endpointConfig.apiKey, stream), headers: buildHeaders('', provider), body: buildGeminiRequestBody({ messages, systemPrompt, temperature, maxTokens }) };
  }
  if (provider === 'ollama') {
    return { provider, url: smartChatUrl(base, 'ollama'), headers: buildHeaders('', provider), body: buildOllamaRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens }) };
  }
  return { provider: 'openai', url: smartChatUrl(base, 'openai'), headers: buildHeaders(endpointConfig.apiKey, 'openai'), body: buildOpenAIRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens }) };
}

// ═══════════════════════════════════════
// 【错误处理】
// ═══════════════════════════════════════

function getErrorMessage(status) {
  if (status === 400) return '请求格式不对，模型名或消息内容可能不合适';
  if (status === 401) return '密钥不对或过期啦';
  if (status === 402) return '额度不够啦，需要看看账户余额';
  if (status === 403) return '这个密钥没有访问权限';
  if (status === 404) return '接口地址或模型名没找到';
  if (status === 408) return '等太久啦，连接超时了';
  if (status === 429) return '请求太密啦，先歇一小会儿';
  if (status === 500) return '服务器炸咯，晚点再戳它';
  if (status === 502) return '中转站打了个喷嚏，暂时接不上';
  if (status === 503) return '服务正在忙，稍后再试试';
  if (status === 504) return '中转站等太久啦，超时了';
  if (status >= 500) return 'AI 服务暂时不可用';
  if (status >= 400) return '请求失败啦，请检查 API 配置';
  return '网络连接失败';
}

export async function parseErrorResponse(response) {
  try {
    const data = await response.json();
    const detail = data?.error?.message || data?.message || data?.error || '';
    const base = getErrorMessage(response.status);
    return detail ? `HTTP ${response.status}｜${base}：${detail}` : `HTTP ${response.status}｜${base}`;
  } catch {
    return `HTTP ${response.status}｜${getErrorMessage(response.status)}`;
  }
}

async function buildHttpError(response) {
  const message = await parseErrorResponse(response);
  const error = new Error(message);
  error.status = response.status;
  error.statusText = response.statusText || '';
  error.isHttpError = true;
  return error;
}

function cleanApiErrorMessage(message) {
  const raw = String(message || '').trim();
  if (!raw) return '';
  return raw.replace(/^HTTP\s*\d+\s*[｜|]\s*/i, '').replace(/^Error:\s*/i, '').trim();
}

function normalizeApiError(error, fallbackMessage) {
  if (error?.name === 'AbortError') return '等太久啦，连接超时了';
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return '网络断开啦，先检查一下连接';
  if (error?.isNetworkError) return error.message;
  if (isBrowserBlockedError(error)) return '这个中转站被浏览器拦住啦，可能没开放跨域访问（CORS）';
  const message = cleanApiErrorMessage(error?.message);
  return message || fallbackMessage;
}

// ═══════════════════════════════════════
// 【响应解析】
// ═══════════════════════════════════════

function extractThinkingFromText(text) {
  if (!text) return { content: '', thinking: '' };
  let thinking = '';
  const content = String(text).replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (match, innerText) => {
    const clean = String(innerText || '').trim();
    if (clean) thinking += thinking ? `\n${clean}` : clean;
    return '';
  });
  return { content, thinking };
}

function readContentValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      return item.text || item.content || item.value || '';
    }).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') return value.text || value.content || value.value || '';
  return '';
}

function extractContentFromData(data) {
  const choice = data?.choices?.[0] || {};
  const delta = choice.delta || {};
  const message = choice.message || {};
  const output = data?.output?.[0] || {};
  const outputContent = output?.content?.[0] || {};
  const candidate = data?.candidates?.[0] || {};
  const candidateParts = candidate?.content?.parts || [];
  const geminiText = candidateParts.map((p) => p?.text || '').filter(Boolean).join('');
  const text = [
    readContentValue(delta.content), readContentValue(message.content), readContentValue(choice.text),
    readContentValue(data.content), readContentValue(data.message), readContentValue(data.response),
    readContentValue(data.reply), readContentValue(outputContent.text), readContentValue(outputContent.content), geminiText
  ].filter(Boolean).join('');
  const reasoning = [
    delta.reasoning_content, delta.reasoning, delta.thinking,
    message.reasoning_content, message.reasoning, message.thinking,
    choice.reasoning_content, choice.reasoning,
    data.reasoning_content, data.reasoning, data.thinking,
    candidate?.reasoning, candidate?.reasoningContent,
    data?.candidates?.[0]?.content?.thought || ''
  ].filter(Boolean).join('\n');
  const extracted = extractThinkingFromText(text);
  return {
    done: data === '[DONE]' || Boolean(choice.finish_reason) || Boolean(candidate.finishReason),
    content: extracted.content,
    thinking: [reasoning, extracted.thinking].filter(Boolean).join('\n'),
    finishReason: choice.finish_reason || candidate.finishReason || '',
    raw: data
  };
}

function parseStreamPayload(payload) {
  if (!payload || payload === '[DONE]') {
    return { done: payload === '[DONE]', content: '', thinking: '', finishReason: '', raw: null };
  }
  try {
    const parsed = JSON.parse(payload);
    if (parsed?.error) return { done: true, content: '', thinking: '', finishReason: '', raw: parsed };
    return extractContentFromData(parsed);
  } catch {
    return { done: false, content: '', thinking: '', finishReason: '', raw: null };
  }
}

function appendValue(base, value) {
  if (!value) return base;
  return base ? `${base}\n${value}` : value;
}

async function readStream(response, callbacks) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  let fullThinking = '';
  let completed = false;
  while (!completed) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const eventBlocks = buffer.split('\n\n');
    buffer = eventBlocks.pop() || '';
    for (const event of eventBlocks) {
      const dataLines = event.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('data:')).map((l) => l.replace(/^data:\s*/, ''));
      if (!dataLines.length) continue;
      const chunk = parseStreamPayload(dataLines.join('\n'));
      fullContent += chunk.content || '';
      fullThinking = appendValue(fullThinking, chunk.thinking);
      if (chunk.content || chunk.thinking) callbacks.onChunk?.({ content: chunk.content, thinking: chunk.thinking, raw: chunk.raw, done: false });
      if (chunk.done) { completed = true; break; }
    }
  }
  if (buffer.trim()) {
    const dataLines = buffer.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('data:')).map((l) => l.replace(/^data:\s*/, ''));
    if (dataLines.length) {
      const chunk = parseStreamPayload(dataLines.join('\n'));
      fullContent += chunk.content || '';
      fullThinking = appendValue(fullThinking, chunk.thinking);
      if (chunk.content || chunk.thinking) callbacks.onChunk?.({ content: chunk.content, thinking: chunk.thinking, raw: chunk.raw, done: false });
    }
  }
  if (!fullContent && buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim());
      const extracted = extractContentFromData(parsed);
      if (extracted.content) { fullContent = extracted.content; fullThinking = appendValue(fullThinking, extracted.thinking); }
    } catch {}
  }
  callbacks.onDone?.({ content: fullContent, thinking: fullThinking });
}

function parseJsonFromText(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;
  try { return JSON.parse(cleanText); } catch {}
  const match = cleanText.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function normalizeResponsePayload(data, provider) {
  if (provider === 'gemini') {
    const candidate = (Array.isArray(data?.candidates) ? data.candidates : [])[0] || {};
    const text = (candidate?.content?.parts || []).map((p) => p?.text || '').filter(Boolean).join('');
    return extractThinkingFromText(text);
  }
  if (provider === 'ollama') return extractThinkingFromText(data?.message?.content || data?.response || '');
  if (provider === 'anthropic') {
    const raw = data?.content;
    const text = raw ? (Array.isArray(raw) ? raw.map((i) => i?.text || '').filter(Boolean).join('') : String(raw)) : '';
    return extractThinkingFromText(text);
  }
  const extracted = extractContentFromData(data);
  return { content: extracted.content, thinking: extracted.thinking };
}

async function readJsonResponse(response, provider) {
  return normalizeResponsePayload(await response.json(), provider);
}

async function readTextResponse(response, provider) {
  const text = await response.text();
  const parsed = parseJsonFromText(text);
  if (parsed) return normalizeResponsePayload(parsed, provider);
  if (provider === 'gemini') return normalizeResponsePayload({ candidates: [{ content: { parts: [{ text }] } }] }, provider);
  if (provider === 'ollama') return normalizeResponsePayload({ message: { content: text } }, provider);
  if (provider === 'anthropic') return normalizeResponsePayload({ content: [{ text }] }, provider);
  return normalizeResponsePayload({ content: text }, provider);
}

// ═══════════════════════════════════════
// 【统一调用入口】轮换池 callAPI（支持 groupTypes 过滤）
// ═══════════════════════════════════════

async function requestOnce({ source, messages = [], systemPrompt = '', model = '', stream = false, timeout = DEFAULT_TIMEOUT, temperature, maxTokens, onChunk, signal }) {
  const startedAt = Date.now();
  const { controller, timer } = createTimeoutController(timeout, signal);
  try {
    const provider = source.provider || detectProvider(source.endpoint);
    const requestContext = buildRequestContext({
      endpointConfig: { ...source, provider },
      model: model || source.model, systemPrompt, messages, stream, temperature, maxTokens
    });
    const hasMessages = requestContext.provider === 'gemini'
      ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
      : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;
    if (!hasMessages) throw new Error('请求内容不能为空');
    const response = await fetch(requestContext.url, {
      method: 'POST', headers: requestContext.headers, signal: controller.signal, body: JSON.stringify(requestContext.body)
    });
    if (!response.ok) throw await buildHttpError(response);
    if (stream) {
      if (!response.body) {
        const fallback = await readTextResponse(response, requestContext.provider);
        return { content: fallback.content, thinking: fallback.thinking, latencyMs: Date.now() - startedAt };
      }
      const result = await new Promise((resolve, reject) => {
        readStream(response, {
          onChunk,
          onDone: ({ content, thinking }) => resolve({ content, thinking })
        }).catch(reject);
      });
      return { ...result, latencyMs: Date.now() - startedAt };
    }
    const { content, thinking } = response.body
      ? await readJsonResponse(response, requestContext.provider)
      : await readTextResponse(response, requestContext.provider);
    return { content: String(content || '').trim(), thinking: String(thinking || '').trim(), latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

export async function callAPI({
  messages = [], systemPrompt = '', model = '', stream = false, timeout,
  temperature, maxTokens, onChunk, onDone, onError, signal,
  groupTypes = []
} = {}) {
  await ensureApiPoolMigrated();
  const poolItems = await getApiPoolItems();
  const groups = getPoolGroups();

  const effectiveGroupTypes = Array.isArray(groupTypes) && groupTypes.length
    ? groupTypes
    : ['paid', 'free'];

  const paidEnabled = groups.paid?.enabled !== false;
  const freeEnabled = groups.free?.enabled !== false;

  const paidWanted = effectiveGroupTypes.includes('paid') || effectiveGroupTypes.includes('all');
  const freeWanted = effectiveGroupTypes.includes('free') || effectiveGroupTypes.includes('all');

  const paidItems = paidWanted && paidEnabled ? poolItems.filter((item) => item.groupType !== 'free') : [];
  const freeItems = freeWanted && freeEnabled ? poolItems.filter((item) => item.groupType === 'free') : [];

  const paidSources = buildPoolCandidateSources(paidItems, { model, groupTypes: ['paid'] });
  const freeSources = buildPoolCandidateSources(freeItems, { model, groupTypes: ['free'] });

  if (!paidSources.length && !freeSources.length) {
    return await callLegacyFallback({
      messages, systemPrompt, model, stream, timeout, temperature, maxTokens, onChunk, onDone, onError, signal
    });
  }

  const callStartedAt = Date.now();

  for (const source of paidSources) {
    if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
    try {
      const result = await requestOnce({
        source, messages, systemPrompt, model: model || source.model, stream,
        timeout: timeout || PAID_TIMEOUT, temperature, maxTokens, onChunk, signal
      });
      await markPoolSourceSuccess(source, result.latencyMs || 0);
      onDone?.(result);
      return result;
    } catch (error) {
      if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
      const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, source) : error;
      const status = getStatusFromError(normalizedError);
      await markPoolSourceError(source, normalizedError.message || String(error?.message || ''), 0);
      const hasMorePaid = paidSources.indexOf(source) < paidSources.length - 1;
      if (hasMorePaid && isRetryableError(status, Boolean(source.apiKey), source)) {
        const nextSource = paidSources[paidSources.indexOf(source) + 1];
        if (source.isUser) notifyRetry(nextSource?.name || '备用接口');
        continue;
      }
      break;
    }
  }

  if (freeSources.length) {
    const source = freeSources[0];
    if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
    try {
      const result = await requestOnce({
        source, messages, systemPrompt, model: model || source.model, stream,
        timeout: timeout || FREE_TIMEOUT, temperature, maxTokens, onChunk, signal
      });
      await markPoolSourceSuccess(source, result.latencyMs || 0);
      onDone?.(result);
      return result;
    } catch (error) {
      if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
      await markPoolSourceError(source, String(error?.message || ''), 0);
      const elapsed = Date.now() - callStartedAt;
      if (elapsed >= FREE_HINT_THRESHOLD) notifyPoolHint('免费接口等了好久都没回应，建议换个模型试试');
      onError?.({ message: '免费接口暂时没接上', raw: error, status: getStatusFromError(error) });
      return null;
    }
  }

  const message = '所有接口都没接上，稍后再试试';
  notifyPoolHint(message);
  onError?.({ message, status: 0 });
  return null;
}

async function callLegacyFallback({
  messages, systemPrompt, model, stream, timeout, temperature, maxTokens, onChunk, onDone, onError, signal
}) {
  const sources = getAvailableSources('');
  if (!sources.length) {
    const message = '还没有配置 API 接口，先去设置里加一个吧';
    notifyPoolHint(message);
    onError?.({ message, status: 0 });
    return null;
  }

  try {
    const result = await tryWithFallback({
      sources,
      onSwitch: notifyRetry,
      onReset: null,
      buildFn: async (source) => {
        const provider = source.provider || detectProvider(source.endpoint);
        const requestContext = buildRequestContext({
          endpointConfig: { ...source, provider },
          model: model || source.model, systemPrompt, messages, stream, temperature, maxTokens
        });
        const hasMessages = requestContext.provider === 'gemini'
          ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
          : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;
        if (!hasMessages) throw new Error('请求内容不能为空');
        const { controller, timer } = createTimeoutController(timeout || DEFAULT_TIMEOUT, signal);
        try {
          const response = await fetch(requestContext.url, {
            method: 'POST', headers: requestContext.headers, signal: controller.signal, body: JSON.stringify(requestContext.body)
          });
          if (!response.ok) throw await buildHttpError(response);
          if (stream) {
            if (!response.body) {
              const fallback = await readTextResponse(response, requestContext.provider);
              return { content: fallback.content, thinking: fallback.thinking };
            }
            return await new Promise((resolve, reject) => {
              readStream(response, {
                onChunk,
                onDone: ({ content, thinking }) => resolve({ content, thinking })
              }).catch(reject);
            });
          }
          const { content, thinking } = response.body
            ? await readJsonResponse(response, requestContext.provider)
            : await readTextResponse(response, requestContext.provider);
          return { content: String(content || '').trim(), thinking: String(thinking || '').trim() };
        } finally {
          clearTimeout(timer);
        }
      }
    });
    onDone?.(result);
    return result;
  } catch (error) {
    const message = normalizeApiError(error, 'AI 请求失败啦');
    notifyPoolHint(message);
    onError?.({ message, raw: error, status: getStatusFromError(error) });
    return null;
  }
}

// ═══════════════════════════════════════
// 【导出 API】带 Fallback 的三大接口
// ═══════════════════════════════════════

export async function streamMessage({
  messages = [], systemPrompt = '', endpointId = '', model = '',
  onChunk, onDone, onError, onReset, timeout = DEFAULT_TIMEOUT, temperature, maxTokens
} = {}) {
  const sources = getAvailableSources(endpointId);
  let currentTimer = null;
  const hasKeyedSource = sources.some((s) => Boolean(s.apiKey));
  try {
    const result = await tryWithFallback({
      sources, onSwitch: notifyRetry, onReset,
      buildFn: async (source) => {
        if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
        const { controller, timer } = createTimeoutController(timeout);
        currentTimer = timer;
        try {
          const provider = source.provider || detectProvider(source.endpoint);
          const requestContext = buildRequestContext({
            endpointConfig: { ...source, provider }, model: model || source.model,
            systemPrompt, messages, stream: true, temperature, maxTokens
          });
          const hasMessages = requestContext.provider === 'gemini'
            ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
            : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;
          if (!hasMessages) throw new Error('消息内容不能为空');
          const response = await fetch(requestContext.url, {
            method: 'POST', headers: requestContext.headers, signal: controller.signal, body: JSON.stringify(requestContext.body)
          });
          if (!response.ok) throw await buildHttpError(response);
          if (!response.body) {
            const fallback = await readTextResponse(response, requestContext.provider);
            return { content: fallback.content, thinking: fallback.thinking };
          }
          return await new Promise((resolve, reject) => {
            readStream(response, {
              onChunk,
              onDone: ({ content, thinking }) => resolve({ content, thinking })
            }).catch(reject);
          });
        } finally { clearTimeout(timer); currentTimer = null; }
      }
    });
    onDone?.(result);
    return true;
  } catch (error) {
    const message = normalizeApiError(error, 'AI 请求失败啦');
    if (hasKeyedSource || error?.isNetworkError || error?.isHttpError) notifyApiError(message);
    onError?.({ message, raw: error, status: getStatusFromError(error) });
    return false;
  } finally {
    if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
  }
}

export async function silentRequest({
  prompt = '', messages = [], systemPrompt = '', endpointId = '', model = '',
  timeout = DEFAULT_TIMEOUT, temperature, maxTokens, json = false
} = {}) {
  const sources = getAvailableSources(endpointId);
  let currentTimer = null;
  const hasKeyedSource = sources.some((s) => Boolean(s.apiKey));
  try {
    const result = await tryWithFallback({
      sources, onSwitch: notifyRetry, onReset: null,
      buildFn: async (source) => {
        if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
        const { controller, timer } = createTimeoutController(timeout);
        currentTimer = timer;
        try {
          const provider = source.provider || detectProvider(source.endpoint);
          const requestContext = buildRequestContext({
            endpointConfig: { ...source, provider }, model: model || source.model,
            systemPrompt, messages: Array.isArray(messages) && messages.length ? messages : [{ role: 'user', content: prompt }],
            stream: false, temperature, maxTokens
          });
          const hasMessages = requestContext.provider === 'gemini'
            ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
            : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;
          if (!hasMessages) throw new Error('请求内容不能为空');
          const response = await fetch(requestContext.url, {
            method: 'POST', headers: requestContext.headers, signal: controller.signal, body: JSON.stringify(requestContext.body)
          });
          if (!response.ok) throw await buildHttpError(response);
          const { content, thinking } = response.body
            ? await readJsonResponse(response, requestContext.provider)
            : await readTextResponse(response, requestContext.provider);
          return { content: String(content || '').trim(), thinking: String(thinking || '').trim() };
        } finally { clearTimeout(timer); currentTimer = null; }
      }
    });
    const finalContent = result?.content || '';
    const finalThinking = result?.thinking || '';
    if (json) return parseJsonFromText(finalContent || finalThinking);
    return finalContent || finalThinking;
  } catch (error) {
    const message = normalizeApiError(error, '后台请求失败啦');
    if (hasKeyedSource || error?.isNetworkError || error?.isHttpError) notifyApiError(message);
    return json ? null : '';
  } finally {
    if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
  }
}

export async function fetchModels(endpointId, timeout = DEFAULT_TIMEOUT) {
  const settings = getSettings();
  const targetId = endpointId || settings.defaultApiEndpointId;
  const hasUserEndpoint = Boolean(settings.apiEndpoints.find((item) => item.id === targetId)?.endpoint);
  if (hasUserEndpoint) {
    const { controller, timer } = createTimeoutController(timeout);
    try {
      const endpointConfig = findEndpoint(endpointId);
      if (endpointConfig.provider === 'gemini') {
        let base = endpointConfig.endpoint.replace(/\/v1beta\/models\/?$/i, '').replace(/\/v1beta\/?$/i, '').replace(/\/+$/, '');
        const url = new URL(`${base}/v1beta/models`);
        if (endpointConfig.apiKey) url.searchParams.set('key', endpointConfig.apiKey);
        const response = await fetch(url.toString(), { method: 'GET', signal: controller.signal });
        if (!response.ok) throw await buildHttpError(response);
        const data = await response.json();
        return (Array.isArray(data.models) ? data.models : []).map((m) => (m?.name || '').replace(/^models\//, '')).filter(Boolean).sort((a, b) => a.localeCompare(b));
      }
      const url = smartModelsUrl(endpointConfig.endpoint, endpointConfig.provider);
      const response = await fetch(url, { method: 'GET', headers: buildHeaders(endpointConfig.apiKey, endpointConfig.provider), signal: controller.signal });
      if (!response.ok) throw await buildHttpError(response);
      const data = await response.json();
      if (endpointConfig.provider === 'ollama') {
        return (Array.isArray(data.models) ? data.models : []).map((m) => m?.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
      }
      return (Array.isArray(data.data) ? data.data : []).map((m) => m?.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
    } catch (error) {
      const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, { isUser: true }) : error;
      notifyApiError(normalizeApiError(normalizedError, '拉取模型失败啦'));
    } finally { clearTimeout(timer); }
  }
  for (const anon of ANONYMOUS_SOURCES) {
    const { controller, timer } = createTimeoutController(timeout);
    try {
      const url = smartModelsUrl(anon.endpoint, 'openai');
      const response = await fetch(url, { method: 'GET', headers: buildHeaders('', 'openai'), signal: controller.signal });
      if (!response.ok) continue;
      const data = await response.json();
      const list = (Array.isArray(data.data) ? data.data : []).map((m) => m?.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
      if (list.length) {
        if (!hasUserEndpoint) notifyApiInfo(`从 ${anon.name} 拉到 ${list.length} 个模型`);
        return list;
      }
    } catch { continue; } finally { clearTimeout(timer); }
  }
  return [];
}

// ═══════════════════════════════════════
// 【轮换池测试】
// ═══════════════════════════════════════

export async function testPoolEndpoint(poolId) {
  const items = await getApiPoolItems();
  const target = items.find((item) => String(item.id) === String(poolId));
  if (!target) return { ok: false, message: '找不到这条接口', latencyMs: 0, models: [] };
  const normalized = normalizePoolItem(target);
  const key = normalized.keys[0] || '';
  const model = normalized.model || normalized.models[0] || '';
  if (!normalized.endpoint) return { ok: false, message: '地址没填', latencyMs: 0, models: normalized.models };
  if (!model && normalized.provider !== 'gemini') return { ok: false, message: '模型名没填', latencyMs: 0, models: normalized.models };
  const source = {
    id: normalized.id, poolId: normalized.id, groupType: normalized.groupType,
    name: normalized.name, endpoint: normalized.endpoint, provider: normalized.provider,
    apiKey: key, model, isUser: normalized.groupType === 'paid', isAnonymous: normalized.source === 'anonymous'
  };
  const startedAt = Date.now();
  try {
    const result = await requestOnce({
      source, messages: [{ role: 'user', content: '1+1=?' }], model, stream: false,
      timeout: 15000, temperature: 0.1, maxTokens: 32
    });
    const latencyMs = Date.now() - startedAt;
    await markPoolSourceSuccess(source, latencyMs);
    return { ok: true, message: '连接成功', latencyMs, models: normalized.models, response: result.content };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, source) : error;
    const message = normalizeApiError(normalizedError, '连接失败');
    await markPoolSourceError(source, message, latencyMs);
    return { ok: false, message, latencyMs, models: normalized.models };
  }
}

export async function testAllPoolEndpoints() {
  const items = await getApiPoolItems();
  const results = [];
  for (const item of items) {
    const result = await testPoolEndpoint(item.id);
    results.push({ id: item.id, name: item.name || '未命名', groupType: item.groupType, ...result });
  }
  return results;
}

// 依赖：./storage.js(getData,setData,getAllDB,setDB,deleteDB,getNow,generateId)

