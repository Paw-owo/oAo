/* ============================================================
   main.js — 主入口
   负责：
   1. 初始化底座模块
   2. 注册 service worker
   3. 启动流程：Boot → LockScreen → Desktop
   4. APP 文件各自加载时调用 AppRegistry.register 注册自己
   ============================================================ */
(function (global) {
  "use strict";

  async function start() {
    // 1. 等待存储就绪 + 种子数据
    try {
      await global.Phone.Storage.ready;
      await global.Phone.Storage.seedIfEmpty();
    } catch (e) {
      console.error("[Main] 存储初始化失败", e);
      _showFatal("小手机没法保存数据啦，换个浏览器试试");
      return;
    }

    // 2. 加载全局状态（主题/字号/系统名等）
    try {
      await global.Phone.State.init();
    } catch (e) {
      console.error("[Main] 状态初始化失败", e);
    }

    // 2.5 应用全局主题引擎（壁纸/小组件/Dock/图标/气泡等所有外观变量）
    try {
      if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.init) {
        await global.Phone.ThemeEngine.init();
      }
    } catch (e) {
      console.error("[Main] 主题引擎初始化失败", e);
    }

    // 3. 注册 Service Worker（PWA 离线）
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }

    // 4. 初始化路由（根页面 = 桌面）
    global.Phone.Router.init(global.Phone.Desktop.mount);

    // 5. 启动流程：boot → lockscreen → desktop
    global.Phone.Boot.show(async () => {
      try {
        await global.Phone.LockScreen.show();
      } catch (e) {
        console.warn("[Main] 锁屏异常，跳过", e);
      }
      await global.Phone.Router.showRoot();

      // 启动后：触发周年纪念 / 备忘录提醒检查（如果相应 APP 已注册）
      setTimeout(() => {
        if (global.Phone.Anniversary && global.Phone.Anniversary.checkDue) {
          try { global.Phone.Anniversary.checkDue(); } catch {}
        }
        if (global.Phone.Memo && global.Phone.Memo.checkReminders) {
          try { global.Phone.Memo.checkReminders(); } catch {}
        }
        // 启动我的主动行为引擎（我会主动发朋友圈/点赞评论/主动聊天）
        if (global.Phone.AIProactive && global.Phone.AIProactive.start) {
          try { global.Phone.AIProactive.start(); } catch (e) { console.warn("[Main] 我的主动引擎启动失败了", e); }
        }
      }, 1500);
    });

    // 监听 visibility，回到前台时刷新角标
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        try { global.Phone.Notify.refreshBadges(); } catch {}
      }
    });

    // 启动桌面顶部站内通知条（监听 MESSAGE_RECEIVED）
    try {
      if (global.Phone.NotificationBar && global.Phone.NotificationBar.init) {
        global.Phone.NotificationBar.init();
      }
    } catch (e) {
      console.warn("[Main] 通知条初始化失败", e);
    }
  }

  function _showFatal(msg) {
    const div = document.createElement("div");
    div.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:#FFF8E7;color:#4A3C28;font-size:15px;";
    div.textContent = msg;
    document.body.appendChild(div);
  }

  // DOM 就绪后启动
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // 暴露启动函数（调试用）
  global.Phone = global.Phone || {};
  global.Phone.start = start;
})(window);
