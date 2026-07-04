/* ============================================================
   truth-or-dare.js — 真心话大冒险（专业版）
   对齐参考：真心话大冒险 Online / 聚会玩 / 探探真心话
   功能：
     - 抽题（真心话 / 大冒险 / 随机）
     - 难度分级（轻松 / 普通 / 挑战）
     - 自定义题库（用户可加自己的题）
     - 完成 / 跳过 / 长按删除
     - 统计概览：总数 / 完成 / 跳过 / 今日
     - 历史搜索
     - 设置页：默认类型 / 难度 / 显示统计 / 清空 / 导出 / 关于
   数据存 game_truth_dare 表 + game_truth_dare_custom 表
   事件 GAME_PLAYED
   挂在 window.Phone.Games["truth-or-dare"]
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.Games = global.Phone.Games || {};

  // 难度分级：每个难度都有真心话 + 大冒险
  const BANK = {
    easy: {
      truth: [
        "你最近一次大笑是因为什么？",
        "你最想去哪里旅行？和谁？",
        "你最喜欢的一道菜是什么？",
        "你手机里最常用的 APP 是哪个？",
        "你最近一次晚睡是因为什么？",
        "你最想拥有的超能力是什么？",
        "你喜欢猫还是狗？为什么？",
        "你最近一次吃撑是什么时候？",
      ],
      dare: [
        "学一种动物的叫声，让大家猜",
        "用最可爱的语气说一句情话",
        "唱一段你最拿手的歌",
        "做一个最夸张的表情并保持五秒",
        "模仿在场某个人的口头禅",
        "给最近联系的人发一句\"我想你了\"",
        "用左手写自己的名字",
        "闭眼单脚站立 15 秒",
      ],
    },
    normal: {
      truth: [
        "你最近一次撒谎是什么时候？为了什么？",
        "你最害怕什么？",
        "你做过最尴尬的一件事？",
        "你暗恋过谁？",
        "你最不想让别人知道的秘密？",
        "你最后一次哭是因为什么？",
        "你觉得现在的自己最大的缺点是什么？",
        "你做过最疯狂的事？",
        "你最想拥有什么超能力？为什么？",
        "你手机里最不想被看到的是什么？",
        "你最想对谁说一声对不起？",
        "你最珍惜的一段回忆是什么？",
      ],
      dare: [
        "模仿一只猫叫三声",
        "给最近联系的人发一句\"我想你了\"",
        "唱一段你最拿手的歌",
        "用最可爱的语气说一句情话",
        "做十个深蹲",
        "闭眼单脚站立 30 秒",
        "模仿在场某个人的口头禅",
        "用左手写自己的名字",
        "对着镜头做一个最丑的鬼脸",
        "学一种动物的走路姿势",
        "对 AI 说一句土味情话",
        "原地转三圈然后走直线",
      ],
    },
    hard: {
      truth: [
        "你做过最对不起别人的事是什么？",
        "你最害怕被揭露的秘密是什么？",
        "你最想和在场谁交换一天生活？",
        "如果可以重来一次，你最想改变什么？",
        "你最近一次心动是什么时候？为谁？",
        "你最在意的人是谁？为什么？",
        "你觉得自己最不堪的一面是什么？",
        "你做过最自私的决定是什么？",
      ],
      dare: [
        "用一门外语说\"我爱你\"并解释意思",
        "表演一段即兴 rap",
        "模仿打喷嚏打十次",
        "学婴儿说话十秒钟",
        "假装自己是新闻主播，播报今天的天气",
        "闭眼画一只猫",
        "给在场每个人说一句赞美",
        "打电话给一个许久没联系的朋友问候",
      ],
    },
  };

  const DIFF_LABELS = { easy: "轻松", normal: "普通", hard: "挑战" };
  const TYPE_LABELS = { truth: "真心话", dare: "大冒险" };

  function open() { global.Phone.Router.push("game-truth-dare", mount, {}); }

  async function _allQuestions(difficulty) {
    const builtIn = BANK[difficulty] || BANK.normal;
    let customs = [];
    try { customs = await global.Phone.Storage.getAll("game_truth_dare_custom"); } catch (e) {}
    const truth = builtIn.truth.slice();
    const dare = builtIn.dare.slice();
    customs.forEach((c) => {
      if (c.difficulty === difficulty || !c.difficulty) {
        if (c.type === "truth") truth.push(c.text);
        else if (c.type === "dare") dare.push(c.text);
      }
    });
    return { truth, dare };
  }

  async function mount(container) {
    global.Phone.Games.applyBg(container);
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "truth-or-dare");
    }
    page.appendChild(_nav(U, "真心话大冒险", () => _openSettings(U, () => _remount(container))));

    const stage = U.el("div", { class: "game-stage scroll", style: { padding: "16px" } });

    // ---------- 难度选择 ----------
    const curDiff = State.get("gamesDifficulty") || "normal";
    const diffSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "12px" } });
    let activeDiff = curDiff;
    [
      { v: "easy", l: "轻松" },
      { v: "normal", l: "普通" },
      { v: "hard", l: "挑战" },
    ].forEach((s) => {
      const node = U.el("div", { class: "segment-item" + (activeDiff === s.v ? " active" : ""), text: s.l });
      node.addEventListener("click", () => {
        activeDiff = s.v;
        diffSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
      });
      diffSeg.appendChild(node);
    });
    stage.appendChild(diffSeg);

    // ---------- 统计概览 ----------
    if (State.get("truthDareShowStats") !== false) {
      const all = await Storage.getAll("game_truth_dare");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const today = all.filter((r) => (r.createdAt || 0) >= t0.getTime()).length;
      const done = all.filter((r) => r.done).length;
      const skip = all.length - done;
      stage.appendChild(U.el("div", { class: "gm-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(all.length) }), U.el("div", { class: "msb-label", text: "总数" })]),
        U.el("div", { class: "msb-card highlight" }, [U.el("div", { class: "msb-num", text: String(done) }), U.el("div", { class: "msb-label", text: "完成" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(skip) }), U.el("div", { class: "msb-label", text: "跳过" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(today) }), U.el("div", { class: "msb-label", text: "今日" })]),
      ]));
    }

    // 当前题
    let curQ = null;
    let curType = State.get("truthDareDefaultType") || "truth";

    // 抽题卡
    const card = U.el("div", { class: "game-question" });
    const label = U.el("div", { class: "gq-label", text: "点下方按钮抽题" });
    const text = U.el("div", { class: "gq-text", text: "准备好了吗？" });
    card.appendChild(label);
    card.appendChild(text);
    stage.appendChild(card);

    // 类型选择
    const seg = U.el("div", { class: "seg-bar" });
    [{ k: "truth", t: "真心话" }, { k: "dare", t: "大冒险" }, { k: "random", t: "随机" }].forEach((s) => {
      const b = U.el("button", { class: "seg-btn" + (curType === s.k ? " active" : ""), text: s.t });
      b.addEventListener("click", () => {
        curType = s.k;
        seg.querySelectorAll(".seg-btn").forEach((n) => n.classList.remove("active"));
        b.classList.add("active");
      });
      seg.appendChild(b);
    });
    stage.appendChild(seg);

    // 抽题按钮
    const drawBtn = U.el("button", { class: "btn", text: "抽 一 题", style: { width: "100%", marginTop: "12px" } });
    drawBtn.addEventListener("click", () => _draw());
    stage.appendChild(drawBtn);

    // 操作行（完成 / 跳过）
    const actRow = U.el("div", { class: "row", style: { gap: "8px", marginTop: "12px" } });
    const doneBtn = U.el("button", { class: "btn btn-ghost", text: "完成了", style: { flex: "1" } });
    doneBtn.style.display = "none";
    doneBtn.addEventListener("click", () => _finish(true));
    const skipBtn = U.el("button", { class: "btn btn-text", text: "跳过", style: { flex: "1" } });
    skipBtn.style.display = "none";
    skipBtn.addEventListener("click", () => _finish(false));
    actRow.appendChild(doneBtn);
    actRow.appendChild(skipBtn);
    stage.appendChild(actRow);

    // 自定义题库入口
    const customBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "管理我的题库", style: { width: "100%", marginTop: "8px" } });
    customBtn.addEventListener("click", () => _openCustom(U));
    stage.appendChild(customBtn);

    // ---------- 历史 ----------
    const histTitle = U.el("div", { class: "section-title", text: "历史记录", style: { margin: "16px 0 8px" } });
    stage.appendChild(histTitle);
    const search = U.el("input", { class: "input", placeholder: "搜索记录...", style: { marginBottom: "8px" } });
    stage.appendChild(search);
    const histWrap = U.el("div", {});
    stage.appendChild(histWrap);

    async function _draw() {
      let type = curType;
      if (type === "random") type = Math.random() < 0.5 ? "truth" : "dare";
      const pool = await _allQuestions(activeDiff);
      const arr = type === "truth" ? pool.truth : pool.dare;
      if (arr.length === 0) {
        global.Phone.Notify.push({ appId: "games", title: "题库空空的，去管理我的题库加点吧" });
        return;
      }
      curQ = { type: type, text: arr[Math.floor(Math.random() * arr.length)], difficulty: activeDiff };
      label.textContent = TYPE_LABELS[type] + " · " + DIFF_LABELS[activeDiff];
      text.textContent = curQ.text;
      doneBtn.style.display = "";
      skipBtn.style.display = "";
    }

    async function _finish(done) {
      if (!curQ) return;
      const rec = {
        id: U.uid("td"),
        type: curQ.type,
        text: curQ.text,
        difficulty: curQ.difficulty,
        done: done,
        createdAt: Date.now(),
      };
      await Storage.put("game_truth_dare", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "truth-or-dare", type: curQ.type, done: done, difficulty: curQ.difficulty },
        summary: (done ? "完成了" : "跳过了") + "一道" + (curQ.type === "truth" ? "真心话" : "大冒险") + "（" + DIFF_LABELS[curQ.difficulty] + "）",
      });
      global.Phone.Notify.push({ appId: "games", title: done ? "真棒～做到了！" : "下次再挑战吧" });
      curQ = null;
      label.textContent = "点下方按钮抽题";
      text.textContent = "准备好了吗？";
      doneBtn.style.display = "none";
      skipBtn.style.display = "none";
      _loadHist();
      _refreshStats();
    }

    async function _refreshStats() {
      if (State.get("truthDareShowStats") === false) return;
      // 简单重挂载统计区
      const oldBar = stage.querySelector(".gm-stats-bar");
      if (!oldBar) return;
      const all = await Storage.getAll("game_truth_dare");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const today = all.filter((r) => (r.createdAt || 0) >= t0.getTime()).length;
      const done = all.filter((r) => r.done).length;
      const skip = all.length - done;
      const newBar = U.el("div", { class: "gm-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(all.length) }), U.el("div", { class: "msb-label", text: "总数" })]),
        U.el("div", { class: "msb-card highlight" }, [U.el("div", { class: "msb-num", text: String(done) }), U.el("div", { class: "msb-label", text: "完成" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(skip) }), U.el("div", { class: "msb-label", text: "跳过" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(today) }), U.el("div", { class: "msb-label", text: "今日" })]),
      ]);
      oldBar.replaceWith(newBar);
    }

    async function _loadHist() {
      const list = await Storage.getAll("game_truth_dare");
      list.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(histWrap);
      const kw = search.value.trim().toLowerCase();
      let filtered = list;
      if (kw) {
        filtered = list.filter((r) => (r.text || "").toLowerCase().includes(kw));
      }
      if (filtered.length === 0) {
        histWrap.appendChild(U.el("div", { class: "empty-text", text: list.length === 0 ? "还没有记录" : "没找到匹配的记录" }));
        return;
      }
      filtered.slice(0, 30).forEach((r) => {
        const item = U.el("div", { class: "memo-item" });
        const icon = U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get(r.type === "truth" ? "comment" : "dice", { size: 16 }) });
        item.appendChild(icon);
        const main = U.el("div", { class: "mi-main" });
        main.appendChild(U.el("div", { class: "mi-content", text: r.text }));
        main.appendChild(U.el("div", { class: "mi-meta", text: TYPE_LABELS[r.type] + " · " + (r.difficulty ? DIFF_LABELS[r.difficulty] + " · " : "") + (r.done ? "已完成" : "已跳过") + " · " + U.relTime(r.createdAt) }));
        item.appendChild(main);
        // 长按 600ms 删除
        let pressTimer = null;
        item.addEventListener("touchstart", () => {
          pressTimer = setTimeout(async () => {
            pressTimer = null;
            const ok = await global.Phone.Modal.confirm({ title: "删除记录", message: "删除这条记录？", danger: true });
            if (!ok) return;
            await Storage.del("game_truth_dare", r.id);
            _loadHist();
            _refreshStats();
          }, 600);
        });
        item.addEventListener("touchend", () => { if (pressTimer) clearTimeout(pressTimer); });
        item.addEventListener("touchmove", () => { if (pressTimer) clearTimeout(pressTimer); });
        item.addEventListener("contextmenu", async (e) => {
          e.preventDefault();
          const ok = await global.Phone.Modal.confirm({ title: "删除记录", message: "删除这条记录？", danger: true });
          if (!ok) return;
          await Storage.del("game_truth_dare", r.id);
          _loadHist();
          _refreshStats();
        });
        histWrap.appendChild(item);
      });
    }

    search.addEventListener("input", U.debounce(_loadHist, 200));
    _loadHist();
    page.appendChild(stage);
    container.appendChild(page);
  }

  // ---------- 自定义题库 ----------
  async function _openCustom(U) {
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal", style: { maxWidth: "420px" } });
    modal.appendChild(U.el("div", { class: "modal-title", text: "我的题库" }));
    const body = U.el("div", { class: "modal-body", style: { textAlign: "left", maxHeight: "60vh", overflowY: "auto" } });

    async function _loadCustom() {
      const list = await global.Phone.Storage.getAll("game_truth_dare_custom");
      list.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(body);
      if (list.length === 0) {
        body.appendChild(U.el("div", { class: "empty-text", text: "还没有自定义题，下方添加吧" }));
      } else {
        list.forEach((c) => {
          const row = U.el("div", { class: "memo-item" });
          row.appendChild(U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get(c.type === "truth" ? "comment" : "dice", { size: 16 }) }));
          const main = U.el("div", { class: "mi-main" });
          main.appendChild(U.el("div", { class: "mi-content", text: c.text }));
          main.appendChild(U.el("div", { class: "mi-meta", text: TYPE_LABELS[c.type] + " · " + (DIFF_LABELS[c.difficulty] || "通用") }));
          row.appendChild(main);
          const del = U.el("button", { class: "icon-btn btn-sm", html: global.Phone.IconLibrary.get("trash", { size: 16 }) });
          del.addEventListener("click", async () => {
            await global.Phone.Storage.del("game_truth_dare_custom", c.id);
            _loadCustom();
          });
          row.appendChild(del);
          body.appendChild(row);
        });
      }
    }

    // 添加表单
    const formGroup = U.el("div", { class: "form-group", style: { marginTop: "12px" } });
    const typeSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "8px" } });
    let newType = "truth";
    [{ k: "truth", t: "真心话" }, { k: "dare", t: "大冒险" }].forEach((s) => {
      const n = U.el("div", { class: "segment-item" + (newType === s.k ? " active" : ""), text: s.t });
      n.addEventListener("click", () => {
        newType = s.k;
        typeSeg.querySelectorAll(".segment-item").forEach((x) => x.classList.remove("active"));
        n.classList.add("active");
      });
      typeSeg.appendChild(n);
    });
    formGroup.appendChild(typeSeg);
    const diffSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "8px" } });
    let newDiff = "normal";
    [{ v: "easy", l: "轻松" }, { v: "normal", l: "普通" }, { v: "hard", l: "挑战" }].forEach((s) => {
      const n = U.el("div", { class: "segment-item" + (newDiff === s.v ? " active" : ""), text: s.l });
      n.addEventListener("click", () => {
        newDiff = s.v;
        diffSeg.querySelectorAll(".segment-item").forEach((x) => x.classList.remove("active"));
        n.classList.add("active");
      });
      diffSeg.appendChild(n);
    });
    formGroup.appendChild(diffSeg);
    const textIn = U.el("textarea", { class: "textarea", placeholder: "输入你的题目...", style: { marginBottom: "8px" } });
    formGroup.appendChild(textIn);
    const addBtn = U.el("button", { class: "btn btn-sm", text: "添加", style: { width: "100%" } });
    addBtn.addEventListener("click", async () => {
      const t = textIn.value.trim();
      if (!t) { global.Phone.Notify.push({ appId: "games", title: "题目不能为空" }); return; }
      await global.Phone.Storage.put("game_truth_dare_custom", {
        id: global.Phone.Utils.uid("tdc"),
        type: newType, difficulty: newDiff, text: t, createdAt: Date.now(),
      });
      textIn.value = "";
      global.Phone.Notify.push({ appId: "games", title: "已添加题目" });
      _loadCustom();
    });
    formGroup.appendChild(addBtn);

    body.appendChild(formGroup);
    modal.appendChild(body);
    const actions = U.el("div", { class: "modal-actions" });
    actions.appendChild(U.el("button", { class: "btn", text: "关闭", onclick: () => mask.remove() }));
    modal.appendChild(actions);
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
    _loadCustom();
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "truth-or-dare",
      title: "真心话大冒险设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("显示");
        tools.toggle("显示统计概览", "关闭后隐藏顶部的数字卡片", "truthDareShowStats", null);
        tools.toggle("显示历史记录", "在抽题页底部显示历史", "truthDareShowHistory", null);

        tools.section("默认题型");
        const curType = State.get("truthDareDefaultType") || "truth";
        const typeSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        [
          { v: "truth", l: "真心话" },
          { v: "dare", l: "大冒险" },
          { v: "random", l: "随机" },
        ].forEach((s) => {
          const node = U.el("div", { class: "segment-item" + (curType === s.v ? " active" : ""), text: s.l });
          node.addEventListener("click", async () => {
            await State.set("truthDareDefaultType", s.v);
            typeSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          typeSeg.appendChild(node);
        });
        const typeGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [typeSeg]);
        content.appendChild(typeGroup);

        tools.section("数据");
        tools.action("导出历史记录", async () => {
          const list = await global.Phone.Storage.getAll("game_truth_dare");
          const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "truth-dare-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
          URL.revokeObjectURL(url);
          global.Phone.Notify.push({ appId: "games", title: "已导出 " + list.length + " 条" });
        });
        tools.action("清空历史记录", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空记录", message: "删除所有真心话大冒险的历史？", danger: true, okText: "清空" });
          if (!ok) return;
          const list = await global.Phone.Storage.getAll("game_truth_dare");
          for (const r of list) await global.Phone.Storage.del("game_truth_dare", r.id);
          global.Phone.Notify.push({ appId: "games", title: "已清空" });
          onDone && onDone();
        }, { danger: true });
        tools.action("清空自定义题库", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空题库", message: "删除所有自定义题目？", danger: true, okText: "清空" });
          if (!ok) return;
          const list = await global.Phone.Storage.getAll("game_truth_dare_custom");
          for (const r of list) await global.Phone.Storage.del("game_truth_dare_custom", r.id);
          global.Phone.Notify.push({ appId: "games", title: "已清空题库" });
        }, { danger: true });

        tools.section("关于");
        tools.hint("真心话大冒险支持 3 个难度，每个难度都有内置题库，你也可以在「管理我的题库」里添加自定义题目。长按历史记录可删除。");
      },
    });
  }

  function _nav(U, title, onSettings) {
    const nav = U.el("div", { class: "navbar" });
    const left = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    left.appendChild(back);
    nav.appendChild(left);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    const right = U.el("div", { class: "nav-right" });
    if (onSettings) {
      const setBtn = U.el("button", { class: "icon-btn" });
      setBtn.innerHTML = global.Phone.IconLibrary.get("app-settings", { size: 20 });
      setBtn.addEventListener("click", onSettings);
      right.appendChild(setBtn);
    }
    nav.appendChild(right);
    return nav;
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 API ----------
  global.Phone.Games["truth-or-dare"] = {
    open, mount,
    /** 列出历史记录 */
    async list(filter) {
      let list = await global.Phone.Storage.getAll("game_truth_dare");
      if (filter) {
        if (filter.type) list = list.filter((r) => r.type === filter.type);
        if (filter.difficulty) list = list.filter((r) => r.difficulty === filter.difficulty);
        if (typeof filter.done === "boolean") list = list.filter((r) => r.done === filter.done);
      }
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    /** 添加自定义题 */
    async addCustom(opts) {
      const rec = {
        id: global.Phone.Utils.uid("tdc"),
        type: opts.type === "dare" ? "dare" : "truth",
        difficulty: opts.difficulty || "normal",
        text: String(opts.text || "").trim(),
        createdAt: Date.now(),
      };
      if (!rec.text) return { ok: false, error: "题目不能为空" };
      await global.Phone.Storage.put("game_truth_dare_custom", rec);
      return { ok: true, rec };
    },
    /** 列出自定义题 */
    async listCustom() {
      return await global.Phone.Storage.getAll("game_truth_dare_custom");
    },
    /** 统计 */
    async stats() {
      const list = await global.Phone.Storage.getAll("game_truth_dare");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      return {
        total: list.length,
        done: list.filter((r) => r.done).length,
        skipped: list.filter((r) => !r.done).length,
        today: list.filter((r) => (r.createdAt || 0) >= t0.getTime()).length,
        byType: {
          truth: list.filter((r) => r.type === "truth").length,
          dare: list.filter((r) => r.type === "dare").length,
        },
      };
    },
    /** 我抽一道题（不写入历史） */
    async draw(difficulty, type) {
      const diff = difficulty || global.Phone.State.get("gamesDifficulty") || "normal";
      let t = type || "random";
      if (t !== "truth" && t !== "dare") t = Math.random() < 0.5 ? "truth" : "dare";
      const pool = await _allQuestions(diff);
      const arr = t === "truth" ? pool.truth : pool.dare;
      if (!arr || arr.length === 0) return null;
      const text = arr[Math.floor(Math.random() * arr.length)];
      // 我判断一下是内置还是自定义题
      let source = "builtin";
      try {
        const customs = await global.Phone.Storage.getAll("game_truth_dare_custom");
        if (customs && customs.some((c) => c.text === text)) source = "custom";
      } catch (e) {}
      return { question: text, type: t, difficulty: diff, source: source };
    },
    /** 我提交一道题的结果（写入历史 + emit 事件） */
    async finish(question, done) {
      let q = question;
      if (typeof q === "string") q = { text: q };
      q = q || {};
      const text = String(q.question || q.text || "").trim();
      if (!text) return { ok: false, error: "题目不能为空" };
      const rec = {
        id: global.Phone.Utils.uid("td"),
        question: text,
        text: text, // 兼容现有 UI（UI 读 r.text）
        type: q.type === "dare" ? "dare" : (q.type === "truth" ? "truth" : "truth"),
        difficulty: q.difficulty || "normal",
        done: !!done,
        createdAt: Date.now(),
      };
      await global.Phone.Storage.put("game_truth_dare", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "truth-or-dare", type: rec.type, done: rec.done, difficulty: rec.difficulty },
        summary: rec.done ? "我完成了一道题" : "我跳过了一道题",
      });
      return { ok: true, rec };
    },
    /** 我删除一道自定义题 */
    async removeCustom(id) {
      if (!id) return { ok: false, error: "缺少 id" };
      await global.Phone.Storage.del("game_truth_dare_custom", id);
      return { ok: true };
    },
    /** 我把题库列出来（内置 + 自定义，按难度和类型筛选） */
    async listQuestions(difficulty, type) {
      const out = [];
      const diffs = difficulty ? [difficulty] : Object.keys(BANK);
      for (const d of diffs) {
        const bank = BANK[d] || BANK.normal;
        const types = type ? [type] : ["truth", "dare"];
        for (const t of types) {
          (bank[t] || []).forEach((text) => {
            out.push({ question: text, type: t, difficulty: d, source: "builtin" });
          });
        }
      }
      // 合并自定义
      let customs = [];
      try { customs = await global.Phone.Storage.getAll("game_truth_dare_custom"); } catch (e) {}
      customs.forEach((c) => {
        if (difficulty && c.difficulty && c.difficulty !== difficulty) return;
        if (type && c.type !== type) return;
        out.push({
          id: c.id,
          question: c.text,
          type: c.type || "truth",
          difficulty: c.difficulty || "normal",
          source: "custom",
        });
      });
      return out;
    },
    /** 我清空历史记录 */
    async clearHistory() {
      const list = await global.Phone.Storage.getAll("game_truth_dare");
      for (const r of list) await global.Phone.Storage.del("game_truth_dare", r.id);
      return { ok: true, cleared: list.length };
    },
    /** 我读一下某个设置（key 不带 truthDare 前缀） */
    getSetting(key) {
      const map = { defaultType: "truthDareDefaultType", showHistory: "truthDareShowHistory", showStats: "truthDareShowStats" };
      const realKey = map[key] || ("truthDare" + (key ? key.charAt(0).toUpperCase() + key.slice(1) : ""));
      return global.Phone.State.get(realKey);
    },
    /** 我改一下某个设置（key 不带 truthDare 前缀） */
    async setSetting(key, value) {
      const map = { defaultType: "truthDareDefaultType", showHistory: "truthDareShowHistory", showStats: "truthDareShowStats" };
      const realKey = map[key] || ("truthDare" + (key ? key.charAt(0).toUpperCase() + key.slice(1) : ""));
      await global.Phone.State.set(realKey, value);
      return value;
    },
    /** 我把所有设置列出来 */
    listSettings() {
      const State = global.Phone.State;
      return {
        defaultType: State.get("truthDareDefaultType"),
        showHistory: State.get("truthDareShowHistory"),
        showStats: State.get("truthDareShowStats"),
      };
    },
  };
})(window);
