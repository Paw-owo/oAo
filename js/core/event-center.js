/* ============================================================
   event-center.js — 事件中心
   APP 间通信枢纽：emit / on / once / off / query
   所有事件落 IndexedDB events 表，可被消息中心 & AI 读取

   事件结构：
   { id, type, sourceApp, data, createdAt, read, summary }
   summary: 给消息中心和 AI 看的简短描述（可省略，由 emit 时提供）

   挂在 window.Phone.EventCenter
   ============================================================ */
(function (global) {
  "use strict";

  const handlers = {};       // type -> Set<handler>
  const wildcards = new Set(); // "*" handler

  function _on(type, handler, once) {
    if (type === "*") {
      wildcards.add({ handler: handler, once: !!once });
      return () => _off(type, handler);
    }
    if (!handlers[type]) handlers[type] = new Set();
    const wrap = { handler: handler, once: !!once };
    handlers[type].add(wrap);
    return () => _off(type, handler);
  }

  function on(type, handler) { return _on(type, handler, false); }
  function once(type, handler) { return _on(type, handler, true); }

  function off(type, handler) { return _off(type, handler); }
  function _off(type, handler) {
    if (type === "*") {
      for (const w of wildcards) if (w.handler === handler) wildcards.delete(w);
      return;
    }
    const set = handlers[type];
    if (!set) return;
    for (const w of set) if (w.handler === handler) set.delete(w);
  }

  /**
   * 触发事件 + 落库 + 通知订阅者
   * @param {string} type 事件类型
   * @param {object} payload { sourceApp, data, summary }
   */
  async function emit(type, payload) {
    payload = payload || {};
    const Storage = global.Phone && global.Phone.Storage;
    const event = {
      id: global.Phone.Utils.uid("evt"),
      type: type,
      sourceApp: payload.sourceApp || "system",
      data: payload.data || {},
      summary: payload.summary || "",
      createdAt: Date.now(),
      read: false,
    };

    // 落库（不阻塞 emit 返回，失败时仅记录）
    if (Storage) {
      try { await Storage.put("events", event); } catch (e) { console.warn("[EventCenter] 落库失败", e); }
    }

    // 通知订阅者
    const set = handlers[type];
    if (set) {
      for (const w of Array.from(set)) {
        try { w.handler(event); } catch (e) { console.warn("[EventCenter] 订阅者报错", e); }
        if (w.once) set.delete(w);
      }
    }
    for (const w of Array.from(wildcards)) {
      try { w.handler(event); } catch (e) { console.warn("[EventCenter] 通配订阅者报错", e); }
      if (w.once) wildcards.delete(w);
    }
    return event;
  }

  // 查询历史事件（AI / 消息中心用）
  async function query(filter) {
    filter = filter || {};
    const Storage = global.Phone && global.Phone.Storage;
    if (!Storage) return [];
    let list = await Storage.getAll("events");
    if (filter.type) list = list.filter((e) => e.type === filter.type);
    if (filter.sourceApp) list = list.filter((e) => e.sourceApp === filter.sourceApp);
    if (filter.since) list = list.filter((e) => e.createdAt >= filter.since);
    if (filter.until) list = list.filter((e) => e.createdAt <= filter.until);
    if (typeof filter.read === "boolean") list = list.filter((e) => e.read === filter.read);
    if (filter.limit) list = list.slice(-filter.limit);
    list.sort((a, b) => a.createdAt - b.createdAt);
    return list;
  }

  // 标记已读
  async function markRead(eventId) {
    const Storage = global.Phone && global.Phone.Storage;
    if (!Storage) return;
    const e = await Storage.get("events", eventId);
    if (e && !e.read) { e.read = true; await Storage.put("events", e); }
  }

  async function markAllRead(type) {
    const list = await query({ type: type, read: false });
    const Storage = global.Phone.Storage;
    for (const e of list) { e.read = true; await Storage.put("events", e); }
  }

  // 删除事件
  async function remove(eventId) {
    const Storage = global.Phone && global.Phone.Storage;
    if (!Storage) return;
    await Storage.del("events", eventId);
  }

  // ---------- 常用事件类型常量 ----------
  const TYPES = {
    MESSAGE_RECEIVED: "message_received",
    MESSAGE_SENT: "message_sent",
    CHAT_MODE_CHANGED: "chat_mode_changed",
    MOMENT_POSTED: "moment_posted",
    MOMENT_LIKED: "moment_liked",
    MOMENT_COMMENTED: "moment_commented",
    GRUDGE_CREATED: "grudge_created",
    GRUDGE_FORGIVEN: "grudge_forgiven",
    WALLET_CHANGED: "wallet_changed",
    SHOP_PURCHASED: "shop_purchased",
    SHOP_GIFTED: "shop_gifted",
    GAME_PLAYED: "game_played",
    MUSIC_PLAYING: "music_playing",
    MUSIC_SHARED: "music_shared",
    MEMO_CREATED: "memo_created",
    MEMO_REMINDED: "memo_reminded",
    ANNIVERSARY_DUE: "anniversary_due",
    CHARACTER_SWITCHED: "character_switched",
    CHARACTER_CREATED: "character_created",
    WORLDBOOK_UPDATED: "worldbook_updated",
    MEMORY_ADDED: "memory_added",
    SETTINGS_CHANGED: "settings_changed",
    NOTIFY: "notify",
  };

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.EventCenter = {
    on, once, off, emit,
    query, markRead, markAllRead, remove,
    TYPES,
  };
})(window);
