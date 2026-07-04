/* ============================================================
   desktop.js — 桌面总装
   整合：壁纸 + 状态栏 + 小组件 + APP 网格 + 页面指示器 + Dock
   挂在 window.Phone.Desktop
   ============================================================ */
(function (global) {
  "use strict";

  let _destroyers = [];

  /**
   * 我（桌面）的根挂载函数（Router rootMount）
   * @param {HTMLElement} container
   */
  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;

    // 清理之前的
    _destroyers.forEach((fn) => { try { fn(); } catch {} });
    _destroyers = [];
    U.empty(container);

    const desktop = U.el("div", { class: "desktop" });

    // 壁纸层
    const wallpaper = U.el("div", { class: "desktop-wallpaper" });
    const wpUrl = State.get("wallpaper");
    if (wpUrl) wallpaper.style.background = "url('" + wpUrl + "') center/cover no-repeat";
    desktop.appendChild(wallpaper);

    // 内容层
    const content = U.el("div", { class: "desktop-content" });

    // 状态栏
    const sb = global.Phone.StatusBar.mount(content);
    _destroyers.push(() => sb.destroy && sb.destroy());

    // 小组件
    const widgets = global.Phone.Widgets.mount(content);
    _destroyers.push(() => widgets.destroy && widgets.destroy());

    // APP 网格（内含分页与页面指示器）
    const grid = await global.Phone.AppGrid.mount(content);
    _destroyers.push(() => grid.destroy && grid.destroy());

    // Dock
    const dock = await global.Phone.Dock.mount(content);
    _destroyers.push(() => dock.destroy && dock.destroy());

    desktop.appendChild(content);
    container.appendChild(desktop);

    // 监听壁纸变化
    const unsubWp = State.subscribe("wallpaper", (val) => {
      if (val) wallpaper.style.background = "url('" + val + "') center/cover no-repeat";
      else wallpaper.style.background = "var(--bg-base-grad)";
    });
    _destroyers.push(unsubWp);

    // 监听主题变化（壁纸层用渐变会自动跟随）

    // 监听 dockApps 变化（重渲染 dock）
    const unsubDock = State.subscribe("dockApps", async () => {
      if (dock.destroy) dock.destroy();
      await global.Phone.Dock.mount(content);
    });
    _destroyers.push(unsubDock);

    // 监听 hiddenApps / appOrder 变化（重渲染网格）
    const refreshGrid = async () => {
      if (grid.destroy) grid.destroy();
      await global.Phone.AppGrid.mount(content);
    };
    _destroyers.push(State.subscribe("hiddenApps", refreshGrid));
    _destroyers.push(State.subscribe("appOrder", refreshGrid));
    _destroyers.push(State.subscribe("iconColumns", refreshGrid));

    return desktop;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Desktop = { mount };
})(window);
