/* ============================================================
   undercover.js — 谁是卧底（专业版）
   对齐参考：谁是卧底 Online / 聚会玩 / 桌游大全
   功能：
     - 玩家 vs 当前角色（AI）/ 随机分配卧底 / 描述 / 猜身份 / 揭示
     - 多轮描述（1-3 轮，可配置）
     - AI 描述：优先调用 AIClient，失败回退到模板
     - 统计概览：总局 / 胜场 / 胜率 / 今日
     - 历史搜索 + 长按删除
     - 设置页：AI 对手 / 轮数 / 显示统计 / 清空 / 导出 / 关于
   数据存 game_undercover 表，事件 GAME_PLAYED
   挂在 window.Phone.Games["undercover"]
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.Games = global.Phone.Games || {};

  // 词对库：[平民词, 卧底词] —— 按难度分组
  const WORD_BANK = {
    easy: [
      ["苹果", "橘子"], ["猫", "狗"], ["咖啡", "茶"], ["太阳", "月亮"],
      ["沙发", "床"], ["雨伞", "帽子"], ["书本", "笔记本"], ["手机", "平板"],
    ],
    normal: [
      ["钢琴", "吉他"], ["蛋糕", "面包"], ["地铁", "公交车"], ["冰箱", "空调"],
      ["铅笔", "钢笔"], ["春天", "秋天"], ["海浪", "湖面"], ["薯片", "饼干"],
      ["果汁", "汽水"], ["牛奶", "豆浆"],
    ],
    hard: [
      ["律师", "检察官"], ["教授", "研究员"], ["海豚", "鲨鱼"], ["樱花", "梅花"],
      ["唐诗", "宋词"], ["散文", "随笔"], ["寓言", "童话"], ["油画", "水彩"],
    ],
  };

  // AI 描述模板（回退用）
  const DESC_TEMPLATES = [
    "它和{词}有点像，但又不完全一样",
    "我想到的这个词，平时很常见",
    "这个词让我想起一些温暖的画面",
    "嗯……它有自己的特点",
    "它和某些东西属于同一类",
    "我说一个特征：它挺特别的",
    "它存在很久了，大家都熟悉",
    "它和我手里的词关系微妙",
  ];

  function open() { global.Phone.Router.push("game-undercover", mount, {}); }

  let _round = null; // 当前回合状态

  async function _aiDescribe(aiWord, round, history) {
    // 优先调用 AIClient（如果有 endpoint 配置）
    const AIClient = global.Phone.AIClient;
    if (AIClient && typeof AIClient.chat === "function") {
      try {
        const prompt = "我们在玩「谁是卧底」，你拿到的词是「" + aiWord + "」。请用一句话含蓄地描述这个词（不要直接说出它），第 " + round + " 轮描述，可以参考之前的描述但不要重复。直接给出描述，不要解释。";
        const reply = await AIClient.chat([{ role: "user", content: prompt }]);
        if (reply && typeof reply === "string" && reply.trim()) {
          return reply.trim().slice(0, 60);
        }
      } catch (e) { /* 回退到模板 */ }
    }
    // 模板回退
    const tpl = DESC_TEMPLATES[Math.floor(Math.random() * DESC_TEMPLATES.length)];
    return tpl.replace("{词}", aiWord);
  }

  async function mount(container) {
    global.Phone.Games.applyBg(container);
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const curCharId = await State.get("currentCharacterId");
    const chars = await Storage.getAll("characters");
    const aiChar = chars.find((c) => c.id === curCharId) || chars[0];
    const aiName = aiChar ? aiChar.name : "AI";
    const useAI = State.get("undercoverAiOpponent") !== false;
    const maxRounds = parseInt(State.get("undercoverRounds"), 10) || 2;
    const curDiff = State.get("gamesDifficulty") || "normal";

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "undercover");
    }
    page.appendChild(_nav(U, "谁是卧底", () => _openSettings(U, () => _remount(container))));

    const stage = U.el("div", { class: "game-stage scroll", style: { padding: "16px" } });

    // ---------- 统计概览 ----------
    if (State.get("undercoverShowStats") !== false) {
      const all = await Storage.getAll("game_undercover");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const wins = all.filter((r) => r.win).length;
      const today = all.filter((r) => (r.createdAt || 0) >= t0.getTime()).length;
      const rate = all.length > 0 ? Math.round(wins * 100 / all.length) : 0;
      stage.appendChild(U.el("div", { class: "gm-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(all.length) }), U.el("div", { class: "msb-label", text: "总局" })]),
        U.el("div", { class: "msb-card highlight" }, [U.el("div", { class: "msb-num", text: String(wins) }), U.el("div", { class: "msb-label", text: "胜场" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: rate + "%" }), U.el("div", { class: "msb-label", text: "胜率" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(today) }), U.el("div", { class: "msb-label", text: "今日" })]),
      ]));
    }

    // 顶部信息
    const info = U.el("div", { class: "card-soft", style: { marginBottom: "12px" } });
    info.appendChild(U.el("div", { text: "对手：" + aiName + "（" + (useAI ? "智能描述" : "模板描述") + " · " + maxRounds + " 轮 · " + ({ easy: "轻松", normal: "普通", hard: "挑战" }[curDiff] || "普通") + "）", style: { fontWeight: "500" } }));
    info.appendChild(U.el("div", { class: "muted", text: "你和我各拿一个词，一个是平民词，一个是卧底词。轮流描述后猜身份。", style: { fontSize: "var(--font-xs)", marginTop: "4px" } }));
    stage.appendChild(info);

    // 词卡
    const wordCard = U.el("div", { class: "game-question" });
    const wordLabel = U.el("div", { class: "gq-label", text: "你的词" });
    const wordText = U.el("div", { class: "gq-text", text: "点下方开始" });
    wordCard.appendChild(wordLabel);
    wordCard.appendChild(wordText);
    stage.appendChild(wordCard);

    // 回合指示
    const roundInd = U.el("div", { class: "muted", text: "尚未开始", style: { fontSize: "var(--font-xs)", marginBottom: "8px", textAlign: "center" } });
    stage.appendChild(roundInd);

    // 开始按钮
    const startBtn = U.el("button", { class: "btn", text: "开始新回合", style: { width: "100%", marginBottom: "12px" } });
    stage.appendChild(startBtn);

    // 描述区
    const descArea = U.el("div", { class: "card-soft", style: { display: "none", marginBottom: "12px" } });
    stage.appendChild(descArea);

    // 输入描述
    const descInput = U.el("input", { class: "input", placeholder: "用一句话描述你的词（不要直接说出它）", style: { display: "none", marginBottom: "8px" } });
    stage.appendChild(descInput);
    const descBtn = U.el("button", { class: "btn btn-ghost", text: "提交描述", style: { display: "none", width: "100%", marginBottom: "12px" } });
    stage.appendChild(descBtn);

    // 猜身份
    const guessRow = U.el("div", { class: "row", style: { display: "none", gap: "8px" } });
    const guessCivil = U.el("button", { class: "btn btn-ghost", text: "我是平民", style: { flex: "1" } });
    const guessUnder = U.el("button", { class: "btn", text: "我是卧底", style: { flex: "1" } });
    guessRow.appendChild(guessCivil);
    guessRow.appendChild(guessUnder);
    stage.appendChild(guessRow);

    // 结果
    const result = U.el("div", { class: "card-soft", style: { display: "none", marginBottom: "12px" } });
    stage.appendChild(result);

    // 历史
    stage.appendChild(U.el("div", { class: "section-title", text: "历史记录", style: { margin: "16px 0 8px" } }));
    const search = U.el("input", { class: "input", placeholder: "搜索记录...", style: { marginBottom: "8px" } });
    stage.appendChild(search);
    const histWrap = U.el("div", {});
    stage.appendChild(histWrap);

    function _renderDescArea() {
      U.empty(descArea);
      if (!_round) return;
      // 历史描述列表
      _round.history.forEach((h, i) => {
        const row = U.el("div", { class: "row gap-8", style: { alignItems: "flex-start", marginBottom: "8px" } });
        if (h.who === "player") {
          row.appendChild(U.el("div", { class: "avatar avatar-sm", text: "我" }));
        } else {
          row.appendChild(U.el("div", { class: "avatar avatar-sm", text: (aiName || "?").slice(0, 1) }));
        }
        const main = U.el("div", { class: "mi-main" });
        main.appendChild(U.el("div", { class: "muted", text: (h.who === "player" ? "你的描述" : aiName + " 的描述") + " · 第 " + h.round + " 轮", style: { fontSize: "var(--font-xs)" } }));
        main.appendChild(U.el("div", { text: h.text }));
        row.appendChild(main);
        descArea.appendChild(row);
      });
    }

    function _start() {
      const bank = WORD_BANK[curDiff] || WORD_BANK.normal;
      const pair = bank[Math.floor(Math.random() * bank.length)];
      const playerIsUnder = Math.random() < 0.5;
      _round = {
        civilWord: pair[0],
        underWord: pair[1],
        playerWord: playerIsUnder ? pair[1] : pair[0],
        aiWord: playerIsUnder ? pair[0] : pair[1],
        playerIsUnder: playerIsUnder,
        history: [],
        round: 1,
        maxRounds: maxRounds,
        phase: "desc-player", // desc-player -> desc-ai -> guess -> done
      };
      wordText.textContent = _round.playerWord;
      wordLabel.textContent = "你的词";
      roundInd.textContent = "第 1 / " + maxRounds + " 轮 · 该你描述";
      descArea.style.display = "";
      descInput.style.display = "";
      descBtn.style.display = "";
      descInput.value = "";
      _renderDescArea();
      guessRow.style.display = "none";
      result.style.display = "none";
    }

    async function _submitDesc() {
      const t = descInput.value.trim();
      if (!t) { global.Phone.Notify.push({ appId: "games", title: "说点啥吧" }); return; }
      _round.history.push({ who: "player", text: t, round: _round.round });
      descInput.value = "";
      descInput.style.display = "none";
      descBtn.style.display = "none";
      roundInd.textContent = "第 " + _round.round + " / " + maxRounds + " 轮 · " + aiName + " 思考中...";
      _renderDescArea();
      // AI 描述
      const aiDesc = await _aiDescribe(_round.aiWord, _round.round, _round.history);
      _round.history.push({ who: "ai", text: aiDesc, round: _round.round });
      _renderDescArea();
      // 进入下一轮 or 猜身份
      if (_round.round >= _round.maxRounds) {
        _round.phase = "guess";
        roundInd.textContent = "猜身份时间";
        guessRow.style.display = "flex";
      } else {
        _round.round++;
        _round.phase = "desc-player";
        roundInd.textContent = "第 " + _round.round + " / " + maxRounds + " 轮 · 该你描述";
        descInput.style.display = "";
        descBtn.style.display = "";
      }
    }

    async function _guess(playerGuessUnder) {
      const win = playerGuessUnder === _round.playerIsUnder;
      const rec = {
        id: U.uid("uc"),
        aiCharacterId: aiChar ? aiChar.id : null,
        civilWord: _round.civilWord,
        underWord: _round.underWord,
        playerWord: _round.playerWord,
        aiWord: _round.aiWord,
        playerIsUnder: _round.playerIsUnder,
        history: _round.history,
        guess: playerGuessUnder,
        win: win,
        rounds: _round.maxRounds,
        difficulty: curDiff,
        createdAt: Date.now(),
      };
      await Storage.put("game_undercover", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "undercover", win: win, difficulty: curDiff },
        summary: "谁是卧底：" + (win ? "我猜对了" : "我猜错了") + "（" + (_round.playerIsUnder ? "我是卧底" : "我是平民") + "）",
      });
      // 显示结果
      result.style.display = "";
      U.empty(result);
      result.appendChild(U.el("div", { text: win ? "嘿嘿，猜对啦！" : "哎呀，猜错啦", style: { fontWeight: "600", fontSize: "var(--font-md)", marginBottom: "8px" } }));
      result.appendChild(U.el("div", { class: "mi-content", text: "平民词：" + _round.civilWord }));
      result.appendChild(U.el("div", { class: "mi-content", text: "卧底词：" + _round.underWord }));
      result.appendChild(U.el("div", { class: "muted", text: "你拿的是「" + _round.playerWord + "」" + (_round.playerIsUnder ? "（卧底）" : "（平民）"), style: { marginTop: "4px" } }));
      guessRow.style.display = "none";
      roundInd.textContent = "本回合结束";
      _round.phase = "done";
      _loadHist();
      _refreshStats();
    }

    async function _refreshStats() {
      if (State.get("undercoverShowStats") === false) return;
      const oldBar = stage.querySelector(".gm-stats-bar");
      if (!oldBar) return;
      const all = await Storage.getAll("game_undercover");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const wins = all.filter((r) => r.win).length;
      const today = all.filter((r) => (r.createdAt || 0) >= t0.getTime()).length;
      const rate = all.length > 0 ? Math.round(wins * 100 / all.length) : 0;
      const newBar = U.el("div", { class: "gm-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(all.length) }), U.el("div", { class: "msb-label", text: "总局" })]),
        U.el("div", { class: "msb-card highlight" }, [U.el("div", { class: "msb-num", text: String(wins) }), U.el("div", { class: "msb-label", text: "胜场" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: rate + "%" }), U.el("div", { class: "msb-label", text: "胜率" })]),
        U.el("div", { class: "msb-card" }, [U.el("div", { class: "msb-num", text: String(today) }), U.el("div", { class: "msb-label", text: "今日" })]),
      ]);
      oldBar.replaceWith(newBar);
    }

    async function _loadHist() {
      const list = await Storage.getAll("game_undercover");
      list.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(histWrap);
      const kw = search.value.trim().toLowerCase();
      let filtered = list;
      if (kw) {
        filtered = list.filter((r) => (r.civilWord + r.underWord + (r.history || []).map((h) => h.text).join(" ")).toLowerCase().includes(kw));
      }
      if (filtered.length === 0) {
        histWrap.appendChild(U.el("div", { class: "empty-text", text: list.length === 0 ? "还没有记录" : "没找到匹配的记录" }));
        return;
      }
      filtered.slice(0, 30).forEach((r) => {
        const item = U.el("div", { class: "memo-item" });
        const icon = U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get(r.win ? "check" : "close", { size: 16 }) });
        item.appendChild(icon);
        const main = U.el("div", { class: "mi-main" });
        main.appendChild(U.el("div", { class: "mi-content", text: (r.playerIsUnder ? "卧底" : "平民") + " · " + r.civilWord + "/" + r.underWord }));
        main.appendChild(U.el("div", { class: "mi-meta", text: (r.win ? "胜" : "负") + " · " + (r.rounds || 1) + " 轮 · " + U.relTime(r.createdAt) }));
        item.appendChild(main);
        let pressTimer = null;
        item.addEventListener("touchstart", () => {
          pressTimer = setTimeout(async () => {
            pressTimer = null;
            const ok = await global.Phone.Modal.confirm({ title: "删除记录", message: "删除这条记录？", danger: true });
            if (!ok) return;
            await Storage.del("game_undercover", r.id);
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
          await Storage.del("game_undercover", r.id);
          _loadHist();
          _refreshStats();
        });
        histWrap.appendChild(item);
      });
    }

    startBtn.addEventListener("click", _start);
    descBtn.addEventListener("click", _submitDesc);
    descInput.addEventListener("keydown", (e) => { if (e.key === "Enter") _submitDesc(); });
    guessCivil.addEventListener("click", () => _guess(false));
    guessUnder.addEventListener("click", () => _guess(true));
    search.addEventListener("input", U.debounce(_loadHist, 200));

    _loadHist();
    page.appendChild(stage);
    container.appendChild(page);
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "undercover",
      title: "谁是卧底设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("显示");
        tools.toggle("显示统计概览", "关闭后隐藏顶部的数字卡片", "undercoverShowStats", null);

        tools.section("对手");
        tools.toggle("AI 智能描述", "开启后调用 AI 接口生成描述（更聪明），关闭则用模板", "undercoverAiOpponent", null);

        tools.section("描述轮数");
        const curRounds = parseInt(State.get("undercoverRounds"), 10) || 2;
        const roundSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        [
          { v: "1", l: "1 轮" },
          { v: "2", l: "2 轮" },
          { v: "3", l: "3 轮" },
        ].forEach((s) => {
          const node = U.el("div", { class: "segment-item" + (curRounds === parseInt(s.v, 10) ? " active" : ""), text: s.l });
          node.addEventListener("click", async () => {
            await State.set("undercoverRounds", parseInt(s.v, 10));
            roundSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          roundSeg.appendChild(node);
        });
        const roundGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [roundSeg]);
        content.appendChild(roundGroup);

        tools.section("数据");
        tools.action("导出历史记录", async () => {
          const list = await global.Phone.Storage.getAll("game_undercover");
          const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "undercover-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
          URL.revokeObjectURL(url);
          global.Phone.Notify.push({ appId: "games", title: "已导出 " + list.length + " 条" });
        });
        tools.action("清空历史记录", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空记录", message: "删除所有谁是卧底的历史？", danger: true, okText: "清空" });
          if (!ok) return;
          const list = await global.Phone.Storage.getAll("game_undercover");
          for (const r of list) await global.Phone.Storage.del("game_undercover", r.id);
          global.Phone.Notify.push({ appId: "games", title: "已清空" });
          onDone && onDone();
        }, { danger: true });

        tools.section("关于");
        tools.hint("谁是卧底支持 1-3 轮描述，开启 AI 智能描述后对手会更聪明。长按历史记录可删除。");
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

  // ---------- 自定义词对的存储（IndexedDB，零 localStorage） ----------
  // 我把自定义词对存到 game_undercover_custom 表，和真心话大冒险的 game_truth_dare_custom 表对齐

  // API 模式下的当前回合（仅 start/submitDesc/guess 链路使用，不影响 UI 的 _round）
  let _apiRound = null;

  // ---------- 暴露 API ----------
  global.Phone.Games["undercover"] = {
    open, mount,
    /** 列出历史记录 */
    async list(filter) {
      let list = await global.Phone.Storage.getAll("game_undercover");
      if (filter) {
        if (typeof filter.win === "boolean") list = list.filter((r) => r.win === filter.win);
        if (filter.difficulty) list = list.filter((r) => r.difficulty === filter.difficulty);
        if (filter.aiCharacterId) list = list.filter((r) => r.aiCharacterId === filter.aiCharacterId);
      }
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    /** 统计 */
    async stats() {
      const list = await global.Phone.Storage.getAll("game_undercover");
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const wins = list.filter((r) => r.win).length;
      return {
        total: list.length,
        wins,
        losses: list.length - wins,
        winRate: list.length > 0 ? Math.round(wins * 100 / list.length) : 0,
        today: list.filter((r) => (r.createdAt || 0) >= t0.getTime()).length,
      };
    },
    /** 让 AI 描述一个词（供外部调用） */
    async aiDescribe(word, round) { return await _aiDescribe(word, round || 1, []); },
    /** 我开一局新游戏（API 形式，不写入历史） */
    async start(opts) {
      opts = opts || {};
      const diff = opts.difficulty || global.Phone.State.get("gamesDifficulty") || "normal";
      const rounds = opts.rounds || parseInt(global.Phone.State.get("undercoverRounds"), 10) || 2;
      const bank = (WORD_BANK[diff] || WORD_BANK.normal).slice();
      // 合并自定义词对（从 IndexedDB 读）
      let customs = [];
      try { customs = await global.Phone.Storage.getAll("game_undercover_custom"); } catch (e) {}
      customs.filter((c) => !c.difficulty || c.difficulty === diff).forEach((c) => bank.push([c.civil, c.under]));
      const pair = bank.length > 0 ? bank[Math.floor(Math.random() * bank.length)] : WORD_BANK.normal[0];
      const playerIsUnder = Math.random() < 0.5;
      _apiRound = {
        civilWord: pair[0],
        undercoverWord: pair[1],
        playerWord: playerIsUnder ? pair[1] : pair[0],
        aiWord: playerIsUnder ? pair[0] : pair[1],
        playerIsUnder: playerIsUnder,
        history: [],
        round: 1,
        maxRounds: rounds,
        difficulty: diff,
        phase: "desc-player",
      };
      return {
        civilWord: _apiRound.civilWord,
        undercoverWord: _apiRound.undercoverWord,
        playerWord: _apiRound.playerWord,
        playerIsUnder: _apiRound.playerIsUnder,
        rounds: rounds,
        history: [],
      };
    },
    /** 我提交一句描述（追加到当前局 history，返回当前局状态） */
    async submitDesc(text) {
      if (!_apiRound) return { ok: false, error: "还没开始游戏，先调 start()" };
      const t = String(text || "").trim();
      if (!t) return { ok: false, error: "说点啥吧" };
      _apiRound.history.push({ who: "player", text: t, round: _apiRound.round });
      // 让 AI 也描述一句
      const aiDesc = await _aiDescribe(_apiRound.aiWord, _apiRound.round, _apiRound.history);
      _apiRound.history.push({ who: "ai", text: aiDesc, round: _apiRound.round });
      // 进入下一轮 or 等猜身份
      if (_apiRound.round >= _apiRound.maxRounds) {
        _apiRound.phase = "guess";
      } else {
        _apiRound.round++;
        _apiRound.phase = "desc-player";
      }
      return {
        ok: true,
        round: _apiRound.round,
        maxRounds: _apiRound.maxRounds,
        history: _apiRound.history.slice(),
        phase: _apiRound.phase,
        needGuess: _apiRound.phase === "guess",
        aiDesc: aiDesc,
      };
    },
    /** 我来猜身份（判定胜负 + 写入历史 + emit 事件） */
    async guess(playerGuessUnder) {
      if (!_apiRound) return { ok: false, error: "还没开始游戏" };
      const guessUnder = !!playerGuessUnder;
      const won = guessUnder === _apiRound.playerIsUnder;
      const playerDesc = _apiRound.history.filter((h) => h.who === "player").map((h) => h.text);
      const aiDescs = _apiRound.history.filter((h) => h.who === "ai").map((h) => h.text);
      const rec = {
        id: global.Phone.Utils.uid("uc"),
        civilWord: _apiRound.civilWord,
        undercoverWord: _apiRound.undercoverWord,
        playerWord: _apiRound.playerWord,
        aiWord: _apiRound.aiWord,
        playerIsUnder: _apiRound.playerIsUnder,
        history: _apiRound.history.slice(),
        guess: guessUnder,
        won: won,
        win: won, // 兼容现有 UI（UI 读 r.win）
        rounds: _apiRound.maxRounds,
        difficulty: _apiRound.difficulty,
        playerDesc: playerDesc,
        aiDescs: aiDescs,
        createdAt: Date.now(),
      };
      await global.Phone.Storage.put("game_undercover", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "undercover", win: won, difficulty: _apiRound.difficulty },
        summary: won ? "谁是卧底：我猜对啦" : "谁是卧底：我猜错啦",
      });
      const result = {
        ok: true,
        won: won,
        civilWord: _apiRound.civilWord,
        undercoverWord: _apiRound.undercoverWord,
        playerWord: _apiRound.playerWord,
        playerIsUnder: _apiRound.playerIsUnder,
        playerDesc: playerDesc,
        aiDescs: aiDescs,
      };
      _apiRound = null;
      return result;
    },
    /** 我把词对库列出来（含内置 + 自定义） */
    async listWordBank(difficulty) {
      const out = {};
      const diffs = difficulty ? [difficulty] : Object.keys(WORD_BANK);
      for (const d of diffs) {
        out[d] = (WORD_BANK[d] || []).map((pair) => ({ civil: pair[0], under: pair[1], source: "builtin" }));
      }
      // 合并自定义（从 IndexedDB 读）
      let customs = [];
      try { customs = await global.Phone.Storage.getAll("game_undercover_custom"); } catch (e) {}
      customs.forEach((c) => {
        const d = c.difficulty || "normal";
        if (difficulty && d !== difficulty) return;
        if (!out[d]) out[d] = [];
        out[d].push({ id: c.id, civil: c.civil, under: c.under, difficulty: d, source: "custom" });
      });
      return out;
    },
    /** 我加一对自定义词（存 IndexedDB） */
    async addWordPair(civil, under, difficulty) {
      const civ = String(civil || "").trim();
      const und = String(under || "").trim();
      if (!civ || !und) return { ok: false, error: "词不能为空" };
      const diff = difficulty || "normal";
      const rec = { id: global.Phone.Utils.uid("ucw"), civil: civ, under: und, difficulty: diff, createdAt: Date.now() };
      await global.Phone.Storage.put("game_undercover_custom", rec);
      return { ok: true, rec };
    },
    /** 我清空历史记录 */
    async clearHistory() {
      const list = await global.Phone.Storage.getAll("game_undercover");
      for (const r of list) await global.Phone.Storage.del("game_undercover", r.id);
      return { ok: true, cleared: list.length };
    },
    /** 我读一下某个设置（key 不带 undercover 前缀） */
    getSetting(key) {
      const map = { aiOpponent: "undercoverAiOpponent", rounds: "undercoverRounds", showStats: "undercoverShowStats" };
      const realKey = map[key] || ("undercover" + (key ? key.charAt(0).toUpperCase() + key.slice(1) : ""));
      return global.Phone.State.get(realKey);
    },
    /** 我改一下某个设置（key 不带 undercover 前缀） */
    async setSetting(key, value) {
      const map = { aiOpponent: "undercoverAiOpponent", rounds: "undercoverRounds", showStats: "undercoverShowStats" };
      const realKey = map[key] || ("undercover" + (key ? key.charAt(0).toUpperCase() + key.slice(1) : ""));
      await global.Phone.State.set(realKey, value);
      return value;
    },
    /** 我把所有设置列出来 */
    listSettings() {
      const State = global.Phone.State;
      return {
        aiOpponent: State.get("undercoverAiOpponent"),
        rounds: State.get("undercoverRounds"),
        showStats: State.get("undercoverShowStats"),
      };
    },
  };
})(window);
