/* ============================================================
   tarot.js — 塔罗牌占卜
   22 张大阿卡纳 / 抽 3 张（过去·现在·未来）/ 翻牌动画 / 牌意
   数据存 game_tarot 表，事件 GAME_PLAYED
   挂在 window.Phone.Games["tarot"]
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.Games = global.Phone.Games || {};

  // 22 张大阿卡纳：{ name, upright（正位）, reversed（逆位） }
  const CARDS = [
    { name: "愚者",     upright: "新的开始，纯真，自由，冒险",           reversed: "鲁莽，冲动，缺乏计划" },
    { name: "魔术师",   upright: "创造，行动，技能，意志力",             reversed: "操纵，缺乏自信，未发挥才能" },
    { name: "女祭司",   upright: "直觉，神秘，内在智慧",                 reversed: "隐秘，压抑直觉，信息不全" },
    { name: "皇后",     upright: "丰饶，母性，温暖，创造",               reversed: "过度依赖，占有欲，停滞" },
    { name: "皇帝",     upright: "权威，秩序，稳定，掌控",               reversed: "专横，僵化，控制欲强" },
    { name: "教皇",     upright: "传统，信仰，教导，归属",               reversed: "叛逆，墨守成规，盲从" },
    { name: "恋人",     upright: "爱，选择，和谐，结合",                 reversed: "分歧，失衡，错误选择" },
    { name: "战车",     upright: "胜利，意志，前进，克服",               reversed: "失控，方向不明，挫败" },
    { name: "力量",     upright: "勇气，耐心，柔能克刚",                 reversed: "自我怀疑，软弱，失控" },
    { name: "隐者",     upright: "独处，内省，寻求答案",                 reversed: "孤立，退缩，迷失" },
    { name: "命运之轮", upright: "转机，循环，好运降临",                 reversed: "逆境，失控，延误" },
    { name: "正义",     upright: "公平，因果，真相，裁决",               reversed: "不公，偏颇，逃避责任" },
    { name: "倒吊人",   upright: "牺牲，换角度，暂停",                   reversed: "无谓牺牲，停滞，固执" },
    { name: "死神",     upright: "结束，转变，新生，放下",               reversed: "抗拒改变，拖延，停滞" },
    { name: "节制",     upright: "平衡，调和，耐心，融合",               reversed: "失衡，过度，急躁" },
    { name: "恶魔",     upright: "束缚，欲望，执念，物质",               reversed: "解脱，觉醒，挣脱" },
    { name: "塔",       upright: "突变，崩塌， revelations，重建",        reversed: "避免灾难，抗拒变化" },
    { name: "星星",     upright: "希望，灵感，宁静，信念",               reversed: "失望，悲观，失去方向" },
    { name: "月亮",     upright: "幻觉，潜意识，直觉，不安",             reversed: "释惑，真相显露，走出迷雾" },
    { name: "太阳",     upright: "快乐，成功，活力，明朗",               reversed: "短暂的阴霾，过度乐观" },
    { name: "审判",     upright: "觉醒，召唤，重生，决断",               reversed: "自我怀疑，逃避召唤" },
    { name: "世界",     upright: "圆满，完成，成就，旅程终点",           reversed: "未完成，停滞，差一步" },
  ];

  const POSITIONS = ["过去", "现在", "未来"];

  function open() { global.Phone.Router.push("game-tarot", mount, {}); }

  function _pick3() {
    const idxs = [];
    while (idxs.length < 3) {
      const i = Math.floor(Math.random() * CARDS.length);
      if (idxs.indexOf(i) < 0) idxs.push(i);
    }
    return idxs.map((i) => {
      const c = CARDS[i];
      return { name: c.name, upright: c.upright, reversed: c.reversed, isReversed: Math.random() < 0.5 };
    });
  }

  async function mount(container) {
    global.Phone.Games.applyBg(container);
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;

    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(U, "塔罗牌占卜"));
    const stage = U.el("div", { class: "game-stage" });

    // 说明
    const intro = U.el("div", { class: "card-soft", style: { marginBottom: "12px", textAlign: "center" } });
    intro.appendChild(U.el("div", { text: "🃏 静心默念你的问题", style: { fontWeight: "500" } }));
    intro.appendChild(U.el("div", { class: "muted", text: "抽三张牌，分别代表过去、现在、未来", style: { fontSize: "var(--font-xs)", marginTop: "4px" } }));
    stage.appendChild(intro);

    // 牌位
    const board = U.el("div", { class: "tarot-board" });
    const slots = [];
    for (let i = 0; i < 3; i++) {
      const slot = U.el("div", { class: "tarot-slot" });
      slot.appendChild(U.el("div", { class: "tarot-pos", text: POSITIONS[i] }));
      const card = U.el("div", { class: "tarot-card" });
      const back = U.el("div", { class: "tc-back", html: global.Phone.IconLibrary.get("card-tarot", { size: 32 }) });
      const face = U.el("div", { class: "tc-face" });
      card.appendChild(back);
      card.appendChild(face);
      slot.appendChild(card);
      board.appendChild(slot);
      slots.push({ card: card, face: face, pos: POSITIONS[i], revealed: false });
    }
    stage.appendChild(board);

    // 解读区
    const reading = U.el("div", { class: "card-soft", style: { display: "none", marginBottom: "12px" } });
    stage.appendChild(reading);

    // 抽牌按钮
    const drawBtn = U.el("button", { class: "btn", text: "抽 三 张 牌", style: { width: "100%" } });
    stage.appendChild(drawBtn);

    // 历史
    stage.appendChild(U.el("div", { class: "section-title", text: "历史占卜", style: { margin: "16px 0 8px" } }));
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

      const picks = _pick3();
      // 依次翻牌
      for (let i = 0; i < 3; i++) {
        const s = slots[i];
        s.face.appendChild(U.el("div", { class: "tc-name", text: picks[i].name }));
        s.face.appendChild(U.el("div", { class: "tc-orient", text: picks[i].isReversed ? "逆位" : "正位" }));
        s.face.appendChild(U.el("div", { class: "tc-meaning", text: picks[i].isReversed ? picks[i].reversed : picks[i].upright }));
        if (picks[i].isReversed) s.face.style.transform = "rotateY(180deg) rotate(180deg)";
        else s.face.style.transform = "rotateY(180deg)";
        await new Promise((r) => setTimeout(r, 350));
        s.card.classList.add("flipped");
        s.revealed = true;
        await new Promise((r) => setTimeout(r, 250));
      }

      // 解读
      reading.style.display = "";
      U.empty(reading);
      reading.appendChild(U.el("div", { text: "📖 解读", style: { fontWeight: "600", marginBottom: "8px" } }));
      picks.forEach((p, i) => {
        const row = U.el("div", { class: "mi-content", style: { marginBottom: "6px" } });
        row.appendChild(U.el("div", { class: "muted", text: POSITIONS[i] + " · " + p.name + "（" + (p.isReversed ? "逆位" : "正位") + "）", style: { fontSize: "var(--font-xs)" } }));
        row.appendChild(U.el("div", { text: p.isReversed ? p.reversed : p.upright }));
        reading.appendChild(row);
      });

      // 存历史 + 事件（position 直接用循环索引 i，避免重名牌时 indexOf 出错）
      const rec = {
        id: U.uid("tr"),
        cards: picks.map((p, i) => ({ name: p.name, isReversed: p.isReversed, position: POSITIONS[i] })),
        question: "",
        createdAt: Date.now(),
      };
      await Storage.put("game_tarot", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "tarot", cards: rec.cards },
        summary: "塔罗占卜：" + picks.map((p) => p.name + (p.isReversed ? "(逆)" : "(正)")).join(" / "),
      });

      drawBtn.disabled = false;
      drawBtn.textContent = "再 占 一 次";
      drawing = false;
      _loadHist();
    }

    async function _loadHist() {
      const list = await Storage.getAll("game_tarot");
      list.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(histWrap);
      if (list.length === 0) {
        histWrap.appendChild(U.el("div", { class: "empty-text", text: "还没有记录" }));
        return;
      }
      list.slice(0, 20).forEach((r) => {
        const item = U.el("div", { class: "memo-item" });
        const icon = U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get("card-tarot", { size: 16 }) });
        item.appendChild(icon);
        const main = U.el("div", { class: "mi-main" });
        const txt = (r.cards || []).map((c) => c.name + (c.isReversed ? "(逆)" : "(正)")).join(" / ");
        main.appendChild(U.el("div", { class: "mi-content", text: txt }));
        main.appendChild(U.el("div", { class: "mi-meta", text: U.relTime(r.createdAt) }));
        item.appendChild(main);
        histWrap.appendChild(item);
      });
    }

    drawBtn.addEventListener("click", _draw);
    _loadHist();
    page.appendChild(stage);
    container.appendChild(page);
  }

  function _nav(U, title) {
    const nav = U.el("div", { class: "navbar" });
    const left = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    left.appendChild(back);
    nav.appendChild(left);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    nav.appendChild(U.el("div", { class: "nav-right" }));
    return nav;
  }

  global.Phone.Games["tarot"] = { open, mount };
})(window);
