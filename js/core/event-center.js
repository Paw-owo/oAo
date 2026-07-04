/* ============================================================
   小手机系统 · 事件中心
   所有 APP 事件统一流向这里，消息中心和桌面角标订阅它，
   AI 聊天时通过 getRecent 拉取最近事件让 AI 能"看见"。
   ============================================================ */
(function (global) {
  'use strict';

  const STORE = 'events';
  const listeners = {}; // type -> Set<callback>
  const anyListeners = new Set(); // 监听所有事件

  function notify(type, event) {
    if (listeners[type]) listeners[type].forEach(cb => { try { cb(event); } catch (e) { console.warn(e); } });
    anyListeners.forEach(cb => { try { cb(event); } catch (e) { console.warn(e); } });
  }

  const EventCenter = {
    /**
     * 触发一个事件
     * @param {object} payload { type, appId, title, body, data, level }
     * @returns {Promise<object>} 写入后的事件（带 id, createdAt, read=false）
     */
    async emit(payload) {
      const event = {
        type: payload.type || 'misc',
        appId: payload.appId || 'system',
        title: payload.title || '',
        body: payload.body || '',
        data: payload.data || {},
        level: payload.level || 'info', // info / success / warning / error
        read: false,
        createdAt: Date.now()
      };
      await global.Phone.Storage.put(STORE, event);
      // Storage.put 会带上自增主键 id
      notify(event.type, event);
      return event;
    },

    /**
     * 订阅事件类型
     * @param {string} type 事件类型，'*' 表示订阅全部
     */
    on(type, callback) {
      if (type === '*') {
        anyListeners.add(callback);
        return () => anyListeners.delete(callback);
      }
      if (!listeners[type]) listeners[type] = new Set();
      listeners[type].add(callback);
      return () => listeners[type] && listeners[type].delete(callback);
    },

    /** 取消订阅 */
    off(type, callback) {
      if (type === '*') { anyListeners.delete(callback); return; }
      if (listeners[type]) listeners[type].delete(callback);
    },

    /**
     * 拉取最近事件（消息中心 / AI 读取用）
     * @param {object} opts { limit, appId, unreadOnly, type }
     */
    async getRecent(opts = {}) {
      const { limit = 100, appId, unreadOnly, type } = opts;
      let results;
      if (appId) {
        results = await global.Phone.Storage.list(STORE, { index: 'appId', limit, reverse: true });
      } else if (type) {
        results = await global.Phone.Storage.list(STORE, { index: 'type', limit, reverse: true });
      } else {
        results = await global.Phone.Storage.list(STORE, { index: 'createdAt', limit, reverse: true });
      }
      if (unreadOnly) results = results.filter(e => !e.read);
      return results;
    },

    /** 标记单条已读 */
    async markRead(id) {
      const ev = await global.Phone.Storage.get(STORE, id);
      if (ev && !ev.read) {
        ev.read = true;
        await global.Phone.Storage.put(STORE, ev);
      }
    },

    /** 标记某 APP 全部已读 */
    async markAllRead(appId) {
      const list = await global.Phone.Storage.list(STORE, { index: 'appId' });
      for (const ev of list) {
        if (!ev.read) {
          ev.read = true;
          await global.Phone.Storage.put(STORE, ev);
        }
      }
    },

    /** 未读计数（某 APP 或全局） */
    async unreadCount(appId) {
      const all = await global.Phone.Storage.list(STORE, { index: 'appId', appId });
      const filtered = appId ? all.filter(e => e.appId === appId && !e.read) : all.filter(e => !e.read);
      return filtered.length;
    },

    /** 删除单条事件 */
    async delete(id) {
      await global.Phone.Storage.delete(STORE, id);
    },

    /** 清空全部事件 */
    async clear() {
      await global.Phone.Storage.clear(STORE);
    }
  };

  global.Phone = global.Phone || {};
  global.Phone.EventCenter = EventCenter;
})(window);
