/* ============================================================
   notification-bar.js — 桌面顶部站内通知条
   监听 MESSAGE_RECEIVED：用户不在当前聊天界面且未开免打扰时，
   在桌面顶部短暂显示通知条（角色头像 + 名字 + 消息预览）
   3 秒后自动消失，点击进入对应聊天
   挂在 window.Phone.NotificationBar
   ============================================================ */
(function (global) {
  "use strict";

  let _unsub = null;
  let _host = null;
  let _hideTimer = null;

  // ---------- 初始化（启动时调用一次） ----------
  function init() {
    if (_unsub) return; // 防止重复初始化
    if (!global.Phone.EventCenter) return;

    _ensureHost();

    _unsub = global.Phone.EventCenter.on(
      global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED,
      (event) => _handleMessage(event)
    );
  }

  // ---------- 创建宿主容器（固定顶部） ----------
  function _ensureHost() {
    if (_host && _host.parentNode) return;
    _host = global.Phone.Utils.el("div", { class: "notif-bar-host" });
    document.body.appendChild(_host);
  }

  // ---------- 收到消息事件 ----------
  async function _handleMessage(event) {
    // 只处理来自聊天的消息
    if (!event || event.sourceApp !== "chat") return;
    const data = event.data || {};
    const conversationId = data.conversationId;
    const characterId = data.characterId;
    const content = data.content;
    if (!conversationId || !content) return;

    // 检查当前是否正在该聊天界面（是则不打扰）
    const cur = global.Phone.Router && global.Phone.Router.current();
    if (cur && cur.name === "conversation" && cur.params
        && cur.params.conversationId === conversationId) {
      return; // 用户就在这个聊天里，不需要弹通知条
    }

    // 读取会话，检查免打扰
    let conv = null;
    try {
      conv = await global.Phone.Storage.get("conversations", conversationId);
    } catch (e) { return; }
    if (!conv) return;
    if (conv.muted) return; // 本聊天开了免打扰，不弹

    // 读取角色资料（头像 + 名字）
    let char = null;
    try {
      const chars = await global.Phone.Storage.getAll("characters");
      char = chars.find((c) => c.id === (characterId || conv.characterId)) || null;
    } catch (e) {}
    const charName = (char && char.name) || "AI";
    const charAvatar = char && char.avatar ? char.avatar : "";

    _show({
      conversationId: conversationId,
      characterId: characterId || conv.characterId,
      name: charName,
      avatar: charAvatar,
      preview: _previewText(content),
    });
  }

  // ---------- 截取预览文本 ----------
  function _previewText(text) {
    if (!text) return "";
    const t = String(text).replace(/\s+/g, " ").trim();
    return t.length > 40 ? t.slice(0, 40) + "…" : t;
  }

  // ---------- 显示通知条 ----------
  function _show(info) {
    _ensureHost();
    // 清掉之前的定时器和旧条目
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    // 同一时间只显示一条：移除旧的
    const old = _host.querySelector(".notif-bar");
    if (old) old.remove();

    const U = global.Phone.Utils;
    const bar = U.el("div", { class: "notif-bar", role: "button", tabindex: "0" });

    // 头像
    const avatar = U.el("div", { class: "nb-avatar" });
    if (info.avatar) {
      avatar.innerHTML = '<img src="' + info.avatar + '" alt=""/>';
    } else {
      avatar.textContent = (info.name || "AI").slice(0, 1);
    }
    bar.appendChild(avatar);

    // 文本区
    const text = U.el("div", { class: "nb-text" }, [
      U.el("div", { class: "nb-name", text: info.name }),
      U.el("div", { class: "nb-preview", text: info.preview }),
    ]);
    bar.appendChild(text);

    // 点击 / 回车 → 进入对应聊天
    function _enter() {
      _hide(true);
      global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
        conversationId: info.conversationId,
        characterId: info.characterId,
      });
    }
    bar.addEventListener("click", _enter);
    bar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); _enter(); }
    });

    _host.appendChild(bar);
    // 触发滑入动画
    requestAnimationFrame(() => bar.classList.add("show"));

    // 3 秒后自动消失
    _hideTimer = setTimeout(() => _hide(false), 3000);
  }

  // ---------- 隐藏通知条 ----------
  function _hide(immediate) {
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }
    if (!_host) return;
    const bar = _host.querySelector(".notif-bar");
    if (!bar) return;
    bar.classList.remove("show");
    bar.classList.add("leaving");
    const delay = immediate ? 120 : 280;
    setTimeout(() => { if (bar.parentNode) bar.remove(); }, delay);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.NotificationBar = { init, hide: () => _hide(true) };
})(window);
