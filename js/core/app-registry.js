/* ============================================================
   app-registry.js — APP 注册表
   每个 APP 启动时调用 register(spec) 注册自己
   桌面通过 list() 动态渲染图标，不写死任何 APP 入口

   spec 结构：
   {
     id, name, icon, color, entry,
     events: [],        // 该 APP 会产生的事件类型
     settings: [],      // 该 APP 需要的设置项
     aiSpec: "url",     // AI 说明书文件路径
     defaultHidden: false,
     order: 100,        // 默认排序权重（越小越靠前）
   }

   挂在 window.Phone.AppRegistry
   ============================================================ */
(function (global) {
  "use strict";

  const registry = {}; // id -> spec
  const order = [];    // 注册顺序

  function register(spec) {
    if (!spec || !spec.id) throw new Error("APP 注册缺少 id");
    if (registry[spec.id]) {
      // 已注册：覆盖（热更新场景）
      const idx = order.indexOf(spec.id);
      if (idx >= 0) order.splice(idx, 1);
    }
    spec.order = spec.order != null ? spec.order : 100;
    registry[spec.id] = Object.assign({ registeredAt: Date.now() }, spec);
    order.push(spec.id);
    return spec;
  }

  function get(id) { return registry[id] || null; }
  function has(id) { return !!registry[id]; }
  function list() {
    return order.map((id) => registry[id]).sort((a, b) => (a.order - b.order));
  }
  function listIds() { return list().map((s) => s.id); }

  function unregister(id) {
    delete registry[id];
    const idx = order.indexOf(id);
    if (idx >= 0) order.splice(idx, 1);
  }

  // 打开 APP（统一入口，触发预加载钩子）
  function open(id) {
    const spec = registry[id];
    if (!spec) {
      console.warn("[AppRegistry] 未注册的 APP:", id);
      return false;
    }
    if (typeof spec.entry !== "function") {
      console.warn("[AppRegistry] APP 没有 entry 函数:", id);
      return false;
    }
    try {
      spec.entry();
      global.Phone.EventCenter.emit("app_opened", {
        sourceApp: "system", data: { appId: id }, summary: "打开了 " + spec.name,
      });
      return true;
    } catch (e) {
      console.error("[AppRegistry] 打开 APP 失败:", id, e);
      return false;
    }
  }

  // 获取所有 APP 声明的事件类型集合
  function allEventTypes() {
    const set = new Set();
    Object.keys(registry).forEach((id) => {
      (registry[id].events || []).forEach((t) => set.add(t));
    });
    return Array.from(set);
  }

  // 获取所有 APP 的设置项聚合
  function allSettings() {
    const arr = [];
    Object.keys(registry).forEach((id) => {
      (registry[id].settings || []).forEach((s) => arr.push(Object.assign({ appId: id }, s)));
    });
    return arr;
  }

  // 默认 APP 顺序（与设置中的 appOrder 配合）
  const DEFAULT_APP_ORDER = [
    "chat", "moments", "characters", "worldbook",
    "memory", "gallery", "wallet", "shop",
    "memo", "anniversary", "games", "music", "settings",
  ];

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AppRegistry = {
    register, unregister,
    get, has, list, listIds,
    open,
    allEventTypes, allSettings,
    DEFAULT_APP_ORDER,
  };
})(window);
