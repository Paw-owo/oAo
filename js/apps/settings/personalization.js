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

    // ---------- 小组件背景 ----------
    content.appendChild(U.el("div", { class: "settings-section-title", text: "小组件背景" }));
    const widgetGroup = U.el("div", { class: "settings-group" });
    const widgetBg = State.get("widgetBackground") || "";
    const widgetRow = U.el("div", { class: "settings-row" });
    widgetRow.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get("grid", { size: 18 }) }));
    widgetRow.appendChild(U.el("div", { class: "sr-main" }, [
      U.el("div", { class: "sr-title", text: "桌面小组件背景" }),
      U.el("div", { class: "sr-sub", text: widgetBg ? "已自定义" : "默认（毛玻璃）", style: { fontSize: "var(--font-xs)", color: widgetBg ? "var(--color-primary-deep)" : "var(--text-placeholder)" } }),
    ]));
    widgetRow.appendChild(U.el("div", { class: "sr-right" }, [U.el("span", { class: "chevron", html: global.Phone.IconLibrary.get("chevron-right", { size: 18 }) })]));
    widgetRow.addEventListener("click", () => _editSurfaceBg("widgetBackground", "小组件背景", widgetBg, container));
    widgetGroup.appendChild(widgetRow);
    content.appendChild(widgetGroup);

    // ---------- Dock 栏背景 ----------
    content.appendChild(U.el("div", { class: "settings-section-title", text: "Dock 栏背景" }));
    const dockBgGroup = U.el("div", { class: "settings-group" });
    const dockBg = State.get("dockBackground") || "";
    const dockRow = U.el("div", { class: "settings-row" });
    dockRow.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get("list", { size: 18 }) }));
    dockRow.appendChild(U.el("div", { class: "sr-main" }, [
      U.el("div", { class: "sr-title", text: "底部 Dock 背景" }),
      U.el("div", { class: "sr-sub", text: dockBg ? "已自定义" : "默认（毛玻璃）", style: { fontSize: "var(--font-xs)", color: dockBg ? "var(--color-primary-deep)" : "var(--text-placeholder)" } }),
    ]));
    dockRow.appendChild(U.el("div", { class: "sr-right" }, [U.el("span", { class: "chevron", html: global.Phone.IconLibrary.get("chevron-right", { size: 18 }) })]));
    dockRow.addEventListener("click", () => _editSurfaceBg("dockBackground", "Dock 栏背景", dockBg, container));
    dockBgGroup.appendChild(dockRow);
    content.appendChild(dockBgGroup);

    // ---------- 强调色覆盖 ----------
    content.appendChild(U.el("div", { class: "settings-section-title", text: "强调色" }));
    const accentGroup = U.el("div", { class: "settings-group", style: { padding: "16px" } });
    const accentColor = State.get("accentColor") || "";
    const accentHint = U.el("div", { class: "form-hint", text: accentColor ? "已自定义强调色" : "跟随主题默认色", style: { marginBottom: "10px" } });
    accentGroup.appendChild(accentHint);
    const accentSwatches = U.el("div", { class: "row gap-8", style: { flexWrap: "wrap" } });
    const ACCENT_PRESETS = [
      { name: "默认", v: "" },
      { name: "蜜桃粉", v: "#F38BA0" },
      { name: "薰衣紫", v: "#C792EA" },
      { name: "海盐蓝", v: "#6FB5F0" },
      { name: "薄荷绿", v: "#8AC9B4" },
      { name: "柠檬黄", v: "#F5B945" },
      { name: "焦糖橙", v: "#E8915A" },
      { name: "玫瑰红", v: "#E8506E" },
    ];
    ACCENT_PRESETS.forEach((p) => {
      const sw = U.el("div", { class: "color-swatch", style: {
        width: "36px", height: "36px", borderRadius: "var(--radius-full)",
        background: p.v || "linear-gradient(135deg, #FFC4D2, #C792EA)",
        cursor: "pointer", border: accentColor === p.v ? "3px solid var(--color-primary-deep)" : "2px solid var(--border-soft)",
      }, title: p.name });
      sw.addEventListener("click", async () => {
        await State.set("accentColor", p.v);
        _remount(container);
      });
      accentSwatches.appendChild(sw);
    });
    accentGroup.appendChild(accentSwatches);
    content.appendChild(accentGroup);

    // ---------- 图标圆角 ----------
    content.appendChild(U.el("div", { class: "settings-section-title", text: "图标圆角" }));
    const radiusGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } });
    const iconRadius = State.get("iconRadius") || "md";
    const radiusSeg = U.el("div", { class: "segment", style: { display: "flex" } });
    [
      { v: "sm", l: "小" }, { v: "md", l: "中" }, { v: "lg", l: "大" }, { v: "full", l: "圆形" },
    ].forEach((o) => {
      const node = U.el("div", { class: "segment-item" + (iconRadius === o.v ? " active" : ""), text: o.l });
      node.addEventListener("click", async () => {
        await State.set("iconRadius", o.v);
        radiusSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
      });
      radiusSeg.appendChild(node);
    });
    radiusGroup.appendChild(radiusSeg);
    content.appendChild(radiusGroup);

    // ---------- 气泡圆角 ----------
    content.appendChild(U.el("div", { class: "settings-section-title", text: "聊天气泡圆角" }));
    const bubbleGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } });
    const bubbleRadius = State.get("bubbleRadius") || "md";
    const bubbleSeg = U.el("div", { class: "segment", style: { display: "flex" } });
    [
      { v: "sm", l: "小" }, { v: "md", l: "中" }, { v: "lg", l: "大" },
    ].forEach((o) => {
      const node = U.el("div", { class: "segment-item" + (bubbleRadius === o.v ? " active" : ""), text: o.l });
      node.addEventListener("click", async () => {
        await State.set("bubbleRadius", o.v);
        bubbleSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
      });
      bubbleSeg.appendChild(node);
    });
    bubbleGroup.appendChild(bubbleSeg);
    content.appendChild(bubbleGroup);

    // ---------- APP 图标自定义 ----------
    content.appendChild(U.el("div", { class: "settings-section-title", text: "APP 图标自定义" }));
    content.appendChild(U.el("div", { class: "form-hint", text: "为每个 APP 单独设置图标颜色或图片", style: { padding: "0 16px 8px" } }));
    const iconGroup = U.el("div", { class: "settings-group" });
    const iconStyles = State.get("appIconStyles") || {};
    bgApps.forEach((a) => {
      const row = U.el("div", { class: "settings-row" });
      const s = iconStyles[a.id] || {};
      row.appendChild(U.el("div", { class: "sr-icon", style: s.bg ? { background: s.bg } : {}, html: s.image ? '<img src="' + s.image + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/>' : global.Phone.IconLibrary.get(a.icon, { size: 18 }) }));
      row.appendChild(U.el("div", { class: "sr-main" }, [
        U.el("div", { class: "sr-title", text: a.name }),
        U.el("div", { class: "sr-sub", text: s.bg || s.image ? "已自定义" : "默认", style: { fontSize: "var(--font-xs)", color: s.bg || s.image ? "var(--color-primary-deep)" : "var(--text-placeholder)" } }),
      ]));
      row.appendChild(U.el("div", { class: "sr-right" }, [U.el("span", { class: "chevron", html: global.Phone.IconLibrary.get("chevron-right", { size: 18 }) })]));
      row.addEventListener("click", () => _editIconStyle(a, iconStyles, container));
      iconGroup.appendChild(row);
    });
    content.appendChild(iconGroup);

    // 我的资料（让 AI 知道我是谁）
    content.appendChild(U.el("div", { class: "settings-section-title", text: "我的资料" }));
    content.appendChild(U.el("div", { class: "form-hint", text: "这些信息 AI 会知道，让 TA 更懂你", style: { marginBottom: "8px" } }));
    const profGroup = U.el("div", { class: "settings-group" });
    const uName = State.get("userName") || "";
    const uNick = State.get("userNickname") || "";
    const uGender = State.get("userGender") || "";

    const nameRow = U.el("div", { class: "settings-row" });
    nameRow.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get("user", { size: 18 }) }));
    nameRow.appendChild(U.el("div", { class: "sr-main" }, [
      U.el("div", { class: "sr-title", text: "我的名字" }),
      U.el("div", { class: "sr-sub", text: uName || "未设置", style: { fontSize: "var(--font-xs)", color: "var(--text-placeholder)" } }),
    ]));
    nameRow.addEventListener("click", () => _editProfileField("userName", "我的名字", "请输入你的名字", container));
    profGroup.appendChild(nameRow);

    const nickRow = U.el("div", { class: "settings-row" });
    nickRow.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get("heart", { size: 18 }) }));
    nickRow.appendChild(U.el("div", { class: "sr-main" }, [
      U.el("div", { class: "sr-title", text: "希望被叫什么" }),
      U.el("div", { class: "sr-sub", text: uNick || "未设置", style: { fontSize: "var(--font-xs)", color: "var(--text-placeholder)" } }),
    ]));
    nickRow.addEventListener("click", () => _editProfileField("userNickname", "希望被叫什么", "AI 会这样称呼你", container));
    profGroup.appendChild(nickRow);

    const genderRow = U.el("div", { class: "settings-row" });
    genderRow.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get("users", { size: 18 }) }));
    genderRow.appendChild(U.el("div", { class: "sr-main" }, [
      U.el("div", { class: "sr-title", text: "性别偏好" }),
      U.el("div", { class: "sr-sub", text: uGender || "未设置", style: { fontSize: "var(--font-xs)", color: "var(--text-placeholder)" } }),
    ]));
    genderRow.addEventListener("click", () => _editGender(container));
    profGroup.appendChild(genderRow);
    content.appendChild(profGroup);

    // 系统名
    content.appendChild(U.el("div", { class: "settings-section-title", text: "其他" }));
    const otherGroup = U.el("div", { class: "settings-group" });
    const sysNameRow = U.el("div", { class: "settings-row" });
    sysNameRow.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get("info", { size: 18 }) }));
    sysNameRow.appendChild(U.el("div", { class: "sr-main" }, [U.el("div", { class: "sr-title", text: "系统名字" })]));
    const nameVal = U.el("div", { class: "sr-right", text: State.get("systemName") || "小手机" });
    sysNameRow.appendChild(nameVal);
    sysNameRow.addEventListener("click", () => _editName(container));
    otherGroup.appendChild(sysNameRow);
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

  function _editProfileField(key, title, placeholder, container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;
    global.Phone.Modal.prompt({
      title: title,
      message: placeholder,
      defaultValue: State.get(key) || "",
      placeholder: placeholder,
    }).then(async (val) => {
      if (val === null) return;
      await State.set(key, val.trim());
      global.Phone.Notify.push({ appId: "settings", title: "已保存" });
      _remount(container);
    });
  }

  function _editGender(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;
    const cur = State.get("userGender") || "";
    global.Phone.Modal.prompt({
      title: "性别偏好",
      message: "如：女生 / 男生 / 不想说，或自定义",
      defaultValue: cur,
      placeholder: "留空表示不设置",
    }).then(async (val) => {
      if (val === null) return;
      await State.set("userGender", val.trim());
      _remount(container);
    });
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

  // 通用：编辑某个界面的背景（小组件 / Dock 栏 / 任意界面）
  function _editSurfaceBg(stateKey, title, curVal, container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;
    const cur = curVal || "";

    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal", style: { maxWidth: "460px" } });
    modal.appendChild(U.el("div", { class: "modal-title", text: title }));

    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });

    // 预览
    const preview = U.el("div", { class: "app-bg-preview", style: {
      height: "80px", borderRadius: "var(--radius-md)", marginBottom: "12px",
      background: cur || "var(--bg-surface-2)",
      border: "1px solid var(--border-soft)",
    } });
    body.appendChild(preview);

    body.appendChild(U.el("div", { class: "form-label", text: "纯色或渐变（CSS background 值）" }));
    const cssInput = U.el("input", { class: "input", placeholder: "如 #FFF8E7 或 linear-gradient(...)", value: cur });
    cssInput.addEventListener("input", () => { preview.style.background = cssInput.value || "var(--bg-surface-2)"; });
    body.appendChild(cssInput);

    body.appendChild(U.el("div", { class: "form-label", text: "快速选色", style: { marginTop: "10px" } }));
    const swatchRow = U.el("div", { class: "row gap-8", style: { flexWrap: "wrap" } });
    const PRESETS = [
      { name: "毛玻璃", v: "rgba(255,253,250,0.78)" },
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
        await State.set(stateKey, "");
        mask.remove(); _remount(container);
      }}),
      U.el("div", { class: "row gap-8", style: { width: "100%" } }, [
        U.el("button", { class: "btn btn-ghost", text: "取消", style: { flex: "1" }, onclick: () => mask.remove() }),
        U.el("button", { class: "btn", text: "保存", style: { flex: "1" }, onclick: async () => {
          const v = cssInput.value.trim();
          await State.set(stateKey, v);
          global.Phone.Notify.push({ appId: "settings", title: "已应用" });
          mask.remove(); _remount(container);
        }}),
      ]),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // 编辑单个 APP 图标的样式（颜色 / 图片）
  function _editIconStyle(app, iconStyles, container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;
    const cur = iconStyles[app.id] || {};

    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal", style: { maxWidth: "460px" } });
    modal.appendChild(U.el("div", { class: "modal-title", text: app.name + " 图标" }));

    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });

    // 预览（按当前图标形状）
    const previewBox = U.el("div", { class: "ai-box", style: {
      width: "60px", height: "60px", borderRadius: "var(--radius-lg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      margin: "0 auto 12px", background: cur.bg || "var(--bg-surface)",
      color: cur.color || "var(--color-primary)",
      backgroundImage: cur.image ? "url(" + cur.image + ")" : "none",
      backgroundSize: "cover", backgroundPosition: "center",
      boxShadow: "var(--shadow-neu-out)",
    } });
    if (!cur.image) previewBox.innerHTML = global.Phone.IconLibrary.get(app.icon, { size: 32 });
    body.appendChild(previewBox);

    // 图标底色
    body.appendChild(U.el("div", { class: "form-label", text: "图标底色" }));
    const bgInput = U.el("input", { class: "input", placeholder: "如 #FFE8B0 或渐变", value: cur.bg || "" });
    bgInput.addEventListener("input", () => {
      previewBox.style.background = bgInput.value || "var(--bg-surface)";
      previewBox.style.backgroundImage = cur.image ? "url(" + cur.image + ")" : "none";
      previewBox.style.backgroundSize = "cover";
    });
    body.appendChild(bgInput);

    // 图标线条颜色
    body.appendChild(U.el("div", { class: "form-label", text: "图标线条颜色", style: { marginTop: "10px" } }));
    const colorInput = U.el("input", { class: "input", placeholder: "如 #D8971E", value: cur.color || "" });
    colorInput.addEventListener("input", () => {
      previewBox.style.color = colorInput.value || "var(--color-primary)";
    });
    body.appendChild(colorInput);

    // 预设色板（同时设置底色 + 线条色）
    body.appendChild(U.el("div", { class: "form-label", text: "快速配色", style: { marginTop: "10px" } }));
    const swatchRow = U.el("div", { class: "row gap-8", style: { flexWrap: "wrap" } });
    const PRESETS = [
      { name: "奶黄", bg: "linear-gradient(135deg, #FFF3D6, #FFD66E)", color: "#D8971E" },
      { name: "粉色", bg: "linear-gradient(135deg, #FFE7EC, #FFA8B9)", color: "#D85F78" },
      { name: "天蓝", bg: "linear-gradient(135deg, #E0F0FF, #94C8F5)", color: "#3B8AD6" },
      { name: "薄荷", bg: "linear-gradient(135deg, #E0F0E8, #8AC9B4)", color: "#4A8A75" },
      { name: "淡紫", bg: "linear-gradient(135deg, #F3E2FA, #C792EA)", color: "#7B4FA8" },
      { name: "暖白", bg: "#FFFCF5", color: "#8A7656" },
      { name: "深灰", bg: "#2A2A2A", color: "#FFFFFF" },
    ];
    PRESETS.forEach((p) => {
      const sw = U.el("div", { class: "color-swatch", style: {
        width: "32px", height: "32px", borderRadius: "var(--radius-full)",
        background: p.bg, cursor: "pointer", border: "2px solid var(--border-soft)",
      }, title: p.name });
      sw.addEventListener("click", () => {
        bgInput.value = p.bg;
        colorInput.value = p.color;
        previewBox.style.background = p.bg;
        previewBox.style.color = p.color;
        previewBox.style.backgroundImage = "none";
        if (!previewBox.innerHTML) previewBox.innerHTML = global.Phone.IconLibrary.get(app.icon, { size: 32 });
      });
      swatchRow.appendChild(sw);
    });
    body.appendChild(swatchRow);

    // 上传图片作为图标
    body.appendChild(U.el("div", { class: "form-label", text: "或上传图片作为图标", style: { marginTop: "10px" } }));
    const uploadBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "选择图片" });
    uploadBtn.addEventListener("click", () => {
      const inp = U.el("input", { type: "file", accept: "image/*", style: { display: "none" } });
      document.body.appendChild(inp);
      inp.addEventListener("change", () => {
        const f = inp.files[0]; if (!f) return;
        if (f.size > 1 * 1024 * 1024) {
          global.Phone.Modal.alert({ title: "图片太大", message: "图标建议小于 1MB" });
          inp.remove(); return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          cur.image = reader.result;
          previewBox.style.backgroundImage = "url(" + reader.result + ")";
          previewBox.style.backgroundSize = "cover";
          previewBox.style.backgroundPosition = "center";
          previewBox.innerHTML = "";
          inp.remove();
        };
        reader.readAsDataURL(f);
      });
      inp.click();
    });
    body.appendChild(uploadBtn);

    modal.appendChild(body);

    modal.appendChild(U.el("div", { class: "modal-actions", style: { flexDirection: "column", gap: "6px" } }, [
      U.el("button", { class: "btn btn-text btn-sm", text: "恢复默认", onclick: async () => {
        const next = Object.assign({}, iconStyles); delete next[app.id];
        await State.set("appIconStyles", next);
        mask.remove(); _remount(container);
      }}),
      U.el("div", { class: "row gap-8", style: { width: "100%" } }, [
        U.el("button", { class: "btn btn-ghost", text: "取消", style: { flex: "1" }, onclick: () => mask.remove() }),
        U.el("button", { class: "btn", text: "保存", style: { flex: "1" }, onclick: async () => {
          const next = Object.assign({}, iconStyles);
          const bg = bgInput.value.trim();
          const color = colorInput.value.trim();
          const image = cur.image || "";
          if (bg || color || image) {
            next[app.id] = {};
            if (bg) next[app.id].bg = bg;
            if (color) next[app.id].color = color;
            if (image) next[app.id].image = image;
          } else {
            delete next[app.id];
          }
          await State.set("appIconStyles", next);
          global.Phone.Notify.push({ appId: "settings", title: "图标已更新" });
          mask.remove(); _remount(container);
        }}),
      ]),
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
