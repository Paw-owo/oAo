/* ============================================================
   小手机系统 · APP 注册表
   每个 APP 在此注册元数据；桌面/设置/Dock 通过它统一获取 APP 信息。
   ============================================================ */
(function (global) {
  'use strict';

  const registry = new Map(); // id -> appMeta
  const order = []; // 注册顺序，用于默认排序

  const AppRegistry = {
    /**
     * 注册一个 APP
     * @param {object} meta {
     *   id, name, icon (svg string), entry (function),
     *   events (string[]), settings (array), aiSpec (string),
     *   defaultInDock (bool), defaultInGrid (bool), color (可选),
     *   category (string 可选)
     * }
     */
    register(meta) {
      if (!meta || !meta.id) throw new Error('AppRegistry.register: 缺少 id');
      if (registry.has(meta.id)) {
        // 允许覆盖更新
        registry.set(meta.id, { ...registry.get(meta.id), ...meta });
        return meta;
      }
      const full = {
        id: meta.id,
        name: meta.name || meta.id,
        icon: meta.icon || '',
        entry: meta.entry || (() => {}),
        events: meta.events || [],
        settings: meta.settings || [],
        aiSpec: meta.aiSpec || null,
        defaultInDock: meta.defaultInDock || false,
        defaultInGrid: meta.defaultInGrid !== false,
        color: meta.color || null,
        category: meta.category || 'main',
        description: meta.description || ''
      };
      registry.set(meta.id, full);
      order.push(meta.id);
      return full;
    },

    /** 获取单个 APP 元数据 */
    get(id) { return registry.get(id); },

    /** 是否已注册 */
    has(id) { return registry.has(id); },

    /** 获取全部 APP（按注册顺序） */
    all() { return order.map(id => registry.get(id)); },

    /** 获取默认进 Dock 的 APP */
    defaultDock() { return AppRegistry.all().filter(a => a.defaultInDock).map(a => a.id); },

    /** 获取默认进网格的 APP */
    defaultGrid() { return AppRegistry.all().filter(a => a.defaultInGrid).map(a => a.id); },

    /** 打开 APP */
    open(id) {
      const app = registry.get(id);
      if (!app) { console.warn('未注册的 APP:', id); return; }
      try {
        app.entry();
      } catch (e) {
        console.error('打开 APP 失败:', id, e);
        global.Phone.Utils && global.Phone.Utils.toast('这个 APP 还没准备好呢');
      }
    }
  };

  global.Phone = global.Phone || {};
  global.Phone.AppRegistry = AppRegistry;
})(window);
