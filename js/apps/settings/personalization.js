/* ============================================================
   personalization.js — 个性化设置
   主题 / 壁纸 / 字号 / 桌面布局 / Dock / 系统名
   挂在 window.Phone.Personalization
   ============================================================ */
(function (global) {
  "use strict";

  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;

    const page = U.el("div", { class: "page settings-page" });
    page.appendChild(_nav("个性化", container));

    const content = U.el("div", { class: "scroll page-content no-pad" });

    // 主题
    content.appendChild(U.el("div", { class: "settings-section-title", text: "主题" }));
    const themeCard = U.el("div", { class: "settings-group" });
    const themePicker = U.el("div", { class: "theme-picker" });
    const currentTheme = State.get("theme") || "honey";
    ["honey", "pink", "sky"].forEach((t) => {
      const card = U.el("div", { class: "theme-card" + (currentTheme === t ? " active" : ""), dataset: { theme: t } });
      card.appendChild(U.el("div", { class: "theme-preview" }));
      card.appendChild(U.el("div", { class: "theme-name", text: t === "honey" ? "奶黄" : t === "pink" ? "粉色" : "蓝色" }));
      card.addEventListener("click", async () => {
        await State.set("theme", t);
        themePicker.querySelectorAll(".theme-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
      });
      themePicker.appendChild(card);
    });
    themeCard.appendChild(themePicker);
    content.appendChild(themeCard);

    // 壁纸
    content.appendChild(U.el("div", { class: "settings-section-title", text: "壁纸" }));
    const wpGroup = U.el("div", { class: "settings-group" });
    const wpPicker = U.el("div", { class: "wallpaper-picker" });
    const currentWp = State.get("wallpaper") || "";
    // 默认（用主题渐变）
    const defaultWp = U.el("div", { class: "wp-item" + (!currentWp ? " active" : "") });
    defaultWp.style.background = "var(--bg-base-grad)";
    defaultWp.appendChild(U.el("div", { class: "wp-label", text: "默认" }));
    defaultWp.addEventListener("click", async () => {
      await State.set("wallpaper", "");
      await State.set("wallpaperMode", "default");
      _remount(container);
    });
    wpPicker.appendChild(defaultWp);
    // 上传
    const upload = U.el("div", { class: "wp-item", style: { display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-placeholder)" } });
    upload.innerHTML = global.Phone.IconLibrary.get("upload", { size: 24 });
    upload.appendChild(U.el("div", { class: "wp-label", text: "本地上传" }));
    upload.addEventListener("click", () => {
      const inp = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
      document.body.appendChild(inp);
      inp.addEventListener("change", async () => {
        const f = inp.files[0]; if (!f) return;
        const b64 = await U.fileToBase64(f);
        await State.set("wallpaper", b64);
        await State.set("wallpaperMode", "base64");
        inp.remove();
        _remount(container);
      });
      inp.click();
    });
    wpPicker.appendChild(upload);
    // URL
    const urlItem = U.el("div", { class: "wp-item", style: { display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-placeholder)" } });
    urlItem.innerHTML = global.Phone.IconLibrary.get("image", { size: 24 });
    urlItem.appendChild(U.el("div", { class: "wp-label", text: "URL 图床" }));
    urlItem.addEventListener("click", () => _inputUrl(container));
    wpPicker.appendChild(urlItem);
    // 当前自定义预览
    if (currentWp) {
      const cur = U.el("div", { class: "wp-item active", style: { backgroundImage: "url(" + currentWp + ")", backgroundSize: "cover", backgroundPosition: "center" } });
      cur.appendChild(U.el("div", { class: "wp-label", text: "当前" }));
      cur.addEventListener("click", () => {});
      wpPicker.appendChild(cur);
    }
    wpGroup.appendChild(wpPicker);
    content.appendChild(wpGroup);

    // 字号
    content.appendChild(U.el("div", { class: "settings-section-title", text: "字号" }));
    const fontGroup = U.el("div", { class: "settings-group" });
    const fontRow = U.el("div", { class: "settings-row" });
    fontRow.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get("list", { size: 18 }) }));
    fontRow.appendChild(U.el("div", { class: "sr-main" }, [U.el("div", { class: "sr-title", text: "字号大小" })]));
    const fontSize = State.get("fontSize") || "base";
    const segWrap = U.el("div", { class: "segment" });
    [
      { v: "xs", l: "X小" }, { v: "sm", l: "小" }, { v: "base", l: "标准" },
      { v: "md", l: "大" }, { v: "lg", l: "特大" },
    ].forEach((o) => {
      const item = U.el("div", { class: "segment-item" + (fontSize === o.v ? " active" : ""), text: o.l });
      item.addEventListener("click", async () => {
        await State.set("fontSize", o.v);
        segWrap.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        item.classList.add("active");
      });
      segWrap.appendChild(item);
    });
    fontRow.appendChild(segWrap);
    fontGroup.appendChild(fontRow);
    content.appendChild(fontGroup);

    // 桌面布局
    content.appendChild(U.el("div", { class: "settings-section-title", text: "桌面布局" }));
    const layoutGroup = U.el("div", { class: "settings-group" });
    const colsRow = U.el("div", { class: "settings-row" });
    colsRow.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get("grid", { size: 18 }) }));
    colsRow.appendChild(U.el("div", { class: "sr-main" }, [U.el("div", { class: "sr-title", text: "图标列数" })]));
    const colsSeg = U.el("div", { class: "segment" });
    const currentCols = State.get("iconColumns") || 4;
    [3, 4, 5].forEach((n) => {
      const item = U.el("div", { class: "segment-item" + (currentCols === n ? " active" : ""), text: String(n) + " 列" });
      item.addEventListener("click", async () => {
        await State.set("iconColumns", n);
        colsSeg.querySelectorAll(".segment-item").forEach((x) => x.classList.remove("active"));
        item.classList.add("active");
      });
      colsSeg.appendChild(item);
    });
    colsRow.appendChild(colsSeg);
    layoutGroup.appendChild(colsRow);
    content.appendChild(layoutGroup);

    // Dock 栏自定义
    content.appendChild(U.el("div", { class: "settings-section-title", text: "Dock 栏（最多 4 个）" }));
    const dockGroup = U.el("div", { class: "settings-group" });
    const dockEditor = U.el("div", { class: "dock-editor" });
    const dockApps = (await State.get("dockApps")) || ["chat", "settings", "characters", "worldbook"];
    const allApps = global.Phone.AppRegistry.list();
    for (let i = 0; i < 4; i++) {
      const slot = _dockSlot(i, dockApps[i], allApps, dockApps, async (newId) => {
        if (newId === null) { dockApps[i] = null; }
        else dockApps[i] = newId;
        const next = dockApps.filter(Boolean);
        await State.set("dockApps", next);
        _remount(container);
      });
      dockEditor.appendChild(slot);
    }
    dockGroup.appendChild(dockEditor);
    content.appendChild(dockGroup);

    // APP 自定义背景
    content.appendChild(U.el("div", { class: "settings-section-title", text: "APP 背景" }));
    const bgGroup = U.el("div", { class: "settings-group" });
    const appBgs = State.get("appBackgrounds") || {};
    const bgApps = global.Phone.AppRegistry.list().filter((a) => a.id !== "settings");
    bgApps.forEach((a) => {
      const row = U.el("div", { class: "settings-row" });
      row.appendChild(U.el("div", { class: "sr-icon", style: { background: "var(--color-primary-ultralight)", color: "var(--color-primary-deep)" }, html: global.Phone.IconLibrary.get(a.icon, { size: 18 }) }));
      row.appendChild(U.el("div", { class: "sr-main" }, [U.el("div", { class: "sr-title", text: a.name })]));
      const val = U.el("div", { class: "sr-right", text: appBgs[a.id] ? "已设置" : "默认", style: { fontSize: "var(--font-xs)", color: appBgs[a.id] ? "var(--color-primary-deep)" : "var(--text-placeholder)" } });
      row.appendChild(val);
      row.addEventListener("click", () => _editAppBg(a, appBgs, container));
      bgGroup.appendChild(row);
    });
    content.appendChild(bgGroup);

    // 系统名
    content.appendChild(U.el("div", { class: "settings-section-title", text: "其他" }));
    const otherGroup = U.el("div", { class: "settings-group" });
    const nameRow = U.el("div", { class: "settings-row" });
    nameRow.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get("info", { size: 18 }) }));
    nameRow.appendChild(U.el("div", { class: "sr-main" }, [U.el("div", { class: "sr-title", text: "系统名字" })]));
    const nameVal = U.el("div", { class: "sr-right", text: State.get("systemName") || "小手机" });
    nameRow.appendChild(nameVal);
    nameRow.addEventListener("click", () => _editName(container));
    otherGroup.appendChild(nameRow);
    content.appendChild(otherGroup);

    page.appendChild(content);
    container.appendChild(page);
  }

  function _dockSlot(idx, appId, allApps, currentDock, onChange) {
    const U = global.Phone.Utils;
    const slot = U.el("div", { class: "dock-slot" + (appId ? " filled" : "") });
    if (appId) {
      const spec = allApps.find((a) => a.id === appId);
      if (spec) {
        slot.innerHTML = '<div class="ds-icon">' + global.Phone.IconLibrary.get(spec.icon, { size: 24 }) + '</div>';
        slot.appendChild(U.el("div", { class: "ds-name", text: spec.name }));
      }
      const clear = U.el("button", { class: "ds-clear", text: "×" });
      clear.addEventListener("click", (e) => { e.stopPropagation(); onChange(null); });
      slot.appendChild(clear);
    } else {
      slot.innerHTML = '<div class="ds-icon">' + global.Phone.IconLibrary.get("plus", { size: 24 }) + '</div>';
    }
    slot.addEventListener("click", () => _pickAppForDock(allApps, currentDock, (id) => onChange(id)));
    return slot;
  }

  function _pickAppForDock(allApps, currentDock, onPick) {
    const U = global.Phone.Utils;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "选择 APP" }));
    const list = U.el("div", { class: "new-chat-list", style: { maxHeight: "40vh", overflowY: "auto" } });
    allApps.forEach((a) => {
      const item = U.el("div", { class: "list-item" }, [
        U.el("div", { class: "li-avatar", style: { background: "var(--color-primary-ultralight)", color: "var(--color-primary-deep)" }, html: global.Phone.IconLibrary.get(a.icon, { size: 18 }) }),
        U.el("div", { class: "li-main" }, [U.el("div", { class: "li-title", text: a.name })])
      ]);
      item.addEventListener("click", () => { onPick(a.id); mask.remove(); });
      list.appendChild(item);
    });
    modal.appendChild(list);
    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() })
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  function _inputUrl(container) {
    const U = global.Phone.Utils;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "输入壁纸 URL" }));
    const input = U.el("input", { class: "input", placeholder: "https://...", style: { marginTop: "8px" } });
    modal.appendChild(input);
    modal.appendChild(U.el("div", { class: "form-hint", text: "建议使用图床直链，不占本地存储" }));
    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "确定", onclick: async () => {
        const v = input.value.trim();
        if (!v) return;
        await global.Phone.State.set("wallpaper", v);
        await global.Phone.State.set("wallpaperMode", "url");
        mask.remove();
        _remount(container);
      }})
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  function _editAppBg(app, appBgs, container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;
    const cur = appBgs[app.id] || "";

    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal", style: { maxWidth: "460px" } });
    modal.appendChild(U.el("div", { class: "modal-title", text: app.name + " 的背景" }));

    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });

    // 当前值预览
    const preview = U.el("div", { class: "app-bg-preview", style: {
      height: "80px", borderRadius: "var(--radius-md)", marginBottom: "12px",
      background: cur || "var(--bg-surface-2)",
      border: "1px solid var(--border-soft)",
    } });
    body.appendChild(preview);

    // 纯色 / 渐变输入
    body.appendChild(U.el("div", { class: "form-label", text: "纯色或渐变（CSS background 值）" }));
    const cssInput = U.el("input", { class: "input", placeholder: "如 #FFF8E7 或 linear-gradient(...)", value: cur });
    cssInput.addEventListener("input", () => { preview.style.background = cssInput.value || "var(--bg-surface-2)"; });
    body.appendChild(cssInput);

    // 预设色板
    body.appendChild(U.el("div", { class: "form-label", text: "快速选色", style: { marginTop: "10px" } }));
    const swatchRow = U.el("div", { class: "row gap-8", style: { flexWrap: "wrap" } });
    const PRESETS = [
      { name: "奶黄", v: "linear-gradient(135deg, #FFF8E7, #FFE8B0)" },
      { name: "粉色", v: "linear-gradient(135deg, #FFE4E1, #FFC0CB)" },
      { name: "天蓝", v: "linear-gradient(135deg, #E0F0FF, #B0D8FF)" },
      { name: "薄荷", v: "linear-gradient(135deg, #E8F5E9, #B8E6C1)" },
      { name: "淡紫", v: "linear-gradient(135deg, #F3E8FF, #D8B8FF)" },
      { name: "暖白", v: "#FFFCF5" },
      { name: "深灰", v: "#2A2A2A" },
    ];
    PRESETS.forEach((p) => {
      const sw = U.el("div", { class: "color-swatch", style: {
        width: "32px", height: "32px", borderRadius: "var(--radius-full)",
        background: p.v, cursor: "pointer", border: "2px solid var(--border-soft)",
      }, title: p.name });
      sw.addEventListener("click", () => {
        cssInput.value = p.v;
        preview.style.background = p.v;
      });
      swatchRow.appendChild(sw);
    });
    body.appendChild(swatchRow);

    // 上传图片（存 base64，限制 1.5MB）
    body.appendChild(U.el("div", { class: "form-label", text: "或上传背景图", style: { marginTop: "10px" } }));
    const uploadBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "选择图片" });
    uploadBtn.addEventListener("click", () => {
      const inp = U.el("input", { type: "file", accept: "image/*", style: { display: "none" } });
      document.body.appendChild(inp);
      inp.addEventListener("change", () => {
        const f = inp.files[0]; if (!f) return;
        if (f.size > 1.5 * 1024 * 1024) {
          global.Phone.Modal.alert({ title: "图片太大", message: "建议小于 1.5MB" });
          inp.remove(); return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          cssInput.value = "url(" + reader.result + ") center/cover";
          preview.style.background = cssInput.value;
          inp.remove();
        };
        reader.onerror = () => { global.Phone.Notify.push({ appId: "settings", title: "读取失败" }); inp.remove(); };
        reader.readAsDataURL(f);
      });
      inp.click();
    });
    body.appendChild(uploadBtn);

    modal.appendChild(body);

    modal.appendChild(U.el("div", { class: "modal-actions", style: { flexDirection: "column", gap: "6px" } }, [
      U.el("button", { class: "btn btn-text btn-sm", text: "恢复默认", onclick: async () => {
        const next = Object.assign({}, appBgs); delete next[app.id];
        await State.set("appBackgrounds", next);
        mask.remove(); _remount(container);
      }}),
      U.el("div", { class: "row gap-8", style: { width: "100%" } }, [
        U.el("button", { class: "btn btn-ghost", text: "取消", style: { flex: "1" }, onclick: () => mask.remove() }),
        U.el("button", { class: "btn", text: "保存", style: { flex: "1" }, onclick: async () => {
          const v = cssInput.value.trim();
          const next = Object.assign({}, appBgs);
          if (v) next[app.id] = v; else delete next[app.id];
          await State.set("appBackgrounds", next);
          global.Phone.Notify.push({ appId: "settings", title: "已应用" });
          mask.remove(); _remount(container);
        }}),
      ]),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  function _editName(container) {
    const U = global.Phone.Utils;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "系统名字" }));
    const input = U.el("input", { class: "input", placeholder: "小手机", value: global.Phone.State.get("systemName") || "" });
    modal.appendChild(input);
    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "保存", onclick: async () => {
        await global.Phone.State.set("systemName", input.value.trim() || "小手机");
        mask.remove();
        _remount(container);
      }})
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  function _nav(title, container) {
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
  global.Phone.Personalization = { mount };
})(window);
