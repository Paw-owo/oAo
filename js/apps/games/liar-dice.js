/* ============================================================
   liar-dice.js — 骗子酒馆（专业版）
   对齐参考：Liar's Bar / 骰子大王 / 摇骰子比大小
   功能：
     - 摇 5 个骰子比点数总和 / 下注（联动钱包）
     - 模式：单局 / 三局两胜（BO3）
     - 统计概览：总局 / 胜场 / 胜率 / 累计盈亏
     - 历史搜索 + 长按删除
     - 设置页：默认下注 / 最大下注 / 模式 / 显示统计 / 清空 / 导出 / 关于
   数据存 game_liar_dice 表，事件 GAME_PLAYED + WALLET_CHANGED
   挂在 window.Phone.Games["liar-dice"]
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.Games = global.Phone.Games || {};

  const MODE_LABELS = { single: "单局", bo3: "三局两胜" };

  let _unmounted = false;

  function open() { global.Phone.Router.push("game-liar-dice", mount, {}); }

  function _rollDice() {
    const d = [];
    for (let i = 0; i < 5; i++) d.push(1 + Math.floor(Math.random() * 6));
    return d;
  }

  function _diceHtml(U, dice) {
    return dice.map((n) => U.el("div", { class: "dice-cell", text: String(n) }));
  }

  async function mount(container) {
    _unmounted = false;
    global.Phone.Games.applyBg(container);
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;
    const Wallet = global.Phone.Wallet;

    const defaultBet = parseInt(State.get("liarDiceDefaultBet"), 10) || 10;
    const mode = State.get("liarDiceMode") === "bo3" ? "bo3" : "single";

    const w = await Storage.get("wallet", "main");
    const balance = w ? (w.userBalance || 0) : 0;

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "liar-dice");
    }
    page.appendChild(_nav(U, "骗子酒馆", () => _openSettings(U, () => _remount(container))));

    const stage = U.el("div", { class: "game-stage scroll", style: { padding: "16px" } });

    // ---------- 统计概览 ----------
    if (State.get("liarDiceShowStats") !== false) {
      const all = await Storage.getAll("game_liar_dice");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const wins = all.filter((r) => r.outcome === "win").length;
      const today = all.filter((r) => (r.createdAt || 0) >= t0.getTime()).length;
      const netProfit = all.reduce((acc, r) => {
        if (r.outcome === "win") return acc + (r.bet || 0);
        if (r.outcome === "lose") return acc - (r.bet || 0);
        return acc;
      }, 0);
      stage.appendChild(U.el("div", { class: "gm-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(all.length) }), U.el("div", { class: "msb-label", text: "总局" })]),
        U.el("div", { class: "msb-card highlight" }, [U.el("div", { class: "msb-num", text: String(wins) }), U.el("div", { class: "msb-label", text: "胜场" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: (all.length > 0 ? Math.round(wins * 100 / all.length) : 0) + "%" }), U.el("div", { class: "msb-label", text: "胜率" })]),
        U.el("div", { class: "msb-card" + (netProfit >= 0 ? "" : " danger") }, [U.el("div", { class: "msb-num", text: (netProfit >= 0 ? "+" : "") + netProfit }), U.el("div", { class: "msb-label", text: "累计" })]),
      ]));
    }

    // 余额
    const balCard = U.el("div", { class: "card-soft", style: { marginBottom: "12px" } });
    balCard.appendChild(U.el("div", { class: "muted", text: "当前余额 · 模式：" + MODE_LABELS[mode], style: { fontSize: "var(--font-xs)" } }));
    const balText = U.el("div", { text: balance.toLocaleString() + " 元", style: { fontSize: "var(--font-lg)", fontWeight: "600" } });
    balCard.appendChild(balText);
    stage.appendChild(balCard);

    // 下注
    const betRow = U.el("div", { class: "row", style: { gap: "8px", marginBottom: "12px", alignItems: "center", flexWrap: "wrap" } });
    betRow.appendChild(U.el("div", { text: "下注：", style: { fontSize: "var(--font-sm)" } }));
    const betInput = U.el("input", { type: "number", class: "input", value: String(defaultBet), min: "1", style: { width: "80px" } });
    betRow.appendChild(betInput);
    [10, 50, 100, 500].forEach((v) => {
      const b = U.el("button", { class: "btn btn-ghost btn-sm", text: String(v) });
      b.addEventListener("click", () => { betInput.value = String(v); });
      betRow.appendChild(b);
    });
    stage.appendChild(betRow);

    // BO3 进度（仅 bo3 模式显示）
    let bo3State = null; // { playerWins, aiWins, bet, roundLog: [] }
    const bo3Ind = U.el("div", { class: "muted", style: { display: "none", fontSize: "var(--font-xs)", marginBottom: "8px", textAlign: "center" } });
    stage.appendChild(bo3Ind);

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
    const search = U.el("input", { class: "input", placeholder: "搜索记录...", style: { marginBottom: "8px" } });
    stage.appendChild(search);
    const histWrap = U.el("div", {});
    stage.appendChild(histWrap);

    async function _refreshBalance() {
      const w2 = await Storage.get("wallet", "main");
      balText.textContent = (w2 ? (w2.userBalance || 0) : 0).toLocaleString() + " 元";
    }

    function _updateBo3Ind() {
      if (mode !== "bo3" || !bo3State) { bo3Ind.style.display = "none"; return; }
      bo3Ind.style.display = "";
      bo3Ind.textContent = "三局两胜 · 我 " + bo3State.playerWins + " - " + bo3State.aiWins + " 对手（下注 " + bo3State.bet + "）";
    }

    async function _play() {
      const bet = parseInt(betInput.value, 10);
      if (isNaN(bet) || bet <= 0) { global.Phone.Notify.push({ appId: "games", title: "下注金额不对" }); return; }
      // 单局模式直接检查余额；BO3 模式按 2 倍检查（最多输 2 局）
      const need = mode === "bo3" ? bet * 2 : bet;
      const w2 = await Storage.get("wallet", "main");
      const cur = w2 ? (w2.userBalance || 0) : 0;
      if (need > cur) {
        global.Phone.Notify.push({ appId: "games", title: mode === "bo3" ? "BO3 至少需要下注的 2 倍余额" : "余额不够啦" });
        return;
      }

      if (mode === "bo3" && !bo3State) {
        bo3State = { playerWins: 0, aiWins: 0, bet: bet, roundLog: [] };
        _updateBo3Ind();
      }

      rollBtn.disabled = true;
      rollBtn.textContent = "摇骰中...";

      // 摇骰动画
      let ticks = 0;
      const diceAnimTimer = setInterval(() => {
        if (_unmounted) { clearInterval(diceAnimTimer); return; }
        U.empty(myDiceWrap); _diceHtml(U, _rollDice()).forEach((c) => myDiceWrap.appendChild(c));
        U.empty(aiDiceWrap); _diceHtml(U, _rollDice()).forEach((c) => aiDiceWrap.appendChild(c));
        ticks++;
        if (ticks > 8) {
          clearInterval(diceAnimTimer);
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

      // BO3 模式：本局不结算钱包，记录到 bo3State，达到 2 胜才结算
      if (mode === "bo3" && bo3State) {
        bo3State.roundLog.push({ myTotal, aiTotal, outcome });
        if (outcome === "win") bo3State.playerWins++;
        else if (outcome === "lose") bo3State.aiWins++;
        _updateBo3Ind();

        // 判断 BO3 是否结束
        const bo3Over = bo3State.playerWins >= 2 || bo3State.aiWins >= 2;
        if (!bo3Over) {
          // 继续下一局
          result.style.display = "";
          U.empty(result);
          result.appendChild(U.el("div", { text: outcome === "win" ? "本局赢了，继续！" : outcome === "lose" ? "本局输了，加油！" : "本局平局，继续！", style: { fontWeight: "600", fontSize: "var(--font-md)" } }));
          result.appendChild(U.el("div", { class: "muted", text: "我 " + myTotal + " vs " + aiTotal + " " + aiName() + " · 比分 " + bo3State.playerWins + "-" + bo3State.aiWins, style: { marginTop: "4px", fontSize: "var(--font-xs)" } }));
          rollBtn.disabled = false;
          rollBtn.textContent = "继续下一局";
          return;
        }
        // BO3 结束，统一结算
        const finalWin = bo3State.playerWins >= 2;
        const finalBet = bo3State.bet;
        let settled = finalWin ? "win" : "lose";
        let note = "";
        if (finalWin) {
          const r = await Wallet.aiToUser(finalBet, "骗子酒馆 BO3 赢了");
          if (!r || !r.ok) { settled = "fail"; note = "赢了但 AI 余额不足：" + (r ? r.error : "失败"); }
          else note = "BO3 胜 +" + finalBet;
        } else {
          const r = await Wallet.deduct(finalBet, "骗子酒馆 BO3 输了");
          if (!r || !r.ok) { settled = "fail"; note = "输了但扣款失败：" + (r ? r.error : "失败"); }
          else note = "BO3 负 -" + finalBet;
        }
        // 存档
        const rec = {
          id: U.uid("ld"),
          bet: finalBet,
          mode: "bo3",
          roundLog: bo3State.roundLog,
          playerWins: bo3State.playerWins,
          aiWins: bo3State.aiWins,
          outcome: settled,
          rawOutcome: finalWin ? "win" : "lose",
          createdAt: Date.now(),
        };
        await Storage.put("game_liar_dice", rec);
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
          sourceApp: "games",
          data: { game: "liar-dice", outcome: settled, bet: finalBet, mode: "bo3" },
          summary: "骗子酒馆 BO3：" + (settled === "win" ? "赢了 " + finalBet : settled === "lose" ? "输了 " + finalBet : "未结算"),
        });
        // 显示最终结果
        result.style.display = "";
        U.empty(result);
        result.appendChild(U.el("div", { text: finalWin ? "BO3 胜利！" : "BO3 失败", style: { fontWeight: "600", fontSize: "var(--font-md)" } }));
        result.appendChild(U.el("div", { class: "muted", text: "比分 " + bo3State.playerWins + "-" + bo3State.aiWins + " · " + note, style: { marginTop: "4px", fontSize: "var(--font-xs)" } }));
        bo3State = null;
        _updateBo3Ind();
        rollBtn.disabled = false;
        rollBtn.textContent = "再 来 一 局";
        _refreshBalance();
        _loadHist();
        _refreshStats();
        return;
      }

      // 单局模式：直接结算
      let settled = outcome;
      let note = "骗子酒馆摇骰";
      if (outcome === "win") {
        const r = await Wallet.aiToUser(bet, "骗子酒馆赢了");
        if (r && r.ok) { note = "骰子赢了 +" + bet; }
        else { settled = "fail"; note = "赢了但 AI 余额不足，未结算：" + (r ? r.error : "失败"); }
      } else if (outcome === "lose") {
        const r = await Wallet.deduct(bet, "骗子酒馆输了");
        if (r && r.ok) { note = "骰子输了 -" + bet; }
        else { settled = "fail"; note = "输了但扣款失败：" + (r ? r.error : "失败"); }
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
        mode: "single",
        outcome: settled,
        rawOutcome: outcome,
        createdAt: Date.now(),
      };
      await Storage.put("game_liar_dice", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "liar-dice", outcome: settled, bet: bet, mode: "single" },
        summary: "骗子酒馆：" + (settled === "win" ? "赢了 " + bet : settled === "lose" ? "输了 " + bet : settled === "fail" ? "未结算" : "平局"),
      });

      result.style.display = "";
      U.empty(result);
      const txt = settled === "win" ? "运气真好呀，赢了 +" + bet
        : settled === "lose" ? "差一点点呢，输了 -" + bet
        : settled === "fail" ? "骰子" + (outcome === "win" ? "赢了但" : "输了但") + "结算失败了"
        : "打平啦，退回你的下注";
      result.appendChild(U.el("div", { text: txt, style: { fontWeight: "600", fontSize: "var(--font-md)" } }));
      result.appendChild(U.el("div", { class: "muted", text: note, style: { marginTop: "4px", fontSize: "var(--font-xs)" } }));

      rollBtn.disabled = false;
      rollBtn.textContent = "再 来 一 局";
      _refreshBalance();
      _loadHist();
      _refreshStats();
    }

    function aiName() {
      // 简单返回"对手"（用于 BO3 比分显示）
      return "对手";
    }

    async function _refreshStats() {
      if (State.get("liarDiceShowStats") === false) return;
      const oldBar = stage.querySelector(".gm-stats-bar");
      if (!oldBar) return;
      const all = await Storage.getAll("game_liar_dice");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const wins = all.filter((r) => r.outcome === "win").length;
      const today = all.filter((r) => (r.createdAt || 0) >= t0.getTime()).length;
      const netProfit = all.reduce((acc, r) => {
        if (r.outcome === "win") return acc + (r.bet || 0);
        if (r.outcome === "lose") return acc - (r.bet || 0);
        return acc;
      }, 0);
      const newBar = U.el("div", { class: "gm-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(all.length) }), U.el("div", { class: "msb-label", text: "总局" })]),
        U.el("div", { class: "msb-card highlight" }, [U.el("div", { class: "msb-num", text: String(wins) }), U.el("div", { class: "msb-label", text: "胜场" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: (all.length > 0 ? Math.round(wins * 100 / all.length) : 0) + "%" }), U.el("div", { class: "msb-label", text: "胜率" })]),
        U.el("div", { class: "msb-card" + (netProfit >= 0 ? "" : " danger") }, [U.el("div", { class: "msb-num", text: (netProfit >= 0 ? "+" : "") + netProfit }), U.el("div", { class: "msb-label", text: "累计" })]),
      ]);
      oldBar.replaceWith(newBar);
    }

    async function _loadHist() {
      const list = await Storage.getAll("game_liar_dice");
      list.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(histWrap);
      const kw = search.value.trim().toLowerCase();
      let filtered = list;
      if (kw) {
        filtered = list.filter((r) => (String(r.bet) + " " + (r.outcome || "") + " " + (r.mode || "")).toLowerCase().includes(kw));
      }
      if (filtered.length === 0) {
        histWrap.appendChild(U.el("div", { class: "empty-text", text: list.length === 0 ? "还没有记录" : "没找到匹配的记录" }));
        return;
      }
      filtered.slice(0, 30).forEach((r) => {
        const item = U.el("div", { class: "memo-item" });
        const icon = U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get("dice", { size: 16 }) });
        item.appendChild(icon);
        const main = U.el("div", { class: "mi-main" });
        const tag = r.outcome === "win" ? "胜 +" + r.bet : r.outcome === "lose" ? "负 -" + r.bet : r.outcome === "fail" ? "未结算" : "平";
        let title = "";
        if (r.mode === "bo3") {
          title = "BO3 · 比分 " + (r.playerWins || 0) + "-" + (r.aiWins || 0) + " · " + tag;
        } else {
          title = "我 " + r.myTotal + " vs " + r.aiTotal + " · " + tag;
        }
        main.appendChild(U.el("div", { class: "mi-content", text: title }));
        main.appendChild(U.el("div", { class: "mi-meta", text: "下注 " + r.bet + " · " + (MODE_LABELS[r.mode] || "单局") + " · " + U.relTime(r.createdAt) }));
        item.appendChild(main);
        let pressTimer = null;
        item.addEventListener("touchstart", () => {
          pressTimer = setTimeout(async () => {
            pressTimer = null;
            const ok = await global.Phone.Modal.confirm({ title: "删除记录", message: "删除这条记录？", danger: true });
            if (!ok) return;
            await Storage.del("game_liar_dice", r.id);
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
          await Storage.del("game_liar_dice", r.id);
          _loadHist();
          _refreshStats();
        });
        histWrap.appendChild(item);
      });
    }

    rollBtn.addEventListener("click", _play);
    search.addEventListener("input", U.debounce(_loadHist, 200));
    _loadHist();
    page.appendChild(stage);
    container.appendChild(page);

    if (global.Phone.Router && global.Phone.Router.onLeave) {
      global.Phone.Router.onLeave(() => { _unmounted = true; });
    }
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "liar-dice",
      title: "骗子酒馆设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("显示");
        tools.toggle("显示统计概览", "关闭后隐藏顶部的数字卡片", "liarDiceShowStats", null);

        tools.section("模式");
        const curMode = State.get("liarDiceMode") === "bo3" ? "bo3" : "single";
        const modeSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        [
          { v: "single", l: "单局" },
          { v: "bo3", l: "三局两胜" },
        ].forEach((s) => {
          const node = U.el("div", { class: "segment-item" + (curMode === s.v ? " active" : ""), text: s.l });
          node.addEventListener("click", async () => {
            await State.set("liarDiceMode", s.v);
            modeSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          modeSeg.appendChild(node);
        });
        const modeGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [modeSeg]);
        content.appendChild(modeGroup);

        tools.section("默认下注");
        tools.input("默认下注金额", "liarDiceDefaultBet", { type: "number", min: "1" });

        tools.section("数据");
        tools.action("导出历史记录", async () => {
          const list = await global.Phone.Storage.getAll("game_liar_dice");
          const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "liar-dice-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
          URL.revokeObjectURL(url);
          global.Phone.Notify.push({ appId: "games", title: "已导出 " + list.length + " 条" });
        });
        tools.action("清空历史记录", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空记录", message: "删除所有骗子酒馆的历史？", danger: true, okText: "清空" });
          if (!ok) return;
          const list = await global.Phone.Storage.getAll("game_liar_dice");
          for (const r of list) await global.Phone.Storage.del("game_liar_dice", r.id);
          global.Phone.Notify.push({ appId: "games", title: "已清空" });
          onDone && onDone();
        }, { danger: true });

        tools.section("关于");
        tools.hint("骗子酒馆支持单局和三局两胜两种模式，下注联动钱包。BO3 模式达到 2 胜才结算，最多输 2 倍下注。长按历史记录可删除。");
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

  // API 模式下的 BO3 状态（仅 play/settle 链路使用，不影响 UI 内的 bo3State）
  let _apiBo3State = null;

  // ---------- 暴露 API ----------
  global.Phone.Games["liar-dice"] = {
    open, mount,
    /** 列出历史记录 */
    async list(filter) {
      let list = await global.Phone.Storage.getAll("game_liar_dice");
      if (filter) {
        if (filter.outcome) list = list.filter((r) => r.outcome === filter.outcome);
        if (filter.mode) list = list.filter((r) => r.mode === filter.mode);
      }
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    /** 统计 */
    async stats() {
      const list = await global.Phone.Storage.getAll("game_liar_dice");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const wins = list.filter((r) => r.outcome === "win").length;
      const losses = list.filter((r) => r.outcome === "lose").length;
      const netProfit = list.reduce((acc, r) => {
        if (r.outcome === "win") return acc + (r.bet || 0);
        if (r.outcome === "lose") return acc - (r.bet || 0);
        return acc;
      }, 0);
      return {
        total: list.length,
        wins,
        losses,
        winRate: list.length > 0 ? Math.round(wins * 100 / list.length) : 0,
        netProfit,
        today: list.filter((r) => (r.createdAt || 0) >= t0.getTime()).length,
      };
    },
    /** 我开一局（API 形式，不结算，不写入历史） */
    async play(bet, mode) {
      const b = parseInt(bet, 10);
      if (isNaN(b) || b <= 0) return { ok: false, error: "下注金额不对" };
      const m = mode === "bo3" ? "bo3" : "single";
      // 我按模式和下注决定是否重置 BO3 累计状态：
      //   - 切换到非 bo3 模式：清空，避免残留污染新局
      //   - 同 bo3 模式但下注变了：清空，新下注开始新局
      //   - 同 bo3 模式同下注且已有状态：保留，让连续 settle 继续累计
      //   - 同 bo3 模式但没有状态：初始化新一局
      if (m !== "bo3") {
        _apiBo3State = null;
      } else if (_apiBo3State && _apiBo3State.bet !== b) {
        _apiBo3State = null;
      }
      if (m === "bo3" && !_apiBo3State) {
        _apiBo3State = { playerWins: 0, aiWins: 0, bet: b, roundLog: [] };
      }
      return {
        bet: b,
        mode: m,
        playerDice: [],
        aiDice: [],
        history: [],
      };
    },
    /** 我摇一下骰子（生成 5 个 1-6 给玩家和对手） */
    async roll() {
      return {
        playerDice: _rollDice(),
        aiDice: _rollDice(),
      };
    },
    /** 我来结算（比较骰子总和，大的赢；BO3 达到 2 胜才统一结算） */
    async settle(myDice, aiDice, bet, mode) {
      const m = mode === "bo3" ? "bo3" : "single";
      const myArr = Array.isArray(myDice) ? myDice : [];
      const aiArr = Array.isArray(aiDice) ? aiDice : [];
      const myTotal = myArr.reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
      const aiTotal = aiArr.reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
      let outcome = "draw";
      if (myTotal > aiTotal) outcome = "win";
      else if (myTotal < aiTotal) outcome = "lose";
      const Wallet = global.Phone.Wallet;

      // BO3 模式：本局不结算钱包，达到 2 胜才统一结算
      if (m === "bo3") {
        if (!_apiBo3State) _apiBo3State = { playerWins: 0, aiWins: 0, bet: bet, roundLog: [] };
        _apiBo3State.roundLog.push({ myTotal, aiTotal, outcome });
        if (outcome === "win") _apiBo3State.playerWins++;
        else if (outcome === "lose") _apiBo3State.aiWins++;

        const bo3Over = _apiBo3State.playerWins >= 2 || _apiBo3State.aiWins >= 2;
        if (!bo3Over) {
          return {
            ok: true,
            settled: false,
            mode: "bo3",
            roundOutcome: outcome,
            myTotal: myTotal,
            aiTotal: aiTotal,
            playerWins: _apiBo3State.playerWins,
            aiWins: _apiBo3State.aiWins,
            needMore: true,
          };
        }
        // BO3 结束，统一结算
        const finalWin = _apiBo3State.playerWins >= 2;
        const finalBet = _apiBo3State.bet;
        let profit = 0;
        let settled = finalWin ? "win" : "lose";
        if (finalWin) {
          const r = await Wallet.aiToUser(finalBet, "骗子酒馆 BO3 赢了");
          if (!r || !r.ok) { settled = "fail"; }
          else profit = finalBet;
        } else {
          const r = await Wallet.deduct(finalBet, "骗子酒馆 BO3 输了");
          if (!r || !r.ok) { settled = "fail"; }
          else profit = -finalBet;
        }
        const rec = {
          id: global.Phone.Utils.uid("ld"),
          bet: finalBet,
          mode: "bo3",
          myDice: myArr,
          aiDice: aiArr,
          myTotal: myTotal,
          aiTotal: aiTotal,
          won: finalWin,
          win: finalWin, // 兼容
          outcome: settled,
          rawOutcome: finalWin ? "win" : "lose",
          profit: profit,
          roundLog: _apiBo3State.roundLog,
          playerWins: _apiBo3State.playerWins,
          aiWins: _apiBo3State.aiWins,
          createdAt: Date.now(),
        };
        await global.Phone.Storage.put("game_liar_dice", rec);
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
          sourceApp: "games",
          data: { game: "liar-dice", outcome: settled, bet: finalBet, mode: "bo3" },
          summary: "骗子酒馆 BO3：" + (settled === "win" ? "我赢啦 +" + finalBet : settled === "lose" ? "我输啦 -" + finalBet : "未结算"),
        });
        _apiBo3State = null;
        return { ok: true, settled: true, mode: "bo3", won: finalWin, outcome: settled, profit: profit, rec: rec };
      }

      // 单局模式：直接结算
      let profit = 0;
      let settled = outcome;
      if (outcome === "win") {
        const r = await Wallet.aiToUser(bet, "骗子酒馆赢了");
        if (r && r.ok) profit = bet;
        else settled = "fail";
      } else if (outcome === "lose") {
        const r = await Wallet.deduct(bet, "骗子酒馆输了");
        if (r && r.ok) profit = -bet;
        else settled = "fail";
      }
      const rec = {
        id: global.Phone.Utils.uid("ld"),
        bet: bet,
        mode: "single",
        myDice: myArr,
        aiDice: aiArr,
        myTotal: myTotal,
        aiTotal: aiTotal,
        won: outcome === "win",
        win: outcome === "win", // 兼容
        outcome: settled,
        rawOutcome: outcome,
        profit: profit,
        createdAt: Date.now(),
      };
      await global.Phone.Storage.put("game_liar_dice", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "liar-dice", outcome: settled, bet: bet, mode: "single" },
        summary: "骗子酒馆：" + (outcome === "win" ? "我赢啦 +" + bet : outcome === "lose" ? "我输啦 -" + bet : "打平啦"),
      });
      return { ok: true, settled: true, mode: "single", won: outcome === "win", outcome: settled, profit: profit, rec: rec };
    },
    /** 我重置 BO3 累计状态 */
    resetBo3() { _apiBo3State = null; },
    /** 我生成 5 个随机骰子 */
    getDice() {
      return _rollDice();
    },
    /** 我把支持的模式列出来 */
    listModes() {
      return [
        { val: "single", label: "单局" },
        { val: "bo3", label: "三局两胜" },
      ];
    },
    /** 我清空历史记录 */
    async clearHistory() {
      const list = await global.Phone.Storage.getAll("game_liar_dice");
      for (const r of list) await global.Phone.Storage.del("game_liar_dice", r.id);
      return { ok: true, cleared: list.length };
    },
    /** 我读一下某个设置（key 不带 liarDice 前缀） */
    getSetting(key) {
      const map = { defaultBet: "liarDiceDefaultBet", mode: "liarDiceMode", showStats: "liarDiceShowStats" };
      const realKey = map[key] || ("liarDice" + (key ? key.charAt(0).toUpperCase() + key.slice(1) : ""));
      return global.Phone.State.get(realKey);
    },
    /** 我改一下某个设置（key 不带 liarDice 前缀） */
    async setSetting(key, value) {
      const map = { defaultBet: "liarDiceDefaultBet", mode: "liarDiceMode", showStats: "liarDiceShowStats" };
      const realKey = map[key] || ("liarDice" + (key ? key.charAt(0).toUpperCase() + key.slice(1) : ""));
      await global.Phone.State.set(realKey, value);
      return value;
    },
    /** 我把所有设置列出来 */
    listSettings() {
      const State = global.Phone.State;
      return {
        defaultBet: State.get("liarDiceDefaultBet"),
        mode: State.get("liarDiceMode"),
        showStats: State.get("liarDiceShowStats"),
      };
    },
  };
})(window);
