/* ============================================================
 * index.js — 消息APP 入口装配
 * 职责：
 *   1. 注册 chat APP 到 AppRegistry（id / name / icon / entry / events）
 *   2. 暴露 Phone.Chat.open() 作为打开入口
 *   3. entry 调用 Router.push 打开会话列表页（Phone.ChatList.mountList）
 * 依赖（加载顺序由 index.html 保证）：
 *   Phone.AppRegistry / Phone.Router / Phone.ChatList
 * ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  // 打开会话列表页（栈式路由压入 chat-list）
  function open() {
    var Router = global.Phone.Router;
    var ChatList = global.Phone.ChatList;
    if (!Router || !ChatList || typeof ChatList.mountList !== "function") {
      console.error("[Chat] 依赖未就绪：Router 或 ChatList 缺失");
      return;
    }
    Router.push("chat-list", ChatList.mountList, {});
  }

  // 注册到 AppRegistry（桌面 / Dock 通过 AppRegistry.open("chat") 调用 entry）
  if (global.Phone.AppRegistry && typeof global.Phone.AppRegistry.register === "function") {
    global.Phone.AppRegistry.register({
      id: "chat",
      name: "消息",
      icon: "app-chat",
      entry: function () { open(); },
      events: ["message_received", "message_sent", "chat_mode_changed"],
      settings: [],
      order: 10,
    });
  } else {
    console.warn("[Chat] AppRegistry 未就绪，跳过注册");
  }

  // 暴露 Phone.Chat 兼容旧引用（technical-architecture: Phone.Chat.open()）
  global.Phone.Chat = { open: open };
})(window);
