/* ============================================================
   theme-engine.js — 全局主题引擎
   我把 State 里所有外观相关的设置统一映射成 CSS 变量
   任何界面都可以读取这些变量，做到「任意界面可换壁纸/图标/小组件」

   我管理的 State key：
     - theme / wallpaper / wallpaperMode（已有，沿用）
     - lockWallpaper / lockAvatar / lockText（已有，沿用）
     - appBackgrounds（已有，按 appId 注入到 .page[data-app] 的 --app-bg）
     - chatBackground（已有，注入到 .chat-shell 的 --chat-bg）
     - widgetBackground   —— 小组件背景（任意 CSS background 值）
     - dockBackground     —— Dock 栏背景
     - appIconStyles      —— { appId: { color, bg, image, radius } } 自定义图标
     - accentColor        —— 强调色覆盖（覆盖 --color-accent）
     - bubbleRadius       —— 气泡圆角档位（sm/md/lg）
     - iconRadius         —— APP 图标圆角档位

   挂在 window.Phone.ThemeEngine
   ============================================================ */
(function (global) {
  "use strict";

  const ROOT = document.documentElement;

  // 我把每个 State key 对应到一个应用函数
  const APPLIERS = {
    theme: applyTheme,
    fontSize: applyFontSize,
    systemName: applySystemName,
    wallpaper: applyWallpaper,
    widgetBackground: applyWidgetBackground,
    dockBackground: applyDockBackground,
    chatBackground: applyChatBackground,
    appBackgrounds: applyAppBackgrounds,
    appIconStyles: applyAppIconStyles,
    accentColor: applyAccentColor,
    bubbleRadius: applyBubbleRadius,
    iconRadius: applyIconRadius,
  };

  // ---------- 初始化（启动时一次性应用所有外观） ----------
  async function init() {
    const all = global.Phone.State.getAll();
    Object.keys(APPLIERS).forEach((key) => {
      try { APPLIERS[key](all[key]); } catch (e) { console.warn("[ThemeEngine] 应用 " + key + " 失败", e); }
    });
    // 订阅每个 key 的变化
    Object.keys(APPLIERS).forEach((key) => {
      global.Phone.State.subscribe(key, (val) => {
        try { APPLIERS[key](val); } catch (e) { console.warn("[ThemeEngine] 应用 " + key + " 变更失败", e); }
      });
    });
  }

  // ---------- 主题 ----------
  function applyTheme(theme) {
    ROOT.setAttribute("data-theme", theme || "honey");
  }

  function applyFontSize(fs) {
    ROOT.setAttribute("data-font-size", fs || "base");
  }

  function applySystemName(name) {
    const n = name || "小手机";
    document.title = n;
    const meta = document.querySelector('meta[name="application-name"]');
    if (meta) meta.setAttribute("content", n);
  }

  // ---------- 桌面壁纸（注入到 :root，让任何界面都能引用） ----------
  function applyWallpaper(wp) {
    if (wp) {
      ROOT.style.setProperty("--wallpaper-image", "url('" + wp + "')");
      ROOT.style.setProperty("--wallpaper-overlay", "rgba(255,255,255,0)");
    } else {
      ROOT.style.removeProperty("--wallpaper-image");
      ROOT.style.removeProperty("--wallpaper-overlay");
    }
  }

  // ---------- 小组件背景 ----------
  function applyWidgetBackground(bg) {
    if (bg) ROOT.style.setProperty("--widget-bg", bg);
    else ROOT.style.removeProperty("--widget-bg");
  }

  // ---------- Dock 栏背景 ----------
  function applyDockBackground(bg) {
    if (bg) ROOT.style.setProperty("--dock-bg", bg);
    else ROOT.style.removeProperty("--dock-bg");
  }

  // ---------- 聊天背景 ----------
  function applyChatBackground(bg) {
    if (bg) ROOT.style.setProperty("--chat-bg", "url('" + bg + "') center/cover no-repeat");
    else ROOT.style.removeProperty("--chat-bg");
  }

  // ---------- APP 背景（按 appId 注入） ----------
  function applyAppBackgrounds(map) {
    map = map || {};
    // 我把所有 APP 背景写到一个 CSS 变量字典里
    // 每个 .page[data-app="xxx"] 会读 --app-bg-xxx
    Object.keys(map).forEach((appId) => {
      ROOT.style.setProperty("--app-bg-" + appId, map[appId]);
    });
  }

  // ---------- APP 图标样式 ----------
  function applyAppIconStyles(map) {
    map = map || {};
    Object.keys(map).forEach((appId) => {
      const s = map[appId] || {};
      if (s.bg)   ROOT.style.setProperty("--icon-bg-" + appId, s.bg);
      else        ROOT.style.removeProperty("--icon-bg-" + appId);
      if (s.color) ROOT.style.setProperty("--icon-color-" + appId, s.color);
      else         ROOT.style.removeProperty("--icon-color-" + appId);
      if (s.image) ROOT.style.setProperty("--icon-image-" + appId, "url('" + s.image + "') center/cover no-repeat");
      else         ROOT.style.removeProperty("--icon-image-" + appId);
      if (s.radius) ROOT.style.setProperty("--icon-radius-" + appId, s.radius);
      else          ROOT.style.removeProperty("--icon-radius-" + appId);
    });
  }

  // ---------- 强调色覆盖 ----------
  function applyAccentColor(c) {
    if (c) {
      ROOT.style.setProperty("--color-accent", c);
      ROOT.style.setProperty("--color-accent-light", _lighten(c, 0.3));
      ROOT.style.setProperty("--color-accent-ultralight", _lighten(c, 0.6));
    } else {
      // 移除覆盖，回到主题默认
      ROOT.style.removeProperty("--color-accent");
      ROOT.style.removeProperty("--color-accent-light");
      ROOT.style.removeProperty("--color-accent-ultralight");
    }
  }

  // ---------- 气泡圆角 ----------
  function applyBubbleRadius(r) {
    const map = { sm: "10px", md: "16px", lg: "22px" };
    if (r && map[r]) ROOT.style.setProperty("--bubble-radius", map[r]);
    else ROOT.style.removeProperty("--bubble-radius");
  }

  // ---------- 图标圆角 ----------
  function applyIconRadius(r) {
    const map = { sm: "10px", md: "18px", lg: "24px", full: "999px" };
    if (r && map[r]) ROOT.style.setProperty("--icon-radius-base", map[r]);
    else ROOT.style.removeProperty("--icon-radius-base");
  }

  // ---------- 工具：颜色变亮（简易 HSL 转换） ----------
  function _lighten(hex, amount) {
    if (!hex || !hex.startsWith("#")) return hex;
    const h = hex.slice(1);
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const nr = Math.min(255, Math.round(r + (255 - r) * amount));
    const ng = Math.min(255, Math.round(g + (255 - g) * amount));
    const nb = Math.min(255, Math.round(b + (255 - b) * amount));
    return "#" + [nr, ng, nb].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  // ---------- 给某个容器的根 div 打上 data-app 标记（供 APP 背景生效） ----------
  function tagApp(container, appId) {
    if (container) container.setAttribute("data-app", appId);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.ThemeEngine = {
    init,
    tagApp,
    applyAll: init,
  };
})(window);
