/* ============================================================
   anniversary.js — 周年纪念 APP
   纪念日 CRUD / 倒计时 / 已经过天数 / 提前提醒 / 封面 / 重复
   事件写入事件中心，AI 可在聊天中提及
   挂在 window.Phone.Anniversary
   main.js 启动时会调 checkDue() 检查临近纪念日
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
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

  let _curFilter = "upcoming"; // upcoming / past / all

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;

    const list = await Storage.getAll("anniversaries");
    list.sort((a, b) => _nextDate(a) - _nextDate(b));

    const page = U.el("div", { class: "page" });
    const nav = _nav(U, "周年纪念");
    const addBtn = U.el("button", { class: "icon-btn" });
    addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    addBtn.addEventListener("click", () => _edit(U, null, () => _remount(container)));
    nav.querySelector(".nav-right").appendChild(addBtn);
    page.appendChild(nav);

    // 筛选
    const filterBar = U.el("div", { class: "seg-bar" });
    [
      { k: "upcoming", t: "即将到来" },
      { k: "past", t: "已经过去" },
      { k: "all", t: "全部" },
    ].forEach((s) => {
      const b = U.el("button", { class: "seg-btn" + (_curFilter === s.k ? " active" : ""), text: s.t });
      b.addEventListener("click", () => { _curFilter = s.k; _remount(container); });
      filterBar.appendChild(b);
    });
    page.appendChild(filterBar);

    const content = U.el("div", { class: "page-content" });

    const now = Date.now();
    let filtered = list;
    if (_curFilter === "upcoming") filtered = list.filter((a) => _nextDate(a) >= now);
    if (_curFilter === "past") filtered = list.filter((a) => _nextDate(a) < now);

    if (filtered.length === 0) {
      content.appendChild(_empty(U, "还没有纪念日哦～\n点右上角加一个吧"));
    } else {
      filtered.forEach((a) => content.appendChild(_card(U, a, now, () => _remount(container))));
    }
    page.appendChild(content);
    container.appendChild(page);
  }

  // ---------- 卡片 ----------
  function _card(U, a, now, onDone) {
    const next = _nextDate(a);
    const isUpcoming = next >= now;
    const days = Math.floor(Math.abs(next - now) / 86400000);
    // 距首个纪念日已过多少天
    const firstTs = new Date(a.date + "T00:00:00").getTime();
    const passedDays = Math.max(0, Math.floor((now - firstTs) / 86400000));

    const card = U.el("div", { class: "an-card" + (isUpcoming ? " upcoming" : " past") });
    if (a.cover) {
      card.style.backgroundImage = "url(" + a.cover + ")";
      card.style.backgroundSize = "cover";
      card.style.backgroundPosition = "center";
      card.classList.add("has-cover");
    }

    const body = U.el("div", { class: "an-body" });
    body.appendChild(U.el("div", { class: "an-title", text: a.title || "（无标题）" }));
    if (a.description) {
      body.appendChild(U.el("div", { class: "an-desc", text: a.description }));
    }
    body.appendChild(U.el("div", { class: "an-date", text: "📅 " + (a.date || "") + (a.repeat === "yearly" ? " · 每年重复" : " · 一次性") }));

    const cd = U.el("div", { class: "an-countdown" });
    if (isUpcoming) {
      if (days === 0) {
        cd.textContent = "🎉 就是今天！";
        cd.classList.add("today");
      } else {
        cd.textContent = "还有 " + days + " 天";
      }
    } else {
      cd.textContent = "已过 " + days + " 天";
    }
    if (passedDays > 0 && a.repeat === "yearly") {
      body.appendChild(U.el("div", { class: "an-passed", text: "已经陪伴 " + passedDays + " 天啦" }));
    }
    body.appendChild(cd);

    // 操作行
    const actions = U.el("div", { class: "an-actions" });
    const editBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "编辑" });
    editBtn.addEventListener("click", () => _edit(U, a, onDone));
    const delBtn = U.el("button", { class: "btn btn-text btn-sm", text: "删除" });
    delBtn.addEventListener("click", async () => {
      const ok = await global.Phone.Modal.confirm({
        title: "删除纪念日", message: "删除「" + (a.title || "无标题") + "」？", danger: true, okText: "删除",
      });
      if (!ok) return;
      await global.Phone.Storage.del("anniversaries", a.id);
      global.Phone.Notify.push({ appId: "anniversary", title: "已删除" });
      onDone();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  // ---------- 编辑/新增 ----------
  function _edit(U, ann, onDone) {
    const isEdit = !!ann;
    const a = ann || { id: global.Phone.Utils.uid("ann"), title: "", date: "", description: "", cover: "", repeat: "yearly", remindDays: 1 };

    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: isEdit ? "编辑纪念日" : "新建纪念日" }));

    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });
    const titleIn = U.el("input", { class: "input", placeholder: "标题（如：在一起第 100 天）", value: a.title || "" });
    const dateIn = U.el("input", { class: "input", type: "date", value: a.date || "" });
    const descIn = U.el("textarea", { class: "input", placeholder: "描述（可选）", rows: 3 });
    descIn.value = a.description || "";

    // 重复
    const repeatRow = U.el("div", { class: "form-group" });
    repeatRow.appendChild(U.el("div", { class: "form-label", text: "重复" }));
    const repeatSel = U.el("select", { class: "input" });
    [
      { v: "yearly", t: "每年重复" },
      { v: "once", t: "一次性" },
    ].forEach((o) => {
      const op = U.el("option", { value: o.v, text: o.t });
      if (a.repeat === o.v) op.selected = true;
      repeatSel.appendChild(op);
    });
    repeatRow.appendChild(repeatSel);

    // 提前提醒
    const remindRow = U.el("div", { class: "form-group" });
    remindRow.appendChild(U.el("div", { class: "form-label", text: "提前几天提醒" }));
    const remindIn = U.el("input", { class: "input", type: "number", min: 0, max: 30, value: String(a.remindDays != null ? a.remindDays : 1) });
    remindRow.appendChild(remindIn);

    // 封面
    const coverRow = U.el("div", { class: "form-group" });
    coverRow.appendChild(U.el("div", { class: "form-label", text: "封面图（可选）" }));
    const coverPreview = U.el("div", { class: "an-cover-preview", style: { width: "100%", height: "80px", borderRadius: "12px", background: a.cover ? "url(" + a.cover + ") center/cover" : "var(--bg-surface-2)", marginBottom: "8px" } });
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
        coverPreview.style.background = "url(" + a.cover + ") center/cover";
      };
      reader.readAsDataURL(f);
    });
    coverBtn.addEventListener("click", () => coverInput.click());
    const clearCoverBtn = U.el("button", { class: "btn btn-text btn-sm", text: "清除" });
    clearCoverBtn.addEventListener("click", () => {
      a.cover = "";
      coverPreview.style.background = "var(--bg-surface-2)";
    });
    coverRow.appendChild(coverPreview);
    coverRow.appendChild(coverBtn);
    coverRow.appendChild(clearCoverBtn);

    body.appendChild(U.el("div", { class: "form-group" }, [U.el("div", { class: "form-label", text: "标题" }), titleIn]));
    body.appendChild(U.el("div", { class: "form-group" }, [U.el("div", { class: "form-label", text: "日期" }), dateIn]));
    body.appendChild(U.el("div", { class: "form-group" }, [U.el("div", { class: "form-label", text: "描述" }), descIn]));
    body.appendChild(repeatRow);
    body.appendChild(remindRow);
    body.appendChild(coverRow);
    modal.appendChild(body);

    const actions = U.el("div", { class: "modal-actions" });
    actions.appendChild(U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }));
    const saveBtn = U.el("button", { class: "btn", text: "保存" });
    saveBtn.addEventListener("click", async () => {
      const title = titleIn.value.trim();
      const date = dateIn.value;
      if (!title) { global.Phone.Notify.push({ appId: "anniversary", title: "请填标题" }); return; }
      if (!date) { global.Phone.Notify.push({ appId: "anniversary", title: "请选日期" }); return; }
      a.title = title;
      a.date = date;
      a.description = descIn.value.trim();
      a.repeat = repeatSel.value;
      a.remindDays = Math.max(0, parseInt(remindIn.value, 10) || 0);
      a.updatedAt = Date.now();
      if (!isEdit) a.createdAt = Date.now();
      await global.Phone.Storage.put("anniversaries", a);
      if (!isEdit) {
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.ANNIVERSARY_DUE, {
          sourceApp: "anniversary",
          data: a,
          summary: "新增纪念日：" + a.title + "（" + a.date + "）",
        });
      }
      global.Phone.Notify.push({ appId: "anniversary", title: isEdit ? "已更新" : "已添加" });
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
    // 一次性
    return new Date(y, m - 1, d).getTime();
  }

  // ---------- 启动时检查临近纪念日 ----------
  async function checkDue() {
    const Storage = global.Phone.Storage;
    if (!Storage) return;
    const list = await Storage.getAll("anniversaries");
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const a of list) {
      const next = _nextDate(a);
      const days = Math.floor((next - today.getTime()) / 86400000);
      const remindDays = a.remindDays != null ? a.remindDays : 1;
      // 0 ~ remindDays 天内，且今天没提醒过
      if (days >= 0 && days <= remindDays) {
        const todayKey = new Date().toISOString().slice(0, 10);
        const lastKey = a.lastRemindKey;
        if (lastKey === todayKey) continue;
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

  // ---------- 工具 ----------
  function _nav(U, title) {
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

  function _empty(U, text) {
    const wrap = U.el("div", { class: "empty-state" });
    wrap.appendChild(U.el("div", { class: "empty-icon", html: global.Phone.IconLibrary.get("app-anniversary", { size: 48 }) }));
    text.split("\n").forEach((line) => wrap.appendChild(U.el("div", { class: "empty-text", text: line })));
    return wrap;
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 ----------
  global.Phone.Anniversary = { open, mount, checkDue };
})(window);
