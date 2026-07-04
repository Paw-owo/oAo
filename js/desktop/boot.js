/* ============================================================
   boot.js — 启动动画
   "小手机正在醒来..." + 呼吸动画
   挂在 window.Phone.Boot
   ============================================================ */
(function (global) {
  "use strict";

  const BOOT_MESSAGES = [
    "小手机正在醒来...",
    "棉花糖正在揉眼睛...",
    "奶黄云朵正在飘过来...",
    "正在调好枕头...",
    "小手机想你了...",
  ];

  /**
   * 我（启动动画）的入口
   * @param {function} onDone 启动完成回调
   * @param {object} opts { minDuration }
   */
  function show(onDone, opts) {
    opts = opts || {};
    const minDuration = opts.minDuration || 1800;
    const startTime = Date.now();

    const boot = global.Phone.Utils.el("div", { class: "boot-screen" });
    const logo = global.Phone.Utils.el("div", { class: "boot-logo anim-breathe" }, {
      html: global.Phone.IconLibrary.get("sb-paw-big", { size: 72, strokeWidth: 1.4 })
    });
    const msg = global.Phone.Utils.el("div", { class: "boot-msg", text: global.Phone.Utils.pick(BOOT_MESSAGES) });
    const dots = global.Phone.Utils.el("div", { class: "boot-dots" }, [
      global.Phone.Utils.el("span"), global.Phone.Utils.el("span"), global.Phone.Utils.el("span"),
    ]);
    boot.appendChild(logo);
    boot.appendChild(msg);
    boot.appendChild(dots);
    document.body.appendChild(boot);

    // 文案轮换
    let idx = 0;
    const msgTimer = setInterval(() => {
      idx = (idx + 1) % BOOT_MESSAGES.length;
      msg.textContent = BOOT_MESSAGES[idx];
      msg.classList.remove("boot-msg-fade");
      void msg.offsetWidth;
      msg.classList.add("boot-msg-fade");
    }, 900);

    function finish() {
      clearInterval(msgTimer);
      boot.classList.add("boot-leave");
      setTimeout(() => {
        boot.remove();
        if (typeof onDone === "function") onDone();
      }, 320);
    }

    // 至少展示 minDuration
    setTimeout(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= minDuration) finish();
      else setTimeout(finish, minDuration - elapsed);
    }, minDuration);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Boot = { show, BOOT_MESSAGES };
})(window);
