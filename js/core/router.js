/* ============================================================
   router.js — 简易页面路由
   基于 history API，APP 通过 push(name, params) 进入页面
   桌面是根页面，APP 是子页面
   挂在 window.Phone.Router

   约定：
   - 每个页面有一个 mount(container) 函数和可选的 unmount()
   - 容器：#app-root
   - 支持返回手势（popstate）
   - back() 与物理返回键统一走 popstate，保持浏览器历史与页面栈同步
   ============================================================ */
(function (global) {
  "use strict";

  const stack = [];        // 页面栈
  let rootMount = null;    // 桌面挂载函数
  let container = null;

  let _rootMounted = false;   // 桌面是否当前已挂载（避免重复挂载）
  let _suppressPop = false;   // 主动 history.back() 时屏蔽 popstate 重复 pop
  let _backGuard = null;      // 返回拦截器（编辑模式等），返回 true 表示已消费

  function init(mount) {
    container = document.getElementById("app-root") || document.body;
    rootMount = mount;
    window.addEventListener("popstate", () => {
      // 主动 back 触发的 history.back()：不重复 pop
      if (_suppressPop) { _suppressPop = false; return; }
      // 编辑模式优先退出
      if (_backGuard) { try { if (_backGuard()) return; } catch {} }
      // 浮层 / 键盘 优先关闭
      if (_closeOverlayBack()) return;
      // 正常页面返回
      if (stack.length > 0) {
        _pop(true);
      } else if (!_rootMounted) {
        _showRoot();
      }
    });
  }

  // 关闭浮层 / 收起键盘：返回 true 表示已处理（back 应止步）
  function _closeOverlayBack() {
    // 1. Modal 弹窗（取最上层，点遮罩 = 取消）
    const modals = document.querySelectorAll(".phone-modal-mask");
    if (modals.length) {
      const top = modals[modals.length - 1];
      top.click();
      return true;
    }
    // 2. 底部 Action Sheet
    const sheet = document.querySelector(".sheet-mask");
    if (sheet) { sheet.remove(); return true; }
    // 3. 输入键盘
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
      ae.blur();
      return true;
    }
    return false;
  }

  function _clear() {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  async function _showRoot() {
    _clear();
    await _applyBg(null); // 回桌面清除 APP 背景
    if (typeof rootMount === "function") {
      await rootMount(container);
    }
    _rootMounted = true;
  }

  // 应用 APP 自定义背景（读 appBackgrounds 设置，key = 页面名）
  // 子游戏页面名形如 "game-xxx"，查不到背景时由子游戏自己应用 bgs.games
  async function _applyBg(name) {
    try {
      const bgs = await global.Phone.State.get("appBackgrounds");
      if (name && bgs && bgs[name]) container.style.background = bgs[name];
      else container.style.background = "";
    } catch (e) {}
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

    _rootMounted = false;
    _clear();
    await _applyBg(name); // 应用该 APP 的自定义背景（若有）
    container.classList.add("page-entering");
    try {
      await mountFn(container, page.params);
    } catch (e) {
      console.error("[Router] 挂载页面失败", name, e);
    }
    requestAnimationFrame(() => container.classList.remove("page-entering"));
  }

  /**
   * 返回上一页
   * 优先级：编辑模式 backGuard → 关闭浮层/收键盘 → 栈空回桌面 → 正常 pop
   * 正常 pop 时通过 history.back() 让 popstate 统一处理，保持浏览器历史与栈同步
   */
  async function back() {
    // 1. 编辑模式（桌面）优先退出
    if (_backGuard) { try { if (_backGuard()) return; } catch {} }
    // 2. 关闭浮层 / 收起键盘
    if (_closeOverlayBack()) return;
    // 3. 栈空：确保回到桌面
    if (stack.length === 0) {
      if (!_rootMounted) await _showRoot();
      return;
    }
    // 4. 正常返回：先 pop 栈，再 history.back() 同步浏览器历史
    //    用 _suppressPop 屏蔽这次 history.back() 触发的 popstate，避免重复 pop
    _suppressPop = true;
    const popPromise = _pop(false);
    try {
      history.back();
    } catch {
      _suppressPop = false;
    }
    // 兜底：若 history.back() 未触发 popstate（无更早历史项等），清除标志
    setTimeout(() => { _suppressPop = false; }, 200);
    await popPromise;
  }

  async function _pop(fromPopState) {
    const page = stack.pop();
    if (page && typeof page.unmount === "function") {
      try { await page.unmount(); } catch {}
    }
    _rootMounted = false;
    if (stack.length === 0) {
      await _showRoot();
    } else {
      const top = stack[stack.length - 1];
      _clear();
      await _applyBg(top.name); // 恢复上一页的 APP 背景
      try { await top.mount(container, top.params); } catch (e) { console.error(e); }
    }
  }

  // 注册 unmount 钩子（当前页可调用）
  function onLeave(fn) {
    if (stack.length > 0) {
      stack[stack.length - 1].unmount = fn;
    }
  }

  // 注册返回拦截器：返回 true 表示已消费本次返回（用于桌面编辑模式等）
  function setBackGuard(fn) { _backGuard = fn; }

  function current() { return stack[stack.length - 1] || null; }
  function depth() { return stack.length; }
  function isRoot() { return stack.length === 0; }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Router = {
    init, push, back, onLeave, current, depth, isRoot,
    setBackGuard,
    showRoot: _showRoot,
  };
})(window);
