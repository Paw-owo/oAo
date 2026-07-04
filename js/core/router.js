/* ============================================================
   router.js — 简易页面路由
   基于 history API，APP 通过 push(name, params) 进入页面
   桌面是根页面，APP 是子页面
   挂在 window.Phone.Router

   约定：
   - 每个页面有一个 mount(container) 函数和可选的 unmount()
   - 容器：#app-root
   - 支持返回手势（popstate）
   ============================================================ */
(function (global) {
  "use strict";

  const stack = [];        // 页面栈
  let rootMount = null;    // 桌面挂载函数
  let container = null;

  function init(mount) {
    container = document.getElementById("app-root") || document.body;
    rootMount = mount;
    window.addEventListener("popstate", (e) => {
      // 用户按返回键
      if (stack.length > 0) {
        _pop(true);
      } else {
        _showRoot();
      }
    });
  }

  function _clear() {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  async function _showRoot() {
    _clear();
    if (typeof rootMount === "function") {
      await rootMount(container);
    }
  }

  /**
   * 我（路由器）压入一个新页面
   * @param {string} name 页面名
   * @param {function} mountFn (container, params) => void  挂载函数
   * @param {object} params 传给 mountFn 的参数
   * @param {object} opts { title, anim }
   */
  async function push(name, mountFn, params, opts) {
    opts = opts || {};
    if (typeof mountFn !== "function") {
      console.warn("[Router] mountFn 不是函数", name);
      return;
    }
    const page = { name: name, mount: mountFn, params: params || {}, opts: opts };
    stack.push(page);
    try { history.pushState({ name: name, idx: stack.length - 1 }, ""); } catch {}

    _clear();
    container.classList.add("page-entering");
    try {
      await mountFn(container, page.params);
    } catch (e) {
      console.error("[Router] 挂载页面失败", name, e);
    }
    requestAnimationFrame(() => container.classList.remove("page-entering"));
  }

  // 返回上一页
  async function back() {
    if (stack.length === 0) return;
    await _pop(false);
  }

  async function _pop(fromPopState) {
    const page = stack.pop();
    if (page && typeof page.unmount === "function") {
      try { await page.unmount(); } catch {}
    }
    if (stack.length === 0) {
      if (!fromPopState) {
        try { history.back(); } catch { _showRoot(); }
      } else {
        _showRoot();
      }
    } else {
      const top = stack[stack.length - 1];
      _clear();
      try { await top.mount(container, top.params); } catch (e) { console.error(e); }
    }
  }

  // 注册 unmount 钩子（当前页可调用）
  function onLeave(fn) {
    if (stack.length > 0) {
      stack[stack.length - 1].unmount = fn;
    }
  }

  function current() { return stack[stack.length - 1] || null; }
  function depth() { return stack.length; }
  function isRoot() { return stack.length === 0; }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Router = {
    init, push, back, onLeave, current, depth, isRoot,
    showRoot: _showRoot,
  };
})(window);
