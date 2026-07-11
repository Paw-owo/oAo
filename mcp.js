// core/mcp.js
// imports: getData from './storage.js'

import { getData } from './storage.js';

/* ── 常量 ── */
const MCP_TIMEOUT = 20000;
const CLIENT_INFO = { name: 'ai-phone', version: '1.0.0' };
const PROTOCOL_VERSION = '2025-03-26';

/* ── 内部状态 ── */
let rpcId = 0;
const sessions = new Map();

/* ── 工具函数 ── */

function nextId() {
  return ++rpcId;
}

function toast(msg) {
  if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
    window.showToast(msg);
  }
}

function buildRpc(method, params) {
  const msg = { jsonrpc: '2.0', id: nextId(), method };
  if (params !== undefined) msg.params = params;
  return msg;
}

function buildNotification(method, params) {
  const msg = { jsonrpc: '2.0', method };
  if (params !== undefined) msg.params = params;
  return msg;
}

function findServer(serverId) {
  const settings = getData('app_settings');
  const servers = settings?.mcpServers || [];
  return servers.find(s => s.id === serverId) || null;
}

// ═══════════════════════════════════════
// 【请求头】构建 headers，支持 apiKey 认证
// ═══════════════════════════════════════

function buildHeaders(sessionId, apiKey) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

async function fetchWithTimeout(url, options, timeout = MCP_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

/**
 * 解析响应体，兼容 application/json 和 text/event-stream
 * SSE 格式从 data: 行中提取最后一条带 id 的 JSON-RPC 响应
 */
async function parseResponseBody(response) {
  const contentType = response.headers.get('Content-Type') || '';

  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    const lines = text.split('\n');
    let lastRpc = null;

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.jsonrpc && parsed.id !== undefined) {
          lastRpc = parsed;
        }
      } catch (_) {
        /* 跳过非 JSON 行 */
      }
    }

    if (!lastRpc) {
      return { ok: false, error: 'SSE 响应中未找到有效结果', result: null };
    }
    return parseRpcResult(lastRpc);
  }

  const data = await response.json();
  return parseRpcResult(data);
}

function parseRpcResult(data) {
  if (data.error) {
    const code = data.error.code || '';
    const message = data.error.message || '未知错误';
    return { ok: false, error: `[${code}] ${message}`, result: null };
  }
  return { ok: true, error: null, result: data.result };
}

function extractTextFromContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text)
    .join('\n');
}

// ═══════════════════════════════════════
// 【会话初始化】发送 initialize 请求，带认证头
// ═══════════════════════════════════════

async function ensureSession(serverId) {
  const cached = sessions.get(serverId);
  if (cached && cached.ready) return cached;

  const server = findServer(serverId);
  if (!server) return null;

  const session = { ready: false, sessionId: null, serverInfo: null, capabilities: null };
  const serverApiKey = server.apiKey || '';

  try {
    const initBody = buildRpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO
    });

    const response = await fetchWithTimeout(server.url, {
      method: 'POST',
      headers: buildHeaders(null, serverApiKey),
      body: JSON.stringify(initBody)
    });

    if (response.ok) {
      session.sessionId = response.headers.get('Mcp-Session-Id') || null;

      const parsed = await parseResponseBody(response);
      if (parsed.ok && parsed.result) {
        session.serverInfo = parsed.result.serverInfo || null;
        session.capabilities = parsed.result.capabilities || null;
      }

      try {
        await fetchWithTimeout(server.url, {
          method: 'POST',
          headers: buildHeaders(session.sessionId, serverApiKey),
          body: JSON.stringify(buildNotification('initialized'))
        }, 5000);
      } catch (_) {
        /* initialized 通知失败不阻塞 */
      }
    }
  } catch (_) {
    /* 初始化失败，仍允许后续请求（兼容不要求初始化的服务器） */
  }

  session.ready = true;
  sessions.set(serverId, session);
  return session;
}

// ═══════════════════════════════════════
// 【通用 RPC】发送 JSON-RPC 请求，带认证头
// ═══════════════════════════════════════

async function rpcCall(serverId, method, params, isRetry = false) {
  const server = findServer(serverId);
  if (!server) {
    toast('MCP 服务器不存在');
    return null;
  }

  const session = await ensureSession(serverId);
  const sessionId = session?.sessionId || null;
  const serverApiKey = server.apiKey || '';

  try {
    const body = buildRpc(method, params);
    const response = await fetchWithTimeout(server.url, {
      method: 'POST',
      headers: buildHeaders(sessionId, serverApiKey),
      body: JSON.stringify(body)
    });

    /* 会话过期：清除缓存并重试一次 */
    if (response.status === 404 && sessionId && !isRetry) {
      sessions.delete(serverId);
      return rpcCall(serverId, method, params, true);
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 404) {
        toast('MCP 端点不存在，请检查 URL');
      } else if (status === 405) {
        toast('MCP 服务器不支持该请求方式');
      } else {
        toast(`MCP 请求失败 (${status})`);
      }
      return null;
    }

    return await parseResponseBody(response);
  } catch (error) {
    if (error.name === 'AbortError') {
      toast('MCP 请求超时');
    } else if (error.message?.includes('Failed to fetch')) {
      toast('MCP 连接失败，请检查服务器地址或 CORS 配置');
    } else {
      toast('MCP 请求出错');
    }
    return null;
  }
}

/* ── 导出函数 ── */

/**
 * 获取已启用的 MCP 服务器列表
 * @returns {Array<{id,name,url,enabled}>}
 */
export function getMcpServers() {
  const settings = getData('app_settings');
  const servers = settings?.mcpServers || [];
  return servers.filter(s => s.enabled);
}

/**
 * 获取指定服务器的工具列表
 * @param {string} serverId
 * @returns {Promise<Array<{name,description,inputSchema}>>}
 */
export async function listMcpTools(serverId) {
  const rpc = await rpcCall(serverId, 'tools/list');
  if (!rpc || !rpc.ok) return [];
  return rpc.result?.tools || [];
}

/**
 * 调用 MCP 工具
 * @param {string} serverId
 * @param {string} toolName
 * @param {object} params - 工具参数
 * @returns {Promise<{content:Array, isError:boolean, text:string}|null>}
 */
export async function callMcpTool(serverId, toolName, params) {
  const rpc = await rpcCall(serverId, 'tools/call', {
    name: toolName,
    arguments: params || {}
  });

  if (!rpc) return null;

  if (!rpc.ok) {
    toast(`MCP 工具调用失败：${rpc.error}`);
    return null;
  }

  const content = rpc.result?.content || [];
  const isError = rpc.result?.isError || false;
  const text = extractTextFromContent(content);

  if (isError) {
    toast(`MCP 工具返回错误：${text || '未知'}`);
  }

  return { content, isError, text };
}

/**
 * 将 MCP 工具结果格式化为可注入上下文的字符串
 * @param {string} serverId
 * @param {string} toolName
 * @param {object} result - callMcpTool 的返回值
 * @returns {string}
 */
export function buildMcpContext(serverId, toolName, result) {
  if (!result || !result.text) return '';

  const server = findServer(serverId);
  const serverName = server?.name || 'MCP';

  return `\n\n[MCP工具结果 - ${serverName}/${toolName}]\n${result.text}`;
}

/**
 * 清除指定服务器或全部会话缓存
 * @param {string} [serverId] - 不传则清除全部
 */
export function resetSession(serverId) {
  if (serverId) {
    sessions.delete(serverId);
  } else {
    sessions.clear();
  }
}

// depends: core/storage.js -> getData
