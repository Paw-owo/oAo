/* ============================================================
   liar-dice.js — 骗子酒馆
   摇 5 个骰子比点数总和 / 下注（联动钱包）/ 历史记录
   数据存 game_liar_dice 表，事件 GAME_PLAYED + WALLET_CHANGED
   挂在 window.Phone.Games["liar-dice"]
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.Games = global.Phone.Games || {};

  function open() { global.Phone.Router.push("game-liar-dice", mount, {}); }

  function _rollDice() {
    const d = [];
    for (let i = 0; i < 5; i++) d.push(1 + Math.floor(Math.random() * 6));
    return d;
  }

  function _diceHtml(U, dice) {
    return dice.map((n) => {
      const cell = U.el("div", { class: "dice-cell", text: String(n) });
      return cell;
    });
  }

  async function mount(container) {
    global.Phone.Games.applyBg(container);
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const Wallet = global.Phone.Wallet;

    const w = await Storage.get("wallet", "main");
    const balance = w ? (w.userBalance || 0) : 0;

    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(U, "骗子酒馆"));
    const stage = U.el("div", { class: "game-stage" });

    // 余额
    const balCard = U.el("div", { class: "card-soft", style: { marginBottom: "12px" } });
    balCard.appendChild(U.el("div", { class: "muted", text: "当前余额", style: { fontSize: "var(--font-xs)" } }));
    const balText = U.el("div", { text: "💰 " + balance, style: { fontSize: "var(--font-lg)", fontWeight: "600" } });
    balCard.appendChild(balText);
    stage.appendChild(balCard);

    // 下注
    const betRow = U.el("div", { class: "row", style: { gap: "8px", marginBottom: "12px", alignItems: "center" } });
    betRow.appendChild(U.el("div", { text: "下注：", style: { fontSize: "var(--font-sm)" } }));
    const betInput = U.el("input", { type: "number", class: "input", value: "10", min: "1", style: { width: "80px" } });
    betRow.appendChild(betInput);
    [10, 50, 100].forEach((v) => {
      const b = U.el("button", { class: "btn btn-ghost btn-sm", text: String(v) });
      b.addEventListener("click", () => { betInput.value = String(v); });
      betRow.appendChild(b);
    });
    stage.appendChild(betRow);

    // 玩家骰
    const myArea = U.el("div", { class: "game-question", style: { marginBottom: "8px" } });
    myArea.appendChild(U.el("div", { class: "gq-label", text: "我的骰子" }));
    const myDiceWrap = U.el("div", { class: "row gap-8", style: { justifyContent: "center", marginTop: "8px" } });
    myArea.appendChild(myDiceWrap);
    const mySum = U.el("div", { class: "muted", text: "总和：-", style: { marginTop: "6px" } });
    myArea.appendChild(mySum);
    stage.appendChild(myArea);

    // AI 骰
    const aiArea = U.el("div", { class: "game-question", style: { marginBottom: "8px" } });
    aiArea.appendChild(U.el("div", { class: "gq-label", text: "对手骰子" }));
    const aiDiceWrap = U.el("div", { class: "row gap-8", style: { justifyContent: "center", marginTop: "8px" } });
    aiArea.appendChild(aiDiceWrap);
    const aiSum = U.el("div", { class: "muted", text: "总和：-", style: { marginTop: "6px" } });
    aiArea.appendChild(aiSum);
    stage.appendChild(aiArea);

    // 结果
    const result = U.el("div", { class: "card-soft", style: { display: "none", marginBottom: "12px" } });
    stage.appendChild(result);

    // 摇骰按钮
    const rollBtn = U.el("button", { class: "btn", text: "摇 骰 子", style: { width: "100%" } });
    stage.appendChild(rollBtn);

    // 历史
    stage.appendChild(U.el("div", { class: "section-title", text: "历史记录", style: { margin: "16px 0 8px" } }));
    const histWrap = U.el("div", {});
    stage.appendChild(histWrap);

    async function _refreshBalance() {
      const w2 = await Storage.get("wallet", "main");
      balText.textContent = "💰 " + (w2 ? (w2.userBalance || 0) : 0);
    }

    async function _play() {
      const bet = parseInt(betInput.value, 10);
      if (isNaN(bet) || bet <= 0) { global.Phone.Notify.push({ appId: "games", title: "下注金额不对" }); return; }
      // 先检查余额够不够
      const w2 = await Storage.get("wallet", "main");
      const cur = w2 ? (w2.userBalance || 0) : 0;
      if (bet > cur) { global.Phone.Notify.push({ appId: "games", title: "余额不够啦" }); return; }

      rollBtn.disabled = true;
      rollBtn.textContent = "摇骰中...";

      // 摇骰动画
      let ticks = 0;
      const timer = setInterval(() => {
        U.empty(myDiceWrap); _diceHtml(U, _rollDice()).forEach((c) => myDiceWrap.appendChild(c));
        U.empty(aiDiceWrap); _diceHtml(U, _rollDice()).forEach((c) => aiDiceWrap.appendChild(c));
        ticks++;
        if (ticks > 8) {
          clearInterval(timer);
          _settle(bet);
        }
      }, 80);
    }

    async function _settle(bet) {
      const myDice = _rollDice();
      const aiDice = _rollDice();
      U.empty(myDiceWrap); _diceHtml(U, myDice).forEach((c) => myDiceWrap.appendChild(c));
      U.empty(aiDiceWrap); _diceHtml(U, aiDice).forEach((c) => aiDiceWrap.appendChild(c));
      const myTotal = myDice.reduce((a, b) => a + b, 0);
      const aiTotal = aiDice.reduce((a, b) => a + b, 0);
      mySum.textContent = "总和：" + myTotal;
      aiSum.textContent = "总和：" + aiTotal;

      let outcome = "draw"; // win / lose / draw
      if (myTotal > aiTotal) outcome = "win";
      else if (myTotal < aiTotal) outcome = "lose";

      let note = "骗子酒馆摇骰";
      if (outcome === "win") {
        await Wallet.aiToUser(bet, "骗子酒馆赢了");
        note = "骰子赢了 +" + bet;
      } else if (outcome === "lose") {
        await Wallet.deduct(bet, "骗子酒馆输了");
        note = "骰子输了 -" + bet;
      } else {
        note = "骰子平局";
      }

      const rec = {
        id: U.uid("ld"),
        bet: bet,
        myDice: myDice,
        aiDice: aiDice,
        myTotal: myTotal,
        aiTotal: aiTotal,
        outcome: outcome,
        createdAt: Date.now(),
      };
      await Storage.put("game_liar_dice", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "liar-dice", outcome: outcome, bet: bet },
        summary: "骗子酒馆：" + (outcome === "win" ? "赢了" + bet : outcome === "lose" ? "输了" + bet : "平局"),
      });

      // 显示结果
      result.style.display = "";
      U.empty(result);
      const txt = outcome === "win" ? "🎉 你赢了！+" + bet : outcome === "lose" ? "😢 你输了 -" + bet : "🤝 平局，退回下注";
      result.appendChild(U.el("div", { text: txt, style: { fontWeight: "600", fontSize: "var(--font-md)" } }));
      result.appendChild(U.el("div", { class: "muted", text: note, style: { marginTop: "4px", fontSize: "var(--font-xs)" } }));

      rollBtn.disabled = false;
      rollBtn.textContent = "再 来 一 局";
      _refreshBalance();
      _loadHist();
    }

    async function _loadHist() {
      const list = await Storage.getAll("game_liar_dice");
      list.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(histWrap);
      if (list.length === 0) {
        histWrap.appendChild(U.el("div", { class: "empty-text", text: "还没有记录" }));
        return;
      }
      list.slice(0, 20).forEach((r) => {
        const item = U.el("div", { class: "memo-item" });
        const icon = U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get("dice", { size: 16 }) });
        item.appendChild(icon);
        const main = U.el("div", { class: "mi-main" });
        const tag = r.outcome === "win" ? "胜 +" + r.bet : r.outcome === "lose" ? "负 -" + r.bet : "平";
        main.appendChild(U.el("div", { class: "mi-content", text: "我 " + r.myTotal + " vs " + r.aiTotal + " · " + tag }));
        main.appendChild(U.el("div", { class: "mi-meta", text: "下注 " + r.bet + " · " + U.relTime(r.createdAt) }));
        item.appendChild(main);
        histWrap.appendChild(item);
      });
    }

    rollBtn.addEventListener("click", _play);
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

  global.Phone.Games["liar-dice"] = { open, mount };
})(window);
