/**
 * test_chat_v2.js — 消息APP 完全重写 v2 自检
 * 验证完整链路：APP 注册 → 会话列表 → 点击进入聊天页 → 输入栏 → 返回
 * 用最小 mock 替代 IndexedDB / Router / State，聚焦验证新代码本身
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = "/workspace";
const errors = [];
const logs = [];

function readJS(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

const dom = new JSDOM("<!DOCTYPE html><html><body><div id='app-root'></div></body></html>", {
  url: "http://127.0.0.1:8765/index.html",
  pretendToBeVisual: true,
  runScripts: "dangerously",
});
const { window } = dom;

window.onerror = (msg, src, line, col, err) => {
  errors.push(`[JS ERROR] ${msg} at ${src}:${line}:${col}`);
};
window.addEventListener("unhandledrejection", (e) => {
  errors.push(`[PROMISE REJECT] ${e.reason && e.reason.stack ? e.reason.stack : e.reason}`);
});
window.console = {
  log: (...a) => logs.push(a.join(" ")),
  warn: (...a) => errors.push("[warn] " + a.join(" ")),
  error: (...a) => errors.push("[console.error] " + a.join(" ")),
  info: () => {}, debug: () => {},
};
window.matchMedia = window.matchMedia || (() => ({
  matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
}));
window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// ---------- 最小 mock：Phone.Utils ----------
window.Phone = window.Phone || {};
const stores = { conversations: {}, characters: {}, settings: {} };
window.Phone.Utils = {
  el(tag, attrs, children) {
    attrs = attrs || {};
    const el = window.document.createElement(tag);
    Object.keys(attrs).forEach((k) => {
      const v = attrs[k];
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "onClick") el.addEventListener("click", v);
      else if (k === "dataset" && typeof v === "object") Object.assign(el.dataset, v);
      else if (typeof v === "string" || typeof v === "number") el.setAttribute(k, v);
    });
    (children || []).forEach((c) => { if (c) el.appendChild(c); });
    return el;
  },
  empty(node) { while (node && node.firstChild) node.removeChild(node.firstChild); },
  uid(p) { return p + "_" + Math.random().toString(36).slice(2, 9); },
  escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
  pad2(n) { return String(n).padStart(2, "0"); },
  fmtHM(ts) { const d = new Date(ts); return window.Phone.Utils.pad2(d.getHours()) + ":" + window.Phone.Utils.pad2(d.getMinutes()); },
  WEEK_CN: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  truncate(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; },
  vibrate() {},
};

// ---------- 最小 mock：Storage（内存版，async 接口对齐真实） ----------
window.Phone.Storage = {
  ready: Promise.resolve(),
  async getAll(store) { return Object.values(stores[store] || {}); },
  async get(store, id) { return (stores[store] || {})[id] || null; },
  async put(store, obj) {
    const kp = store === "settings" ? "key" : "id";
    stores[store] = stores[store] || {};
    stores[store][obj[kp]] = obj;
    return obj;
  },
  async delete(store, id) { delete (stores[store] || {})[id]; },
  async getSetting(key) { return (stores.settings || {})[key] ? (stores.settings[key].value) : null; },
  async setSetting(key, value) { stores.settings = stores.settings || {}; stores.settings[key] = { key, value }; },
  async seedIfEmpty() {},
};

// ---------- 最小 mock：State / Notify / AppRegistry ----------
const stateStore = {};
window.Phone.State = {
  get: (k) => stateStore[k],
  set: async (k, v) => { stateStore[k] = v; },
  subscribe: () => () => {},
};
window.Phone.Notify = { push: () => {} };
const registry = {};
window.Phone.AppRegistry = {
  register: (spec) => { registry[spec.id] = spec; logs.push("registered: " + spec.id); },
  open: (id) => { if (registry[id] && registry[id].entry) registry[id].entry(); },
  get: (id) => registry[id],
  all: () => Object.values(registry),
};

// ---------- 最小 mock：Router（栈式，记录历史） ----------
const routerStack = [];
let routerContainer = window.document.getElementById("app-root");
window.Phone.Router = {
  push(name, mountFn, params) {
    routerStack.push({ name, mountFn, params });
    while (routerContainer.firstChild) routerContainer.removeChild(routerContainer.firstChild);
    return Promise.resolve().then(() => mountFn(routerContainer, params || {}));
  },
  back() {
    routerStack.pop();
    while (routerContainer.firstChild) routerContainer.removeChild(routerContainer.firstChild);
    const prev = routerStack[routerStack.length - 1];
    if (prev) return Promise.resolve().then(() => prev.mountFn(routerContainer, prev.params));
    return Promise.resolve();
  },
  current: () => routerStack[routerStack.length - 1],
  stackSize: () => routerStack.length,
};

// ---------- mock Modal（chat-settings 可能引用） ----------
window.Phone.Modal = { confirm: async () => true };

// ---------- 加载新 chat 文件 ----------
const chatFiles = [
  "js/apps/chat/chat-icons.js",
  "js/apps/chat/chat-list.js",
  "js/apps/chat/chat-view.js",
  "js/apps/chat/chat-toolbox.js",
  "js/apps/chat/chat-settings.js",
  "js/apps/chat/index.js",
];
for (const f of chatFiles) {
  try {
    const code = readJS(f);
    const s = window.document.createElement("script");
    s.textContent = code;
    window.document.body.appendChild(s);
  } catch (e) {
    errors.push(`[LOAD FAIL] ${f}: ${e.message}`);
  }
}

// ---------- 异步走查 ----------
setTimeout(async () => {
  const out = [];
  const P = window.Phone;
  out.push("=== 1. 模块挂载检查 ===");
  out.push("Phone.ChatIcons: " + (P.ChatIcons ? "OK" : "MISSING"));
  out.push("Phone.ChatList: " + (P.ChatList ? "OK" : "MISSING"));
  out.push("Phone.ChatList.mountList: " + (P.ChatList && typeof P.ChatList.mountList === "function" ? "OK" : "MISSING"));
  out.push("Phone.ChatList.mountSearch: " + (P.ChatList && typeof P.ChatList.mountSearch === "function" ? "OK" : "MISSING"));
  out.push("Phone.Conversation: " + (P.Conversation ? "OK" : "MISSING"));
  out.push("Phone.Conversation.mount: " + (P.Conversation && typeof P.Conversation.mount === "function" ? "OK" : "MISSING"));
  out.push("Phone.ChatToolbox: " + (P.ChatToolbox ? "OK" : "MISSING"));
  out.push("Phone.ChatToolbox.renderToolbox: " + (P.ChatToolbox && typeof P.ChatToolbox.renderToolbox === "function" ? "OK" : "MISSING"));
  out.push("Phone.ChatToolbox.renderMenuSheet: " + (P.ChatToolbox && typeof P.ChatToolbox.renderMenuSheet === "function" ? "OK" : "MISSING"));
  out.push("Phone.ChatSettings: " + (P.ChatSettings ? "OK" : "MISSING"));
  out.push("Phone.ChatSettings.mount: " + (P.ChatSettings && typeof P.ChatSettings.mount === "function" ? "OK" : "MISSING"));
  out.push("Phone.Chat: " + (P.Chat ? "OK" : "MISSING"));
  out.push("Phone.Chat.open: " + (P.Chat && typeof P.Chat.open === "function" ? "OK" : "MISSING"));
  out.push("AppRegistry.chat: " + (registry.chat ? "OK (order=" + registry.chat.order + ", icon=" + registry.chat.icon + ")" : "MISSING"));

  // 图标抽样
  out.push("\n=== 2. 图标库抽样 ===");
  ["search", "plus", "send", "chevron-left", "github", "msg-empty"].forEach((n) => {
    const svg = P.ChatIcons.get(n, 16);
    out.push(n + ": " + (svg && svg.indexOf("<svg") === 0 ? "OK (" + svg.length + " chars)" : "BAD"));
  });

  // 工具箱渲染
  out.push("\n=== 3. 工具箱渲染 ===");
  const tb = P.ChatToolbox.renderToolbox();
  const toolItems = tb.querySelectorAll(".tool-item");
  out.push("toolbox .tool-item 数量: " + toolItems.length + (toolItems.length === 12 ? " OK" : " EXPECTED 12"));
  const activeTool = tb.querySelector(".tool-item.active");
  out.push("默认 active 工具: " + (activeTool ? activeTool.querySelector("span").textContent : "无"));

  // 长按菜单渲染
  out.push("\n=== 4. 长按菜单渲染 ===");
  const menu = P.ChatToolbox.renderMenuSheet({ role: "assistant", isAI: true }, {});
  const menuItems = menu.querySelectorAll(".menu-item");
  out.push("AI消息菜单项数量: " + menuItems.length + (menuItems.length === 6 ? " OK" : " EXPECTED 6"));
  const menuUser = P.ChatToolbox.renderMenuSheet({ role: "user", isAI: false }, {});
  const menuItemsUser = menuUser.querySelectorAll(".menu-item");
  out.push("用户消息菜单项数量: " + menuItemsUser.length + (menuItemsUser.length === 5 ? " OK (无重新生成)" : " EXPECTED 5"));

  // 种子数据：1 个角色 + 1 个会话 + 2 条消息
  out.push("\n=== 5. 种子数据 ===");
  const now = Date.now();
  await P.Storage.put("characters", { id: "char_1", name: "小测试", description: "测试角色", avatar: "", createdAt: now });
  await P.Storage.put("conversations", {
    id: "conv_1", characterId: "char_1", title: "测试对话",
    messages: [
      { id: "m1", role: "user", content: "你好", createdAt: now - 60000 },
      { id: "m2", role: "assistant", content: "你好呀！我是小测试。", createdAt: now - 50000 },
    ],
    createdAt: now - 60000, updatedAt: now - 50000, mode: "bubble", unread: 2,
  });
  out.push("角色已种: " + (Object.keys(stores.characters).length === 1 ? "OK" : "FAIL"));
  out.push("会话已种: " + (Object.keys(stores.conversations).length === 1 ? "OK" : "FAIL"));

  // 打开会话列表页
  out.push("\n=== 6. 打开会话列表页 ===");
  await P.Chat.open();
  await new Promise((r) => setTimeout(r, 50));
  const root = window.document.getElementById("app-root");
  out.push("Router栈大小: " + window.Phone.Router.stackSize() + (window.Phone.Router.stackSize() === 1 ? " OK" : " EXPECTED 1"));
  out.push("页面名: " + (window.Phone.Router.current() ? window.Phone.Router.current().name : "空") + " (期望 chat-list)");
  out.push("chat-screen 存在: " + (!!root.querySelector(".chat-screen") ? "OK" : "MISSING"));
  out.push("app-title 文案: " + (root.querySelector(".app-title") ? root.querySelector(".app-title").textContent : "MISSING"));
  out.push("searchbar 存在: " + (!!root.querySelector(".searchbar") ? "OK" : "MISSING"));
  out.push("tabs 存在: " + (!!root.querySelector(".tabs") ? "OK" : "MISSING"));
  const tabsSpans = root.querySelectorAll(".tabs span");
  out.push("tabs 数量: " + tabsSpans.length + " 文案: " + Array.from(tabsSpans).map((s) => s.textContent).join("/"));
  out.push("list 存在: " + (!!root.querySelector(".list") ? "OK" : "MISSING"));
  const listItems = root.querySelectorAll(".list .list-item");
  out.push("list-item 数量: " + listItems.length + (listItems.length === 1 ? " OK" : " EXPECTED 1"));
  if (listItems.length === 1) {
    out.push("  名称: " + (listItems[0].querySelector(".list-name") ? listItems[0].querySelector(".list-name").textContent : "?"));
    out.push("  预览: " + (listItems[0].querySelector(".list-preview") ? listItems[0].querySelector(".list-preview").textContent : "?"));
    out.push("  未读角标: " + (listItems[0].querySelector(".badge") ? listItems[0].querySelector(".badge").textContent : "无"));
  }

  // 点击第一个会话项进入聊天页
  out.push("\n=== 7. 点击会话进入聊天页 ===");
  if (listItems.length === 1) {
    listItems[0].click();
    await new Promise((r) => setTimeout(r, 80));
  }
  out.push("Router栈大小: " + window.Phone.Router.stackSize() + (window.Phone.Router.stackSize() === 2 ? " OK" : " EXPECTED 2"));
  out.push("页面名: " + (window.Phone.Router.current() ? window.Phone.Router.current().name : "空") + " (期望 conversation)");
  out.push("topbar 存在: " + (!!root.querySelector(".topbar") ? "OK" : "MISSING"));
  out.push("topbar-name: " + (root.querySelector(".topbar-name") ? root.querySelector(".topbar-name").textContent : "?"));
  out.push("content 存在: " + (!!root.querySelector(".content") ? "OK" : "MISSING"));
  out.push("messages 存在: " + (!!root.querySelector(".messages") ? "OK" : "MISSING"));
  const rows = root.querySelectorAll(".messages .row");
  out.push("消息行数量: " + rows.length + (rows.length === 2 ? " OK" : " EXPECTED 2"));
  const aiRows = root.querySelectorAll(".messages .row.ai");
  const userRows = root.querySelectorAll(".messages .row.user");
  out.push("AI行: " + aiRows.length + " / 用户行: " + userRows.length);
  const bubbles = root.querySelectorAll(".messages .bubble");
  out.push("气泡数量: " + bubbles.length + (bubbles.length === 2 ? " OK" : " EXPECTED 2"));
  const actions = root.querySelectorAll(".messages .msg-actions");
  out.push("AI操作行数量: " + actions.length + (actions.length === 1 ? " OK (仅AI)" : " EXPECTED 1"));
  out.push("input-zone 存在: " + (!!root.querySelector(".input-zone") ? "OK" : "MISSING"));
  out.push("inputbar 存在: " + (!!root.querySelector(".inputbar") ? "OK" : "MISSING"));
  out.push("textarea 存在: " + (!!root.querySelector(".textarea") ? "OK" : "MISSING"));
  out.push("send-btn 存在: " + (!!root.querySelector(".send-btn") ? "OK" : "MISSING"));
  out.push("send-btn 初始 muted: " + (root.querySelector(".send-btn") && root.querySelector(".send-btn").classList.contains("muted") ? "OK" : "MISSING"));

  // 输入文字 → send-btn 应激活
  out.push("\n=== 8. 输入栏交互 ===");
  const ta = root.querySelector(".textarea");
  ta.value = "测试输入";
  ta.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  out.push("输入后 send-btn 激活(无muted): " + (!root.querySelector(".send-btn").classList.contains("muted") ? "OK" : "FAIL"));
  // Enter 发送（骨架阶段清空输入）
  ta.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  out.push("Enter后输入框清空: " + (ta.value === "" ? "OK" : "FAIL value=" + ta.value));
  out.push("Enter后 send-btn 恢复muted: " + (root.querySelector(".send-btn").classList.contains("muted") ? "OK" : "FAIL"));

  // 进入聊天设置页
  out.push("\n=== 9. 进入聊天设置页 ===");
  await window.Phone.Router.push("chat-settings", P.ChatSettings.mount, { conversationId: "conv_1" });
  await new Promise((r) => setTimeout(r, 50));
  out.push("Router栈大小: " + window.Phone.Router.stackSize() + (window.Phone.Router.stackSize() === 3 ? " OK" : " EXPECTED 3"));
  out.push("settings-page 存在: " + (!!root.querySelector(".settings-page") ? "OK" : "MISSING"));
  const groups = root.querySelectorAll(".settings-page .settings-group");
  out.push("settings-group 数量: " + groups.length + (groups.length === 4 ? " OK" : " EXPECTED 4"));
  const groupTitles = Array.from(root.querySelectorAll(".group-title")).map((g) => g.textContent);
  out.push("分组标题: " + groupTitles.join(" / "));
  const pills = root.querySelectorAll(".setting-pill");
  out.push("setting-pill 数量: " + pills.length);
  const toggles = root.querySelectorAll(".toggle");
  out.push("toggle 数量: " + toggles.length + (toggles.length === 4 ? " OK" : " EXPECTED 4"));

  // 返回
  out.push("\n=== 10. 返回链路 ===");
  await window.Phone.Router.back();
  await new Promise((r) => setTimeout(r, 50));
  out.push("back后栈大小: " + window.Phone.Router.stackSize() + (window.Phone.Router.stackSize() === 2 ? " OK" : " EXPECTED 2"));
  await window.Phone.Router.back();
  await new Promise((r) => setTimeout(r, 50));
  out.push("back后栈大小: " + window.Phone.Router.stackSize() + (window.Phone.Router.stackSize() === 1 ? " OK" : " EXPECTED 1"));
  out.push("回到会话列表: " + (window.Phone.Router.current() && window.Phone.Router.current().name === "chat-list" ? "OK" : "FAIL"));
  out.push("列表仍渲染: " + (root.querySelectorAll(".list .list-item").length === 1 ? "OK" : "FAIL"));

  // 搜索页
  out.push("\n=== 11. 搜索页 ===");
  await window.Phone.Router.push("chat-search", P.ChatList.mountSearch, {});
  await new Promise((r) => setTimeout(r, 30));
  out.push("搜索页 topbar-name: " + (root.querySelector(".topbar-name") ? root.querySelector(".topbar-name").textContent : "?"));
  out.push("搜索页 searchbar input: " + (root.querySelector(".searchbar input") ? "OK" : "MISSING"));
  out.push("搜索页空状态: " + (root.querySelector(".chat-empty") ? "OK" : "MISSING"));

  // 总结
  out.push("\n=== 12. 总结 ===");
  out.push("错误数: " + errors.length);
  errors.forEach((e) => out.push("  ✗ " + e));

  console.log("\n" + out.join("\n"));
  process.exit(errors.length > 0 ? 1 : 0);
}, 200);
