/* ============================================================
   lock-security.js — 锁屏与安全
   密码修改 / 锁屏壁纸 / 锁屏头像 / 锁屏文案
   挂在 window.Phone.LockSecurity
   ============================================================ */
(function (global) {
  "use strict";

  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;

    const [password, wallpaper, avatar, lockText] = await Promise.all([
      State.get("lockPassword"), State.get("lockWallpaper"),
      State.get("lockAvatar"), State.get("lockText"),
    ]);

    const page = U.el("div", { class: "page settings-page" });
    page.appendChild(_nav("锁屏与安全"));

    const content = U.el("div", { class: "scroll page-content" });

    // 密码
    content.appendChild(U.el("div", { class: "settings-section-title", text: "锁屏密码" }));
    content.appendChild(U.el("div", { class: "list-item" }, [
      U.el("div", { class: "li-avatar", style: { background: "var(--color-primary-ultralight)", color: "var(--color-primary-deep)" }, html: global.Phone.IconLibrary.get("lock", { size: 18 }) }),
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: "锁屏密码" }),
        U.el("div", { class: "li-sub", text: "当前：" + "•".repeat(4) + "（点修改）" }),
      ]),
    ]));
    const pwdBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "修改密码", style: { margin: "8px 16px" } });
    pwdBtn.addEventListener("click", () => _editPassword(container));
    content.appendChild(pwdBtn);

    // 锁屏壁纸
    content.appendChild(U.el("div", { class: "settings-section-title", text: "锁屏壁纸" }));
    const wpGroup = U.el("div", { class: "settings-group", style: { padding: "16px" } });
    const wpPicker = U.el("div", { class: "wallpaper-picker" });
    const defaultWp = U.el("div", { class: "wp-item" + (!wallpaper ? " active" : "") });
    defaultWp.style.background = "var(--bg-base-grad)";
    defaultWp.appendChild(U.el("div", { class: "wp-label", text: "默认" }));
    defaultWp.addEventListener("click", async () => { await State.set("lockWallpaper", ""); _remount(container); });
    wpPicker.appendChild(defaultWp);
    const upWp = U.el("div", { class: "wp-item", style: { display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-placeholder)" } });
    upWp.innerHTML = global.Phone.IconLibrary.get("upload", { size: 24 });
    upWp.appendChild(U.el("div", { class: "wp-label", text: "上传" }));
    upWp.addEventListener("click", () => {
      const inp = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
      document.body.appendChild(inp);
      inp.addEventListener("change", async () => {
        const f = inp.files[0]; if (!f) return;
        const b64 = await U.fileToBase64(f);
        await State.set("lockWallpaper", b64);
        inp.remove(); _remount(container);
      });
      inp.click();
    });
    wpPicker.appendChild(upWp);
    if (wallpaper) {
      const cur = U.el("div", { class: "wp-item active", style: { backgroundImage: "url(" + wallpaper + ")", backgroundSize: "cover", backgroundPosition: "center" } });
      cur.appendChild(U.el("div", { class: "wp-label", text: "当前" }));
      wpPicker.appendChild(cur);
    }
    wpGroup.appendChild(wpPicker);
    content.appendChild(wpGroup);

    // 锁屏头像
    content.appendChild(U.el("div", { class: "settings-section-title", text: "锁屏头像" }));
    const avatarRow = U.el("div", { class: "list-item" }, [
      (() => {
        const av = U.el("div", { class: "li-avatar" });
        if (avatar) av.innerHTML = '<img src="' + avatar + '"/>';
        else av.innerHTML = global.Phone.IconLibrary.get("user", { size: 18 });
        return av;
      })(),
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: avatar ? "已设置头像" : "使用默认头像" }),
        U.el("div", { class: "li-sub", text: "点此更换" }),
      ]),
    ]);
    avatarRow.addEventListener("click", () => {
      const inp = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
      document.body.appendChild(inp);
      inp.addEventListener("change", async () => {
        const f = inp.files[0]; if (!f) return;
        const b64 = await U.fileToBase64(f);
        await State.set("lockAvatar", b64);
        inp.remove(); _remount(container);
      });
      inp.click();
    });
    content.appendChild(avatarRow);
    if (avatar) {
      const clearAv = U.el("button", { class: "btn btn-text btn-sm", text: "清除头像", style: { margin: "0 16px" } });
      clearAv.addEventListener("click", async () => { await State.set("lockAvatar", ""); _remount(container); });
      content.appendChild(clearAv);
    }

    // 锁屏文案
    content.appendChild(U.el("div", { class: "settings-section-title", text: "锁屏文案" }));
    content.appendChild(U.el("div", { class: "form-group", style: { padding: "0 16px" } }, [
      U.el("textarea", { class: "textarea", id: "lock-text", placeholder: "默认显示时间日期，可自定义一句话", html: U.escapeHtml(lockText || "") }),
      U.el("button", { class: "btn btn-block", style: { marginTop: "8px" }, text: "保存文案", id: "save-lock-text" }),
    ]));

    page.appendChild(content);
    container.appendChild(page);

    document.getElementById("save-lock-text").addEventListener("click", async () => {
      const v = document.getElementById("lock-text").value.trim();
      await State.set("lockText", v);
      global.Phone.Notify.push({ appId: "settings", title: "锁屏文案已保存" });
    });
  }

  function _editPassword(container) {
    const U = global.Phone.Utils;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "设置 4 位数字密码" }));
    const input = U.el("input", { class: "input", type: "tel", maxlength: "4", placeholder: "例如 0326", style: { textAlign: "center", fontSize: "20px", letterSpacing: "8px" } });
    modal.appendChild(input);
    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "确定", onclick: async () => {
        const v = input.value.trim();
        if (!/^\d{4}$/.test(v)) {
          global.Phone.Notify.push({ appId: "settings", title: "请输入 4 位数字哦" });
          return;
        }
        await global.Phone.State.set("lockPassword", v);
        global.Phone.Notify.push({ appId: "settings", title: "密码已更新" });
        mask.remove();
      }}),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  function _nav(title) {
    const U = global.Phone.Utils;
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    nav.appendChild(U.el("div", { class: "nav-right" }));
    return nav;
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.LockSecurity = { mount };
})(window);
