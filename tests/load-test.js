/* load-test.js — 加载所有脚本，验证语法/重复声明/全局对象挂载
 * 用 node 直接跑：node tests/load-test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

// 极简 DOM / IndexedDB / Audio 模拟（只够 IIFE 顶层执行）
const sandbox = {
  console,
  Date,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Promise,
  Array,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  Map,
  Set,
  TextDecoder,
  TextEncoder,
  URL,
  // 浏览器全局
  window: {},
  document: {
    documentElement: { setAttribute() {}, getAttribute() {}, style: { setProperty() {}, removeProperty() {} } },
    body: { appendChild() {}, contains() { return true; }, addEventListener() {}, removeChild() {}, firstChild: null },
    head: { appendChild() {} },
    querySelector() { return { setAttribute() {}, getAttribute() { return null; } }; },
    querySelectorAll() { return []; },
    createElement() { return _makeEl(); },
    createTextNode(t) { return { textContent: t }; },
    addEventListener() {},
    readyState: "complete",
  },
  navigator: { serviceWorker: { register() { return Promise.resolve(); } }, vibrate() {} },
  location: { href: "http://localhost/", protocol: "http:" },
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  indexedDB: null,
  FileReader: function () { return { readAsDataURL() {}, readAsText() {}, readAsArrayBuffer() {} }; },
  Audio: function () { return { play() { return Promise.resolve(); }, pause() {}, load() {}, addEventListener() {}, removeEventListener() {} }; },
  fetch: () => Promise.resolve({ ok: true, body: { getReader: () => ({ read: () => Promise.resolve({ done: true, value: null }) }) }, json: () => Promise.resolve({}) }),
  MutationObserver: function () { return { observe() {}, disconnect() {} }; },
  setInterval: () => 1,
  setTimeout: () => 1,
  clearInterval: () => {},
  clearTimeout: () => {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

function _makeEl() {
  const el = {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    dataset: {},
    appendChild() {},
    removeChild() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return _makeEl(); },
    querySelectorAll() { return []; },
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    insertAdjacentHTML() {},
    insertBefore() {},
    contains() { return true; },
    remove() {},
    click() {},
    focus() {},
    blur() {},
    parentNode: null,
    firstChild: null,
    textContent: "",
    innerHTML: "",
    innerText: "",
    value: "",
    files: [],
  };
  return el;
}

vm.createContext(sandbox);

// 按 index.html 的顺序加载
const SCRIPTS = [
  "js/core/utils.js",
  "js/core/icon-library.js",
  "js/core/storage.js",
  "js/core/event-center.js",
  "js/core/app-registry.js",
  "js/core/ai-client.js",
  "js/core/mcp-client.js",
  "js/core/state.js",
  "js/core/notify.js",
  "js/core/router.js",
  "js/core/modal.js",
  "js/core/theme-engine.js",
  "js/core/ai-proactive.js",
  "js/desktop/boot.js",
  "js/desktop/lockscreen.js",
  "js/desktop/status-bar.js",
  "js/desktop/widgets.js",
  "js/desktop/app-grid.js",
  "js/desktop/dock.js",
  "js/desktop/desktop.js",
  "js/apps/chat/chat-ai.js",
  "js/apps/chat/message-renderer.js",
  "js/apps/chat/input-bar.js",
  "js/apps/chat/conversation.js",
  "js/apps/chat/chat-settings.js",
  "js/apps/chat/chat.js",
  "js/apps/settings/personalization.js",
  "js/apps/settings/ai-config.js",
  "js/apps/settings/app-settings.js",
  "js/apps/settings/notifications.js",
  "js/apps/settings/lock-security.js",
  "js/apps/settings/data.js",
  "js/apps/settings/settings.js",
  "js/apps/characters/characters.js",
  "js/apps/worldbook/worldbook.js",
  "js/apps/memory/memory.js",
  "js/apps/gallery/gallery.js",
  "js/apps/wallet/wallet.js",
  "js/apps/shop/shop.js",
  "js/apps/memo/memo.js",
  "js/apps/moments/moments.js",
  "js/apps/anniversary/anniversary.js",
  "js/apps/music/music-player.js",
  "js/apps/music/music.js",
  "js/apps/games/games.js",
  "js/apps/games/truth-or-dare.js",
  "js/apps/games/undercover.js",
  "js/apps/games/liar-dice.js",
  "js/apps/games/tarot.js",
  "js/main.js",
];

let failures = 0;
console.log("=== 加载测试开始 ===");
for (const rel of SCRIPTS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error("[MISS] " + rel);
    failures++;
    continue;
  }
  const code = fs.readFileSync(abs, "utf8");
  try {
    vm.runInContext(code, sandbox, { filename: rel });
    console.log("[ OK ] " + rel);
  } catch (e) {
    console.error("[FAIL] " + rel + " — " + e.message);
    failures++;
  }
}

console.log("\n=== 关键全局对象检查 ===");
const expected = [
  "Phone.Utils", "Phone.IconLibrary", "Phone.Storage", "Phone.EventCenter",
  "Phone.AppRegistry", "Phone.AIClient", "Phone.State", "Phone.Notify",
  "Phone.Router", "Phone.Modal", "Phone.ThemeEngine", "Phone.AIProactive",
  "Phone.Desktop", "Phone.LockScreen", "Phone.StatusBar", "Phone.Widgets",
  "Phone.AppGrid", "Phone.Dock", "Phone.Boot",
  "Phone.ChatAI", "Phone.MessageRenderer", "Phone.InputBar", "Phone.Conversation",
  "Phone.ChatSettings", "Phone.Chat",
  "Phone.Personalization", "Phone.AIConfig", "Phone.AppSettings",
  "Phone.Notifications", "Phone.LockSecurity", "Phone.DataMgr", "Phone.Settings",
  "Phone.Characters", "Phone.Worldbook", "Phone.Memory", "Phone.Gallery",
  "Phone.Wallet", "Phone.Shop", "Phone.Memo", "Phone.Moments",
  "Phone.Anniversary", "Phone.MusicPlayer", "Phone.Music",
  "Phone.Games", // 子游戏挂在 Phone.Games["truth-or-dare"] 等键下，不是顶层全局对象
];
function has(obj, path) {
  return path.split(".").reduce((o, k) => o && o[k], obj);
}
let missingGlobal = 0;
for (const name of expected) {
  if (!has(sandbox, name)) {
    console.error("[MISS GLOBAL] " + name);
    missingGlobal++;
  } else {
    console.log("[ OK GLOBAL] " + name);
  }
}

console.log("\n=== 结果 ===");
console.log("脚本加载失败：" + failures);
console.log("全局对象缺失：" + missingGlobal);
if (failures === 0 && missingGlobal === 0) {
  console.log("全部通过");
  process.exit(0);
} else {
  process.exit(1);
}
