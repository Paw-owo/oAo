/* ============================================================
   memo.js — 备忘录 APP（专业版）
   对齐参考：Apple 提醒事项 / 滴答清单 / Todoist / Notion 待办
   功能：
     - CRUD：标题 / 内容 / 分类 / 标签 / 优先级 / 提醒
     - 子任务清单（checklist）
     - 重复提醒：不重复 / 每天 / 每周 / 每月 / 每年
     - 完成 / 置顶 / 归档
     - 搜索 + 多维度筛选（全部/待办/已完成/今日/已过期/归档）
     - 排序：更新时间 / 创建时间 / 提醒时间 / 优先级 / 标题
     - 统计：完成率 / 各分类数量
     - 设置页：默认排序 / 默认分类 / 自动提醒 / 清空数据
   挂在 window.Phone.Memo
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  // 优先级
  const PRIORITIES = [
    { v: 0, l: "无", color: "var(--text-placeholder)" },
    { v: 1, l: "低", color: "var(--color-success)" },
    { v: 2, l: "中", color: "var(--color-warning, #C9A36B)" },
    { v: 3, l: "高", color: "var(--color-danger)" },
  ];

  // 重复选项
  const RECURRING = [
    { v: "none", l: "不重复" },
    { v: "daily", l: "每天" },
    { v: "weekly", l: "每周" },
    { v: "monthly", l: "每月" },
    { v: "yearly", l: "每年" },
  ];

  // 标签颜色板
  const TAG_COLORS = [
    "#E8846B", "#8BC28A", "#C9A36B", "#9B7EBD",
    "#7BB5D6", "#E8869B", "#A8A8A8", "#B0B0B0",
  ];

  global.Phone.AppRegistry.register({
    id: "memo",
    name: "备忘录",
    icon: "app-memo",
    entry: () => open(),
    events: ["memo_created", "memo_reminded"],
    settings: [],
    order: 81,
  });

  function open() { global.Phone.Router.push("memo", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "memo");
    }
    page.appendChild(_nav(U, "备忘录", () => _edit(U, null, () => _remount(container)), () => _openSettings(U, () => _remount(container))));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // ---------- 统计概览 ----------
    const allMemos = await Storage.getAll("memos");
    const total = allMemos.length;
    const completed = allMemos.filter((m) => m.completed).length;
    const pending = total - completed;
    const todayDue = allMemos.filter((m) => !m.completed && m.remindAt && _isToday(m.remindAt)).length;
    const overdue = allMemos.filter((m) => !m.completed && m.remindAt && m.remindAt < Date.now()).length;
    const statsBar = U.el("div", { class: "memo-stats-bar" }, [
      U.el("div", { class: "msb-card" }, [
        U.el("div", { class: "msb-num", text: String(total) }),
        U.el("div", { class: "msb-label", text: "全部" }),
      ]),
      U.el("div", { class: "msb-card" }, [
        U.el("div", { class: "msb-num", text: String(pending) }),
        U.el("div", { class: "msb-label", text: "待办" }),
      ]),
      U.el("div", { class: "msb-card" + (todayDue > 0 ? " highlight" : "") }, [
        U.el("div", { class: "msb-num", text: String(todayDue) }),
        U.el("div", { class: "msb-label", text: "今日" }),
      ]),
      U.el("div", { class: "msb-card" + (overdue > 0 ? " danger" : "") }, [
        U.el("div", { class: "msb-num", text: String(overdue) }),
        U.el("div", { class: "msb-label", text: "过期" }),
      ]),
    ]);
    content.appendChild(statsBar);

    // ---------- 搜索 ----------
    const search = U.el("input", { class: "input", placeholder: "搜索备忘 / 标签...", style: { marginBottom: "12px" } });
    content.appendChild(search);

    // ---------- 筛选 segment ----------
    const filterSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "8px", overflowX: "auto" } });
    const filters = [
      { v: "all", l: "全部" },
      { v: "pending", l: "待办" },
      { v: "today", l: "今日" },
      { v: "overdue", l: "过期" },
      { v: "done", l: "已完成" },
      { v: "archived", l: "归档" },
    ];
    let curFilter = "all";
    const listWrap = U.el("div", {});

    // ---------- 排序 ----------
    const sortWrap = U.el("div", { class: "row", style: { justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } });
    const sortLabel = U.el("div", { class: "muted", text: "排序：", style: { fontSize: "var(--font-xs)" } });
    const sortSelect = U.el("select", { class: "input", style: { width: "auto", fontSize: "var(--font-xs)" } });
    const curSort = State.get("memoDefaultSort") || "updated";
    [
      { v: "updated", l: "更新时间" },
      { v: "created", l: "创建时间" },
      { v: "remind", l: "提醒时间" },
      { v: "priority", l: "优先级" },
      { v: "title", l: "标题" },
    ].forEach((o) => {
      const opt = U.el("option", { value: o.v, text: o.l });
      if (curSort === o.v) opt.selected = true;
      sortSelect.appendChild(opt);
    });
    sortWrap.appendChild(sortLabel);
    sortWrap.appendChild(sortSelect);
    content.appendChild(sortWrap);
    sortSelect.addEventListener("change", async () => {
      await State.set("memoDefaultSort", sortSelect.value);
      _load();
    });

    async function _load() {
      let memos = await Storage.getAll("memos");
      const kw = search.value.trim().toLowerCase();
      if (kw) {
        memos = memos.filter((m) =>
          (m.title || "").toLowerCase().includes(kw) ||
          (m.content || "").toLowerCase().includes(kw) ||
          (m.tags || []).some((t) => (t || "").toLowerCase().includes(kw))
        );
      }
      const now = Date.now();
      if (curFilter === "pending") memos = memos.filter((m) => !m.completed && !m.archived);
      else if (curFilter === "done") memos = memos.filter((m) => m.completed);
      else if (curFilter === "today") memos = memos.filter((m) => !m.completed && !m.archived && m.remindAt && _isToday(m.remindAt));
      else if (curFilter === "overdue") memos = memos.filter((m) => !m.completed && !m.archived && m.remindAt && m.remindAt < now);
      else if (curFilter === "archived") memos = memos.filter((m) => m.archived);
      else memos = memos.filter((m) => !m.archived); // all = 非归档

      // 排序
      const sort = sortSelect.value;
      memos.sort((a, b) => {
        // 置顶永远在最前
        if (!!b.pinned - !!a.pinned !== 0) return (!!b.pinned ? 1 : 0) - (!!a.pinned ? 1 : 0);
        // 未完成 > 已完成（除了归档/已完成视图）
        if (curFilter === "all" || curFilter === "pending" || curFilter === "today" || curFilter === "overdue") {
          if (!!a.completed - !!b.completed !== 0) return (!!a.completed ? 1 : 0) - (!!b.completed ? 1 : 0);
        }
        if (sort === "created") return (b.createdAt || 0) - (a.createdAt || 0);
        if (sort === "remind") {
          const at = a.remindAt || Infinity, bt = b.remindAt || Infinity;
          return at - bt;
        }
        if (sort === "priority") return (b.priority || 0) - (a.priority || 0);
        if (sort === "title") return (a.title || "").localeCompare(b.title || "");
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });

      U.empty(listWrap);
      if (memos.length === 0) {
        listWrap.appendChild(_empty(U, kw ? "没找到相关备忘" : "还没有备忘", kw ? "换个关键词试试" : "点右上角写一条吧~"));
        return;
      }
      memos.forEach((m) => {
        listWrap.appendChild(_memoCard(U, m, () => _load(), () => _edit(U, m, () => _load())));
      });
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

  function _isToday(ts) {
    const d = new Date(ts);
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  // ---------- 备忘卡 ----------
  function _memoCard(U, m, onReload, onEdit) {
    const card = U.el("div", { class: "memo-item" + (m.completed ? " completed" : "") + (m.pinned ? " pinned" : "") + (m.archived ? " archived" : "") });
    if (m.remindAt && !m.completed && m.remindAt < Date.now()) {
      card.classList.add("overdue");
    }
    // 优先级色条
    if (m.priority && m.priority > 0) {
      const pri = PRIORITIES.find((p) => p.v === m.priority) || PRIORITIES[0];
      card.style.borderLeft = "3px solid " + pri.color;
    }
    card.appendChild(U.el("div", { class: "mi-top" }, [
      U.el("div", { class: "row gap-4", style: { alignItems: "center", flex: "1", minWidth: "0" } }, [
        (() => {
          const cb = U.el("button", { class: "icon-btn" });
          cb.innerHTML = global.Phone.IconLibrary.get(m.completed ? "check" : "circle", { size: 18 });
          if (m.priority === 3) cb.style.color = "var(--color-danger)";
          else if (m.priority === 2) cb.style.color = "var(--color-warning, #C9A36B)";
          cb.addEventListener("click", async () => {
            m.completed = !m.completed;
            m.completedAt = m.completed ? Date.now() : null;
            m.updatedAt = Date.now();
            // 完成重复提醒：自动生成下一个
            if (m.completed && m.remindAt && m.recurring && m.recurring !== "none") {
              const next = _nextRecurring(m.remindAt, m.recurring);
              if (next) {
                m.remindAt = next;
                m.completed = false;
                m.lastRemindedAt = null;
                global.Phone.Notify.push({ appId: "memo", title: "已生成下一次提醒：" + global.Phone.Utils.fmtDateTime(next) });
              }
            }
            await global.Phone.Storage.put("memos", m);
            onReload();
          });
          return cb;
        })(),
        U.el("div", { class: "mi-title" + (m.completed ? " done" : ""), text: m.title || "（无标题）", style: { flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }),
      ]),
      U.el("div", { class: "row gap-4", style: { flexShrink: "0" } }, [
        (() => {
          const b = U.el("button", { class: "icon-btn" });
          b.innerHTML = global.Phone.IconLibrary.get(m.pinned ? "pin-fill" : "pin", { size: 16 });
          b.addEventListener("click", async () => {
            m.pinned = !m.pinned;
            m.updatedAt = Date.now();
            await global.Phone.Storage.put("memos", m);
            onReload();
          });
          return b;
        })(),
        (() => {
          const b = U.el("button", { class: "icon-btn" });
          b.innerHTML = global.Phone.IconLibrary.get("archive", { size: 16 });
          b.title = m.archived ? "取消归档" : "归档";
          b.addEventListener("click", async () => {
            m.archived = !m.archived;
            m.updatedAt = Date.now();
            await global.Phone.Storage.put("memos", m);
            global.Phone.Notify.push({ appId: "memo", title: m.archived ? "已归档" : "已取消归档" });
            onReload();
          });
          return b;
        })(),
        (() => {
          const b = U.el("button", { class: "icon-btn" });
          b.innerHTML = global.Phone.IconLibrary.get("edit", { size: 16 });
          b.addEventListener("click", onEdit);
          return b;
        })(),
        (() => {
          const b = U.el("button", { class: "icon-btn" });
          b.innerHTML = global.Phone.IconLibrary.get("trash", { size: 16 });
          b.addEventListener("click", async () => {
            const ok = await global.Phone.Modal.confirm({ title: "删除备忘", message: "删除「" + (m.title || "无标题") + "」？", danger: true });
            if (!ok) return;
            await global.Phone.Storage.del("memos", m.id);
            onReload();
          });
          return b;
        })(),
      ]),
    ]));

    if (m.content) {
      card.appendChild(U.el("div", { class: "mi-content", text: m.content }));
    }

    // 子任务进度
    if (m.subtasks && m.subtasks.length > 0) {
      const doneSub = m.subtasks.filter((s) => s.done).length;
      const totalSub = m.subtasks.length;
      const subBar = U.el("div", { class: "mi-subtasks" }, [
        U.el("div", { class: "mis-progress" }, [
          U.el("div", { class: "mis-bar", style: { width: (doneSub / totalSub * 100) + "%" } }),
        ]),
        U.el("div", { class: "mis-text", text: doneSub + " / " + totalSub + " 子任务" }),
      ]);
      card.appendChild(subBar);
    }

    // 标签
    if (m.tags && m.tags.length > 0) {
      const tagWrap = U.el("div", { class: "mi-tags" });
      m.tags.forEach((t, i) => {
        const color = TAG_COLORS[(i + (m.title || "").length) % TAG_COLORS.length];
        tagWrap.appendChild(U.el("div", { class: "mi-tag", text: t, style: { background: color + "22", color: color } }));
      });
      card.appendChild(tagWrap);
    }

    // 提醒 / 重复
    if (m.remindAt) {
      const overdue = !m.completed && m.remindAt < Date.now();
      const recLabel = m.recurring && m.recurring !== "none" ? " · " + (RECURRING.find((r) => r.v === m.recurring) || {}).l : "";
      card.appendChild(U.el("div", { class: "mi-remind" + (overdue ? " overdue" : ""), text: (overdue ? "已过期 " : "提醒 ") + global.Phone.Utils.fmtDateTime(m.remindAt) + recLabel }));
    }

    return card;
  }

  // 计算下一个重复时间
  function _nextRecurring(fromTs, recurring) {
    const d = new Date(fromTs);
    if (recurring === "daily") return d.getTime() + 24 * 3600 * 1000;
    if (recurring === "weekly") return d.getTime() + 7 * 24 * 3600 * 1000;
    if (recurring === "monthly") return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()).getTime();
    if (recurring === "yearly") return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime();
    return null;
  }

  // ---------- 编辑 ----------
  function _edit(U, memo, onDone) {
    const State = global.Phone.State;
    const isEdit = !!memo;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: isEdit ? "编辑备忘" : "新建备忘" }));

    const titleInput = U.el("input", { class: "input", placeholder: "标题", style: { marginTop: "8px" } });
    if (memo) titleInput.value = memo.title || "";
    modal.appendChild(titleInput);

    const contentInput = U.el("textarea", { class: "textarea", placeholder: "内容...", style: { marginTop: "8px", minHeight: "80px" } });
    if (memo) contentInput.value = memo.content || "";
    modal.appendChild(contentInput);

    // 分类
    const catInput = U.el("input", { class: "input", placeholder: "分类（可选）", style: { marginTop: "8px" }, value: memo ? (memo.category || "") : (State.get("memoDefaultCategory") || "") });
    modal.appendChild(catInput);

    // 优先级
    modal.appendChild(U.el("div", { class: "form-label", text: "优先级", style: { marginTop: "12px" } }));
    const priSeg = U.el("div", { class: "segment", style: { display: "flex" } });
    let curPri = (memo && memo.priority) || 0;
    PRIORITIES.forEach((p) => {
      const node = U.el("div", { class: "segment-item" + (curPri === p.v ? " active" : ""), text: p.l });
      if (curPri === p.v) node.style.borderColor = p.color;
      node.addEventListener("click", () => {
        curPri = p.v;
        priSeg.querySelectorAll(".segment-item").forEach((n) => { n.classList.remove("active"); n.style.borderColor = ""; });
        node.classList.add("active");
        node.style.borderColor = p.color;
      });
      priSeg.appendChild(node);
    });
    modal.appendChild(priSeg);

    // 标签
    modal.appendChild(U.el("div", { class: "form-label", text: "标签（用逗号分隔）", style: { marginTop: "12px" } }));
    const tagInput = U.el("input", { class: "input", placeholder: "如：工作, 学习, 生活", value: memo && memo.tags ? memo.tags.join(", ") : "" });
    modal.appendChild(tagInput);

    // 提醒 + 重复
    const remindWrap = U.el("div", { class: "row gap-8", style: { marginTop: "12px", alignItems: "center" } });
    const remindInput = U.el("input", { class: "input", type: "datetime-local", style: { flex: "1" } });
    if (memo && memo.remindAt) {
      const d = new Date(memo.remindAt);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      remindInput.value = local;
    }
    remindWrap.appendChild(U.el("div", { class: "muted", text: "提醒", style: { fontSize: "var(--font-xs)" } }));
    remindWrap.appendChild(remindInput);
    modal.appendChild(remindWrap);

    modal.appendChild(U.el("div", { class: "form-label", text: "重复", style: { marginTop: "12px" } }));
    const recSelect = U.el("select", { class: "input" });
    const curRec = (memo && memo.recurring) || "none";
    RECURRING.forEach((r) => {
      const opt = U.el("option", { value: r.v, text: r.l });
      if (curRec === r.v) opt.selected = true;
      recSelect.appendChild(opt);
    });
    modal.appendChild(recSelect);

    // 子任务
    modal.appendChild(U.el("div", { class: "form-label", text: "子任务", style: { marginTop: "12px" } }));
    const subWrap = U.el("div", {});
    let subtasks = (memo && memo.subtasks) ? memo.subtasks.slice() : [];
    function _renderSubs() {
      U.empty(subWrap);
      subtasks.forEach((s, i) => {
        const row = U.el("div", { class: "row gap-4", style: { marginBottom: "6px", alignItems: "center" } });
        const cb = U.el("button", { class: "icon-btn btn-sm" });
        cb.innerHTML = global.Phone.IconLibrary.get(s.done ? "check" : "circle", { size: 16 });
        cb.addEventListener("click", () => { s.done = !s.done; _renderSubs(); });
        row.appendChild(cb);
        const inp = U.el("input", { class: "input", value: s.text, style: { flex: "1", padding: "4px 8px", fontSize: "var(--font-sm)" } });
        inp.addEventListener("input", () => { s.text = inp.value; });
        row.appendChild(inp);
        const del = U.el("button", { class: "icon-btn btn-sm" });
        del.innerHTML = global.Phone.IconLibrary.get("close", { size: 14 });
        del.addEventListener("click", () => { subtasks.splice(i, 1); _renderSubs(); });
        row.appendChild(del);
        subWrap.appendChild(row);
      });
    }
    _renderSubs();
    modal.appendChild(subWrap);
    const addSubBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "+ 添加子任务", style: { marginTop: "6px" } });
    addSubBtn.addEventListener("click", () => {
      subtasks.push({ text: "", done: false });
      _renderSubs();
    });
    modal.appendChild(addSubBtn);

    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "保存", onclick: async () => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        if (!title && !content) {
          global.Phone.Notify.push({ appId: "memo", title: "写点啥再保存吧" });
          return;
        }
        const remindAt = remindInput.value ? new Date(remindInput.value).getTime() : null;
        const tags = tagInput.value.split(",").map((t) => t.trim()).filter(Boolean);
        const Storage = global.Phone.Storage;
        if (memo) {
          memo.title = title;
          memo.content = content;
          memo.category = catInput.value.trim();
          memo.priority = curPri;
          memo.tags = tags;
          memo.subtasks = subtasks.filter((s) => s.text.trim());
          memo.remindAt = remindAt;
          memo.recurring = recSelect.value;
          memo.updatedAt = Date.now();
          await Storage.put("memos", memo);
        } else {
          const m = {
            id: U.uid("memo"), title, content,
            category: catInput.value.trim(),
            priority: curPri, tags,
            subtasks: subtasks.filter((s) => s.text.trim()),
            completed: false, completedAt: null,
            pinned: false, archived: false,
            remindAt, recurring: recSelect.value,
            createdAt: Date.now(), updatedAt: Date.now(),
          };
          await Storage.put("memos", m);
          global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMO_CREATED, {
            sourceApp: "memo", data: m,
            summary: "新建备忘：" + (title || content.slice(0, 20)),
          });
        }
        global.Phone.Notify.push({ appId: "memo", title: isEdit ? "已更新" : "记下啦" });
        mask.remove(); onDone();
      }}),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 检查过期提醒（main.js 启动时调用） ----------
  async function checkReminders() {
    const Storage = global.Phone.Storage;
    if (!Storage) return;
    const memos = await Storage.getAll("memos");
    const now = Date.now();
    const autoRemind = global.Phone.State.get("memoAutoRemind") !== false;
    const due = memos.filter((m) =>
      m.remindAt && !m.completed && !m.archived && m.remindAt < now &&
      (!m.lastRemindedAt || (now - m.lastRemindedAt) > 5 * 60 * 1000)
    );
    for (const m of due) {
      if (autoRemind) {
        global.Phone.Notify.push({
          appId: "memo",
          title: "备忘提醒：" + (m.title || "（无标题）"),
          body: m.content ? m.content.slice(0, 50) : "",
        });
      }
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMO_REMINDED, {
        sourceApp: "memo", data: m,
        summary: "备忘到期：" + (m.title || "无标题"),
      });
      m.lastRemindedAt = now;
      // 重复提醒自动滚动到下一个
      if (m.recurring && m.recurring !== "none") {
        const next = _nextRecurring(m.remindAt, m.recurring);
        if (next && next <= now) {
          // 已经错过了好几次，循环到未来
          while (next <= now) {
            const nn = _nextRecurring(next, m.recurring);
            if (!nn || nn === next) break;
            next = nn;
          }
          m.remindAt = next;
          m.lastRemindedAt = null;
        }
      }
      await Storage.put("memos", m);
    }
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "memo",
      title: "备忘录设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("排序");
        const curSort = State.get("memoDefaultSort") || "updated";
        const sortGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } });
        const sortSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        [
          { v: "updated", l: "更新" },
          { v: "created", l: "创建" },
          { v: "remind", l: "提醒" },
          { v: "priority", l: "优先级" },
          { v: "title", l: "标题" },
        ].forEach((s) => {
          const node = U.el("div", { class: "segment-item" + (curSort === s.v ? " active" : ""), text: s.l });
          node.addEventListener("click", async () => {
            await State.set("memoDefaultSort", s.v);
            sortSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          sortSeg.appendChild(node);
        });
        sortGroup.appendChild(sortSeg);
        content.appendChild(sortGroup);

        tools.section("默认值");
        tools.input("默认分类", "memoDefaultCategory", { placeholder: "如：生活" });

        tools.section("提醒");
        tools.toggle("自动推送提醒", "关闭后只在事件中心记录，不弹通知", "memoAutoRemind", null);
        tools.hint("重复提醒（每天/每周/每月/每年）会自动滚动到下一个时间点。");

        tools.section("数据");
        tools.action("清空所有备忘", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空备忘", message: "这会删除所有备忘录数据，不可恢复哦。", danger: true });
          if (!ok) return;
          const memos = await global.Phone.Storage.getAll("memos");
          for (const m of memos) await global.Phone.Storage.del("memos", m.id);
          global.Phone.Notify.push({ appId: "memo", title: "已清空" });
          onDone && onDone();
        }, { danger: true });
        tools.action("清空已完成", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空已完成", message: "删除所有已完成的备忘？", danger: true });
          if (!ok) return;
          const memos = await global.Phone.Storage.getAll("memos");
          for (const m of memos) if (m.completed) await global.Phone.Storage.del("memos", m.id);
          global.Phone.Notify.push({ appId: "memo", title: "已清空已完成" });
          onDone && onDone();
        }, { danger: true });

        tools.section("关于");
        tools.hint("备忘录 APP 帮你记下所有待办事项，支持子任务、重复提醒、优先级。所有数据保存在本地。");
      },
    });
  }

  // ---------- 工具函数 ----------
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
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-memo", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub }),
    ]);
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 API ----------
  global.Phone.Memo = {
    open, mount, checkReminders,
    PRIORITIES, RECURRING, TAG_COLORS,
    /** 列出备忘（支持过滤） */
    async list(filter) {
      let list = await global.Phone.Storage.getAll("memos");
      if (filter) {
        if (filter.completed != null) list = list.filter((m) => !!m.completed === !!filter.completed);
        if (filter.archived != null) list = list.filter((m) => !!m.archived === !!filter.archived);
        if (filter.pinned != null) list = list.filter((m) => !!m.pinned === !!filter.pinned);
        if (filter.category) list = list.filter((m) => m.category === filter.category);
        if (filter.tag) list = list.filter((m) => (m.tags || []).includes(filter.tag));
        if (filter.priority != null) list = list.filter((m) => (m.priority || 0) === filter.priority);
        if (filter.since) list = list.filter((m) => m.createdAt >= filter.since);
      }
      return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    /** 创建备忘（API 调用） */
    async create(opts) {
      const m = {
        id: global.Phone.Utils.uid("memo"),
        title: opts.title || "",
        content: opts.content || "",
        category: opts.category || "",
        priority: opts.priority || 0,
        tags: opts.tags || [],
        subtasks: opts.subtasks || [],
        completed: false, completedAt: null,
        pinned: !!opts.pinned, archived: false,
        remindAt: opts.remindAt || null,
        recurring: opts.recurring || "none",
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await global.Phone.Storage.put("memos", m);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMO_CREATED, {
        sourceApp: "memo", data: m,
        summary: "新建备忘：" + (m.title || m.content.slice(0, 20)),
      });
      return m;
    },
    /** 完成备忘 */
    async complete(id, completed) {
      const m = await global.Phone.Storage.get("memos", id);
      if (!m) return { ok: false, error: "找不到" };
      m.completed = completed !== false;
      m.completedAt = m.completed ? Date.now() : null;
      m.updatedAt = Date.now();
      await global.Phone.Storage.put("memos", m);
      return { ok: true };
    },
    /** 统计 */
    async stats() {
      const list = await global.Phone.Storage.getAll("memos");
      const now = Date.now();
      return {
        total: list.length,
        completed: list.filter((m) => m.completed).length,
        pending: list.filter((m) => !m.completed && !m.archived).length,
        archived: list.filter((m) => m.archived).length,
        overdue: list.filter((m) => !m.completed && !m.archived && m.remindAt && m.remindAt < now).length,
        todayDue: list.filter((m) => !m.completed && !m.archived && m.remindAt && _isToday(m.remindAt)).length,
      };
    },
  };
})(window);
