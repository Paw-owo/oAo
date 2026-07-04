/* ============================================================
   lockscreen.js — 锁屏
   4 位数字密码（默认 0326），错误提示"嘿嘿，不对哦"
   锁屏壁纸 / 头像 / 文案可自定义
   挂在 window.Phone.LockScreen
   ============================================================ */
(function (global) {
  "use strict";

  let _resolveUnlock = null;

  /**
   * 我（锁屏）显示锁屏界面
   * @returns {Promise<void>} 解锁成功时 resolve
   */
  function show() {
    return new Promise((resolve) => {
      _resolveUnlock = resolve;
      _render();
    });
  }

  async function _render() {
    const S = global.Phone.Storage;
    const U = global.Phone.Utils;
    const State = global.Phone.State;

    const [password, wallpaper, avatar, lockText] = await Promise.all([
      S.getSetting("lockPassword"),
      S.getSetting("lockWallpaper"),
      S.getSetting("lockAvatar"),
      S.getSetting("lockText"),
    ]);

    // 移除旧锁屏
    const old = document.querySelector(".lockscreen");
    if (old) old.remove();

    const lock = U.el("div", { class: "lockscreen" });

    // 背景
    if (wallpaper) {
      lock.style.background = "url('" + wallpaper + "') center/cover no-repeat";
    } else {
      lock.style.background = "var(--bg-base-grad)";
    }

    // 头像 + 时间 + 文案
    const top = U.el("div", { class: "lock-top" });
    if (avatar) {
      top.appendChild(U.el("div", { class: "lock-avatar" }, [
        U.el("img", { src: avatar, alt: "" })
      ]));
    } else {
      top.appendChild(U.el("div", { class: "lock-avatar lock-avatar-default" }, {
        html: global.Phone.IconLibrary.get("sb-cat", { size: 40 })
      }));
    }

    // 实时时间
    const timeBox = U.el("div", { class: "lock-time" });
    const timeEl = U.el("div", { class: "lock-time-main" });
    const dateEl = U.el("div", { class: "lock-time-date" });
    timeBox.appendChild(timeEl);
    timeBox.appendChild(dateEl);
    top.appendChild(timeBox);

    if (lockText) {
      top.appendChild(U.el("div", { class: "lock-text", text: lockText }));
    }
    lock.appendChild(top);

    // 密码输入
    const bottom = U.el("div", { class: "lock-bottom" });

    const dots = U.el("div", { class: "lock-dots" }, [
      U.el("span"), U.el("span"), U.el("span"), U.el("span")
    ]);
    bottom.appendChild(dots);

    const tip = U.el("div", { class: "lock-tip", text: "输入密码解锁" });
    bottom.appendChild(tip);

    // 数字键盘 1-9, 0, 删除
    const pad = U.el("div", { class: "lock-pad" });
    const keys = ["1","2","3","4","5","6","7","8","9","","0","del"];
    let input = "";
    function updateDots() {
      const arr = dots.querySelectorAll("span");
      arr.forEach((d, i) => {
        d.classList.toggle("filled", i < input.length);
      });
    }
    function tryUnlock() {
      if (input.length < 4) return;
      if (input === password) {
        lock.classList.add("lock-unlock");
        tip.textContent = "欢迎回来～";
        setTimeout(() => {
          lock.remove();
          if (_resolveUnlock) { _resolveUnlock(); _resolveUnlock = null; }
        }, 400);
      } else {
        tip.textContent = "嘿嘿，不对哦";
        tip.classList.add("lock-tip-shake");
        lock.classList.add("lock-shake");
        global.Phone.Utils.vibrate(40);
        setTimeout(() => {
          tip.classList.remove("lock-tip-shake");
          lock.classList.remove("lock-shake");
          input = "";
          updateDots();
          tip.textContent = "输入密码解锁";
        }, 600);
      }
    }
    keys.forEach((k) => {
      const btn = U.el("button", { class: "lock-key" + (k === "" ? " lock-key-blank" : "") });
      if (k === "del") {
        btn.innerHTML = global.Phone.IconLibrary.get("backspace", { size: 24 });
        btn.addEventListener("click", () => {
          if (input.length > 0) { input = input.slice(0, -1); updateDots(); }
        });
      } else if (k === "") {
        btn.disabled = true;
      } else {
        btn.textContent = k;
        btn.addEventListener("click", () => {
          if (input.length >= 4) return;
          input += k;
          updateDots();
          global.Phone.Utils.vibrate(8);
          if (input.length === 4) setTimeout(tryUnlock, 120);
        });
      }
      pad.appendChild(btn);
    });
    bottom.appendChild(pad);
    lock.appendChild(bottom);

    document.body.appendChild(lock);

    // 实时更新时间
    function tick() {
      const now = new Date();
      timeEl.textContent = global.Phone.Utils.pad2(now.getHours()) + ":" + global.Phone.Utils.pad2(now.getMinutes());
      dateEl.textContent = (now.getMonth() + 1) + "月" + now.getDate() + "日 " + global.Phone.Utils.WEEK_CN[now.getDay()];
    }
    tick();
    const timer = setInterval(tick, 1000 * 10);
    // 锁屏移除时清除
    const observer = new MutationObserver(() => {
      if (!document.body.contains(lock)) {
        clearInterval(timer);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.LockScreen = { show };
})(window);
