/* ============================================================
   小手机系统 · 存储层（IndexedDB 封装）
   ============================================================ */
(function (global) {
  'use strict';

  const DB_NAME = 'phone-system';
  const DB_VERSION = 1;

  // 所有 store 的 schema 定义
  const STORE_SCHEMAS = {
    events:        { key: 'id', auto: true,  indexes: [['type', 'type'], ['appId', 'appId'], ['createdAt', 'createdAt'], ['read', 'read']] },
    conversations: { key: 'id', auto: false, indexes: [['pinned', 'pinned'], ['hidden', 'hidden'], ['updatedAt', 'updatedAt']] },
    messages:      { key: 'id', auto: true,  indexes: [['conversationId', 'conversationId'], ['createdAt', 'createdAt']] },
    characters:    { key: 'id', auto: false, indexes: [['name', 'name'], ['active', 'active']] },
    memories:      { key: 'id', auto: true,  indexes: [['characterId', 'characterId'], ['createdAt', 'createdAt']] },
    worldbook:     { key: 'id', auto: false, indexes: [['name', 'name'], ['active', 'active']] },
    moments:       { key: 'id', auto: true,  indexes: [['createdAt', 'createdAt']] },
    gallery:       { key: 'id', auto: true,  indexes: [['createdAt', 'createdAt']] },
    memo:          { key: 'id', auto: true,  indexes: [['createdAt', 'createdAt'], ['pinned', 'pinned']] },
    anniversary:   { key: 'id', auto: false, indexes: [['date', 'date']] },
    wallet_tx:     { key: 'id', auto: true,  indexes: [['createdAt', 'createdAt'], ['type', 'type']] },
    shop_items:    { key: 'id', auto: false, indexes: [['owned', 'owned']] },
    notifications: { key: 'id', auto: true,  indexes: [['appId', 'appId'], ['read', 'read'], ['createdAt', 'createdAt']] },
    kv:            { key: 'key', auto: false, indexes: [] }
  };

  let db = null;
  const tableListeners = {}; // store -> Set<callback>

  function notifyChange(store) {
    const set = tableListeners[store];
    if (set) set.forEach(cb => { try { cb(); } catch (e) { console.warn(e); } });
  }

  /**
   * 打开/初始化数据库
   */
  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        for (const storeName in STORE_SCHEMAS) {
          const schema = STORE_SCHEMAS[storeName];
          if (d.objectStoreNames.contains(storeName)) continue;
          const os = d.createObjectStore(storeName, { keyPath: schema.key, autoIncrement: schema.auto });
          schema.indexes.forEach(([name, field]) => {
            os.createIndex(name, field, { unique: false });
          });
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  /** 事务辅助：获取 store */
  function txStore(store, mode = 'readonly') {
    if (!db) throw new Error('Storage 未初始化，请先 await Phone.Storage.init()');
    const t = db.transaction(store, mode);
    return t.objectStore(store);
  }

  function req2promise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const Storage = {
    /** 初始化 */
    async init() {
      if (db) return db;
      db = await open();
      return db;
    },

    /** 读单条 */
    async get(store, key) {
      const r = req2promise(txStore(store).get(key));
      return await r;
    },

    /** 写单条（覆盖） */
    async put(store, value) {
      const os = txStore(store, 'readwrite');
      await req2promise(os.put(value));
      notifyChange(store);
    },

    /** 写单条（同 put，别名） */
    async set(store, value) { return Storage.put(store, value); },

    /** 列表查询
     * @param {string} store
     * @param {object} opts { index, range, limit, reverse }
     */
    async list(store, opts = {}) {
      const { index, range, limit, reverse } = opts;
      const os = txStore(store);
      const source = index ? os.index(index) : os;
      const direction = reverse ? 'prev' : 'next';
      const req = range ? source.openCursor(range, direction) : source.openCursor(null, direction);
      const results = [];
      return new Promise((resolve, reject) => {
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor && (limit == null || results.length < limit)) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => reject(req.error);
      });
    },

    /** 删除单条 */
    async delete(store, key) {
      const os = txStore(store, 'readwrite');
      await req2promise(os.delete(key));
      notifyChange(store);
    },

    /** 清空 store */
    async clear(store) {
      const os = txStore(store, 'readwrite');
      await req2promise(os.clear());
      notifyChange(store);
    },

    /** 计数 */
    async count(store, index, range) {
      const os = txStore(store);
      const source = index ? os.index(index) : os;
      const req = range ? source.count(range) : source.count();
      return await req2promise(req);
    },

    /** 监听某 store 变化 */
    onTable(store, callback) {
      if (!tableListeners[store]) tableListeners[store] = new Set();
      tableListeners[store].add(callback);
      return () => tableListeners[store] && tableListeners[store].delete(callback);
    },

    /** 导出全部数据 */
    async exportAll() {
      const out = {};
      for (const store of Object.keys(STORE_SCHEMAS)) {
        out[store] = await Storage.list(store);
      }
      return out;
    },

    /** 导入全部数据（覆盖） */
    async importAll(json) {
      for (const store of Object.keys(STORE_SCHEMAS)) {
        if (!json[store]) continue;
        await Storage.clear(store);
        const os = txStore(store, 'readwrite');
        for (const item of json[store]) {
          // 移除主键以避免自增冲突（如果 store 是 autoIncrement）
          const schema = STORE_SCHEMAS[store];
          let val = item;
          if (schema.auto) {
            val = { ...item };
            delete val[schema.key];
          }
          os.put(val);
        }
      }
      // 触发所有 store 的变更
      Object.keys(STORE_SCHEMAS).forEach(notifyChange);
    },

    /** 重置（清空全部 store） */
    async resetAll() {
      for (const store of Object.keys(STORE_SCHEMAS)) {
        await Storage.clear(store);
      }
    },

    /** 列出所有 store 名 */
    stores() { return Object.keys(STORE_SCHEMAS); },

    /** 列出某 store 的 schema */
    schema(store) { return STORE_SCHEMAS[store]; }
  };

  global.Phone = global.Phone || {};
  global.Phone.Storage = Storage;
})(window);
