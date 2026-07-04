/* ============================================================
   storage.js — IndexedDB 封装层
   提供 CRUD / 批量 / 导出导入 / 默认数据种子
   挂在 window.Phone.Storage

   DB 名: PhoneDB    版本: 1
   Stores 见 technical-architecture.md
   ============================================================ */
(function (global) {
  "use strict";

  const DB_NAME = "PhoneDB";
  const DB_VERSION = 3;

  // Store 定义：name -> { keyPath, indexes }
  const STORE_DEFS = {
    settings:        { keyPath: "key"  },
    characters:      { keyPath: "id",  indexes: [["createdAt", "createdAt"]] },
    worldbooks:      { keyPath: "id"   },
    conversations:   { keyPath: "id",  indexes: [["characterId", "characterId"], ["updatedAt", "updatedAt"]] },
    messages:        { keyPath: "id",  indexes: [["conversationId", "conversationId"], ["createdAt", "createdAt"]] },
    memories:        { keyPath: "id",  indexes: [["characterId", "characterId"], ["type", "type"], ["createdAt", "createdAt"]] },
    grudges:         { keyPath: "id",  indexes: [["characterId", "characterId"], ["forgiven", "forgiven"], ["createdAt", "createdAt"]] },
    moments:         { keyPath: "id",  indexes: [["authorId", "authorId"], ["createdAt", "createdAt"]] },
    wallet:          { keyPath: "key"  }, // 单例 'main'
    transactions:    { keyPath: "id",  indexes: [["createdAt", "createdAt"]] },
    shop:            { keyPath: "id",  indexes: [["category", "category"]] },
    inventory:       { keyPath: "id",  indexes: [["characterId", "characterId"], ["itemId", "itemId"]] },
    favorites:       { keyPath: "id",  indexes: [["itemId", "itemId"], ["createdAt", "createdAt"]] },
    cart:            { keyPath: "id",  indexes: [["itemId", "itemId"], ["updatedAt", "updatedAt"]] },
    orders:          { keyPath: "id",  indexes: [["itemId", "itemId"], ["type", "type"], ["createdAt", "createdAt"]] },
    music:           { keyPath: "id"   },
    playlists:       { keyPath: "id"   },
    memos:           { keyPath: "id",  indexes: [["completed", "completed"], ["remindAt", "remindAt"]] },
    anniversaries:   { keyPath: "id",  indexes: [["date", "date"]] },
    events:          { keyPath: "id",  indexes: [["type", "type"], ["sourceApp", "sourceApp"], ["createdAt", "createdAt"], ["read", "read"]] },
    notifications:   { keyPath: "id",  indexes: [["read", "read"], ["createdAt", "createdAt"]] },
    drafts:          { keyPath: "conversationId" },
    game_truth_dare: { keyPath: "id",  indexes: [["createdAt", "createdAt"]] },
    game_undercover: { keyPath: "id",  indexes: [["createdAt", "createdAt"]] },
    game_liar_dice:  { keyPath: "id",  indexes: [["createdAt", "createdAt"]] },
    game_tarot:      { keyPath: "id",  indexes: [["createdAt", "createdAt"]] },
  };

  let _db = null;
  const _ready = new Promise((resolve, reject) => {
    if (!global.indexedDB) { reject(new Error("浏览器不支持 IndexedDB")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      Object.keys(STORE_DEFS).forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          const def = STORE_DEFS[name];
          const store = db.createObjectStore(name, { keyPath: def.keyPath });
          (def.indexes || []).forEach(([idxName, field]) => {
            store.createIndex(idxName, field, { unique: false });
          });
        }
      });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });

  function tx(storeName, mode) {
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  // ---------- 通用 CRUD ----------
  function put(storeName, value) {
    return _ready.then((db) => new Promise((resolve, reject) => {
      const r = tx(storeName, "readwrite").put(value);
      r.onsuccess = () => resolve(value);
      r.onerror = () => reject(r.error);
    }));
  }

  function get(storeName, key) {
    return _ready.then((db) => new Promise((resolve, reject) => {
      const r = tx(storeName, "readonly").get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    }));
  }

  function getAll(storeName) {
    return _ready.then((db) => new Promise((resolve, reject) => {
      const r = tx(storeName, "readonly").getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    }));
  }

  function del(storeName, key) {
    return _ready.then((db) => new Promise((resolve, reject) => {
      const r = tx(storeName, "readwrite").delete(key);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    }));
  }

  function clear(storeName) {
    return _ready.then((db) => new Promise((resolve, reject) => {
      const r = tx(storeName, "readwrite").clear();
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    }));
  }

  function count(storeName) {
    return _ready.then((db) => new Promise((resolve, reject) => {
      const r = tx(storeName, "readonly").count();
      r.onsuccess = () => resolve(r.result || 0);
      r.onerror = () => reject(r.error);
    }));
  }

  // 按索引查询
  function getByIndex(storeName, indexName, value) {
    return _ready.then((db) => new Promise((resolve, reject) => {
      const store = tx(storeName, "readonly");
      const idx = store.index(indexName);
      const r = idx.getAll(value);
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    }));
  }

  // 批量写入
  function bulkPut(storeName, items) {
    return _ready.then((db) => new Promise((resolve, reject) => {
      const store = tx(storeName, "readwrite");
      items.forEach((it) => store.put(it));
      const r = store.transaction;
      r.oncomplete = () => resolve(true);
      r.onerror = () => reject(r.error);
      r.onabort = () => reject(r.error);
    }));
  }

  // ---------- Settings 便捷 API ----------
  const DEFAULT_SETTINGS = {
    systemName: "小手机",
    version: "1.0.0",
    theme: "honey",
    wallpaper: "",          // 空 = 用主题默认渐变
    wallpaperMode: "default", // default / base64 / url
    fontSize: "base",
    iconColumns: 4,
    iconSpacing: "comfortable",
    dockApps: ["chat", "settings", "characters", "worldbook"],
    hiddenApps: [],
    appOrder: null,         // null = 默认顺序
    appBackgrounds: {},     // appId -> 背景 css
    bubbleStyle: "rounded",
    chatBackground: "",
    aiEndpoint: "",
    aiApiKey: "",
    aiModel: "gpt-4o-mini",
    aiSpeakingStyle: "",
    showThinking: false,
    aiTemperature: 0.7,
    aiMaxTokens: 2000,
    notifyEnabled: true,
    notifyPerApp: {},
    dndEnabled: false,
    dndStart: "23:00",
    dndEnd: "07:00",
    badgeEnabled: true,
    lockPassword: "0326",
    lockWallpaper: "",
    lockAvatar: "",
    lockText: "",
    currentCharacterId: null,
    bootShown: false,
    installedAt: null,
    lastVisitedAt: null,
  };

  async function getSetting(key) {
    const row = await get("settings", key);
    if (row) return row.value;
    return DEFAULT_SETTINGS[key] !== undefined ? DEFAULT_SETTINGS[key] : null;
  }

  async function setSetting(key, value) {
    await put("settings", { key: key, value: value });
    // 触发全局设置变更事件（不进事件中心，避免循环）
    if (global.Phone && global.Phone.State) {
      global.Phone.State._notify(key, value);
    }
    return value;
  }

  async function getAllSettings() {
    const rows = await getAll("settings");
    const obj = {};
    Object.keys(DEFAULT_SETTINGS).forEach((k) => obj[k] = DEFAULT_SETTINGS[k]);
    rows.forEach((r) => obj[r.key] = r.value);
    return obj;
  }

  // ---------- 默认数据种子 ----------
  async function seedIfEmpty() {
    const settings = await getAllSettings();
    if (!settings.installedAt) {
      await setSetting("installedAt", Date.now());
    }

    // 默认角色
    const chars = await getAll("characters");
    if (chars.length === 0) {
      const now = Date.now();
      const defaultChar = {
        id: "char_default",
        name: "小棉花",
        avatar: "",
        description: "一团软软的棉花糖，喜欢撒娇也喜欢记仇。",
        personality: "温柔软萌，偶尔傲娇，记性很好",
        speakingStyle: "口语化、爱用语气词、爱叫人 nickname",
        background: "出生在奶黄云朵里，被你捡回家的小棉花糖",
        worldbookIds: [],
        memory: [],
        createdAt: now,
        updatedAt: now,
      };
      await put("characters", defaultChar);
      await setSetting("currentCharacterId", defaultChar.id);
    }

    // 默认钱包
    const wallet = await get("wallet", "main");
    if (!wallet) {
      const walletNow = Date.now();
      await put("wallet", {
        key: "main",
        userBalance: 10000,
        aiBalance: 5000,
        transactions: [{
          id: "tx_seed_1",
          type: "init",
          amount: 10000,
          balanceType: "user",
          note: "初始余额",
          createdAt: walletNow,
        }, {
          id: "tx_seed_2",
          type: "init",
          amount: 5000,
          balanceType: "ai",
          note: "AI 初始余额",
          createdAt: walletNow,
        }],
      });
    }

    // 默认商店商品
    const shop = await getAll("shop");
    if (shop.length === 0) {
      const items = [
        { id: "shop_1", name: "草莓蛋糕", price: 30, description: "软软的草莓奶油蛋糕，甜到心里。", image: "", category: "礼物", emoji: "" },
        { id: "shop_2", name: "棉花糖抱枕", price: 88, description: "比 AI 还软的抱枕。", image: "", category: "礼物" },
        { id: "shop_3", name: "魔法星星", price: 5, description: "可以许一个小愿望。", image: "", category: "道具" },
        { id: "shop_4", name: "解锁新话题", price: 50, description: "AI 会主动聊一个新话题。", image: "", category: "功能" },
        { id: "shop_5", name: "原谅卡", price: 10, description: "用它可以请求原谅一次记仇。", image: "", category: "道具" },
      ];
      await bulkPut("shop", items);
    }

    // 默认世界书
    const wbs = await getAll("worldbooks");
    if (wbs.length === 0) {
      const now2 = Date.now();
      await put("worldbooks", {
        id: "wb_default",
        name: "默认世界书",
        entries: [
          { id: "entry_1", keywords: ["小手机"], content: "小手机是用户的虚拟伴侣手机，AI 住在里面。", priority: 10, enabled: true },
          { id: "entry_2", keywords: ["棉花糖"], content: "小棉花是一团软软的棉花糖，被用户捡回家。", priority: 8, enabled: true },
        ],
        createdAt: now2,
        updatedAt: now2,
      });
    }
  }

  // ---------- 导出 / 导入 ----------
  async function exportAll() {
    const data = { _meta: { version: DB_VERSION, exportedAt: Date.now() } };
    for (const name of Object.keys(STORE_DEFS)) {
      data[name] = await getAll(name);
    }
    return data;
  }

  async function importAll(data, mode) {
    mode = mode || "merge"; // merge / replace
    for (const name of Object.keys(STORE_DEFS)) {
      if (!data[name]) continue;
      if (mode === "replace") await clear(name);
      await bulkPut(name, data[name]);
    }
    return true;
  }

  // 清空所有（保留 settings 的 installedAt）
  async function clearAll() {
    for (const name of Object.keys(STORE_DEFS)) {
      if (name === "settings") continue;
      await clear(name);
    }
    await setSetting("installedAt", Date.now());
    await seedIfEmpty();
    return true;
  }

  // 重置系统（清空 + 重置 settings 到默认）
  async function resetSystem() {
    for (const name of Object.keys(STORE_DEFS)) {
      await clear(name);
    }
    await seedIfEmpty();
    return true;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Storage = {
    ready: _ready,
    STORE_DEFS,
    DEFAULT_SETTINGS,
    put, get, getAll, del, clear, count, getByIndex, bulkPut,
    getSetting, setSetting, getAllSettings,
    seedIfEmpty,
    exportAll, importAll, clearAll, resetSystem,
  };
})(window);
