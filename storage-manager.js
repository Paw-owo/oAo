// core/storage-manager.js
// imports:
//   from './storage.js': getData, setData, removeData, getAllDB, setDB, clearStoreDB, generateId, getNow

import {
  getData,
  setData,
  removeData,
  getAllDB,
  setDB,
  clearStoreDB,
  generateId,
  getNow
} from './storage.js';

// ═══════════════════════════════════════
// 【常量】存储 key、超时、版本
// ═══════════════════════════════════════

const CLOUD_KEY = 'app_cloud_server';
const SYNC_STATUS_KEY = 'app_cloud_sync_status';
const DEVICE_ID_KEY = 'app_device_id';

const SNAPSHOT_VERSION = 1;
const CLOUD_TIMEOUT_MS = 10000;

const LOCAL_STORAGE_KEYS = [
  'app_settings',
  'app_theme',
  'app_theme_preset',
  'app_theme_mode',
  'app_cloud_server',
  'app_icons',
  'app_hidden_icons',
  'app_icon_positions',
  'app_widget_positions',
  'app_widget_backgrounds',
  'desktop_layout_scale',
  'app_custom_font_meta',
  'app_custom_widgets',
  'app_wallpaper_opacity',
  'app_weather_cache',
  'weather_cache',
  'app_focus_widget',
  'chat_unread_counts',
  'chat_group_unread_counts',
  'chat_hidden_private_threads',
  'chat_last_route',
  'chat_active_thread',
  'chat_draft_map',
  'chat_pinned_threads',
  'chat_archived_threads',
  'moments_unread_count',
  'games_unread_count',
  'app_lock_unlocked',
  'app_first_open_seed',
  'anniversaries',
  'app_anniversaries',
  'anniversary_list',
  'app_dream_last_gen',
  'app_dream_config'
];

const INDEXED_DB_STORES = [
  'characters',
  'messages',
  'moments',
  'memories',
  'stickers',
  'worldbook',
  'inventory',
  'pet',
  'groups',
  'group_messages',
  'blobs',
  'grudges',
  'punishments',
  'relationship_locks',
  'dreams',
  'api_pool',
  'albums',
  'memories_album',
  'songs',
  'playlists',
  'ai_phone_diaries',
  'ai_phone_visits',
  'ai_phone_chat_archives',
  'ai_phone_memos',
  'ai_phone_mailbox',
  'ai_phone_app_locks',
  'ai_phone_action_logs'
];

const DEFAULT_CLOUD_CONFIG = {
  enabled: false,
  endpoint: '',
  apiKey: '',
  status: 'unknown',
  lastTestAt: '',
  updatedAt: ''
};

const DEFAULT_SYNC_STATUS = {
  running: false,
  lastSyncAt: '',
  lastUploadAt: '',
  lastDownloadAt: '',
  lastError: '',
  updatedAt: ''
};

let syncLock = false;

// ═══════════════════════════════════════
// 【配置读写】云端配置的读取、保存、就绪判断
// ═══════════════════════════════════════

export function getCloudConfig() {
  const saved = getData(CLOUD_KEY) || {};
  return {
    ...DEFAULT_CLOUD_CONFIG,
    ...saved,
    enabled: saved.enabled === true,
    endpoint: String(saved.endpoint || '').trim(),
    apiKey: String(saved.apiKey || '').trim()
  };
}

export function saveCloudConfig(config = {}) {
  const current = getCloudConfig();
  const next = {
    ...current,
    ...config,
    endpoint: String(config.endpoint ?? current.endpoint ?? '').trim(),
    apiKey: String(config.apiKey ?? current.apiKey ?? '').trim(),
    updatedAt: getNow()
  };

  if (!next.endpoint || !next.apiKey) {
    next.enabled = false;
  }

  setData(CLOUD_KEY, next);
  return next;
}

export function isCloudReady(config = getCloudConfig()) {
  return Boolean(config?.enabled === true && String(config.endpoint || '').trim() && String(config.apiKey || '').trim());
}

// ═══════════════════════════════════════
// 【连接测试】ping 云端并保存状态
// ═══════════════════════════════════════

export async function testCloudConnection(config = getCloudConfig()) {
  const cloud = {
    ...getCloudConfig(),
    ...config,
    endpoint: String(config.endpoint || '').trim(),
    apiKey: String(config.apiKey || '').trim()
  };

  if (!cloud.endpoint || !cloud.apiKey) {
    const next = saveCloudConfig({
      ...cloud,
      status: 'error',
      lastTestAt: getNow()
    });

    return {
      ok: false,
      status: next.status,
      message: '请先填写服务器地址和 API 密钥'
    };
  }

  try {
    const response = await cloudFetch('/api/ping', {
      method: 'GET'
    }, cloud);

    const data = await safeJson(response);

    if (!response.ok || !isPingOk(data)) {
      throw new Error(data?.message || `HTTP ${response.status}`);
    }

    saveCloudConfig({
      ...cloud,
      status: 'ok',
      lastTestAt: getNow()
    });

    return {
      ok: true,
      status: 'ok',
      message: '连接成功',
      data
    };
  } catch (error) {
    console.error('[云连接]', error);

    saveCloudConfig({
      ...cloud,
      status: 'error',
      lastTestAt: getNow()
    });

    return {
      ok: false,
      status: 'error',
      message: getFriendlyCloudError(error, cloud.endpoint)
    };
  }
}

// ═══════════════════════════════════════
// 【快照构建】打包本地所有数据
// ═══════════════════════════════════════

export async function buildLocalSnapshot() {
  const localStorageData = {};
  const indexedDBData = {};

  LOCAL_STORAGE_KEYS.forEach((key) => {
    const value = getData(key);
    if (value !== null && value !== undefined) {
      localStorageData[key] = value;
    }
  });

  for (const storeName of INDEXED_DB_STORES) {
    try {
      indexedDBData[storeName] = await getAllDB(storeName);
    } catch {
      indexedDBData[storeName] = [];
    }
  }

  return {
    version: SNAPSHOT_VERSION,
    createdAt: getNow(),
    deviceId: getDeviceId(),
    localStorage: localStorageData,
    indexedDB: indexedDBData
  };
}

// ═══════════════════════════════════════
// 【快照恢复】把云端快照写回本地
// ═══════════════════════════════════════

export async function applyLocalSnapshot(snapshot, options = {}) {
  if (!isValidSnapshot(snapshot)) {
    throw new Error('云端数据格式不正确');
  }

  const overwrite = options.overwrite !== false;
  const skipCloudConfig = options.skipCloudConfig === true;

  if (overwrite) {
    for (const storeName of INDEXED_DB_STORES) {
      try {
        await clearStoreDB(storeName);
      } catch {}
    }
  }

  Object.entries(snapshot.localStorage || {}).forEach(([key, value]) => {
    if (skipCloudConfig && key === CLOUD_KEY) return;
    setData(key, value);
  });

  for (const storeName of INDEXED_DB_STORES) {
    const records = Array.isArray(snapshot.indexedDB?.[storeName]) ? snapshot.indexedDB[storeName] : [];

    for (const record of records) {
      const primaryKey = getPrimaryKey(storeName, record);
      if (!primaryKey) continue;

      try {
        await setDB(storeName, primaryKey, record);
      } catch {}
    }
  }

  setSyncStatus({
    lastDownloadAt: getNow(),
    lastSyncAt: getNow(),
    lastError: ''
  });

  emitStorageChanged();

  return true;
}

// ═══════════════════════════════════════
// 【上传】把本地快照推到云端
// ═══════════════════════════════════════

export async function uploadSnapshotToCloud(options = {}) {
  return withSyncLock(async () => {
    const cloud = getCloudConfig();

    if (!isCloudReady(cloud)) {
      throw new Error('云服务没有开启，或地址/密钥不完整');
    }

    setSyncStatus({
      running: true,
      lastError: ''
    });

    const snapshot = options.snapshot || await buildLocalSnapshot();

    try {
      const response = await cloudFetch('/api/snapshot', {
        method: 'PUT',
        body: JSON.stringify(snapshot)
      }, cloud);

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data?.message || `上传失败：HTTP ${response.status}`);
      }

      setSyncStatus({
        running: false,
        lastUploadAt: getNow(),
        lastSyncAt: getNow(),
        lastError: ''
      });

      return {
        ok: true,
        uploadedAt: getNow(),
        data
      };
    } catch (error) {
      setSyncStatus({
        running: false,
        lastError: getFriendlyCloudError(error, cloud.endpoint)
      });
      throw error;
    }
  });
}

// ═══════════════════════════════════════
// 【下载】从云端拉快照恢复到本地
// ═══════════════════════════════════════

export async function downloadSnapshotFromCloud(options = {}) {
  return withSyncLock(async () => {
    const cloud = getCloudConfig();

    if (!isCloudReady(cloud)) {
      throw new Error('云服务没有开启，或地址/密钥不完整');
    }

    setSyncStatus({
      running: true,
      lastError: ''
    });

    try {
      const response = await cloudFetch('/api/snapshot', {
        method: 'GET'
      }, cloud);

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data?.message || `下载失败：HTTP ${response.status}`);
      }

      const snapshot = data?.snapshot || data;

      if (!isValidSnapshot(snapshot)) {
        throw new Error('云端没有可用备份');
      }

      if (options.apply !== false) {
        await applyLocalSnapshot(snapshot, {
          overwrite: options.overwrite !== false,
          skipCloudConfig: options.skipCloudConfig !== false
        });
      }

      setSyncStatus({
        running: false,
        lastDownloadAt: getNow(),
        lastSyncAt: getNow(),
        lastError: ''
      });

      return {
        ok: true,
        snapshot
      };
    } catch (error) {
      setSyncStatus({
        running: false,
        lastError: getFriendlyCloudError(error, cloud.endpoint)
      });
      throw error;
    }
  });
}

// ═══════════════════════════════════════
// 【同步入口】按模式分流上传/下载
// ═══════════════════════════════════════

export async function syncWithCloud(options = {}) {
  const mode = options.mode || 'upload';

  if (mode === 'download' || mode === 'pull') {
    return downloadSnapshotFromCloud(options);
  }

  if (mode === 'upload' || mode === 'push') {
    return uploadSnapshotToCloud(options);
  }

  throw new Error('未知同步模式');
}

// ═══════════════════════════════════════
// 【同步状态】读取、清除
// ═══════════════════════════════════════

export function getSyncStatus() {
  return {
    ...DEFAULT_SYNC_STATUS,
    ...(getData(SYNC_STATUS_KEY) || {})
  };
}

export function clearSyncStatus() {
  removeData(SYNC_STATUS_KEY);
  return true;
}

function setSyncStatus(patch = {}) {
  const next = {
    ...getSyncStatus(),
    ...patch,
    updatedAt: getNow()
  };

  setData(SYNC_STATUS_KEY, next);
  window.dispatchEvent(new CustomEvent('cloud-sync-status-changed', { detail: next }));

  return next;
}

// ═══════════════════════════════════════
// 【设备 ID】首次生成后复用
// ═══════════════════════════════════════

function getDeviceId() {
  const saved = getData(DEVICE_ID_KEY);
  if (saved) return saved;

  const id = generateId();
  setData(DEVICE_ID_KEY, id);
  return id;
}

// ═══════════════════════════════════════
// 【请求工具】cloudFetch、超时、JSON 解析
// ═══════════════════════════════════════

function normalizeEndpoint(endpoint) {
  return String(endpoint || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/ping\/?$/i, '')
    .replace(/\/api\/snapshot\/?$/i, '');
}

function cloudFetch(path, options = {}, config = getCloudConfig()) {
  const endpoint = normalizeEndpoint(config.endpoint);

  if (!endpoint) {
    throw new Error('云服务器地址为空');
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort();
  }, CLOUD_TIMEOUT_MS);

  const url = `${endpoint}${path}`;
  const headers = {
    'x-api-key': config.apiKey,
    ...(options.headers || {})
  };

  if (options.body && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }

  return fetch(url, {
    ...options,
    headers,
    mode: 'cors',
    cache: 'no-store',
    signal: controller.signal
  }).finally(() => {
    window.clearTimeout(timer);
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isPingOk(data) {
  return Boolean(
    data?.status === 'ok' ||
    data?.ok === true ||
    data?.success === true ||
    data?.message === 'ok' ||
    data?.message === 'pong'
  );
}

function isValidSnapshot(snapshot) {
  return Boolean(
    snapshot &&
    typeof snapshot === 'object' &&
    typeof snapshot.localStorage === 'object' &&
    typeof snapshot.indexedDB === 'object'
  );
}

function getPrimaryKey(storeName, record) {
  if (!record || typeof record !== 'object') return '';

  if (storeName === 'blobs') {
    return record.key || '';
  }

  return record.id || record.key || '';
}

// ═══════════════════════════════════════
// 【错误提示】把各种异常翻译成人话
// ═══════════════════════════════════════

function getFriendlyCloudError(error, endpoint = '') {
  const name = String(error?.name || '');
  const message = String(error?.message || '');

  if (/AbortError/i.test(name) || /timeout|timed out|连接超时/i.test(message)) {
    return '连接超时了，检查一下服务器地址和端口对不对';
  }

  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    const ep = String(endpoint || '').toLowerCase();
    if (ep.startsWith('http://')) {
      return '小手机是 HTTPS，但云服务器是 HTTP，浏览器会拦住。请给云服务器配上 HTTPS，或者用同一局域网的内网穿透';
    }
    return '连接被浏览器拦住了，确认云服务器已配置 CORS 放行当前网址';
  }

  return message || '连接失败，再检查一下服务器地址吧';
}

// ═══════════════════════════════════════
// 【同步锁】防止并发同步
// ═══════════════════════════════════════

async function withSyncLock(task) {
  if (syncLock) {
    throw new Error('同步正在进行中');
  }

  syncLock = true;

  try {
    return await task();
  } finally {
    syncLock = false;
  }
}

function emitStorageChanged() {
  window.dispatchEvent(new CustomEvent('desktop:refresh'));
  window.dispatchEvent(new CustomEvent('app-settings-updated'));
  window.dispatchEvent(new CustomEvent('app-images-updated'));
}

// 依赖：./storage.js(getData,setData,removeData,getAllDB,setDB,clearStoreDB,generateId,getNow)
