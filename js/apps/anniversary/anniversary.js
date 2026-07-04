/* ============================================================
   anniversary.js — 周年纪念 APP（专业版）
   对齐参考：倒数日 (Days Matter) / 纪念日大全 / Apple Calendar
   功能：
     - 类型分类：生日 / 恋爱 / 结婚 / 考试 / 旅行 / 工作 / 普通
     - 每个纪念日可选图标 + 颜色 + 封面
     - 倒计时 / 已过天数 / 已陪伴天数
     - 重复：每年 / 一次性
     - 提前 N 天提醒（启动时检查）
     - 置顶 / 搜索 / 多维度筛选 / 多种排序
     - 统计概览：总数 / 本月 / 今日 / 已过
     - 模板快捷创建
     - 设置页：默认排序 / 默认提醒 / 默认类型 / 阈值 / 清空 / 导出
   挂在 window.Phone.Anniversary
   main.js 启动时会调 checkDue() 检查临近纪念日
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  // 类型库
  const TYPES = [
    { v: "birthday",  l: "生日",   icon: "cake",     color: "#E8846B" },
    { v: "love",      l: "恋爱",   icon: "heart",    color: "#E8869B" },
    { v: "wedding",   l: "结婚",   icon: "gift",     color: "#C9A36B" },
    { v: "exam",      l: "考试",   icon: "edit",     color: "#7BB5D6" },
    { v: "travel",    l: "旅行",   icon: "car",      color: "#8BC28A" },
    { v: "work",      l: "工作",   icon: "bag",      color: "#9B7EBD" },
    { v: "other",     l: "普通",   icon: "calendar", color: "#A8A8A8" },
  ];

  // 模板
  const TEMPLATES = [
    { tpl: "生日",   type: "birthday", title: "TA的生日",     repeat: "yearly", remindDays: 3 },
    { tpl: "在一起", type: "love",     title: "在一起纪念日", repeat: "yearly", remindDays: 1 },
    { tpl: "结婚",   type: "wedding",  title: "结婚纪念日",   repeat: "yearly", remindDays: 7 },
    { tpl: "考试",   type: "exam",     title: "重要考试",     repeat: "once",   remindDays: 7 },
    { tpl: "旅行",   type: "travel",   title: "旅行出发",     repeat: "once",   remindDays: 1 },
    { tpl: "面试",   type: "work",     title: "面试",         repeat: "once",   remindDays: 1 },
  ];

  global.Phone.AppRegistry.register({
    id: "anniversary",
    name: "周年纪念",
    icon: "app-anniversary",
    entry: () => open(),
    events: ["anniversary_due", "anniversary_created"],
    settings: [],
    order: 51,
  });

  function open() { global.Phone.Router.push("anniversary", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "anniversary");
    }
    page.appendChild(_nav(U, "周年纪念",
      () => _edit(U, null, () => _remount(container)),
      () => _openSettings(U, () => _remount(container))));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // ---------- 统计概览 ----------
    const all = await Storage.getAll("anniversaries");
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const total = all.length;
    const todayCount = all.filter((a) => {
      const n = _nextDate(a);
      const d = new Date(n); d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    }).length;
    const monthCount = all.filter((a) => {
      const n = _nextDate(a);
      const d = new Date(n);
      return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }).length;
    const passedCount = all.filter((a) => _nextDate(a) < now).length;
    content.appendChild(U.el("div", { class: "anni-stats-bar" }, [
      U.el("div", { class: "asb-card" }, [
        U.el("div", { class: "asb-num", text: String(total) }),
        U.el("div", { class: "asb-label", text: "全部" }),
      ]),
      U.el("div", { class: "asb-card" + (monthCount > 0 ? " highlight" : "") }, [
        U.el("div", { class: "asb-num", text: String(monthCount) }),
        U.el("div", { class: "asb-label", text: "本月" }),
      ]),
      U.el("div", { class: "asb-card" + (todayCount > 0 ? " today" : "") }, [
        U.el("div", { class: "asb-num", text: String(todayCount) }),
        U.el("div", { class: "asb-label", text: "今日" }),
      ]),
      U.el("div", { class: "asb-card" }, [
        U.el("div", { class: "asb-num", text: String(passedCount) }),
        U.el("div", { class: "asb-label", text: "已过" }),
      ]),
    ]));

    // ---------- 搜索 ----------
    const search = U.el("input", { class: "input", placeholder: "搜索纪念日...", style: { marginBottom: "12px" } });
    content.appendChild(search);

    // ---------- 筛选 segment ----------
    const filterSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "8px", overflowX: "auto" } });
    const filters = [
      { v: "upcoming", l: "即将" },
      { v: "today", l: "今日" },
      { v: "month", l: "本月" },
      { v: "past", l: "已过" },
      { v: "all", l: "全部" },
    ];
    let curFilter = State.get("anniversaryDefaultSort") ? "upcoming" : "upcoming";
    const listWrap = U.el("div", {});

    // ---------- 排序 ----------
    const sortWrap = U.el("div", { class: "row", style: { justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } });
    const sortLabel = U.el("div", { class: "muted", text: "排序：", style: { fontSize: "var(--font-xs)" } });
    const sortSelect = U.el("select", { class: "input", style: { width: "auto", fontSize: "var(--font-xs)" } });
    const curSort = State.get("anniversaryDefaultSort") || "soon";
    [
      { v: "soon", l: "最近到来" },
      { v: "created", l: "创建时间" },
      { v: "title", l: "标题" },
      { v: "type", l: "类型" },
      { v: "date", l: "原始日期" },
    ].forEach((o) => {
      const opt = U.el("option", { value: o.v, text: o.l });
      if (curSort === o.v) opt.selected = true;
      sortSelect.appendChild(opt);
    });
    sortWrap.appendChild(sortLabel);
    sortWrap.appendChild(sortSelect);
    content.appendChild(sortWrap);
    sortSelect.addEventListener("change", async () => {
      await State.set("anniversaryDefaultSort", sortSelect.value);
      _load();
    });

    async function _load() {
      let list = await Storage.getAll("anniversaries");
      const kw = search.value.trim().toLowerCase();
      if (kw) {
        list = list.filter((a) =>
          (a.title || "").toLowerCase().includes(kw) ||
          (a.description || "").toLowerCase().includes(kw) ||
          (a.type || "").toLowerCase().includes(kw)
        );
      }
      const showPassed = State.get("anniversaryShowPassed") !== false;
      if (curFilter === "upcoming") list = list.filter((a) => _nextDate(a) >= now);
      else if (curFilter === "today") list = list.filter((a) => {
        const d = new Date(_nextDate(a)); d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      });
      else if (curFilter === "month") list = list.filter((a) => {
        const d = new Date(_nextDate(a));
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      });
      else if (curFilter === "past") list = list.filter((a) => _nextDate(a) < now);
      else if (!showPassed) list = list.filter((a) => _nextDate(a) >= now);

      // 排序
      const sort = sortSelect.value;
      list.sort((a, b) => {
        if (!!b.pinned - !!a.pinned !== 0) return (!!b.pinned ? 1 : 0) - (!!a.pinned ? 1 : 0);
        if (sort === "created") return (b.createdAt || 0) - (a.createdAt || 0);
        if (sort === "title") return (a.title || "").localeCompare(b.title || "");
        if (sort === "type") return (a.type || "other").localeCompare(b.type || "other");
        if (sort === "date") {
          const ta = new Date(a.date + "T00:00:00").getTime();
          const tb = new Date(b.date + "T00:00:00").getTime();
          return ta - tb;
        }
        // soon = 最近到来（已过的排到最后）
        const na = _nextDate(a), nb = _nextDate(b);
        const aUp = na >= now ? 0 : 1;
        const bUp = nb >= now ? 0 : 1;
        if (aUp !== bUp) return aUp - bUp;
        return na - nb;
      });

      U.empty(listWrap);
      if (list.length === 0) {
        listWrap.appendChild(_empty(U, kw ? "没找到相关纪念日" : "还没有纪念日", kw ? "换个关键词试试" : "点右上角加一个吧~"));
        return;
      }
      list.forEach((a) => listWrap.appendChild(_card(U, a, now, () => _load(), () => _edit(U, a, () => _load()))));
    }

    filters.forEach((f) => {
      const node = U.el("div", { class: "segment-item" + (curFilter === f.v ? " active" : ""), text: f.l });
      node.addEventListener("click", () => {
        curFilter = f.v;
        filterSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
        _load();
      });
      filterSeg.appendChild(node);
    });
    content.appendChild(filterSeg);

    search.addEventListener("input", global.Phone.Utils.debounce(_load, 200));
    content.appendChild(listWrap);
    _load();

    page.appendChild(content);
    container.appendChild(page);
  }

  // ---------- 卡片 ----------
  function _card(U, a, now, onReload, onEdit) {
    const next = _nextDate(a);
    const isUpcoming = next >= now;
    const days = Math.floor(Math.abs(next - now) / 86400000);
    const firstTs = a.date ? new Date(a.date + "T00:00:00").getTime() : 0;
    const passedDays = firstTs > 0 ? Math.max(0, Math.floor((now - firstTs) / 86400000)) : 0;
    const type = TYPES.find((t) => t.v === (a.type || "other")) || TYPES[TYPES.length - 1];

    const card = U.el("div", {
      class: "an-card" + (isUpcoming ? " upcoming" : " past") + (a.pinned ? " pinned" : ""),
      style: { borderLeftColor: type.color },
    });
    if (a.cover) {
      card.style.backgroundImage = "url(" + a.cover + ")";
      card.style.backgroundSize = "cover";
      card.style.backgroundPosition = "center";
      card.classList.add("has-cover");
    }

    const body = U.el("div", { class: "an-body" });

    // 头部：图标 + 类型 + 标题 + 置顶/编辑/删除
    body.appendChild(U.el("div", { class: "an-head" }, [
      U.el("div", { class: "an-type-icon", style: { background: type.color + "22", color: type.color }, html: global.Phone.IconLibrary.get(type.icon, { size: 18 }) }),
      U.el("div", { class: "an-main" }, [
        U.el("div", { class: "an-title", text: a.title || "（无标题）" }),
        U.el("div", { class: "an-meta" }, [
          U.el("span", { class: "an-type-tag", text: type.l, style: { background: type.color + "22", color: type.color } }),
          U.el("span", { class: "an-date", text: (a.date || "") + (a.repeat === "yearly" ? " · 每年" : " · 一次性") }),
        ]),
      ]),
      U.el("div", { class: "an-ops" }, [
        (() => {
          const b = U.el("button", { class: "icon-btn btn-sm" });
          b.innerHTML = global.Phone.IconLibrary.get(a.pinned ? "pin-fill" : "pin", { size: 14 });
          b.title = a.pinned ? "取消置顶" : "置顶";
          b.addEventListener("click", async (e) => {
            e.stopPropagation();
            a.pinned = !a.pinned;
            a.updatedAt = Date.now();
            await global.Phone.Storage.put("anniversaries", a);
            onReload();
          });
          return b;
        })(),
        (() => {
          const b = U.el("button", { class: "icon-btn btn-sm" });
          b.innerHTML = global.Phone.IconLibrary.get("edit", { size: 14 });
          b.addEventListener("click", (e) => { e.stopPropagation(); onEdit(); });
          return b;
        })(),
        (() => {
          const b = U.el("button", { class: "icon-btn btn-sm" });
          b.innerHTML = global.Phone.IconLibrary.get("trash", { size: 14 });
          b.addEventListener("click", async (e) => {
            e.stopPropagation();
            const ok = await global.Phone.Modal.confirm({
              title: "删除纪念日", message: "删除「" + (a.title || "无标题") + "」？", danger: true, okText: "删除",
            });
            if (!ok) return;
            await global.Phone.Storage.del("anniversaries", a.id);
            global.Phone.Notify.push({ appId: "anniversary", title: "已删除" });
            onReload();
          });
          return b;
        })(),
      ]),
    ]));

    if (a.description) {
      body.appendChild(U.el("div", { class: "an-desc", text: a.description }));
    }

    // 已陪伴天数
    if (passedDays > 0 && a.repeat === "yearly") {
      body.appendChild(U.el("div", { class: "an-passed", text: "已经陪伴 " + passedDays + " 天啦" }));
    }

    // 倒计时
    const cd = U.el("div", { class: "an-countdown" });
    if (isUpcoming) {
      if (days === 0) {
        cd.textContent = "就是今天呀，记得庆祝一下";
        cd.classList.add("today");
      } else if (days <= 3) {
        cd.textContent = "还有 " + days + " 天，要来啦";
        cd.classList.add("near");
      } else {
        cd.textContent = "还有 " + days + " 天";
      }
    } else {
      cd.textContent = "已过 " + days + " 天";
    }
    body.appendChild(cd);

    card.appendChild(body);

    // 长按 600ms 触发编辑
    let pressTimer = null;
    card.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => { onEdit(); pressTimer = null; }, 600);
    });
    card.addEventListener("touchend", () => { if (pressTimer) clearTimeout(pressTimer); });
    card.addEventListener("touchmove", () => { if (pressTimer) clearTimeout(pressTimer); });

    return card;
  }

  // ---------- 编辑/新增 ----------
  function _edit(U, ann, onDone) {
    const State = global.Phone.State;
    const isEdit = !!ann;
    const a = ann || {
      id: global.Phone.Utils.uid("ann"),
      title: "", date: "", description: "", cover: "",
      repeat: State.get("anniversaryDefaultRepeat") || "yearly",
      remindDays: State.get("anniversaryDefaultRemindDays") != null ? State.get("anniversaryDefaultRemindDays") : 1,
      type: State.get("anniversaryDefaultType") || "other",
      pinned: false,
    };

    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: isEdit ? "编辑纪念日" : "新建纪念日" }));

    // 模板快捷
    if (!isEdit) {
      const tmplWrap = U.el("div", { class: "an-tmpl-list" });
      TEMPLATES.forEach((t) => {
        const b = U.el("button", { class: "an-tmpl-chip", text: t.tpl });
        b.addEventListener("click", () => {
          titleIn.value = t.title;
          repeatSel.value = t.repeat;
          remindIn.value = String(t.remindDays);
          _selectType(t.type);
        });
        tmplWrap.appendChild(b);
      });
      modal.appendChild(tmplWrap);
    }

    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });

    // 标题
    body.appendChild(U.el("div", { class: "form-label", text: "标题" }));
    const titleIn = U.el("input", { class: "input", placeholder: "如：在一起第 100 天", value: a.title || "" });
    body.appendChild(titleIn);

    // 日期
    body.appendChild(U.el("div", { class: "form-label", text: "日期", style: { marginTop: "10px" } }));
    const dateIn = U.el("input", { class: "input", type: "date", value: a.date || "" });
    body.appendChild(dateIn);

    // 类型
    body.appendChild(U.el("div", { class: "form-label", text: "类型", style: { marginTop: "10px" } }));
    const typeGrid = U.el("div", { class: "an-type-grid" });
    let curType = a.type || "other";
    function _selectType(v) {
      curType = v;
      typeGrid.querySelectorAll(".an-type-chip").forEach((n) => n.classList.remove("active"));
      const target = typeGrid.querySelector('[data-v="' + v + '"]');
      if (target) target.classList.add("active");
    }
    TYPES.forEach((t) => {
      const chip = U.el("div", {
        class: "an-type-chip" + (curType === t.v ? " active" : ""),
        "data-v": t.v,
        style: { borderColor: curType === t.v ? t.color : "transparent" },
      }, [
        U.el("div", { class: "an-type-icon", style: { background: t.color + "22", color: t.color }, html: global.Phone.IconLibrary.get(t.icon, { size: 16 }) }),
        U.el("div", { class: "an-type-name", text: t.l }),
      ]);
      chip.addEventListener("click", () => _selectType(t.v));
      typeGrid.appendChild(chip);
    });
    body.appendChild(typeGrid);

    // 描述
    body.appendChild(U.el("div", { class: "form-label", text: "描述（可选）", style: { marginTop: "10px" } }));
    const descIn = U.el("textarea", { class: "textarea", placeholder: "写下你想记的话...", style: { minHeight: "60px" } });
    descIn.value = a.description || "";
    body.appendChild(descIn);

    // 重复
    body.appendChild(U.el("div", { class: "form-label", text: "重复", style: { marginTop: "10px" } }));
    const repeatSel = U.el("select", { class: "input" });
    [
      { v: "yearly", t: "每年重复" },
      { v: "once", t: "一次性" },
    ].forEach((o) => {
      const op = U.el("option", { value: o.v, text: o.t });
      if (a.repeat === o.v) op.selected = true;
      repeatSel.appendChild(op);
    });
    body.appendChild(repeatSel);

    // 提前提醒
    body.appendChild(U.el("div", { class: "form-label", text: "提前几天提醒", style: { marginTop: "10px" } }));
    const remindIn = U.el("input", { class: "input", type: "number", min: 0, max: 60, value: String(a.remindDays != null ? a.remindDays : 1) });
    body.appendChild(remindIn);

    // 封面
    body.appendChild(U.el("div", { class: "form-label", text: "封面图（可选）", style: { marginTop: "10px" } }));
    const coverPreview = U.el("div", { class: "an-cover-preview", style: { backgroundImage: a.cover ? "url(" + a.cover + ")" : "none", backgroundColor: a.cover ? "transparent" : "var(--bg-surface-2)" } });
    const coverBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: a.cover ? "更换封面" : "上传封面" });
    const coverInput = U.el("input", { type: "file", accept: "image/*", style: { display: "none" } });
    coverInput.addEventListener("change", () => {
      const f = coverInput.files[0];
      if (!f) return;
      if (f.size > 1.5 * 1024 * 1024) {
        global.Phone.Notify.push({ appId: "anniversary", title: "图片太大啦，请压缩到 1.5MB 以内" });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        a.cover = reader.result;
        coverPreview.style.backgroundImage = "url(" + a.cover + ")";
        coverPreview.style.backgroundColor = "transparent";
      };
      reader.readAsDataURL(f);
    });
    coverBtn.addEventListener("click", () => coverInput.click());
    const clearCoverBtn = U.el("button", { class: "btn btn-text btn-sm", text: "清除封面" });
    clearCoverBtn.addEventListener("click", () => {
      a.cover = "";
      coverPreview.style.backgroundImage = "none";
      coverPreview.style.backgroundColor = "var(--bg-surface-2)";
    });
    body.appendChild(coverPreview);
    body.appendChild(U.el("div", { class: "row gap-8", style: { marginTop: "8px" } }, [coverBtn, clearCoverBtn]));

    modal.appendChild(body);

    const actions = U.el("div", { class: "modal-actions" });
    actions.appendChild(U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }));
    const saveBtn = U.el("button", { class: "btn", text: "保存" });
    saveBtn.addEventListener("click", async () => {
      const title = titleIn.value.trim();
      const date = dateIn.value;
      if (!title) { global.Phone.Notify.push({ appId: "anniversary", title: "请填个标题吧" }); return; }
      if (!date) { global.Phone.Notify.push({ appId: "anniversary", title: "请选个日期哦" }); return; }
      a.title = title;
      a.date = date;
      a.description = descIn.value.trim();
      a.type = curType;
      a.repeat = repeatSel.value;
      a.remindDays = Math.max(0, parseInt(remindIn.value, 10) || 0);
      a.updatedAt = Date.now();
      if (!isEdit) a.createdAt = Date.now();
      await global.Phone.Storage.put("anniversaries", a);
      if (!isEdit) {
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.ANNIVERSARY_CREATED || "anniversary_created", {
          sourceApp: "anniversary",
          data: a,
          summary: "新增纪念日：" + a.title + "（" + a.date + "）",
        });
      }
      global.Phone.Notify.push({ appId: "anniversary", title: isEdit ? "已更新啦" : "已添加啦" });
      mask.remove();
      onDone();
    });
    actions.appendChild(saveBtn);
    modal.appendChild(actions);
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 计算下一个纪念日时间戳 ----------
  function _nextDate(a) {
    if (!a.date) return Date.now() + 365 * 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = a.date.split("-").map((n) => parseInt(n, 10));
    if (a.repeat === "yearly") {
      let next = new Date(today.getFullYear(), m - 1, d);
      if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
      return next.getTime();
    }
    return new Date(y, m - 1, d).getTime();
  }

  // ---------- 启动时检查临近纪念日 ----------
  async function checkDue() {
    const Storage = global.Phone.Storage;
    if (!Storage) return;
    const list = await Storage.getAll("anniversaries");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayKey = new Date().toISOString().slice(0, 10);
    for (const a of list) {
      const next = _nextDate(a);
      const days = Math.floor((next - today.getTime()) / 86400000);
      const remindDays = a.remindDays != null ? a.remindDays : 1;
      if (days >= 0 && days <= remindDays) {
        if (a.lastRemindKey === todayKey) continue;
        global.Phone.Notify.push({
          appId: "anniversary",
          title: "纪念日提醒：" + a.title,
          body: days === 0 ? "就是今天啦！" : "还有 " + days + " 天",
        });
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.ANNIVERSARY_DUE, {
          sourceApp: "anniversary",
          data: a,
          summary: "纪念日临近：" + a.title + "（还有 " + days + " 天）",
        });
        a.lastRemindKey = todayKey;
        await Storage.put("anniversaries", a);
      }
    }
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "anniversary",
      title: "周年纪念设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("排序与显示");
        const curSort = State.get("anniversaryDefaultSort") || "soon";
        const sortSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        [
          { v: "soon", l: "最近" },
          { v: "created", l: "创建" },
          { v: "title", l: "标题" },
          { v: "type", l: "类型" },
          { v: "date", l: "日期" },
        ].forEach((s) => {
          const node = U.el("div", { class: "segment-item" + (curSort === s.v ? " active" : ""), text: s.l });
          node.addEventListener("click", async () => {
            await State.set("anniversaryDefaultSort", s.v);
            sortSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          sortSeg.appendChild(node);
        });
        const sortGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [sortSeg]);
        content.appendChild(sortGroup);
        tools.toggle("显示已过纪念日", "关闭后只显示即将到来的", "anniversaryShowPassed", null);

        tools.section("默认值");
        const defType = State.get("anniversaryDefaultType") || "other";
        const typeSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        TYPES.forEach((t) => {
          const node = U.el("div", { class: "segment-item" + (defType === t.v ? " active" : ""), text: t.l });
          node.addEventListener("click", async () => {
            await State.set("anniversaryDefaultType", t.v);
            typeSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          typeSeg.appendChild(node);
        });
        const typeGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [typeSeg]);
        content.appendChild(typeGroup);

        tools.input("默认提前提醒天数", "anniversaryDefaultRemindDays", { type: "number", min: 0, max: 60 });
        const curRep = State.get("anniversaryDefaultRepeat") || "yearly";
        const repSeg = U.el("div", { class: "segment", style: { display: "flex" } });
        [
          { v: "yearly", l: "每年" },
          { v: "once", l: "一次性" },
        ].forEach((r) => {
          const node = U.el("div", { class: "segment-item" + (curRep === r.v ? " active" : ""), text: r.l });
          node.addEventListener("click", async () => {
            await State.set("anniversaryDefaultRepeat", r.v);
            repSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          repSeg.appendChild(node);
        });
        const repGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [repSeg]);
        content.appendChild(repGroup);

        tools.section("数据");
        tools.action("导出全部纪念日", async () => {
          const list = await global.Phone.Storage.getAll("anniversaries");
          const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "anniversaries-" + new Date().toISOString().slice(0, 10) + ".json";
          a.click();
          URL.revokeObjectURL(url);
          global.Phone.Notify.push({ appId: "anniversary", title: "已导出 " + list.length + " 条" });
        });
        tools.action("清空所有纪念日", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空纪念日", message: "这会删除所有纪念日数据，不可恢复哦。", danger: true });
          if (!ok) return;
          const list = await global.Phone.Storage.getAll("anniversaries");
          for (const a of list) await global.Phone.Storage.del("anniversaries", a.id);
          global.Phone.Notify.push({ appId: "anniversary", title: "已清空" });
          onDone && onDone();
        }, { danger: true });

        tools.section("关于");
        tools.hint("周年纪念 APP 帮你记下所有重要的日子，支持生日/恋爱/结婚/考试/旅行/工作等类型，提前提醒不漏掉。所有数据保存在本地。");
      },
    });
  }

  // ---------- 工具 ----------
  function _nav(U, title, onAdd, onSettings) {
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    const navRight = U.el("div", { class: "nav-right" });
    if (onSettings) {
      const setBtn = U.el("button", { class: "icon-btn" });
      setBtn.innerHTML = global.Phone.IconLibrary.get("app-settings", { size: 20 });
      setBtn.addEventListener("click", onSettings);
      navRight.appendChild(setBtn);
    }
    const addBtn = U.el("button", { class: "icon-btn" });
    addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    addBtn.addEventListener("click", onAdd);
    navRight.appendChild(addBtn);
    nav.appendChild(navRight);
    return nav;
  }

  function _empty(U, title, sub) {
    return U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-anniversary", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub }),
    ]);
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 API ----------
  global.Phone.Anniversary = {
    open, mount, checkDue,
    TYPES, TEMPLATES,
    /** 列出纪念日 */
    async list(filter) {
      let list = await global.Phone.Storage.getAll("anniversaries");
      if (filter) {
        if (filter.type) list = list.filter((a) => a.type === filter.type);
        if (filter.upcoming) list = list.filter((a) => _nextDate(a) >= Date.now());
        if (filter.past) list = list.filter((a) => _nextDate(a) < Date.now());
        if (filter.pinned != null) list = list.filter((a) => !!a.pinned === !!filter.pinned);
      }
      return list.sort((a, b) => _nextDate(a) - _nextDate(b));
    },
    /** 创建纪念日（API） */
    async create(opts) {
      const a = {
        id: global.Phone.Utils.uid("ann"),
        title: opts.title || "",
        date: opts.date || "",
        description: opts.description || "",
        type: opts.type || "other",
        repeat: opts.repeat || "yearly",
        remindDays: opts.remindDays != null ? opts.remindDays : 1,
        cover: opts.cover || "",
        pinned: !!opts.pinned,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await global.Phone.Storage.put("anniversaries", a);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.ANNIVERSARY_CREATED || "anniversary_created", {
        sourceApp: "anniversary",
        data: a,
        summary: "新增纪念日：" + a.title + "（" + a.date + "）",
      });
      return a;
    },
    /** 计算下一个纪念日时间戳 */
    nextDate(a) { return _nextDate(a); },
    /** 统计 */
    async stats() {
      const list = await global.Phone.Storage.getAll("anniversaries");
      const now = Date.now();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return {
        total: list.length,
        upcoming: list.filter((a) => _nextDate(a) >= now).length,
        past: list.filter((a) => _nextDate(a) < now).length,
        today: list.filter((a) => {
          const d = new Date(_nextDate(a)); d.setHours(0, 0, 0, 0);
          return d.getTime() === today.getTime();
        }).length,
        thisMonth: list.filter((a) => {
          const d = new Date(_nextDate(a));
          return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        }).length,
      };
    },
    /** 我编辑纪念日（合并 patch，更新 updatedAt） */
    async update(id, patch) {
      const a = await global.Phone.Storage.get("anniversaries", id);
      if (!a) return { ok: false, error: "找不到这个纪念日呀" };
      Object.keys(patch).forEach((k) => { a[k] = patch[k]; });
      a.updatedAt = Date.now();
      await global.Phone.Storage.put("anniversaries", a);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.ANNIVERSARY_CREATED || "anniversary_created", {
        sourceApp: "anniversary", data: a,
        summary: "我更新了一个纪念日",
      });
      return { ok: true, anniversary: a };
    },
    /** 我删掉一个纪念日 */
    async remove(id) {
      await global.Phone.Storage.del("anniversaries", id);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.ANNIVERSARY_CREATED || "anniversary_created", {
        sourceApp: "anniversary", data: { id, action: "remove" },
        summary: "我删掉了一个纪念日",
      });
      return { ok: true };
    },
    /** 我置顶 / 取消置顶纪念日 */
    async pin(id, pinned) {
      const a = await global.Phone.Storage.get("anniversaries", id);
      if (!a) return { ok: false, error: "找不到" };
      a.pinned = pinned !== false;
      a.updatedAt = Date.now();
      await global.Phone.Storage.put("anniversaries", a);
      return { ok: true };
    },
    /** 我列出所有纪念日类型（[{val,label}...] 格式） */
    listTypes() {
      return TYPES.map((t) => ({ val: t.v, label: t.l }));
    },
    /** 我读纪念日设置（key 不带 anniversary 前缀，如 UpcomingDays） */
    getSetting(key) {
      return global.Phone.State.get("anniversary" + key);
    },
    /** 我写纪念日设置（key 不带 anniversary 前缀） */
    async setSetting(key, value) {
      return await global.Phone.State.set("anniversary" + key, value);
    },
    /** 我列出纪念日当前全部设置 */
    listSettings() {
      const State = global.Phone.State;
      return {
        upcomingDays: State.get("anniversaryUpcomingDays"),
        defaultRepeat: State.get("anniversaryDefaultRepeat") || "yearly",
        defaultSort: State.get("anniversaryDefaultSort") || "soon",
        showPassed: State.get("anniversaryShowPassed") !== false,
        defaultRemindDays: State.get("anniversaryDefaultRemindDays") != null ? State.get("anniversaryDefaultRemindDays") : 1,
        defaultType: State.get("anniversaryDefaultType") || "other",
      };
    },
  };
})(window);
