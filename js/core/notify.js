/* ============================================================
   notify.js — 站内通知系统
   负责桌面角标 / 红点 / 通知中心显示
   纯前端第一版：不做关闭后系统级推送

   通知结构（落 notifications 表）：
   { id, appId, title, body, icon, createdAt, read }

   挂在 window.Phone.Notify
   ============================================================ */
(function (global) {
  "use strict";

  const badgeCallbacks = new Set(); // 角标更新回调

  /**
   * 我（通知系统）创建一条通知
   * @param {object} n { appId, title, body, icon }
   */
  async function push(n) {
    n = n || {};
    const S = global.Phone.Storage;
    const settings = await S.getAllSettings();

    // 全局开关
    if (!settings.notifyEnabled) return null;
    // 分 APP 开关
    if (n.appId && settings.notifyPerApp && settings.notifyPerApp[n.appId] === false) return null;
    // 免打扰时段
    if (settings.dndEnabled && isInDnd(settings.dndStart, settings.dndEnd)) return null;

    const row = {
      id: global.Phone.Utils.uid("ntf"),
      appId: n.appId || "system",
      title: n.title || "通知",
      body: n.body || "",
      icon: n.icon || "",
      createdAt: Date.now(),
      read: false,
    };
    await S.put("notifications", row);

    // 同步写一条事件（便于 AI 提及）
    await global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.NOTIFY, {
      sourceApp: n.appId || "system",
      data: row,
      summary: n.title + (n.body ? "：" + n.body : ""),
    });

    _notifyBadges();
    _toast(row);
    return row;
  }

  function isInDnd(start, end) {
    if (!start || !end) return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const s = sh * 60 + sm, e = eh * 60 + em;
    if (s <= e) return cur >= s && cur <= e;
    // 跨天
    return cur >= s || cur <= e;
  }

  // ---------- 角标 ----------
  // 订阅角标更新（桌面图标 / Dock 用）
  function onBadgeUpdate(fn) {
    badgeCallbacks.add(fn);
    return () => badgeCallbacks.delete(fn);
  }

  async function _notifyBadges() {
    const settings = await global.Phone.Storage.getAllSettings();
    if (!settings.badgeEnabled) {
      badgeCallbacks.forEach((fn) => fn({}));
      return;
    }
    // 未读通知按 appId 聚合
    const all = await global.Phone.Storage.getAll("notifications");
    const unread = all.filter((n) => !n.read);
    const map = {};
    unread.forEach((n) => { map[n.appId] = (map[n.appId] || 0) + 1; });
    badgeCallbacks.forEach((fn) => fn(map));
  }

  async function getBadges() {
    const all = await global.Phone.Storage.getAll("notifications");
    const map = {};
    all.filter((n) => !n.read).forEach((n) => { map[n.appId] = (map[n.appId] || 0) + 1; });
    return map;
  }

  async function markRead(id) {
    const S = global.Phone.Storage;
    const n = await S.get("notifications", id);
    if (n && !n.read) { n.read = true; await S.put("notifications", n); _notifyBadges(); }
  }

  async function markAppRead(appId) {
    const S = global.Phone.Storage;
    const all = await S.getAll("notifications");
    for (const n of all) {
      if (n.appId === appId && !n.read) { n.read = true; await S.put("notifications", n); }
    }
    _notifyBadges();
  }

  async function markAllRead() {
    const S = global.Phone.Storage;
    const all = await S.getAll("notifications");
    for (const n of all) {
      if (!n.read) { n.read = true; await S.put("notifications", n); }
    }
    _notifyBadges();
  }

  async function list(filter) {
    filter = filter || {};
    let all = await global.Phone.Storage.getAll("notifications");
    if (filter.appId) all = all.filter((n) => n.appId === filter.appId);
    if (typeof filter.read === "boolean") all = all.filter((n) => n.read === filter.read);
    all.sort((a, b) => b.createdAt - a.createdAt);
    if (filter.limit) all = all.slice(0, filter.limit);
    return all;
  }

  // ---------- 轻量 Toast ----------
  let toastTimer = null;
  function _toast(n) {
    let host = document.querySelector(".notify-toast-host");
    if (!host) {
      host = global.Phone.Utils.el("div", { class: "notify-toast-host" });
      document.body.appendChild(host);
    }
    const item = global.Phone.Utils.el("div", { class: "notify-toast anim-slide-up" }, [
      global.Phone.Utils.el("div", { class: "nt-title", text: n.title }),
      n.body ? global.Phone.Utils.el("div", { class: "nt-body", text: n.body }) : null,
    ]);
    host.appendChild(item);
    setTimeout(() => {
      item.classList.add("nt-leave");
      setTimeout(() => item.remove(), 300);
    }, 3200);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Notify = {
    push, onBadgeUpdate, getBadges, markRead, markAppRead, markAllRead, list,
    refreshBadges: _notifyBadges,
  };
})(window);
