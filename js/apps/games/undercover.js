/* ============================================================
   undercover.js — 谁是卧底
   玩家 vs 当前角色（AI）/ 随机分配卧底 / 描述 / 猜身份 / 揭示
   数据存 game_undercover 表，事件 GAME_PLAYED
   挂在 window.Phone.Games["undercover"]
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.Games = global.Phone.Games || {};

  // 词对库：[平民词, 卧底词]
  const WORDS = [
    ["苹果", "橘子"],
    ["猫", "狗"],
    ["咖啡", "茶"],
    ["太阳", "月亮"],
    ["沙发", "床"],
    ["雨伞", "帽子"],
    ["书本", "笔记本"],
    ["手机", "平板"],
    ["钢琴", "吉他"],
    ["蛋糕", "面包"],
    ["地铁", "公交车"],
    ["冰箱", "空调"],
    ["铅笔", "钢笔"],
    ["春天", "秋天"],
    ["海浪", "湖面"],
  ];

  // AI 描述模板
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

  async function mount(container) {
    global.Phone.Games.applyBg(container);
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const curCharId = await State.get("currentCharacterId");
    const chars = await Storage.getAll("characters");
    const aiChar = chars.find((c) => c.id === curCharId) || chars[0];
    const aiName = aiChar ? aiChar.name : "AI";

    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(U, "谁是卧底"));
    const stage = U.el("div", { class: "game-stage" });

    // 顶部信息
    const info = U.el("div", { class: "card-soft", style: { marginBottom: "12px" } });
    info.appendChild(U.el("div", { text: "对手：" + aiName, style: { fontWeight: "500" } }));
    info.appendChild(U.el("div", { class: "muted", text: "你和我各拿一个词，一个是平民词，一个是卧底词。描述完猜身份。", style: { fontSize: "var(--font-xs)", marginTop: "4px" } }));
    stage.appendChild(info);

    // 词卡
    const wordCard = U.el("div", { class: "game-question" });
    const wordLabel = U.el("div", { class: "gq-label", text: "你的词" });
    const wordText = U.el("div", { class: "gq-text", text: "点下方开始" });
    wordCard.appendChild(wordLabel);
    wordCard.appendChild(wordText);
    stage.appendChild(wordCard);

    // 开始按钮
    const startBtn = U.el("button", { class: "btn", text: "开始新回合", style: { width: "100%", marginBottom: "12px" } });
    stage.appendChild(startBtn);

    // 描述区
    const descArea = U.el("div", { class: "card-soft", style: { display: "none", marginBottom: "12px" } });
    const myDescRow = U.el("div", { class: "row gap-8", style: { alignItems: "flex-start", marginBottom: "8px" } });
    myDescRow.appendChild(U.el("div", { class: "avatar avatar-sm", text: "我" }));
    const myDescMain = U.el("div", { class: "mi-main" });
    myDescMain.appendChild(U.el("div", { class: "muted", text: "你的描述", style: { fontSize: "var(--font-xs)" } }));
    const myDescText = U.el("div", { text: "（还没说）" });
    myDescMain.appendChild(myDescText);
    myDescRow.appendChild(myDescMain);
    descArea.appendChild(myDescRow);
    const aiDescRow = U.el("div", { class: "row gap-8", style: { alignItems: "flex-start" } });
    aiDescRow.appendChild(U.el("div", { class: "avatar avatar-sm", text: (aiName || "?").slice(0, 1) }));
    const aiDescMain = U.el("div", { class: "mi-main" });
    aiDescMain.appendChild(U.el("div", { class: "muted", text: aiName + " 的描述", style: { fontSize: "var(--font-xs)" } }));
    const aiDescText = U.el("div", { text: "（还没说）" });
    aiDescMain.appendChild(aiDescText);
    aiDescRow.appendChild(aiDescMain);
    descArea.appendChild(aiDescRow);
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
    const histWrap = U.el("div", {});
    stage.appendChild(histWrap);

    function _start() {
      const pair = WORDS[Math.floor(Math.random() * WORDS.length)];
      const playerIsUnder = Math.random() < 0.5;
      _round = {
        civilWord: pair[0],
        underWord: pair[1],
        playerWord: playerIsUnder ? pair[1] : pair[0],
        aiWord: playerIsUnder ? pair[0] : pair[1],
        playerIsUnder: playerIsUnder,
        myDesc: "",
        aiDesc: "",
        phase: "desc", // desc -> guess -> done
      };
      wordText.textContent = _round.playerWord;
      wordLabel.textContent = "你的词";
      descArea.style.display = "";
      descInput.style.display = "";
      descBtn.style.display = "";
      descInput.value = "";
      myDescText.textContent = "（还没说）";
      aiDescText.textContent = "（还没说）";
      guessRow.style.display = "none";
      result.style.display = "none";
    }

    function _submitDesc() {
      const t = descInput.value.trim();
      if (!t) { global.Phone.Notify.push({ appId: "games", title: "说点啥吧" }); return; }
      _round.myDesc = t;
      myDescText.textContent = t;
      // AI 描述（用模板，避免依赖 AI 接口）
      const tpl = DESC_TEMPLATES[Math.floor(Math.random() * DESC_TEMPLATES.length)];
      _round.aiDesc = tpl.replace("{词}", _round.aiWord);
      aiDescText.textContent = _round.aiDesc;
      descInput.style.display = "none";
      descBtn.style.display = "none";
      guessRow.style.display = "flex";
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
        myDesc: _round.myDesc,
        aiDesc: _round.aiDesc,
        guess: playerGuessUnder,
        win: win,
        createdAt: Date.now(),
      };
      await Storage.put("game_undercover", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "undercover", win: win },
        summary: "谁是卧底：" + (win ? "我猜对了" : "我猜错了") + "（" + (_round.playerIsUnder ? "我是卧底" : "我是平民") + "）",
      });
      // 显示结果
      result.style.display = "";
      U.empty(result);
      result.appendChild(U.el("div", { text: win ? "🎉 猜对了！" : "😅 猜错了", style: { fontWeight: "600", fontSize: "var(--font-md)", marginBottom: "8px" } }));
      result.appendChild(U.el("div", { class: "mi-content", text: "平民词：" + _round.civilWord }));
      result.appendChild(U.el("div", { class: "mi-content", text: "卧底词：" + _round.underWord }));
      result.appendChild(U.el("div", { class: "muted", text: "你拿的是「" + _round.playerWord + "」" + (_round.playerIsUnder ? "（卧底）" : "（平民）"), style: { marginTop: "4px" } }));
      guessRow.style.display = "none";
      _round.phase = "done";
      _loadHist();
    }

    async function _loadHist() {
      const list = await Storage.getAll("game_undercover");
      list.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(histWrap);
      if (list.length === 0) {
        histWrap.appendChild(U.el("div", { class: "empty-text", text: "还没有记录" }));
        return;
      }
      list.slice(0, 20).forEach((r) => {
        const item = U.el("div", { class: "memo-item" });
        const icon = U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get(r.win ? "check" : "close", { size: 16 }) });
        item.appendChild(icon);
        const main = U.el("div", { class: "mi-main" });
        main.appendChild(U.el("div", { class: "mi-content", text: (r.playerIsUnder ? "卧底" : "平民") + " · " + r.civilWord + "/" + r.underWord }));
        main.appendChild(U.el("div", { class: "mi-meta", text: (r.win ? "胜" : "负") + " · " + U.relTime(r.createdAt) }));
        item.appendChild(main);
        histWrap.appendChild(item);
      });
    }

    startBtn.addEventListener("click", _start);
    descBtn.addEventListener("click", _submitDesc);
    guessCivil.addEventListener("click", () => _guess(false));
    guessUnder.addEventListener("click", () => _guess(true));

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

  global.Phone.Games["undercover"] = { open, mount };
})(window);
