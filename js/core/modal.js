/* ============================================================
   modal.js — 统一弹窗组件（CuteModal 强化版）
   替代浏览器原生 alert / confirm / prompt
   提供与主题适配的可爱风格弹窗，全部返回 Promise
   - alert / confirm / prompt 保持向下兼容
   - 新增 actionSheet / toast 通用化能力
   - 图标：info / check / warning / danger
   - 圆角输入框 focus 时主题色描边
   - 毛玻璃背景 + 滑入/淡入动画
   挂在 window.Phone.Modal

   用法：
     const ok = await Modal.confirm({ title:"删除？", message:"不可恢复", danger:true });
     const name = await Modal.prompt({ title:"新建歌单", placeholder:"输入名字" });
     await Modal.alert({ title:"提示", message:"已完成", icon:"success" });
     const idx = await Modal.actionSheet({ title:"选择", items:[{label:"A"},{label:"B"}] });
     Modal.toast({ text:"已保存", type:"success" });
   ============================================================ */
(function (global) {
  "use strict";

  const U = () => global.Phone.Utils;

  // z-index 自增，保证连续/嵌套调用时后开的弹窗在上层
  let _zIndex = 9000;

  // 图标名映射 → icon-library key
  const ICON_MAP = {
    info: "info",
    success: "check",
    check: "check",
    warning: "warning",
    danger: "close",
    error: "close",
  };

  function _getIcon(name) {
    if (!global.Phone.IconLibrary) return "";
    const key = ICON_MAP[name] || name;
    try { return global.Phone.IconLibrary.get(key, { size: 28 }); } catch { return ""; }
  }

  /**
   * 创建并显示一个弹窗（保持向下兼容的 _open 入口）
   * @param {object} config
   *   - type: "confirm" | "prompt" | "alert"
   *   - title: 标题（可选，默认按 type 给默认标题）
   *   - message: 正文（可选）
   *   - placeholder: prompt 的输入框占位符
   *   - defaultValue: prompt 的输入框默认值
   *   - okText: 确认按钮文字（默认"确定"/alert 为"知道啦"）
   *   - cancelText: 取消按钮文字（默认"再想想"）
   *   - danger: true 时确认按钮用危险色（红橙）
   *   - inputType: prompt 输入框类型，默认 text
   *   - icon: info / success / warning / danger（CuteModal 新增）
   * @returns {Promise} confirm→boolean, prompt→string|null, alert→void
   */
  function _open(config) {
    config = config || {};
    const type = config.type || "alert";
    const isConfirm = type === "confirm";
    const isPrompt = type === "prompt";

    return new Promise((resolve) => {
      const z = ++_zIndex;
      let settled = false;

      function done(result) {
        if (settled) return;
        settled = true;
        mask.classList.add("closing");
        card.classList.add("phone-modal-closing");
        setTimeout(() => {
          if (mask.parentNode) mask.remove();
          document.removeEventListener("keydown", onKey);
        }, 160);
        resolve(result);
      }

      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          done(isPrompt ? null : false);
        } else if (e.key === "Enter" && isPrompt) {
          e.preventDefault();
          done(inputEl.value);
        }
      }

      // ---------- 遮罩（毛玻璃）----------
      const mask = U().el("div", { class: "phone-modal-mask" });
      mask.style.zIndex = z;
      mask.addEventListener("click", (e) => {
        if (e.target === mask) done(isPrompt ? null : (isConfirm ? false : undefined));
      });

      // ---------- 卡片 ----------
      const card = U().el("div", {
        class: "phone-modal-card anim-pop" + (config.icon ? " with-icon" : ""),
        role: "dialog",
        "aria-modal": "true",
      });

      // 图标（CuteModal 强化）
      if (config.icon) {
        const iconType = config.danger ? "danger" : config.icon;
        const iconWrap = U().el("div", { class: "phone-modal-icon " + iconType });
        iconWrap.innerHTML = _getIcon(iconType);
        card.appendChild(iconWrap);
      }

      // 标题
      const titleText = config.title != null ? config.title
        : (isConfirm ? "请确认" : isPrompt ? "请输入" : "提示");
      card.appendChild(U().el("div", { class: "phone-modal-title", text: titleText }));

      // 正文
      if (config.message != null && config.message !== "") {
        card.appendChild(U().el("div", { class: "phone-modal-message", text: config.message }));
      }

      // 输入框（prompt）— 圆角 + 主题色 focus 描边
      let inputEl = null;
      if (isPrompt) {
        inputEl = U().el("input", {
          class: "phone-modal-input rounded",
          type: config.inputType || "text",
          placeholder: config.placeholder || "",
          value: config.defaultValue || "",
        });
        card.appendChild(inputEl);
        setTimeout(() => { inputEl.focus(); inputEl.select(); }, 60);
      }

      // 按钮区
      const btns = U().el("div", { class: "phone-modal-btns" });

      // 取消按钮（confirm / prompt 才有）
      if (isConfirm || isPrompt) {
        const cancelBtn = U().el("button", {
          class: "phone-modal-btn phone-modal-btn-cancel phone-modal-btn-secondary",
          text: config.cancelText || "再想想",
        });
        cancelBtn.addEventListener("click", () => done(isPrompt ? null : false));
        btns.appendChild(cancelBtn);
      }

      // 确认按钮
      const okText = config.okText || (type === "alert" ? "知道啦" : "确定");
      const okBtn = U().el("button", {
        class: "phone-modal-btn phone-modal-btn-ok phone-modal-btn-primary" + (config.danger ? " phone-modal-btn-danger" : ""),
        text: okText,
      });
      okBtn.addEventListener("click", () => {
        if (isPrompt) done(inputEl.value);
        else if (isConfirm) done(true);
        else done(undefined);
      });
      btns.appendChild(okBtn);

      card.appendChild(btns);
      mask.appendChild(card);
      document.body.appendChild(mask);

      document.addEventListener("keydown", onKey);
    });
  }

  // ---------- 对外 API（向下兼容）----------
  function confirm(opts) {
    return _open(Object.assign({ icon: "warning" }, opts, { type: "confirm" }));
  }
  function prompt(opts) {
    return _open(Object.assign({}, opts, { type: "prompt" }));
  }
  function alert(opts) {
    // 允许传字符串：Modal.alert("提示文字")
    if (typeof opts === "string") opts = { message: opts };
    // 默认 info 图标，danger 用 warning
    const icon = opts.icon || (opts.danger ? "warning" : "info");
    return _open(Object.assign({ icon: icon }, opts, { type: "alert" }));
  }

  // ---------- actionSheet（通用化）----------
  // 用法：
  //   const idx = await Modal.actionSheet({
  //     title: "请选择",
  //     items: [
  //       { label: "拍照", icon: "camera" },
  //       { label: "相册", icon: "gallery" },
  //       { label: "删除", icon: "trash", danger: true },
  //     ],
  //     cancelText: "取消",
  //   });
  //   // 返回选中索引，取消返回 -1
  function actionSheet(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const z = ++_zIndex;
      let settled = false;
      function done(idx) {
        if (settled) return;
        settled = true;
        mask.classList.add("closing");
        sheet.classList.add("closing");
        setTimeout(() => { if (mask.parentNode) mask.remove(); }, 200);
        resolve(idx);
      }

      const mask = U().el("div", { class: "cute-sheet-mask" });
      mask.style.zIndex = z;
      mask.addEventListener("click", (e) => { if (e.target === mask) done(-1); });

      const sheet = U().el("div", { class: "cute-sheet", role: "dialog" });

      const handle = U().el("div", { class: "sheet-handle" });
      sheet.appendChild(handle);

      if (opts.title) {
        sheet.appendChild(U().el("div", { class: "cute-sheet-title", text: opts.title }));
      }

      (opts.items || []).forEach((it, idx) => {
        const item = U().el("div", { class: "cute-sheet-item" + (it.danger ? " danger" : "") });
        if (it.icon) {
          const ic = U().el("div", { class: "csi-icon" });
          try { ic.innerHTML = global.Phone.IconLibrary.get(it.icon, { size: 16 }); } catch {}
          item.appendChild(ic);
        }
        item.appendChild(document.createTextNode(it.label || ""));
        item.addEventListener("click", () => {
          if (typeof it.fn === "function") {
            try { it.fn(); } catch {}
          }
          done(idx);
        });
        sheet.appendChild(item);
      });

      const cancel = U().el("div", { class: "cute-sheet-cancel", text: opts.cancelText || "取消" });
      cancel.addEventListener("click", () => done(-1));
      sheet.appendChild(cancel);

      mask.appendChild(sheet);
      document.body.appendChild(mask);
    });
  }

  // ---------- toast（自动消失）----------
  // 用法：
  //   Modal.toast({ text: "已保存", type: "success" });
  //   Modal.toast("加载中…");  // 简写：默认 info
  //   Modal.toast({ text: "出错了", type: "warning", duration: 3000 });
  function toast(opts) {
    if (typeof opts === "string") opts = { text: opts };
    opts = opts || {};
    const type = opts.type || "info";
    const duration = opts.duration || 2000;

    // 复用 host
    let host = document.querySelector(".cute-toast-host");
    if (!host) {
      host = U().el("div", { class: "cute-toast-host" });
      document.body.appendChild(host);
    }

    const t = U().el("div", { class: "cute-toast " + type });
    const ic = U().el("div", { class: "ct-icon" });
    const iconType = type === "success" ? "check" : type === "warning" ? "warning" : "info";
    try { ic.innerHTML = global.Phone.IconLibrary.get(iconType, { size: 18 }); } catch {}
    t.appendChild(ic);
    t.appendChild(U().el("div", { class: "ct-text", text: opts.text || "" }));
    host.appendChild(t);

    // 点击可提前关闭
    t.addEventListener("click", () => _dismiss());
    let timer = setTimeout(_dismiss, duration);
    function _dismiss() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!t.parentNode) return;
      t.classList.add("cute-toast-leave");
      setTimeout(() => { if (t.parentNode) t.remove(); }, 250);
    }
    return t;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Modal = { confirm, prompt, alert, actionSheet, toast, _open };
})(window);
