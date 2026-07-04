/* ============================================================
   games.js — 游戏 APP 主入口
   汇总 4 个子游戏：真心话大冒险 / 谁是卧底 / 骗子酒馆 / 塔罗牌占卜
   子游戏各自独立文件，挂在 window.Phone.Games 下
   挂在 window.Phone.Games
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.Games = global.Phone.Games || {};

  global.Phone.AppRegistry.register({
    id: "games",
    name: "游戏",
    icon: "app-games",
    entry: () => open(),
    events: ["game_played"],
    settings: [],
    order: 51,
  });

  function open() { global.Phone.Router.push("games", mount, {}); }

  // 子游戏清单（id 对应 window.Phone.Games[id]）
  const GAMES = [
    { id: "truth-or-dare", name: "真心话大冒险", desc: "抽题挑战，看谁敢说真话", icon: "app-games", color: "#E8846B" },
    { id: "undercover",    name: "谁是卧底",     desc: "我和你，到底谁是卧底？", icon: "users",      color: "#8BC28A" },
    { id: "liar-dice",     name: "骗子酒馆",     desc: "摇骰子比大小，下注赢钱", icon: "dice",       color: "#C9A36B" },
    { id: "tarot",         name: "塔罗牌占卜",   desc: "抽三张牌，看看未来",     icon: "card-tarot", color: "#9B7EBD" },
  ];

  async function mount(container) {
    _applyBg(container);
    const U = global.Phone.Utils;
    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(U, "游戏"));
    const content = U.el("div", { class: "page-content" });
    GAMES.forEach((g) => {
      const card = U.el("div", { class: "game-card" });
      const icon = U.el("div", { class: "gc-icon", style: { background: g.color } });
      icon.innerHTML = global.Phone.IconLibrary.get(g.icon, { size: 28 });
      card.appendChild(icon);
      const main = U.el("div", { class: "gc-main" });
      main.appendChild(U.el("div", { class: "gc-name", text: g.name }));
      main.appendChild(U.el("div", { class: "gc-desc", text: g.desc }));
      card.appendChild(main);
      card.addEventListener("click", () => {
        const sub = global.Phone.Games[g.id];
        if (sub && sub.open) sub.open();
      });
      content.appendChild(card);
    });
    page.appendChild(content);
    container.appendChild(page);
  }

  // 应用自定义背景（棒5统一推广到所有 APP）
  async function _applyBg(container) {
    try {
      const bgs = await global.Phone.State.get("appBackgrounds");
      if (bgs && bgs.games) container.style.background = bgs.games;
      else container.style.background = "";
    } catch (e) {}
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

  // 暴露主入口 + 子游戏挂载点
  global.Phone.Games.open = open;
  global.Phone.Games.mount = mount;
  global.Phone.Games.applyBg = _applyBg; // 供子游戏复用
})(window);
