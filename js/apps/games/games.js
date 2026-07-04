/* ============================================================
   games.js — 游戏 APP 主入口（专业版）
   对齐参考：聚会玩 / 谁是卧底 Online / Tabletopia / BGA
   功能：
     - 4 个子游戏汇总：真心话大冒险 / 谁是卧底 / 骗子酒馆 / 塔罗牌占卜
     - 统计概览：总局数 / 今日 / 胜场 / 收藏
     - 搜索 + 收藏置顶
     - 设置页：默认难度 / 默认游戏 / 显示提示 / 音效 / 显示统计 / 清空所有历史 / 关于
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
    { id: "truth-or-dare", name: "真心话大冒险", desc: "抽题挑战，看谁敢说真话", icon: "app-games",    color: "#E8846B", storeKey: "game_truth_dare", winKey: "done" },
    { id: "undercover",    name: "谁是卧底",     desc: "我和你，到底谁是卧底？", icon: "users",         color: "#8BC28A", storeKey: "game_undercover", winKey: "win" },
    { id: "liar-dice",     name: "骗子酒馆",     desc: "摇骰子比大小，下注赢钱", icon: "dice",          color: "#C9A36B", storeKey: "game_liar_dice",  winKey: "outcome", winVal: "win" },
    { id: "tarot",         name: "塔罗牌占卜",   desc: "抽三张牌，看看未来",     icon: "card-tarot",    color: "#9B7EBD", storeKey: "game_tarot",      winKey: null },
  ];

  async function mount(container) {
    _applyBg(container);
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "games");
    }
    page.appendChild(_nav(U, "游戏", () => _openSettings(U, () => _remount(container))));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // ---------- 统计概览 ----------
    if (State.get("gamesShowStats") !== false) {
      const stats = await _gatherStats(Storage);
      content.appendChild(U.el("div", { class: "gm-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: String(stats.total) }),
          U.el("div", { class: "msb-label", text: "总局数" }),
        ]),
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: String(stats.today) }),
          U.el("div", { class: "msb-label", text: "今日" }),
        ]),
        U.el("div", { class: "msb-card" + (stats.wins > 0 ? " highlight" : "") }, [
          U.el("div", { class: "msb-num", text: String(stats.wins) }),
          U.el("div", { class: "msb-label", text: "胜场" }),
        ]),
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: String(stats.favCount) }),
          U.el("div", { class: "msb-label", text: "收藏" }),
        ]),
      ]));
    }

    // ---------- 搜索 ----------
    const search = U.el("input", { class: "input", placeholder: "搜索游戏...", style: { marginBottom: "12px" } });
    content.appendChild(search);

    const listWrap = U.el("div", {});
    content.appendChild(listWrap);

    async function _load() {
      const favs = State.get("gamesPinFavorites") || [];
      let kw = search.value.trim().toLowerCase();
      U.empty(listWrap);
      let list = GAMES.filter((g) => !kw || g.name.toLowerCase().includes(kw) || g.desc.toLowerCase().includes(kw));
      // 收藏置顶
      list.sort((a, b) => {
        const ai = favs.indexOf(a.id), bi = favs.indexOf(b.id);
        if (ai >= 0 && bi < 0) return -1;
        if (bi >= 0 && ai < 0) return 1;
        return 0;
      });
      if (list.length === 0) {
        listWrap.appendChild(U.el("div", { class: "empty-text", text: "没找到游戏呢" }));
        return;
      }
      for (const g of list) {
        const isFav = favs.indexOf(g.id) >= 0;
        listWrap.appendChild(_gameCard(U, g, isFav, async () => {
          // 切换收藏
          const cur = State.get("gamesPinFavorites") || [];
          const idx = cur.indexOf(g.id);
          if (idx >= 0) cur.splice(idx, 1); else cur.push(g.id);
          await State.set("gamesPinFavorites", cur);
          global.Phone.Notify.push({ appId: "games", title: idx >= 0 ? "已取消收藏" : "已收藏「" + g.name + "」" });
          _load();
        }, async () => {
          const sub = global.Phone.Games[g.id];
          if (sub && sub.open) {
            // 进入子游戏前记录今日访问，便于统计
            sub.open();
          }
        }, await _gameStats(Storage, g)));
      }
    }

    search.addEventListener("input", U.debounce(_load, 200));
    _load();

    page.appendChild(content);
    container.appendChild(page);
  }

  // ---------- 汇总统计 ----------
  async function _gatherStats(Storage) {
    let total = 0, today = 0, wins = 0;
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    for (const g of GAMES) {
      const list = await Storage.getAll(g.storeKey);
      total += list.length;
      today += list.filter((r) => (r.createdAt || 0) >= t0.getTime()).length;
      if (g.winKey && g.winVal) {
        wins += list.filter((r) => r[g.winKey] === g.winVal).length;
      } else if (g.winKey === "done") {
        wins += list.filter((r) => r.done).length;
      } else if (g.winKey === "win") {
        wins += list.filter((r) => r.win).length;
      }
    }
    const favs = global.Phone.State.get("gamesPinFavorites") || [];
    return { total, today, wins, favCount: favs.length };
  }

  // ---------- 单游戏统计 ----------
  async function _gameStats(Storage, g) {
    const list = await Storage.getAll(g.storeKey);
    return { total: list.length };
  }

  // ---------- 游戏卡 ----------
  function _gameCard(U, g, isFav, onFav, onOpen, stats) {
    const card = U.el("div", { class: "game-card" });
    const icon = U.el("div", { class: "gc-icon", style: { background: g.color } });
    icon.innerHTML = global.Phone.IconLibrary.get(g.icon, { size: 28 });
    card.appendChild(icon);
    const main = U.el("div", { class: "gc-main" });
    main.appendChild(U.el("div", { class: "gc-name", text: g.name }));
    main.appendChild(U.el("div", { class: "gc-desc", text: g.desc }));
    if (stats && stats.total > 0) {
      main.appendChild(U.el("div", { class: "gc-stats", text: "已玩 " + stats.total + " 局" }));
    }
    card.appendChild(main);
    // 收藏按钮
    const favBtn = U.el("button", { class: "icon-btn gc-fav" + (isFav ? " active" : "") });
    favBtn.innerHTML = global.Phone.IconLibrary.get(isFav ? "heart-fill" : "heart", { size: 18 });
    if (isFav) favBtn.style.color = "var(--color-accent)";
    favBtn.addEventListener("click", (e) => { e.stopPropagation(); onFav(); });
    card.appendChild(favBtn);
    card.addEventListener("click", onOpen);
    return card;
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "games",
      title: "游戏设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("显示");
        tools.toggle("显示统计概览", "关闭后隐藏顶部的数字卡片", "gamesShowStats", null);
        tools.toggle("收藏置顶", "把收藏的游戏排在最前面", "gamesPinFavorites", null);
        tools.toggle("显示提示", "游戏中显示玩法提示", "gamesShowHint", null);
        tools.toggle("游戏音效", "按键和翻牌的轻微反馈（静音环境下生效）", "gamesSound", null);

        tools.section("默认难度");
        const curDiff = State.get("gamesDifficulty") || "normal";
        const diffSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        [
          { v: "easy", l: "轻松" },
          { v: "normal", l: "普通" },
          { v: "hard", l: "挑战" },
        ].forEach((s) => {
          const node = U.el("div", { class: "segment-item" + (curDiff === s.v ? " active" : ""), text: s.l });
          node.addEventListener("click", async () => {
            await State.set("gamesDifficulty", s.v);
            diffSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          diffSeg.appendChild(node);
        });
        const diffGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [diffSeg]);
        content.appendChild(diffGroup);

        tools.section("数据");
        tools.action("清空所有游戏记录", async () => {
          const ok = await global.Phone.Modal.confirm({
            title: "清空记录", message: "这会删除 4 个游戏的所有历史记录，不可恢复哦。", danger: true, okText: "清空",
          });
          if (!ok) return;
          for (const g of GAMES) {
            const list = await global.Phone.Storage.getAll(g.storeKey);
            for (const r of list) await global.Phone.Storage.del(g.storeKey, r.id);
          }
          global.Phone.Notify.push({ appId: "games", title: "已清空所有记录" });
          onDone && onDone();
        }, { danger: true });
        tools.action("导出游戏统计", async () => {
          const out = {};
          for (const g of GAMES) {
            const list = await global.Phone.Storage.getAll(g.storeKey);
            out[g.id] = {
              name: g.name,
              total: list.length,
              wins: list.filter((r) => g.winKey && r[g.winKey] === (g.winVal || true)).length,
            };
          }
          const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "games-stats-" + new Date().toISOString().slice(0, 10) + ".json";
          a.click();
          URL.revokeObjectURL(url);
          global.Phone.Notify.push({ appId: "games", title: "已导出统计" });
        });

        tools.section("关于");
        tools.hint("游戏 APP 收纳了 4 个小游戏：真心话大冒险、谁是卧底、骗子酒馆、塔罗牌占卜。每个小游戏都有自己的设置页和历史记录。");
      },
    });
  }

  // 应用自定义背景（统一推广到所有 APP）
  async function _applyBg(container) {
    try {
      const bgs = await global.Phone.State.get("appBackgrounds");
      if (bgs && bgs.games) container.style.background = bgs.games;
      else container.style.background = "";
    } catch (e) {}
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

  // ---------- 暴露 ----------
  global.Phone.Games.open = open;
  global.Phone.Games.mount = mount;
  global.Phone.Games.applyBg = _applyBg; // 供子游戏复用
  global.Phone.Games.GAMES = GAMES;       // 供子游戏查询同胞信息
  global.Phone.Games.gatherStats = _gatherStats;

  // ---------- 对外 API（新增，不改现有方法和 UI 逻辑） ----------
  // 设置 key 映射：API 用的 key 不带 "games" 前缀
  const _SETTING_KEY_MAP = {
    difficulty: "gamesDifficulty",
    sound: "gamesSound",
    showHint: "gamesShowHint",
    showStats: "gamesShowStats",
    defaultTab: "gamesDefaultTab",
    pinFavorites: "gamesPinFavorites",
  };
  function _resolveSettingKey(key) {
    if (_SETTING_KEY_MAP[key]) return _SETTING_KEY_MAP[key];
    if (!key) return "games";
    return "games" + key.charAt(0).toUpperCase() + key.slice(1);
  }

  /** 我列出收藏的游戏 */
  global.Phone.Games.listFavorites = function () {
    const favs = global.Phone.State.get("gamesPinFavorites") || [];
    return GAMES.filter((g) => favs.indexOf(g.id) >= 0);
  };

  /** 我切换某个游戏的收藏状态 */
  global.Phone.Games.toggleFavorite = async function (gameId) {
    if (!gameId) return { ok: false, error: "缺少 gameId" };
    const cur = global.Phone.State.get("gamesPinFavorites") || [];
    const idx = cur.indexOf(gameId);
    let added;
    if (idx >= 0) { cur.splice(idx, 1); added = false; }
    else { cur.push(gameId); added = true; }
    await global.Phone.State.set("gamesPinFavorites", cur);
    const g = GAMES.find((x) => x.id === gameId);
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GAME_PLAYED, {
      sourceApp: "games",
      data: { game: gameId, action: "toggleFavorite", favorite: added },
      summary: added ? "我收藏了" + (g ? "「" + g.name + "」" : "一个游戏") : "我取消了一个游戏收藏",
    });
    return { ok: true, favorite: added, list: cur };
  };

  /** 我把单个游戏的统计拉出来（委托给子游戏） */
  global.Phone.Games.stats = async function (gameId) {
    const sub = global.Phone.Games[gameId];
    if (sub && typeof sub.stats === "function") {
      return await sub.stats();
    }
    return null;
  };

  /** 我清空某个游戏的历史 */
  global.Phone.Games.clearHistory = async function (gameId) {
    const sub = global.Phone.Games[gameId];
    if (sub && typeof sub.clearHistory === "function") {
      return await sub.clearHistory();
    }
    const g = GAMES.find((x) => x.id === gameId);
    if (g) {
      const list = await global.Phone.Storage.getAll(g.storeKey);
      for (const r of list) await global.Phone.Storage.del(g.storeKey, r.id);
      return { ok: true, cleared: list.length };
    }
    return { ok: false, error: "未找到游戏" };
  };

  /** 我把所有游戏的历史都清空 */
  global.Phone.Games.clearAll = async function () {
    let total = 0;
    for (const g of GAMES) {
      const sub = global.Phone.Games[g.id];
      if (sub && typeof sub.clearHistory === "function") {
        try { await sub.clearHistory(); } catch (e) {}
      } else {
        const list = await global.Phone.Storage.getAll(g.storeKey);
        for (const r of list) await global.Phone.Storage.del(g.storeKey, r.id);
        total += list.length;
      }
    }
    return { ok: true, cleared: total };
  };

  /** 我读一下某个设置（key 不带 games 前缀） */
  global.Phone.Games.getSetting = function (key) {
    return global.Phone.State.get(_resolveSettingKey(key));
  };

  /** 我改一下某个设置（key 不带 games 前缀） */
  global.Phone.Games.setSetting = async function (key, value) {
    await global.Phone.State.set(_resolveSettingKey(key), value);
    return value;
  };

  /** 我把所有设置列出来 */
  global.Phone.Games.listSettings = function () {
    const State = global.Phone.State;
    return {
      difficulty: State.get("gamesDifficulty"),
      sound: State.get("gamesSound"),
      showHint: State.get("gamesShowHint"),
      showStats: State.get("gamesShowStats"),
      defaultTab: State.get("gamesDefaultTab"),
      pinFavorites: State.get("gamesPinFavorites"),
    };
  };
})(window);
