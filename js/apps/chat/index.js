/* ============================================================
   index.js — 消息APP入口装配
   只负责 APP 注册和路由挂载
   挂在 window.Phone.Chat
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  // ---------- 注册 APP ----------
  global.Phone.AppRegistry.register({
    id: "chat",
    name: "消息",
    icon: "app-chat",
    entry: function () { open(); },
    events: ["message_received", "message_sent"],
    order: 1,
  });

  // ---------- 打开会话列表 ----------
  function open() {
    var container = document.getElementById("app-root");
    if (!container) return;
    global.Phone.Router.push("chat-list", global.Phone.Chat.mount, {});
  }

  // ---------- 暴露 ----------
  global.Phone.Chat = global.Phone.Chat || {};
  global.Phone.Chat.open = open;
})(window);
