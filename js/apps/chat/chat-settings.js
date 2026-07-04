/* ============================================================
   chat-settings.js — 聊天相关设置
   提供给设置中心调用的聊天设置面板
   气泡样式 / 字号 / 默认聊天背景 / 收藏管理
   挂在 window.Phone.ChatSettings
   ============================================================ */
(function (global) {
  "use strict";

  /**
   * 我（聊天设置）渲染到容器
   * @param {HTMLElement} container
   */
  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;
    const Storage = global.Phone.Storage;

    const page = U.el("div", { class: "page" });

    // 导航栏
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const backBtn = U.el("button", { class: "icon-btn" });
    backBtn.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    backBtn.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(backBtn);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: "聊天设置" }));
    nav.appendChild(U.el("div", { class: "nav-right" }));
    page.appendChild(nav);

    const content = U.el("div", { class: "page-content" });

    const bubbleStyle = (await State.get("bubbleStyle")) || "rounded";
    const fontSize = (await State.get("fontSize")) || "base";
    const chatBg = (await State.get("chatBackground")) || "";
    const favorites = (await Storage.getSetting("chatFavorites")) || [];

    // 气泡样式
    content.appendChild(U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: "气泡样式" }),
      _segment([
        { val: "rounded", label: "圆角" },
        { val: "square", label: "方角" },
        { val: "tail", label: "带尾巴" },
      ], bubbleStyle, (v) => State.set("bubbleStyle", v))
    ]));

    // 字号
    content.appendChild(U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: "字号" }),
      _segment([
        { val: "sm", label: "小" },
        { val: "base", label: "标准" },
        { val: "md", label: "大" },
        { val: "lg", label: "特大" },
      ], fontSize, (v) => State.set("fontSize", v))
    ]));

    // 默认聊天背景
    content.appendChild(U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: "默认聊天背景" }),
      U.el("div", { class: "card-soft", style: { display: "flex", gap: "10px", alignItems: "center" } }, [
        U.el("div", { class: "avatar avatar-sm", style: chatBg ? { backgroundImage: "url(" + chatBg + ")", backgroundSize: "cover", backgroundPosition: "center" } : {}, html: chatBg ? "" : global.Phone.IconLibrary.get("image", { size: 16 }) }),
        U.el("div", { class: "flex-1" }, [
          U.el("div", { text: chatBg ? "已设置背景" : "未设置" }),
          U.el("div", { class: "form-hint", text: "上传图片作为新对话默认背景" }),
        ]),
      ]),
      U.el("div", { class: "row gap-8", style: { marginTop: "8px" } }, [
        _btn("上传", "btn-ghost btn-sm", async () => {
          const inp = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
          document.body.appendChild(inp);
          inp.addEventListener("change", async () => {
            const f = inp.files[0]; if (!f) return;
            const b64 = await U.fileToBase64(f);
            await State.set("chatBackground", b64);
            inp.remove();
            _remount(container);
          });
          inp.click();
        }),
        chatBg ? _btn("清除", "btn-text btn-sm", async () => {
          await State.set("chatBackground", "");
          _remount(container);
        }) : null,
      ])
    ]));

    // 收藏管理
    content.appendChild(U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: "收藏 (" + favorites.length + ")" }),
      favorites.length === 0
        ? U.el("div", { class: "empty-state" }, [
            U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("archive", { size: 28 }) }),
            U.el("div", { class: "es-title", text: "还没有收藏" }),
            U.el("div", { class: "es-sub", text: "长按消息可以收藏哦" })
          ])
        : U.el("div", { class: "list" }, favorites.map((f) => U.el("div", { class: "list-item" }, [
            U.el("div", { class: "li-main" }, [
              U.el("div", { class: "li-title", text: f.content.slice(0, 40) }),
              U.el("div", { class: "li-sub", text: "来自 " + (f.from || "AI") + " · " + U.relTime(f.createdAt) })
            ]),
            (() => {
              const btn = U.el("button", { class: "icon-btn" });
              btn.innerHTML = global.Phone.IconLibrary.get("trash", { size: 18 });
              btn.addEventListener("click", async () => {
                const next = favorites.filter((x) => x.id !== f.id);
                await Storage.setSetting("chatFavorites", next);
                _remount(container);
              });
              return btn;
            })()
          ])))
    ]));

    page.appendChild(content);
    container.appendChild(page);
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  function _segment(items, current, onPick) {
    const U = global.Phone.Utils;
    const seg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
    items.forEach((it) => {
      const node = U.el("div", { class: "segment-item" + (current === it.val ? " active" : ""), text: it.label });
      node.addEventListener("click", () => {
        seg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
        onPick(it.val);
      });
      seg.appendChild(node);
    });
    return seg;
  }

  function _btn(label, cls, onclick) {
    const U = global.Phone.Utils;
    const b = U.el("button", { class: "btn " + (cls || ""), text: label });
    b.addEventListener("click", onclick);
    return b;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.ChatSettings = { mount };
})(window);
