/* ============================================================
   state.js — 全局响应式状态
   管理主题 / 当前角色 / 字号 等全局状态
   订阅者通过 subscribe(key, fn) 监听变化
   挂在 window.Phone.State

   注意：与 Storage 设置项是双向同步的——
   setSetting(key, val) 会触发 _notify(key, val)，
   本模块的 set() 也会写入 Storage。
   ============================================================ */
(function (global) {
  "use strict";

  const cache = {};          // key -> value
  const subscribers = {};    // key -> Set<fn>

  // 需要持久化的 key（来自 Storage.DEFAULT_SETTINGS）
  const PERSISTED_KEYS = [
    "systemName", "theme", "wallpaper", "wallpaperMode", "fontSize",
    "iconColumns", "iconSpacing", "dockApps", "hiddenApps", "appOrder",
    "appBackgrounds", "bubbleStyle", "chatBackground",
    "aiEndpoint", "aiApiKey", "aiModel", "aiSpeakingStyle", "showThinking",
    "aiTemperature", "aiMaxTokens",
    "lockPassword", "lockWallpaper", "lockAvatar", "lockText",
    "currentCharacterId", "badgeEnabled", "notifyEnabled", "notifyPerApp",
    "dndEnabled", "dndStart", "dndEnd",
  ];

  // 启动时从 Storage 一次性加载到缓存
  async function init() {
    const settings = await global.Phone.Storage.getAllSettings();
    Object.assign(cache, settings);
    applyTheme();
    applyFontSize();
    applySystemName();
  }

  function get(key) { return cache[key]; }
  function getAll() { return Object.assign({}, cache); }

  // 内存中设置（不落库），用于临时状态
  function setMem(key, val) {
    cache[key] = val;
    _notify(key, val);
  }

  // 设置并落库（持久化的 key 才写 Storage）
  async function set(key, val) {
    cache[key] = val;
    if (PERSISTED_KEYS.indexOf(key) >= 0) {
      try { await global.Phone.Storage.setSetting(key, val); } catch (e) { console.warn("[State] 落库失败", e); }
      // 持久化设置变更进事件中心，供消息中心 / AI 读取
      try {
        const EC = global.Phone.EventCenter;
        if (EC) {
          EC.emit(EC.TYPES.SETTINGS_CHANGED, {
            sourceApp: "settings",
            data: { key, value: val },
            summary: "设置变更：" + key,
          });
        }
      } catch (e) { console.warn("[State] emit SETTINGS_CHANGED 失败", e); }
    }
    _notify(key, val);
    // 主题/字号/系统名联动 DOM
    if (key === "theme") applyTheme();
    if (key === "fontSize") applyFontSize();
    if (key === "systemName") applySystemName();
    return val;
  }

  function subscribe(key, fn) {
    if (!subscribers[key]) subscribers[key] = new Set();
    subscribers[key].add(fn);
    return () => { subscribers[key] && subscribers[key].delete(fn); };
  }

  // 由 Storage.setSetting 触发，避免循环
  function _notify(key, val) {
    cache[key] = val;
    const set = subscribers[key];
    if (set) for (const fn of Array.from(set)) {
      try { fn(val); } catch (e) { console.warn("[State] 订阅者报错", e); }
    }
  }

  // ---------- DOM 联动 ----------
  function applyTheme() {
    const theme = cache.theme || "honey";
    document.documentElement.setAttribute("data-theme", theme);
  }

  function applyFontSize() {
    const fs = cache.fontSize || "base";
    document.documentElement.setAttribute("data-font-size", fs);
  }

  function applySystemName() {
    const name = cache.systemName || "小手机";
    document.title = name;
    const meta = document.querySelector('meta[name="application-name"]');
    if (meta) meta.setAttribute("content", name);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.State = {
    init, get, getAll, set, setMem, subscribe,
    PERSISTED_KEYS,
    _notify,
  };
})(window);
