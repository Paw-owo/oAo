/**
 * 用 jsdom 模拟小手机启动，以用户视角走查消息APP
 * 捕获所有 console 错误、渲染的 DOM 结构、CSS 类匹配情况
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = "/workspace";
const errors = [];
const warnings = [];

// 读取所有 JS 文件
function readJS(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

// 读取 index.html
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// 创建 JSDOM 环境
const dom = new JSDOM(html, {
  url: "http://127.0.0.1:8765/index.html",
  pretendToBeVisual: true,
  resources: "usable",
  runScripts: "outside-only",
});

const { window } = dom;

// 捕获错误
window.onerror = (msg, src, line, col, err) => {
  errors.push(`[JS ERROR] ${msg} at ${src}:${line}:${col}`);
};
window.addEventListener("unhandledrejection", (e) => {
  errors.push(`[PROMISE REJECT] ${e.reason}`);
});

const origConsole = window.console;
window.console = {
  log: (...args) => {},
  warn: (...args) => warnings.push(args.join(" ")),
  error: (...args) => errors.push("[console.error] " + args.join(" ")),
  info: (...args) => {},
  debug: (...args) => {},
};

// mock localStorage
const store = {};
window.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
};

// mock matchMedia
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {},
}));

// mock IntersectionObserver
window.IntersectionObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

// mock ResizeObserver
window.ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

// 按顺序加载 JS
const jsFiles = [
  "js/core/utils.js",
  "js/core/icon-library.js",
  "js/core/storage.js",
  "js/core/event-center.js",
  "js/core/state.js",
  "js/core/router.js",
  "js/core/modal.js",
  "js/core/notify.js",
  "js/core/theme-engine.js",
  "js/core/tts.js",
  "js/core/ai-client.js",
  "js/core/mcp-client.js",
  "js/core/ai-proactive.js",
  "js/core/app-registry.js",
  "js/desktop/boot.js",
  "js/desktop/status-bar.js",
  "js/desktop/lockscreen.js",
  "js/desktop/desktop.js",
  "js/desktop/dock.js",
  "js/desktop/app-grid.js",
  "js/desktop/widgets.js",
  "js/apps/characters/characters.js",
  "js/apps/chat/chat.js",
  "js/apps/chat/conversation.js",
  "js/apps/chat/input-bar.js",
  "js/apps/chat/message-renderer.js",
  "js/apps/chat/toolbox.js",
  "js/apps/chat/chat-ai.js",
  "js/apps/chat/chat-settings.js",
  "js/apps/settings/settings.js",
  "js/apps/settings/ai-config.js",
  "js/apps/settings/app-settings.js",
  "js/apps/settings/data.js",
  "js/apps/settings/lock-security.js",
  "js/apps/settings/notifications.js",
  "js/apps/settings/personalization.js",
  "js/apps/memory/memory.js",
  "js/apps/memo/memo.js",
  "js/apps/moments/moments.js",
  "js/apps/music/music.js",
  "js/apps/music/music-player.js",
  "js/apps/gallery/gallery.js",
  "js/apps/games/games.js",
  "js/apps/games/truth-or-dare.js",
  "js/apps/games/tarot.js",
  "js/apps/games/undercover.js",
  "js/apps/games/liar-dice.js",
  "js/apps/wallet/wallet.js",
  "js/apps/shop/shop.js",
  "js/apps/worldbook/worldbook.js",
  "js/apps/anniversary/anniversary.js",
  "js/main.js",
];

console.log("=== 加载 JS 文件 ===");
for (const f of jsFiles) {
  try {
    const code = readJS(f);
    const scriptEl = window.document.createElement("script");
    scriptEl.textContent = code;
    window.document.body.appendChild(scriptEl);
  } catch (e) {
    errors.push(`[LOAD FAIL] ${f}: ${e.message}`);
  }
}

// 等待 main.js 的 boot 执行
setTimeout(() => {
  console.log("\n=== 启动后检查 ===");
  
  // 1. 检查 app-root 是否有内容
  const appRoot = window.document.getElementById("app-root");
  console.log("app-root children:", appRoot ? appRoot.children.length : "NO app-root");
  if (appRoot) {
    console.log("app-root innerHTML length:", appRoot.innerHTML.length);
    console.log("app-root first 500:", appRoot.innerHTML.substring(0, 500));
  }

  // 2. 检查 Phone 全局对象
  const Phone = window.Phone;
  console.log("\nPhone 对象:", Phone ? "存在" : "不存在");
  if (Phone) {
    console.log("Phone.apps:", Phone.Apps ? Object.keys(Phone.Apps).join(", ") : "无");
    console.log("Phone.Chat:", Phone.Chat ? "存在" : "无");
  }

  // 3. 尝试打开消息APP
  console.log("\n=== 尝试打开消息APP ===");
  try {
    if (Phone && Phone.Router) {
      Phone.Router.open("chat");
      setTimeout(() => {
        const root = window.document.getElementById("app-root") || appRoot;
        console.log("打开chat后 root children:", root.children.length);
        console.log("root innerHTML 前1000:", root.innerHTML.substring(0, 1000));
        
        // 查找消息列表相关元素
        const chatPage = root.querySelector(".chat-page, .chat-list, [class*='chat']");
        console.log("chat相关元素:", chatPage ? chatPage.className : "未找到");
        
        // 查找所有 class 列表
        const allElements = root.querySelectorAll("*");
        const allClasses = new Set();
        allElements.forEach(el => {
          if (el.className && typeof el.className === "string") {
            el.className.split(/\s+/).forEach(c => { if (c) allClasses.add(c); });
          }
        });
        console.log("\n渲染的CSS类数量:", allClasses.size);
        console.log("渲染的CSS类:", [...allClasses].sort().join(", "));
        
        // 检查这些类是否在 chat.css 中定义
        const chatCSS = fs.readFileSync(path.join(ROOT, "css/chat.css"), "utf8");
        const themeCSS = fs.readFileSync(path.join(ROOT, "css/theme.css"), "utf8");
        const commonCSS = fs.readFileSync(path.join(ROOT, "css/common.css"), "utf8");
        const allCSS = chatCSS + themeCSS + commonCSS;
        
        const missingClasses = [];
        allClasses.forEach(cls => {
          if (!allCSS.includes("." + cls)) {
            missingClasses.push(cls);
          }
        });
        console.log("\n=== CSS类匹配检查 ===");
        console.log("未在CSS中找到的类:", missingClasses.length > 0 ? missingClasses.join(", ") : "(全部匹配)");
        
        // 4. 尝试进入一个会话
        console.log("\n=== 尝试点击第一个会话 ===");
        const firstItem = root.querySelector(".chat-list-item, [class*='cli-'], [class*='list-item']");
        if (firstItem) {
          console.log("找到列表项:", firstItem.className);
          // 模拟点击
          try {
            firstItem.click();
            setTimeout(() => {
              const convPage = root.querySelector(".conv-page, [class*='conv-']");
              console.log("会话页:", convPage ? convPage.className : "未找到");
              console.log("root innerHTML 前2000:", root.innerHTML.substring(0, 2000));
              
              // 检查会话页所有class
              const convElements = root.querySelectorAll("[class*='msg-'], [class*='conv-'], [class*='ib-'], [class*='ctb-']");
              console.log("\n会话相关元素数量:", convElements.length);
              
              finalReport();
            }, 500);
          } catch(e) {
            errors.push("[点击会话失败] " + e.message);
            finalReport();
          }
        } else {
          console.log("未找到可点击的会话列表项");
          // 看看空状态
          const empty = root.querySelector("[class*='empty'], [class*='placeholder']");
          console.log("空状态元素:", empty ? empty.className : "无");
          finalReport();
        }
      }, 500);
    } else {
      console.log("Phone.Router 不存在，无法打开APP");
      finalReport();
    }
  } catch(e) {
    errors.push("[打开chat失败] " + e.message);
    finalReport();
  }
}, 1000);

function finalReport() {
  console.log("\n=== 错误汇总 ===");
  if (errors.length === 0) console.log("(无JS错误)");
  else errors.forEach(e => console.log(e));
  
  console.log("\n=== 警告汇总 ===");
  if (warnings.length === 0) console.log("(无警告)");
  else warnings.forEach(w => console.log(w));
  
  process.exit(0);
}
