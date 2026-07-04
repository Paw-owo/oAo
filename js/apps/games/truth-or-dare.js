/* ============================================================
   truth-or-dare.js — 真心话大冒险
   抽题（真心话 / 大冒险 / 随机）/ 完成 / 跳过 / 历史记录
   数据存 game_truth_dare 表，事件 GAME_PLAYED
   挂在 window.Phone.Games["truth-or-dare"]
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.Games = global.Phone.Games || {};

  const TRUTHS = [
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
    "你最近一次心动是什么时候？",
    "你最想去哪里旅行？和谁？",
    "你最想改掉的一个习惯？",
    "你最近一次大笑是因为什么？",
    "你最害怕失去什么？",
    "你觉得自己做过最幼稚的事？",
    "如果可以重来一次，你最想改变什么？",
    "你最在意的人是谁？",
  ];

  const DARES = [
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
    "用一门外语说\"我爱你\"",
    "表演一段即兴 rap",
    "模仿打喷嚏打十次",
    "学婴儿说话十秒钟",
    "做一个最夸张的表情并保持五秒",
    "给在场每个人说一句赞美",
    "闭眼画一只猫",
    "假装自己是新闻主播，播报今天的天气",
  ];

  function open() { global.Phone.Router.push("game-truth-dare", mount, {}); }

  async function mount(container) {
    global.Phone.Games.applyBg(container);
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;

    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(U, "真心话大冒险"));
    const stage = U.el("div", { class: "game-stage" });

    // 当前题
    let curQ = null;
    let curType = "truth";

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

    // 历史标题
    stage.appendChild(U.el("div", { class: "section-title", text: "历史记录", style: { margin: "16px 0 8px" } }));
    const histWrap = U.el("div", {});
    stage.appendChild(histWrap);

    function _draw() {
      let type = curType;
      if (type === "random") type = Math.random() < 0.5 ? "truth" : "dare";
      const pool = type === "truth" ? TRUTHS : DARES;
      curQ = { type: type, text: pool[Math.floor(Math.random() * pool.length)] };
      label.textContent = type === "truth" ? "真心话" : "大冒险";
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
        done: done,
        createdAt: Date.now(),
      };
      await Storage.put("game_truth_dare", rec);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
        sourceApp: "games",
        data: { game: "truth-or-dare", type: curQ.type, done: done },
        summary: (done ? "完成了" : "跳过了") + "一道" + (curQ.type === "truth" ? "真心话" : "大冒险"),
      });
      global.Phone.Notify.push({ appId: "games", title: done ? "真棒～做到了！" : "下次再挑战吧" });
      curQ = null;
      label.textContent = "点下方按钮抽题";
      text.textContent = "准备好了吗？";
      doneBtn.style.display = "none";
      skipBtn.style.display = "none";
      _loadHist();
    }

    async function _loadHist() {
      const list = await Storage.getAll("game_truth_dare");
      list.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(histWrap);
      if (list.length === 0) {
        histWrap.appendChild(U.el("div", { class: "empty-text", text: "还没有记录" }));
        return;
      }
      list.slice(0, 20).forEach((r) => {
        const item = U.el("div", { class: "memo-item" });
        const icon = U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get(r.type === "truth" ? "comment" : "dice", { size: 16 }) });
        item.appendChild(icon);
        const main = U.el("div", { class: "mi-main" });
        main.appendChild(U.el("div", { class: "mi-content", text: r.text }));
        main.appendChild(U.el("div", { class: "mi-meta", text: (r.type === "truth" ? "真心话" : "大冒险") + " · " + (r.done ? "已完成" : "已跳过") + " · " + U.relTime(r.createdAt) }));
        item.appendChild(main);
        histWrap.appendChild(item);
      });
    }

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

  global.Phone.Games["truth-or-dare"] = { open, mount };
})(window);
