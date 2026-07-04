/* ============================================================
   status-bar.js — 顶部状态栏
   可爱状态胶囊，9 种线条风 SVG 图标随机/轮换显示
   图标风格：stroke-width 1.5px，线条风，禁止填充实心

   挂在 window.Phone.StatusBar
   ============================================================ */
(function (global) {
  "use strict";

  let _interval = null;
  let _currentIndex = 0;

  /**
   * 我（状态栏）渲染到指定容器
   * @param {HTMLElement} container
   * @param {object} opts { mode: 'home' | 'app' }
   */
  function mount(container, opts) {
    opts = opts || {};
    const U = global.Phone.Utils;
    const bar = U.el("div", { class: "status-bar" });

    // 左侧：时间 + 装饰图标胶囊
    const leftCapsule = U.el("div", { class: "sb-capsule sb-capsule-left" });
    const time = U.el("span", { class: "sb-time" });
    leftCapsule.appendChild(time);
    const iconWrap = U.el("span", { class: "sb-icon" });
    leftCapsule.appendChild(iconWrap);
    bar.appendChild(leftCapsule);

    // 右侧：信号 / wifi / 电量（线条风装饰）
    const rightCapsule = U.el("div", { class: "sb-capsule sb-capsule-right" }, [
      U.el("span", { class: "sb-mini", html: _signalSvg() }),
      U.el("span", { class: "sb-mini", html: _wifiSvg() }),
      U.el("span", { class: "sb-battery", html: _batterySvg() }),
    ]);
    bar.appendChild(rightCapsule);

    container.appendChild(bar);

    // 初始图标
    _currentIndex = Math.floor(Math.random() * global.Phone.IconLibrary.STATUS_BAR_ICONS.length);
    _setIcon(iconWrap);

    // 时间更新
    function tickTime() {
      const now = new Date();
      time.textContent = global.Phone.Utils.pad2(now.getHours()) + ":" + global.Phone.Utils.pad2(now.getMinutes());
    }
    tickTime();

    // 图标轮换（每 6 秒）
    if (_interval) clearInterval(_interval);
    _interval = setInterval(() => {
      _currentIndex = (_currentIndex + 1) % global.Phone.IconLibrary.STATUS_BAR_ICONS.length;
      iconWrap.classList.add("sb-icon-out");
      setTimeout(() => {
        _setIcon(iconWrap);
        iconWrap.classList.remove("sb-icon-out");
        iconWrap.classList.add("sb-icon-in");
        setTimeout(() => iconWrap.classList.remove("sb-icon-in"), 320);
      }, 200);
      tickTime();
    }, 6000);

    // 时间每分钟更新
    const timeTimer = setInterval(tickTime, 30000);

    return {
      el: bar,
      destroy: () => {
        clearInterval(_interval);
        clearInterval(timeTimer);
        _interval = null;
      }
    };
  }

  function _setIcon(wrap) {
    const key = global.Phone.IconLibrary.STATUS_BAR_ICONS[_currentIndex];
    wrap.innerHTML = global.Phone.IconLibrary.get(key, { size: 16, strokeWidth: 1.5 });
  }

  // 装饰性 SVG（线条风）
  function _signalSvg() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="2" y="14" width="3" height="6" rx="1"/>' +
      '<rect x="7" y="11" width="3" height="9" rx="1"/>' +
      '<rect x="12" y="8" width="3" height="12" rx="1"/>' +
      '<rect x="17" y="5" width="3" height="15" rx="1" opacity="0.4"/></svg>';
  }
  function _wifiSvg() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5 12a10 10 0 0 1 14 0"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>';
  }
  function _batterySvg() {
    return '<svg viewBox="0 0 24 24" width="20" height="14" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="2" y="5" width="18" height="14" rx="3"/><rect x="4" y="7" width="13" height="10" rx="1.5" fill="currentColor" stroke="none"/>' +
      '<rect x="21" y="9" width="2" height="6" rx="1" fill="currentColor" stroke="none"/></svg>';
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.StatusBar = { mount };
})(window);
