/* ============================================================
   modal.js — 统一弹窗组件
   替代浏览器原生 alert / confirm / prompt
   提供与主题适配的可爱风格弹窗，全部返回 Promise
   挂在 window.Phone.Modal

   用法：
     const ok = await Modal.confirm({ title:"删除？", message:"不可恢复", danger:true });
     const name = await Modal.prompt({ title:"新建歌单", placeholder:"输入名字" });
     await Modal.alert({ title:"提示", message:"已完成" });
   ============================================================ */
(function (global) {
  "use strict";

  const U = () => global.Phone.Utils;

  // z-index 自增，保证连续/嵌套调用时后开的弹窗在上层
  let _zIndex = 9000;

  /**
   * 创建并显示一个弹窗
   * @param {object} config
   *   - type: "confirm" | "prompt" | "alert"
   *   - title: 标题（可选，默认按 type 给默认标题）
   *   - message: 正文（可选）
   *   - placeholder: prompt 的输入框占位符
   *   - defaultValue: prompt 的输入框默认值
   *   - okText: 确认按钮文字（默认"确定"/alert 为"知道啦"）
   *   - cancelText: 取消按钮文字（默认"再想想"）
   *   - danger: true 时确认按钮用危险色（红橙），用于删除/清空/重置
   *   - inputType: prompt 输入框类型，默认 text
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
        // 关闭动画后再移除，给 160ms 过渡
        mask.classList.add("phone-modal-closing");
        card.classList.add("phone-modal-closing");
        setTimeout(() => {
          if (mask.parentNode) mask.remove();
          document.removeEventListener("keydown", onKey);
        }, 160);
        resolve(result);
      }

      // ESC = 取消
      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          done(isPrompt ? null : false);
        } else if (e.key === "Enter" && isPrompt) {
          e.preventDefault();
          const val = inputEl.value;
          done(val);
        }
      }

      // ---------- 遮罩 ----------
      const mask = U().el("div", { class: "phone-modal-mask" });
      mask.style.zIndex = z;
      // 点遮罩空白 = 取消（alert 也允许点遮罩关闭）
      mask.addEventListener("click", (e) => {
        if (e.target === mask) done(isPrompt ? null : (isConfirm ? false : undefined));
      });

      // ---------- 卡片 ----------
      const card = U().el("div", {
        class: "phone-modal-card anim-pop",
        role: "dialog",
        "aria-modal": "true",
      });

      // 标题
      const titleText = config.title != null ? config.title
        : (isConfirm ? "请确认" : isPrompt ? "请输入" : "提示");
      card.appendChild(U().el("div", { class: "phone-modal-title", text: titleText }));

      // 正文
      if (config.message != null && config.message !== "") {
        card.appendChild(U().el("div", { class: "phone-modal-message", text: config.message }));
      }

      // 输入框（prompt）
      let inputEl = null;
      if (isPrompt) {
        inputEl = U().el("input", {
          class: "phone-modal-input",
          type: config.inputType || "text",
          placeholder: config.placeholder || "",
          value: config.defaultValue || "",
        });
        card.appendChild(inputEl);
        // 自动聚焦
        setTimeout(() => { inputEl.focus(); inputEl.select(); }, 60);
      }

      // 按钮区
      const btns = U().el("div", { class: "phone-modal-btns" });

      // 取消按钮（confirm / prompt 才有）
      if (isConfirm || isPrompt) {
        const cancelBtn = U().el("button", {
          class: "phone-modal-btn phone-modal-btn-cancel",
          text: config.cancelText || "再想想",
        });
        cancelBtn.addEventListener("click", () => done(isPrompt ? null : false));
        btns.appendChild(cancelBtn);
      }

      // 确认按钮
      const okText = config.okText || (type === "alert" ? "知道啦" : "确定");
      const okBtn = U().el("button", {
        class: "phone-modal-btn phone-modal-btn-ok" + (config.danger ? " phone-modal-btn-danger" : ""),
        text: okText,
      });
      okBtn.addEventListener("click", () => {
        if (isPrompt) {
          done(inputEl.value);
        } else if (isConfirm) {
          done(true);
        } else {
          done(undefined);
        }
      });
      btns.appendChild(okBtn);

      card.appendChild(btns);
      mask.appendChild(card);
      document.body.appendChild(mask);

      document.addEventListener("keydown", onKey);
    });
  }

  // ---------- 对外 API ----------
  function confirm(opts) {
    return _open(Object.assign({}, opts, { type: "confirm" }));
  }
  function prompt(opts) {
    return _open(Object.assign({}, opts, { type: "prompt" }));
  }
  function alert(opts) {
    return _open(Object.assign({}, opts, { type: "alert" }));
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Modal = { confirm, prompt, alert, _open };
})(window);
