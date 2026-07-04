/* ============================================================
   tarot.js — 塔罗牌占卜（专业版）
   对齐参考：测测星座 / 塔罗占卜 / Labyrinthos
   功能：
     - 22 张大阿卡纳 / 翻牌动画 / 牌意（正位 / 逆位）
     - 牌阵：单张 / 过去·现在·未来（三张）
     - 问题输入（占卜前默念问题）
     - 牌详情：点击已翻开的牌查看完整含义
     - 统计概览：占卜次数 / 今日 / 最近一张 / 收藏牌
     - 历史搜索 + 长按删除
     - 设置页：默认牌阵 / 显示统计 / 清空 / 导出 / 关于
   数据存 game_tarot 表，事件 GAME_PLAYED
   挂在 window.Phone.Games["tarot"]
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.Games = global.Phone.Games || {};

  // 22 张大阿卡纳：{ name, upright（正位）, reversed（逆位）, element }
  const CARDS = [
    { name: "愚者",     upright: "新的开始，纯真，自由，冒险",           reversed: "鲁莽，冲动，缺乏计划",            element: "风" },
    { name: "魔术师",   upright: "创造，行动，技能，意志力",             reversed: "操纵，缺乏自信，未发挥才能",      element: "风" },
    { name: "女祭司",   upright: "直觉，神秘，内在智慧",                 reversed: "隐秘，压抑直觉，信息不全",        element: "水" },
    { name: "皇后",     upright: "丰饶，母性，温暖，创造",               reversed: "过度依赖，占有欲，停滞",          element: "土" },
    { name: "皇帝",     upright: "权威，秩序，稳定，掌控",               reversed: "专横，僵化，控制欲强",            element: "火" },
    { name: "教皇",     upright: "传统，信仰，教导，归属",               reversed: "叛逆，墨守成规，盲从",            element: "土" },
    { name: "恋人",     upright: "爱，选择，和谐，结合",                 reversed: "分歧，失衡，错误选择",            element: "风" },
    { name: "战车",     upright: "胜利，意志，前进，克服",               reversed: "失控，方向不明，挫败",            element: "水" },
    { name: "力量",     upright: "勇气，耐心，柔能克刚",                 reversed: "自我怀疑，软弱，失控",            element: "火" },
    { name: "隐者",     upright: "独处，内省，寻求答案",                 reversed: "孤立，退缩，迷失",                element: "土" },
    { name: "命运之轮", upright: "转机，循环，好运降临",                 reversed: "逆境，失控，延误",                element: "火" },
    { name: "正义",     upright: "公平，因果，真相，裁决",               reversed: "不公，偏颇，逃避责任",            element: "风" },
    { name: "倒吊人",   upright: "牺牲，换角度，暂停",                   reversed: "无谓牺牲，停滞，固执",            element: "水" },
    { name: "死神",     upright: "结束，转变，新生，放下",               reversed: "抗拒改变，拖延，停滞",            element: "水" },
    { name: "节制",     upright: "平衡，调和，耐心，融合",               reversed: "失衡，过度，急躁",                element: "火" },
    { name: "恶魔",     upright: "束缚，欲望，执念，物质",               reversed: "解脱，觉醒，挣脱",                element: "土" },
    { name: "塔",       upright: "突变，崩塌，启示，重建",               reversed: "避免灾难，抗拒变化",              element: "火" },
    { name: "星星",     upright: "希望，灵感，宁静，信念",               reversed: "失望，悲观，失去方向",            element: "风" },
    { name: "月亮",     upright: "幻觉，潜意识，直觉，不安",             reversed: "释惑，真相显露，走出迷雾",        element: "水" },
    { name: "太阳",     upright: "快乐，成功，活力，明朗",               reversed: "短暂的阴霾，过度乐观",            element: "火" },
    { name: "审判",     upright: "觉醒，召唤，重生，决断",               reversed: "自我怀疑，逃避召唤",              element: "火" },
    { name: "世界",     upright: "圆满，完成，成就，旅程终点",           reversed: "未完成，停滞，差一步",            element: "土" },
  ];

  const SPREADS = {
    single: { name: "单张", positions: ["当下"] },
    three:  { name: "过去·现在·未来", positions: ["过去", "现在", "未来"] },
  };

  function open() { global.Phone.Router.push("game-tarot", mount, {}); }

  function _pick(spreadKey) {
    const positions = SPREADS[spreadKey].positions;
    const idxs = [];
    while (idxs.length < positions.length) {
      const i = Math.floor(Math.random() * CARDS.length);
      if (idxs.indexOf(i) < 0) idxs.push(i);
    }
    return idxs.map((i, k) => {
      const c = CARDS[i];
      return {
        name: c.name,
        upright: c.upright,
        reversed: c.reversed,
        element: c.element,
        isReversed: Math.random() < 0.5,
        position: positions[k],
      };
    });
  }

  async function mount(container) {
    global.Phone.Games.applyBg(container);
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const curSpread = State.get("tarotDefaultSpread") === "single" ? "single" : "three";

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "tarot");
    }
    page.appendChild(_nav(U, "塔罗牌占卜", () => _openSettings(U, () => _remount(container))));

    const stage = U.el("div", { class: "game-stage scroll", style: { padding: "16px" } });

    // ---------- 统计概览 ----------
    if (State.get("tarotShowStats") !== false) {
      const all = await Storage.getAll("game_tarot");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const today = all.filter((r) => (r.createdAt || 0) >= t0.getTime()).length;
      // 最近一张牌
      let lastCard = "—";
      if (all.length > 0) {
        const sorted = all.slice().sort((a, b) => b.createdAt - a.createdAt);
        const cards = sorted[0].cards || [];
        if (cards.length > 0) lastCard = cards[0].name;
      }
      // 最常出现的牌
      const cardCount = {};
      all.forEach((r) => (r.cards || []).forEach((c) => { cardCount[c.name] = (cardCount[c.name] || 0) + 1; }));
      let topCard = "—";
      let topN = 0;
      Object.keys(cardCount).forEach((k) => { if (cardCount[k] > topN) { topN = cardCount[k]; topCard = k; } });
      stage.appendChild(U.el("div", { class: "gm-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(all.length) }), U.el("div", { class: "msb-label", text: "占卜" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(today) }), U.el("div", { class: "msb-label", text: "今日" })]),
        U.el("div", { class: "msb-card highlight" }, [U.el("div", { class: "msb-num", text: lastCard, style: { fontSize: "var(--font-sm)" } }), U.el("div", { class: "msb-label", text: "最近" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: topCard, style: { fontSize: "var(--font-sm)" } }), U.el("div", { class: "msb-label", text: "最常出现" })]),
      ]));
    }

    // 说明
    const intro = U.el("div", { class: "card-soft", style: { marginBottom: "12px", textAlign: "center" } });
    intro.appendChild(U.el("div", { text: "静下心来，默念你的问题", style: { fontWeight: "500" } }));
    intro.appendChild(U.el("div", { class: "muted", text: "抽 " + SPREADS[curSpread].positions.length + " 张牌 · " + SPREADS[curSpread].name, style: { fontSize: "var(--font-xs)", marginTop: "4px" } }));
    stage.appendChild(intro);

    // 问题输入
    const questionIn = U.el("input", { class: "input", placeholder: "（可选）输入你想问的问题...", style: { marginBottom: "12px", textAlign: "center" } });
    stage.appendChild(questionIn);

    // 牌位
    const board = U.el("div", { class: "tarot-board" });
    const slots = [];
    const positions = SPREADS[curSpread].positions;
    for (let i = 0; i < positions.length; i++) {
      const slot = U.el("div", { class: "tarot-slot" });
      slot.appendChild(U.el("div", { class: "tarot-pos", text: positions[i] }));
      const card = U.el("div", { class: "tarot-card" });
      const back = U.el("div", { class: "tc-back", html: global.Phone.IconLibrary.get("card-tarot", { size: 32 }) });
      const face = U.el("div", { class: "tc-face" });
      card.appendChild(back);
      card.appendChild(face);
      slot.appendChild(card);
      board.appendChild(slot);
      slots.push({ card: card, face: face, pos: positions[i], revealed: false, pick: null });
    }
    stage.appendChild(board);

    // 解读区
    const reading = U.el("div", { class: "card-soft", style: { display: "none", marginBottom: "12px" } });
    stage.appendChild(reading);

    // 抽牌按钮
    const drawBtn = U.el("button", { class: "btn", text: "抽 牌", style: { width: "100%" } });
    stage.appendChild(drawBtn);

    // 历史
    stage.appendChild(U.el("div", { class: "section-title", text: "历史占卜", style: { margin: "16px 0 8px" } }));
    const search = U.el("input", { class: "input", placeholder: "搜索占卜记录...", style: { marginBottom: "8px" } });
    stage.appendChild(search);
    const histWrap = U.el("div", {});
    stage.appendChild(histWrap);

    let drawing = false;

    async function _draw() {
      if (drawing) return;
      drawing = true;
      drawBtn.disabled = true;
      // 重置牌面
      slots.forEach((s) => {
        s.card.classList.remove("flipped");
        s.revealed = false;
        U.empty(s.face);
      });
      reading.style.display = "none";

      const picks = _pick(curSpread);
      picks.forEach((p, i) => { slots[i].pick = p; });

      // 依次翻牌
      for (let i = 0; i < picks.length; i++) {
        const s = slots[i];
        s.face.appendChild(U.el("div", { class: "tc-name", text: picks[i].name }));
        s.face.appendChild(U.el("div", { class: "tc-orient", text: picks[i].isReversed ? "逆位" : "正位" }));
        s.face.appendChild(U.el("div", { class: "tc-meaning", text: picks[i].isReversed ? picks[i].reversed : picks[i].upright }));
        if (picks[i].isReversed) s.face.style.transform = "rotateY(180deg) rotate(180deg)";
        else s.face.style.transform = "rotateY(180deg)";
        await new Promise((r) => setTimeout(r, 350));
        s.card.classList.add("flipped");
        s.revealed = true;
        // 点击已翻开的牌查看详情
        s.card.addEventListener("click", () => {
          if (s.revealed && s.pick) _showCardDetail(U, s.pick);
        });
        await new Promise((r) => setTimeout(r, 250));
      }

      // 解读
      reading.style.display = "";
      U.empty(reading);
      const q = questionIn.value.trim();
      reading.appendChild(U.el("div", { text: q ? "关于「" + q + "」" : "塔罗的悄悄话", style: { fontWeight: "600", marginBottom: "8px" } }));
      picks.forEach((p, i) => {
        const row = U.el("div", { class: "mi-content", style: { marginBottom: "6px" } });
        row.appendChild(U.el("div", { class: "muted", text: p.position + " · " + p.name + "（" + (p.isReversed ? "逆位" : "正位") + "）", style: { fontSize: "var(--font-xs)" } }));
        row.appendChild(U.el("div", { text: p.isReversed ? p.reversed : p.upright }));
        reading.appendChild(row);
      });

      // 存历史 + 事件
      const rec = {
        id: U.uid("tr"),
        cards: picks.map((p) => ({ name: p.name, isReversed: p.isReversed, position: p.position })),
        question: q,
        spread: curSpread,
        createdAt: Date.now(),
      };
      await Storage.put("game_tarot", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "tarot", cards: rec.cards, question: q, spread: curSpread },
        summary: "塔罗占卜：" + picks.map((p) => p.name + (p.isReversed ? "(逆)" : "(正)")).join(" / "),
      });

      drawBtn.disabled = false;
      drawBtn.textContent = "再 占 一 次";
      drawing = false;
      _loadHist();
      _refreshStats();
    }

    async function _refreshStats() {
      if (State.get("tarotShowStats") === false) return;
      const oldBar = stage.querySelector(".gm-stats-bar");
      if (!oldBar) return;
      const all = await Storage.getAll("game_tarot");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const today = all.filter((r) => (r.createdAt || 0) >= t0.getTime()).length;
      let lastCard = "—";
      if (all.length > 0) {
        const sorted = all.slice().sort((a, b) => b.createdAt - a.createdAt);
        const cards = sorted[0].cards || [];
        if (cards.length > 0) lastCard = cards[0].name;
      }
      const cardCount = {};
      all.forEach((r) => (r.cards || []).forEach((c) => { cardCount[c.name] = (cardCount[c.name] || 0) + 1; }));
      let topCard = "—";
      let topN = 0;
      Object.keys(cardCount).forEach((k) => { if (cardCount[k] > topN) { topN = cardCount[k]; topCard = k; } });
      const newBar = U.el("div", { class: "gm-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(all.length) }), U.el("div", { class: "msb-label", text: "占卜" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(today) }), U.el("div", { class: "msb-label", text: "今日" })]),
        U.el("div", { class: "msb-card highlight" }, [U.el("div", { class: "msb-num", text: lastCard, style: { fontSize: "var(--font-sm)" } }), U.el("div", { class: "msb-label", text: "最近" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: topCard, style: { fontSize: "var(--font-sm)" } }), U.el("div", { class: "msb-label", text: "最常出现" })]),
      ]);
      oldBar.replaceWith(newBar);
    }

    async function _loadHist() {
      const list = await Storage.getAll("game_tarot");
      list.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(histWrap);
      const kw = search.value.trim().toLowerCase();
      let filtered = list;
      if (kw) {
        filtered = list.filter((r) => ((r.question || "") + " " + (r.cards || []).map((c) => c.name).join(" ")).toLowerCase().includes(kw));
      }
      if (filtered.length === 0) {
        histWrap.appendChild(U.el("div", { class: "empty-text", text: list.length === 0 ? "还没有记录" : "没找到匹配的记录" }));
        return;
      }
      filtered.slice(0, 30).forEach((r) => {
        const item = U.el("div", { class: "memo-item" });
        const icon = U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get("card-tarot", { size: 16 }) });
        item.appendChild(icon);
        const main = U.el("div", { class: "mi-main" });
        const txt = (r.cards || []).map((c) => c.name + (c.isReversed ? "(逆)" : "(正)")).join(" / ");
        main.appendChild(U.el("div", { class: "mi-content", text: r.question ? "「" + r.question + "」" + txt : txt }));
        main.appendChild(U.el("div", { class: "mi-meta", text: (SPREADS[r.spread] ? SPREADS[r.spread].name : "三张") + " · " + U.relTime(r.createdAt) }));
        item.appendChild(main);
        // 点击查看详情
        item.style.cursor = "pointer";
        item.addEventListener("click", () => _showHistoryDetail(U, r));
        let pressTimer = null;
        item.addEventListener("touchstart", () => {
          pressTimer = setTimeout(async () => {
            pressTimer = null;
            const ok = await global.Phone.Modal.confirm({ title: "删除记录", message: "删除这条占卜记录？", danger: true });
            if (!ok) return;
            await Storage.del("game_tarot", r.id);
            _loadHist();
            _refreshStats();
          }, 600);
        });
        item.addEventListener("touchend", () => { if (pressTimer) clearTimeout(pressTimer); });
        item.addEventListener("touchmove", () => { if (pressTimer) clearTimeout(pressTimer); });
        item.addEventListener("contextmenu", async (e) => {
          e.preventDefault();
          const ok = await global.Phone.Modal.confirm({ title: "删除记录", message: "删除这条占卜记录？", danger: true });
          if (!ok) return;
          await Storage.del("game_tarot", r.id);
          _loadHist();
          _refreshStats();
        });
        histWrap.appendChild(item);
      });
    }

    drawBtn.addEventListener("click", _draw);
    search.addEventListener("input", U.debounce(_loadHist, 200));
    _loadHist();
    page.appendChild(stage);
    container.appendChild(page);
  }

  // ---------- 单牌详情 ----------
  function _showCardDetail(U, pick) {
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal", style: { maxWidth: "360px" } });
    modal.appendChild(U.el("div", { class: "modal-title", text: pick.name + "（" + (pick.isReversed ? "逆位" : "正位") + "）" }));
    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });
    body.appendChild(U.el("div", { class: "muted", text: "位置：" + pick.position + " · 元素：" + (pick.element || "—"), style: { marginBottom: "8px", fontSize: "var(--font-xs)" } }));
    body.appendChild(U.el("div", { class: "form-label", text: "正位含义" }));
    body.appendChild(U.el("div", { text: pick.upright, style: { marginBottom: "10px" } }));
    body.appendChild(U.el("div", { class: "form-label", text: "逆位含义" }));
    body.appendChild(U.el("div", { text: pick.reversed }));
    modal.appendChild(body);
    const actions = U.el("div", { class: "modal-actions" });
    actions.appendChild(U.el("button", { class: "btn", text: "关闭", onclick: () => mask.remove() }));
    modal.appendChild(actions);
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 历史详情 ----------
  function _showHistoryDetail(U, rec) {
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal", style: { maxWidth: "420px" } });
    modal.appendChild(U.el("div", { class: "modal-title", text: rec.question ? "「" + rec.question + "」" : "占卜记录" }));
    const body = U.el("div", { class: "modal-body", style: { textAlign: "left", maxHeight: "60vh", overflowY: "auto" } });
    body.appendChild(U.el("div", { class: "muted", text: (SPREADS[rec.spread] ? SPREADS[rec.spread].name : "三张") + " · " + new Date(rec.createdAt).toLocaleString(), style: { fontSize: "var(--font-xs)", marginBottom: "10px" } }));
    (rec.cards || []).forEach((c) => {
      const card = CARDS.find((x) => x.name === c.name) || { upright: "", reversed: "" };
      body.appendChild(U.el("div", { class: "form-label", text: c.position + " · " + c.name + "（" + (c.isReversed ? "逆位" : "正位") + "）" }));
      body.appendChild(U.el("div", { text: c.isReversed ? card.reversed : card.upright, style: { marginBottom: "10px" } }));
    });
    modal.appendChild(body);
    const actions = U.el("div", { class: "modal-actions" });
    actions.appendChild(U.el("button", { class: "btn", text: "关闭", onclick: () => mask.remove() }));
    modal.appendChild(actions);
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "tarot",
      title: "塔罗占卜设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("显示");
        tools.toggle("显示统计概览", "关闭后隐藏顶部的数字卡片", "tarotShowStats", null);
        tools.toggle("显示历史记录", "在占卜页底部显示历史", "tarotShowHistory", null);

        tools.section("默认牌阵");
        const curSpread = State.get("tarotDefaultSpread") === "single" ? "single" : "three";
        const spreadSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        [
          { v: "single", l: "单张" },
          { v: "three", l: "过去·现在·未来" },
        ].forEach((s) => {
          const node = U.el("div", { class: "segment-item" + (curSpread === s.v ? " active" : ""), text: s.l });
          node.addEventListener("click", async () => {
            await State.set("tarotDefaultSpread", s.v);
            spreadSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          spreadSeg.appendChild(node);
        });
        const spreadGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [spreadSeg]);
        content.appendChild(spreadGroup);

        tools.section("数据");
        tools.action("导出历史记录", async () => {
          const list = await global.Phone.Storage.getAll("game_tarot");
          const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "tarot-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
          URL.revokeObjectURL(url);
          global.Phone.Notify.push({ appId: "games", title: "已导出 " + list.length + " 条" });
        });
        tools.action("清空历史记录", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空记录", message: "删除所有塔罗占卜的历史？", danger: true, okText: "清空" });
          if (!ok) return;
          const list = await global.Phone.Storage.getAll("game_tarot");
          for (const r of list) await global.Phone.Storage.del("game_tarot", r.id);
          global.Phone.Notify.push({ appId: "games", title: "已清空" });
          onDone && onDone();
        }, { danger: true });

        tools.section("关于");
        tools.hint("塔罗占卜包含 22 张大阿卡纳，支持单张和过去·现在·未来两种牌阵。占卜前可默念问题，翻牌后点击牌面可看完整含义。长按历史记录可删除。");
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
  global.Phone.Games["tarot"] = {
    open, mount,
    /** 列出占卜记录 */
    async list(filter) {
      let list = await global.Phone.Storage.getAll("game_tarot");
      if (filter) {
        if (filter.spread) list = list.filter((r) => r.spread === filter.spread);
        if (filter.since) list = list.filter((r) => (r.createdAt || 0) >= filter.since);
      }
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    /** 抽一次牌（不存档，仅返回结果） */
    draw(spreadKey) {
      const sk = spreadKey === "single" ? "single" : "three";
      return _pick(sk);
    },
    /** 查牌意 */
    cardInfo(name) {
      const c = CARDS.find((x) => x.name === name);
      if (!c) return null;
      return { name: c.name, upright: c.upright, reversed: c.reversed, element: c.element };
    },
    /** 列出所有牌 */
    listCards() { return CARDS.slice(); },
    /** 统计 */
    async stats() {
      const list = await global.Phone.Storage.getAll("game_tarot");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const cardCount = {};
      list.forEach((r) => (r.cards || []).forEach((c) => { cardCount[c.name] = (cardCount[c.name] || 0) + 1; }));
      let topCard = null;
      let topN = 0;
      Object.keys(cardCount).forEach((k) => { if (cardCount[k] > topN) { topN = cardCount[k]; topCard = k; } });
      return {
        total: list.length,
        today: list.filter((r) => (r.createdAt || 0) >= t0.getTime()).length,
        topCard,
        topCardCount: topN,
        uniqueCards: Object.keys(cardCount).length,
      };
    },
  };
})(window);
