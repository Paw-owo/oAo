/* ============================================================
   wallet.js — 钱包 APP（专业版）
   对齐参考：支付宝钱包 / 微信钱包 / Apple Wallet / 鲸记账
   功能：
     - 用户余额 + AI 零花钱 双账户
     - 转账 / 收款 / 修改余额
     - 交易分类（餐饮 交通 购物 娱乐 工资 红包 转账 其他）
     - 交易明细：搜索 + 多维度筛选（类型 / 分类 / 时间）
     - 编辑 / 删除单笔交易
     - 月度统计：收支结余 + 分类占比饼图 + 趋势柱状图
     - 低余额提醒（订阅余额变化）
     - 设置页：隐藏余额 / 货币符号 / 低阈值 / 默认分类 / 清空记录
   挂在 window.Phone.Wallet
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  // 交易分类定义（图标 + 名称 + 颜色）
  const CATEGORIES = [
    { id: "food",     name: "餐饮", icon: "utensils",   color: "#E8846B" },
    { id: "transport",name: "交通", icon: "car",        color: "#8BC28A" },
    { id: "shopping", name: "购物", icon: "bag",        color: "#C9A36B" },
    { id: "fun",      name: "娱乐", icon: "gamepad",    color: "#9B7EBD" },
    { id: "salary",   name: "工资", icon: "coin",       color: "#7BB5D6" },
    { id: "gift",     name: "红包", icon: "gift",       color: "#E8869B" },
    { id: "transfer", name: "转账", icon: "switch",     color: "#A8A8A8" },
    { id: "other",    name: "其他", icon: "tag",        color: "#B0B0B0" },
  ];

  global.Phone.AppRegistry.register({
    id: "wallet",
    name: "钱包",
    icon: "app-wallet",
    entry: () => open(),
    events: ["wallet_changed"],
    settings: [],
    order: 61,
  });

  function open() { global.Phone.Router.push("wallet", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const currentId = await State.get("currentCharacterId");
    const chars = await Storage.getAll("characters");
    const current = chars.find((c) => c.id === currentId) || chars[0];

    const wallet = await Storage.get("wallet", "main");
    if (!wallet) {
      container.appendChild(_fatal(U, "钱包还没初始化"));
      return;
    }

    const hideBalance = !!State.get("walletHideBalance");
    const currency = State.get("walletCurrency") || "元";
    const lowThreshold = parseInt(State.get("walletLowThreshold"), 10) || 0;

    const userBalance = wallet.userBalance || 0;
    const aiBalance = wallet.aiBalance || 0;
    const txs = wallet.transactions || [];

    // 当月概览
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthTx = txs.filter((t) => t.createdAt >= monthStart && t.balanceType === "user");
    const monthIncome = monthTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const monthExpense = monthTx.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "wallet");
    }
    page.appendChild(_nav(U, "钱包", () => _openSettings(U, () => _remount(container))));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // ---------- 余额卡 ----------
    const userCard = U.el("div", { class: "wallet-card" }, [
      U.el("div", { class: "wc-row", style: { justifyContent: "space-between", marginTop: "0" } }, [
        U.el("div", { class: "wc-label", text: "我的小金库" }),
        U.el("button", {
          class: "icon-btn", style: { color: "rgba(255,255,255,0.85)" },
          html: global.Phone.IconLibrary.get(hideBalance ? "eye-off" : "eye", { size: 18 }),
          onclick: async () => {
            await State.set("walletHideBalance", !hideBalance);
            _remount(container);
          },
        }),
      ]),
      U.el("div", { class: "wc-amount", text: hideBalance ? "＊＊＊＊" : (_fmtMoney(userBalance, currency)) }),
      U.el("div", { class: "wc-row", style: { justifyContent: "space-between", marginTop: "16px" } }, [
        U.el("div", {}, [
          U.el("div", { class: "wc-label", text: current ? (current.name + " 的零花钱") : "AI 零花钱" }),
          U.el("div", {
            class: "wc-amount",
            text: hideBalance ? "＊＊＊" : _fmtMoney(aiBalance, currency),
            style: { fontSize: "20px", marginTop: "2px" },
          }),
        ]),
        U.el("div", { style: { textAlign: "right" } }, [
          U.el("div", { class: "wc-label", text: "本月结余" }),
          U.el("div", {
            class: "wc-amount",
            text: hideBalance ? "＊＊" : _fmtMoney(monthIncome + monthExpense, currency),
            style: { fontSize: "16px", marginTop: "2px", color: (monthIncome + monthExpense) >= 0 ? "#fff" : "rgba(255,255,255,0.85)" },
          }),
        ]),
      ]),
    ]);
    content.appendChild(userCard);

    // ---------- 本月概览双卡 ----------
    const overview = U.el("div", { class: "wallet-overview" }, [
      U.el("div", { class: "wo-card income" }, [
        U.el("div", { class: "wo-label", text: "本月收入" }),
        U.el("div", { class: "wo-amount", text: hideBalance ? "＊＊" : ("+" + _fmtMoney(monthIncome, currency, false)) }),
      ]),
      U.el("div", { class: "wo-card expense" }, [
        U.el("div", { "class": "wo-label", text: "本月支出" }),
        U.el("div", { class: "wo-amount", text: hideBalance ? "＊＊" : (_fmtMoney(monthExpense, currency, false)) }),
      ]),
    ]);
    content.appendChild(overview);

    // ---------- 操作按钮 ----------
    const actions = U.el("div", { class: "wallet-actions" });
    actions.appendChild(_action(U, "switch", "转账", () => _transfer(U, wallet, current, "user_to_ai", () => _remount(container))));
    actions.appendChild(_action(U, "in", "收款", () => _transfer(U, wallet, current, "ai_to_user", () => _remount(container))));
    actions.appendChild(_action(U, "edit", "记一笔", () => _editBalance(U, wallet, current, () => _remount(container))));
    actions.appendChild(_action(U, "list", "统计", () => _openStats(U, wallet, current)));
    content.appendChild(actions);

    // ---------- 交易明细 ----------
    content.appendChild(U.el("div", {
      class: "section-title",
      text: "交易明细",
      style: { margin: "16px 0 8px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    }, [
      U.el("span", { text: "交易明细" }),
      U.el("span", { class: "muted", text: "共 " + txs.length + " 笔", style: { fontSize: "var(--font-xs)" } }),
    ]));

    // 搜索框
    const searchWrap = U.el("div", { class: "app-header-bar", style: { padding: "0 0 12px" } });
    const searchInput = U.el("input", { class: "input", placeholder: "搜索备注 / 分类...", style: { width: "100%" } });
    searchWrap.appendChild(searchInput);
    content.appendChild(searchWrap);

    // 筛选
    const filterSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "12px", overflowX: "auto" } });
    const filters = [
      { v: "all", l: "全部" },
      { v: "income", l: "收入" },
      { v: "expense", l: "支出" },
      { v: "user", l: "我的" },
      { v: "ai", l: "TA的" },
    ];
    let curFilter = "all";
    const listWrap = U.el("div", { class: "tx-list" });

    function _renderList() {
      let list = txs.slice().sort((a, b) => b.createdAt - a.createdAt);
      const kw = searchInput.value.trim().toLowerCase();
      if (kw) {
        list = list.filter((t) => {
          const cat = _catName(t.category);
          return (
            (t.note || "").toLowerCase().includes(kw) ||
            cat.toLowerCase().includes(kw)
          );
        });
      }
      if (curFilter === "income") list = list.filter((t) => t.amount > 0);
      if (curFilter === "expense") list = list.filter((t) => t.amount < 0);
      if (curFilter === "user") list = list.filter((t) => (t.balanceType || "user") === "user");
      if (curFilter === "ai") list = list.filter((t) => t.balanceType === "ai");

      U.empty(listWrap);
      if (list.length === 0) {
        listWrap.appendChild(_empty(U, "没有匹配的交易", "换个关键词或筛选项试试~"));
        return;
      }
      list.forEach((t) => {
        listWrap.appendChild(_txItem(U, t, current, () => _remount(container)));
      });
    }
    filters.forEach((f) => {
      const node = U.el("div", { class: "segment-item" + (curFilter === f.v ? " active" : ""), text: f.l });
      node.addEventListener("click", () => {
        curFilter = f.v;
        filterSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
        _renderList();
      });
      filterSeg.appendChild(node);
    });
    content.appendChild(filterSeg);
    searchInput.addEventListener("input", U.debounce(_renderList, 200));
    content.appendChild(listWrap);
    _renderList();

    page.appendChild(content);
    container.appendChild(page);

    // 触发低余额提醒检查
    _checkLowBalance(userBalance, lowThreshold);
  }

  // ---------- 单条交易卡 ----------
  function _txItem(U, t, current, onReload) {
    const isIn = t.amount > 0;
    const cat = _catById(t.category) || _catById("other");
    const item = U.el("div", { class: "tx-item " + (isIn ? "income" : "expense") });
    item.appendChild(U.el("div", { class: "ti-icon", style: { background: cat.color + "33", color: cat.color }, html: global.Phone.IconLibrary.get(cat.icon, { size: 18 }) }));
    item.appendChild(U.el("div", { class: "ti-main" }, [
      U.el("div", { class: "ti-title", text: t.note || (isIn ? "收入" : "支出") }),
      U.el("div", { class: "ti-time", text: U.relTime(t.createdAt) + " · " + cat.name + " · " + (t.balanceType === "ai" ? (current ? current.name : "TA") : "我") }),
    ]));
    item.appendChild(U.el("div", { class: "ti-amount", text: (isIn ? "+" : "") + t.amount }));

    // 长按编辑 / 删除
    let pressTimer = null;
    item.addEventListener("pointerdown", () => {
      pressTimer = setTimeout(() => {
        pressTimer = null;
        _editTx(U, t, onReload);
      }, 600);
    });
    item.addEventListener("pointerup", () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
    item.addEventListener("pointerleave", () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
    return item;
  }

  // ---------- 编辑/删除单笔交易 ----------
  function _editTx(U, t, onReload) {
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "编辑交易" }));

    const noteInput = U.el("input", { class: "input", placeholder: "备注", value: t.note || "", style: { marginTop: "8px" } });
    modal.appendChild(noteInput);

    // 分类选择
    modal.appendChild(U.el("div", { class: "form-label", text: "分类", style: { marginTop: "12px" } }));
    const catGrid = U.el("div", { class: "wallet-cat-grid" });
    let curCat = t.category || "other";
    CATEGORIES.forEach((c) => {
      const chip = U.el("div", { class: "wcg-chip" + (curCat === c.id ? " active" : "") });
      chip.appendChild(U.el("div", { class: "wcg-icon", style: { background: c.color + "33", color: c.color }, html: global.Phone.IconLibrary.get(c.icon, { size: 16 }) }));
      chip.appendChild(U.el("div", { class: "wcg-name", text: c.name }));
      chip.addEventListener("click", () => {
        curCat = c.id;
        catGrid.querySelectorAll(".wcg-chip").forEach((n) => n.classList.remove("active"));
        chip.classList.add("active");
      });
      catGrid.appendChild(chip);
    });
    modal.appendChild(catGrid);

    const amountInput = U.el("input", { class: "input", type: "number", placeholder: "金额（正=收入 负=支出）", value: t.amount, style: { marginTop: "12px" } });
    modal.appendChild(amountInput);

    modal.appendChild(U.el("div", { class: "modal-actions", style: { justifyContent: "space-between" } }, [
      U.el("button", { class: "btn btn-ghost", text: "删除", style: { color: "var(--color-danger)" }, onclick: async () => {
        const ok = await global.Phone.Modal.confirm({ title: "删除交易", message: "确认删除这笔交易记录？", danger: true });
        if (!ok) return;
        const w = await global.Phone.Storage.get("wallet", "main");
        w.transactions = (w.transactions || []).filter((x) => x.id !== t.id);
        await global.Phone.Storage.put("wallet", w);
        global.Phone.Notify.push({ appId: "wallet", title: "已删除" });
        mask.remove(); onReload();
      }}),
      U.el("div", { style: { display: "flex", gap: "8px" } }, [
        U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
        U.el("button", { class: "btn", text: "保存", onclick: async () => {
          const newAmount = parseInt(amountInput.value, 10);
          if (isNaN(newAmount)) {
            global.Phone.Notify.push({ appId: "wallet", title: "金额无效呀" });
            return;
          }
          const w = await global.Phone.Storage.get("wallet", "main");
          const tx = (w.transactions || []).find((x) => x.id === t.id);
          if (!tx) { mask.remove(); return; }
          tx.note = noteInput.value.trim();
          tx.category = curCat;
          tx.amount = newAmount;
          await global.Phone.Storage.put("wallet", w);
          global.Phone.Notify.push({ appId: "wallet", title: "已更新" });
          mask.remove(); onReload();
        }}),
      ]),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 修改余额（记一笔）----------
  function _editBalance(U, wallet, current, onDone) {
    const State = global.Phone.State;
    const defaultCat = State.get("walletDefaultCategory") || "other";
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "记一笔" }));

    // 类型切换
    const typeSeg = U.el("div", { class: "segment", style: { display: "flex", margin: "12px 0" } });
    let type = "expense"; // expense / income / adjust
    const sExp = U.el("div", { class: "segment-item active", text: "支出" });
    const sInc = U.el("div", { class: "segment-item", text: "收入" });
    const sAdj = U.el("div", { class: "segment-item", text: "改余额" });
    sExp.addEventListener("click", () => { type = "expense"; sExp.classList.add("active"); sInc.classList.remove("active"); sAdj.classList.remove("active"); });
    sInc.addEventListener("click", () => { type = "income"; sInc.classList.add("active"); sExp.classList.remove("active"); sAdj.classList.remove("active"); });
    sAdj.addEventListener("click", () => { type = "adjust"; sAdj.classList.add("active"); sExp.classList.remove("active"); sInc.classList.remove("active"); });
    typeSeg.appendChild(sExp); typeSeg.appendChild(sInc); typeSeg.appendChild(sAdj);
    modal.appendChild(typeSeg);

    // 账户选择
    const acctSeg = U.el("div", { class: "segment", style: { display: "flex", margin: "0 0 12px" } });
    let acct = "user";
    const sUser = U.el("div", { class: "segment-item active", text: "我的小金库" });
    const sAi = U.el("div", { class: "segment-item", text: current ? (current.name + " 的零花钱") : "AI 零花钱" });
    sUser.addEventListener("click", () => { acct = "user"; sUser.classList.add("active"); sAi.classList.remove("active"); });
    sAi.addEventListener("click", () => { acct = "ai"; sAi.classList.add("active"); sUser.classList.remove("active"); });
    acctSeg.appendChild(sUser); acctSeg.appendChild(sAi);
    modal.appendChild(acctSeg);

    // 分类选择（仅支出/收入显示）
    modal.appendChild(U.el("div", { class: "form-label", text: "分类" }));
    const catGrid = U.el("div", { class: "wallet-cat-grid" });
    let curCat = defaultCat;
    CATEGORIES.forEach((c) => {
      const chip = U.el("div", { class: "wcg-chip" + (curCat === c.id ? " active" : "") });
      chip.appendChild(U.el("div", { class: "wcg-icon", style: { background: c.color + "33", color: c.color }, html: global.Phone.IconLibrary.get(c.icon, { size: 16 }) }));
      chip.appendChild(U.el("div", { class: "wcg-name", text: c.name }));
      chip.addEventListener("click", () => {
        curCat = c.id;
        catGrid.querySelectorAll(".wcg-chip").forEach((n) => n.classList.remove("active"));
        chip.classList.add("active");
      });
      catGrid.appendChild(chip);
    });
    modal.appendChild(catGrid);

    const amountInput = U.el("input", { class: "input", type: "number", placeholder: type === "adjust" ? "输入新余额" : "金额", style: { marginTop: "12px" } });
    modal.appendChild(amountInput);

    const noteInput = U.el("input", { class: "input", placeholder: "备注（可选）", style: { marginTop: "8px" } });
    modal.appendChild(noteInput);

    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "保存", onclick: async () => {
        const raw = amountInput.value.trim();
        const val = parseInt(raw, 10);
        if (isNaN(val) || val < 0) {
          global.Phone.Notify.push({ appId: "wallet", title: "请输入有效的金额呀" });
          return;
        }
        const Storage = global.Phone.Storage;
        const w = await Storage.get("wallet", "main");
        w.transactions = w.transactions || [];
        const note = noteInput.value.trim();
        if (type === "adjust") {
          const oldBal = acct === "user" ? (w.userBalance || 0) : (w.aiBalance || 0);
          const diff = val - oldBal;
          if (acct === "user") w.userBalance = val; else w.aiBalance = val;
          w.transactions.push({
            id: U.uid("tx"), type: "adjust", amount: diff,
            balanceType: acct, category: curCat, note: note || "修改余额", createdAt: Date.now(),
          });
        } else if (type === "expense") {
          if (acct === "user") {
            if (val > (w.userBalance || 0)) {
              global.Phone.Notify.push({ appId: "wallet", title: "余额不够啦" });
              return;
            }
            w.userBalance = (w.userBalance || 0) - val;
          } else {
            if (val > (w.aiBalance || 0)) {
              global.Phone.Notify.push({ appId: "wallet", title: "TA余额不够啦" });
              return;
            }
            w.aiBalance = (w.aiBalance || 0) - val;
          }
          w.transactions.push({
            id: U.uid("tx"), type: "expense", amount: -val,
            balanceType: acct, category: curCat, note: note || "支出", createdAt: Date.now(),
          });
        } else { // income
          if (acct === "user") w.userBalance = (w.userBalance || 0) + val;
          else w.aiBalance = (w.aiBalance || 0) + val;
          w.transactions.push({
            id: U.uid("tx"), type: "income", amount: val,
            balanceType: acct, category: curCat, note: note || "收入", createdAt: Date.now(),
          });
        }
        await Storage.put("wallet", w);
        _emitWallet(U, acct, type === "expense" ? -val : (type === "income" ? val : val), note || (type === "adjust" ? "修改余额" : (type === "expense" ? "支出" : "收入")), current);
        global.Phone.Notify.push({ appId: "wallet", title: "记下啦" });
        mask.remove(); onDone();
      }}),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 转账 ----------
  function _transfer(U, wallet, current, direction, onDone) {
    const isUserToAi = direction === "user_to_ai";
    const title = isUserToAi ? ("转账给 " + (current ? current.name : "AI")) : ((current ? current.name : "AI") + " 转账给我");
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: title }));

    const balance = isUserToAi ? (wallet.userBalance || 0) : (wallet.aiBalance || 0);
    modal.appendChild(U.el("div", { class: "muted", text: "当前余额：" + balance, style: { margin: "8px 0" } }));

    const input = U.el("input", { class: "input", type: "number", placeholder: "转账金额", style: { marginTop: "8px" } });
    modal.appendChild(input);

    // 快捷金额
    const quickWrap = U.el("div", { class: "wallet-quick", style: { display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" } });
    [50, 100, 200, 500, 1000].forEach((v) => {
      const btn = U.el("button", { class: "btn btn-ghost btn-sm", text: String(v), style: { padding: "4px 12px" } });
      btn.addEventListener("click", () => { input.value = v; });
      quickWrap.appendChild(btn);
    });
    modal.appendChild(quickWrap);

    const note = U.el("input", { class: "input", placeholder: "备注（可选）", style: { marginTop: "8px" } });
    modal.appendChild(note);

    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "转账", onclick: async () => {
        const amount = parseInt(input.value, 10);
        if (isNaN(amount) || amount <= 0) {
          global.Phone.Notify.push({ appId: "wallet", title: "请输入正整数金额呀" });
          return;
        }
        const fromBalance = isUserToAi ? (wallet.userBalance || 0) : (wallet.aiBalance || 0);
        if (amount > fromBalance) {
          global.Phone.Notify.push({ appId: "wallet", title: "余额不够啦" });
          return;
        }
        const Storage = global.Phone.Storage;
        if (isUserToAi) {
          wallet.userBalance = fromBalance - amount;
          wallet.aiBalance = (wallet.aiBalance || 0) + amount;
        } else {
          wallet.aiBalance = fromBalance - amount;
          wallet.userBalance = (wallet.userBalance || 0) + amount;
        }
        const noteText = note.value.trim();
        wallet.transactions = wallet.transactions || [];
        wallet.transactions.push({
          id: U.uid("tx"), type: "transfer", amount: -amount,
          balanceType: isUserToAi ? "user" : "ai",
          category: "transfer",
          note: noteText || (isUserToAi ? "转账给 " + (current ? current.name : "AI") : "收到转账"),
          createdAt: Date.now(),
        });
        wallet.transactions.push({
          id: U.uid("tx"), type: "transfer", amount: amount,
          balanceType: isUserToAi ? "ai" : "user",
          category: "transfer",
          note: noteText || (isUserToAi ? "收到转账" : "转账给我"),
          createdAt: Date.now(),
        });
        await Storage.put("wallet", wallet);
        _emitWallet(U, isUserToAi ? "ai" : "user", amount, noteText || (isUserToAi ? "转账给 AI" : "AI 转账给我"), current);
        global.Phone.Notify.push({ appId: "wallet", title: "转账成功啦" });
        mask.remove(); onDone();
      }}),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 统计页 ----------
  function _openStats(U, wallet, current) {
    global.Phone.Router.push("wallet-stats", (container) => {
      _mountStats(U, container, wallet, current);
    }, {});
  }

  function _mountStats(U, container, wallet, current) {
    const State = global.Phone.State;
    const currency = State.get("walletCurrency") || "元";
    const txs = (wallet.transactions || []).filter((t) => t.balanceType === "user");

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "wallet");
    }
    page.appendChild(_nav(U, "收支统计", null));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // 时间范围切换
    const rangeSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "12px" } });
    let range = "month";
    const ranges = [
      { v: "month", l: "本月" },
      { v: "last", l: "上月" },
      { v: "year", l: "今年" },
      { v: "all", l: "全部" },
    ];
    const statsWrap = U.el("div", {});
    ranges.forEach((r) => {
      const node = U.el("div", { class: "segment-item" + (range === r.v ? " active" : ""), text: r.l });
      node.addEventListener("click", () => {
        range = r.v;
        rangeSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
        _render();
      });
      rangeSeg.appendChild(node);
    });
    content.appendChild(rangeSeg);
    content.appendChild(statsWrap);

    function _render() {
      const now = new Date();
      let startTs;
      if (range === "month") startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      else if (range === "last") {
        const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        startTs = last.getTime();
        const lastEnd = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const filtered = txs.filter((t) => t.createdAt >= startTs && t.createdAt < lastEnd);
        U.empty(statsWrap);
        statsWrap.appendChild(_statsCard(U, filtered, currency, current));
        return;
      }
      else if (range === "year") startTs = new Date(now.getFullYear(), 0, 1).getTime();
      else startTs = 0;
      const filtered = txs.filter((t) => t.createdAt >= startTs);
      U.empty(statsWrap);
      statsWrap.appendChild(_statsCard(U, filtered, currency, current));
    }
    _render();

    page.appendChild(content);
    container.appendChild(page);
  }

  function _statsCard(U, txs, currency, current) {
    const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    const balance = income + expense;

    // 按分类汇总（仅支出）
    const catMap = {};
    txs.filter((t) => t.amount < 0).forEach((t) => {
      const cid = t.category || "other";
      if (!catMap[cid]) catMap[cid] = { income: 0, expense: 0 };
      catMap[cid].expense += Math.abs(t.amount);
    });
    txs.filter((t) => t.amount > 0).forEach((t) => {
      const cid = t.category || "other";
      if (!catMap[cid]) catMap[cid] = { income: 0, expense: 0 };
      catMap[cid].income += t.amount;
    });

    const wrap = U.el("div", {});

    // 三宫格概览
    wrap.appendChild(U.el("div", { class: "wallet-stats-grid" }, [
      U.el("div", { class: "wsg-card" }, [
        U.el("div", { class: "wsg-label", text: "收入" }),
        U.el("div", { class: "wsg-amount income", text: "+" + _fmtMoney(income, currency, false) }),
      ]),
      U.el("div", { class: "wsg-card" }, [
        U.el("div", { class: "wsg-label", text: "支出" }),
        U.el("div", { class: "wsg-amount expense", text: _fmtMoney(expense, currency, false) }),
      ]),
      U.el("div", { class: "wsg-card" }, [
        U.el("div", { class: "wsg-label", text: "结余" }),
        U.el("div", { class: "wsg-amount", text: _fmtMoney(balance, currency, false) }),
      ]),
    ]));

    // 分类占比
    wrap.appendChild(U.el("div", { class: "section-title", text: "支出分类", style: { margin: "16px 0 8px" } }));
    const catList = U.el("div", { class: "settings-group", style: { padding: "8px 0" } });
    const totalExpense = Math.abs(expense);
    const cats = Object.keys(catMap).map((cid) => ({ cid, ...catMap[cid] })).sort((a, b) => b.expense - a.expense);
    if (cats.length === 0 || totalExpense === 0) {
      catList.appendChild(U.el("div", { class: "empty-state", style: { padding: "20px" } }, [
        U.el("div", { class: "es-sub", text: "这个时间段还没有支出记录呀" }),
      ]));
    } else {
      cats.forEach((c) => {
        const cat = _catById(c.cid) || _catById("other");
        const pct = totalExpense > 0 ? (c.expense / totalExpense * 100) : 0;
        const row = U.el("div", { class: "wallet-cat-row" }, [
          U.el("div", { class: "wcr-icon", style: { background: cat.color + "33", color: cat.color }, html: global.Phone.IconLibrary.get(cat.icon, { size: 18 }) }),
          U.el("div", { class: "wcr-main" }, [
            U.el("div", { class: "wcr-top" }, [
              U.el("div", { class: "wcr-name", text: cat.name }),
              U.el("div", { class: "wcr-amount", text: "-" + _fmtMoney(c.expense, currency, false) }),
            ]),
            U.el("div", { class: "wcr-bar-bg" }, [
              U.el("div", { class: "wcr-bar", style: { width: pct + "%", background: cat.color } }),
            ]),
            U.el("div", { class: "wcr-pct", text: pct.toFixed(1) + "%" + (c.income > 0 ? " · 收入 " + _fmtMoney(c.income, currency, false) : "") }),
          ]),
        ]);
        catList.appendChild(row);
      });
    }
    wrap.appendChild(catList);

    // 笔数
    wrap.appendChild(U.el("div", {
      class: "form-hint",
      text: "这段时间一共 " + txs.length + " 笔记录，其中支出 " + txs.filter((t) => t.amount < 0).length + " 笔，收入 " + txs.filter((t) => t.amount > 0).length + " 笔。",
      style: { padding: "12px 0", textAlign: "center" },
    }));

    return wrap;
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "wallet",
      title: "钱包设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("显示");
        tools.toggle("隐藏余额", "在卡片上把金额变成 ＊＊＊", "walletHideBalance", null);

        tools.section("货币");
        tools.segment("货币符号", [
          { val: "元", label: "元" },
          { val: "￥", label: "￥" },
          { val: "¥", label: "¥" },
          { val: "$", label: "$" },
          { val: "€", label: "€" },
        ], "walletCurrency", null);

        tools.section("默认值");
        const defaultCat = State.get("walletDefaultCategory") || "other";
        const catGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } });
        catGroup.appendChild(U.el("div", { class: "form-label", text: "默认分类（记一笔时预选）" }));
        const catGrid = U.el("div", { class: "wallet-cat-grid" });
        CATEGORIES.forEach((c) => {
          const chip = U.el("div", { class: "wcg-chip" + (defaultCat === c.id ? " active" : "") });
          chip.appendChild(U.el("div", { class: "wcg-icon", style: { background: c.color + "33", color: c.color }, html: global.Phone.IconLibrary.get(c.icon, { size: 16 }) }));
          chip.appendChild(U.el("div", { class: "wcg-name", text: c.name }));
          chip.addEventListener("click", async () => {
            await State.set("walletDefaultCategory", c.id);
            catGrid.querySelectorAll(".wcg-chip").forEach((n) => n.classList.remove("active"));
            chip.classList.add("active");
            global.Phone.Notify.push({ appId: "wallet", title: "默认分类已设为 " + c.name });
          });
          catGrid.appendChild(chip);
        });
        catGroup.appendChild(catGrid);
        content.appendChild(catGroup);

        tools.section("提醒");
        tools.input("低余额提醒阈值", "walletLowThreshold", { type: "number", placeholder: "如 100" });
        tools.hint("当我的小金库余额低于此值时，会推送一条提醒。");

        tools.section("数据");
        tools.action("清空所有交易记录", async () => {
          const ok = await global.Phone.Modal.confirm({
            title: "清空交易记录",
            message: "这会删除所有交易明细，但保留当前余额。这个操作不可恢复的哦。",
            danger: true,
          });
          if (!ok) return;
          const w = await global.Phone.Storage.get("wallet", "main");
          if (w) {
            w.transactions = [];
            await global.Phone.Storage.put("wallet", w);
            global.Phone.Notify.push({ appId: "wallet", title: "交易记录已清空" });
            onDone && onDone();
          }
        }, { danger: true });

        tools.section("关于");
        tools.hint("钱包 APP 记录你和 TA 之间的零花钱往来，所有数据都保存在本地，不会上传到任何地方。");
      },
    });
  }

  // ---------- 低余额检查 ----------
  let _lowAlerted = false;
  function _checkLowBalance(balance, threshold) {
    if (!threshold || threshold <= 0) return;
    if (balance < threshold && !_lowAlerted) {
      _lowAlerted = true;
      global.Phone.Notify.push({
        appId: "wallet",
        title: "小金库有点紧张啦",
        body: "当前余额 " + balance + "，已经低于提醒阈值 " + threshold + " 了。",
      });
    } else if (balance >= threshold) {
      _lowAlerted = false;
    }
  }

  // 触发钱包事件
  function _emitWallet(U, target, amount, note, current) {
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.WALLET_CHANGED, {
      sourceApp: "wallet",
      data: { target, amount, note, characterId: current ? current.id : null },
      summary: (target === "ai" ? "给" + (current ? current.name : "AI") : "我的小金库") + " " + (amount >= 0 ? "+" : "") + amount + "（" + note + "）",
    });
  }

  // ---------- 工具 ----------
  function _fmtMoney(amount, currency, withUnit) {
    if (withUnit === false) {
      return (amount || 0).toLocaleString() + " " + currency;
    }
    return (amount || 0).toLocaleString() + " " + currency;
  }
  function _catById(id) { return CATEGORIES.find((c) => c.id === id); }
  function _catName(id) { const c = _catById(id); return c ? c.name : "其他"; }

  function _nav(U, title, onSettings) {
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    const navRight = U.el("div", { class: "nav-right" });
    if (onSettings) {
      const setBtn = U.el("button", { class: "icon-btn" });
      setBtn.innerHTML = global.Phone.IconLibrary.get("app-settings", { size: 20 });
      setBtn.addEventListener("click", onSettings);
      navRight.appendChild(setBtn);
    }
    nav.appendChild(navRight);
    return nav;
  }

  function _action(U, icon, name, onClick) {
    const wrap = U.el("div", { class: "wallet-action" });
    const iconWrap = U.el("div", { class: "wa-icon", html: global.Phone.IconLibrary.get(icon, { size: 22 }) });
    wrap.appendChild(iconWrap);
    wrap.appendChild(U.el("div", { class: "wa-name", text: name }));
    wrap.addEventListener("click", onClick);
    return wrap;
  }

  function _empty(U, title, sub) {
    return U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-wallet", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub }),
    ]);
  }

  function _fatal(U, msg) {
    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(U, "钱包", null));
    page.appendChild(U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-title", text: msg }),
      U.el("div", { class: "es-sub", text: "刷新页面试试" }),
    ]));
    return page;
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 API ----------
  global.Phone.Wallet = {
    open, mount,
    CATEGORIES,
    /** 查询当前余额 */
    async getBalance(target) {
      const w = await global.Phone.Storage.get("wallet", "main");
      if (!w) return 0;
      return target === "ai" ? (w.aiBalance || 0) : (w.userBalance || 0);
    },
    /** 列出交易（可按条件过滤） */
    async listTxs(filter) {
      const w = await global.Phone.Storage.get("wallet", "main");
      if (!w) return [];
      let list = (w.transactions || []).slice();
      if (filter) {
        if (filter.type) list = list.filter((t) => t.type === filter.type);
        if (filter.category) list = list.filter((t) => t.category === filter.category);
        if (filter.balanceType) list = list.filter((t) => t.balanceType === filter.balanceType);
        if (filter.since) list = list.filter((t) => t.createdAt >= filter.since);
        if (filter.until) list = list.filter((t) => t.createdAt < filter.until);
      }
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    /** 统计：按分类汇总 */
    async statsByCategory(filter) {
      const list = await this.listTxs(filter);
      const map = {};
      list.forEach((t) => {
        const cid = t.category || "other";
        if (!map[cid]) map[cid] = { income: 0, expense: 0, count: 0 };
        if (t.amount > 0) map[cid].income += t.amount;
        else map[cid].expense += Math.abs(t.amount);
        map[cid].count++;
      });
      return map;
    },
    /** 扣款（向后兼容：amount/note 可选 category） */
    async deduct(amount, note, category) {
      const Storage = global.Phone.Storage;
      let w;
      try {
        w = await Storage.get("wallet", "main");
        if (!w) return { ok: false, error: "钱包未初始化" };
        if ((w.userBalance || 0) < amount) return { ok: false, error: "余额不够啦" };
        w.userBalance = (w.userBalance || 0) - amount;
        w.transactions = w.transactions || [];
        w.transactions.push({
          id: global.Phone.Utils.uid("tx"), type: "purchase", amount: -amount,
          balanceType: "user", category: category || "shopping",
          note: note || "购买", createdAt: Date.now(),
        });
        await Storage.put("wallet", w);
      } catch (e) {
        console.warn("[Wallet] deduct 失败", e);
        throw e;
      }
      _emitWallet(global.Phone.Utils, "user", -amount, note || "购买", null);
      // 检查低余额
      const threshold = parseInt(global.Phone.State.get("walletLowThreshold"), 10) || 0;
      _checkLowBalance(w.userBalance, threshold);
      return { ok: true, balance: w.userBalance };
    },
    /** AI 转账给用户 */
    async aiToUser(amount, note, category) {
      const Storage = global.Phone.Storage;
      const w = await Storage.get("wallet", "main");
      if (!w) return { ok: false, error: "钱包未初始化" };
      if ((w.aiBalance || 0) < amount) return { ok: false, error: "AI 余额不够" };
      w.aiBalance = (w.aiBalance || 0) - amount;
      w.userBalance = (w.userBalance || 0) + amount;
      w.transactions = w.transactions || [];
      w.transactions.push({
        id: global.Phone.Utils.uid("tx"), type: "transfer", amount: amount,
        balanceType: "user", category: category || "gift",
        note: note || "AI 转账", createdAt: Date.now(),
      });
      w.transactions.push({
        id: global.Phone.Utils.uid("tx"), type: "transfer", amount: -amount,
        balanceType: "ai", category: category || "gift",
        note: note || "AI 转账", createdAt: Date.now(),
      });
      await Storage.put("wallet", w);
      const currentId = await global.Phone.State.get("currentCharacterId");
      const chars = await Storage.getAll("characters");
      const current = chars.find((c) => c.id === currentId) || chars[0];
      _emitWallet(global.Phone.Utils, "user", amount, note || "AI 转账", current);
      return { ok: true, userBalance: w.userBalance, aiBalance: w.aiBalance };
    },
    /** 用户转钱给 AI（聊天中说"我给你转账"时触发） */
    async userToAi(amount, note, category) {
      const Storage = global.Phone.Storage;
      const w = await Storage.get("wallet", "main");
      if (!w) return { ok: false, error: "钱包未初始化" };
      if ((w.userBalance || 0) < amount) return { ok: false, error: "余额不够啦" };
      w.userBalance = (w.userBalance || 0) - amount;
      w.aiBalance = (w.aiBalance || 0) + amount;
      w.transactions = w.transactions || [];
      w.transactions.push({
        id: global.Phone.Utils.uid("tx"), type: "transfer", amount: -amount,
        balanceType: "user", category: category || "transfer",
        note: note || "转账给AI", createdAt: Date.now(),
      });
      w.transactions.push({
        id: global.Phone.Utils.uid("tx"), type: "transfer", amount: amount,
        balanceType: "ai", category: category || "transfer",
        note: note || "转账给AI", createdAt: Date.now(),
      });
      await Storage.put("wallet", w);
      const currentId = await global.Phone.State.get("currentCharacterId");
      const chars = await Storage.getAll("characters");
      const current = chars.find((c) => c.id === currentId) || chars[0];
      _emitWallet(global.Phone.Utils, "ai", amount, note || "转账给AI", current);
      _checkLowBalance(w.userBalance, parseInt(global.Phone.State.get("walletLowThreshold"), 10) || 0);
      return { ok: true, userBalance: w.userBalance, aiBalance: w.aiBalance };
    },
    /** 新增一笔记录（不修改余额，仅记账） */
    async addTx(opts) {
      const Storage = global.Phone.Storage;
      const w = await Storage.get("wallet", "main");
      if (!w) return { ok: false, error: "钱包未初始化" };
      w.transactions = w.transactions || [];
      const tx = {
        id: global.Phone.Utils.uid("tx"),
        type: opts.type || "expense",
        amount: opts.amount || 0,
        balanceType: opts.balanceType || "user",
        category: opts.category || "other",
        note: opts.note || "",
        createdAt: opts.createdAt || Date.now(),
      };
      w.transactions.push(tx);
      await Storage.put("wallet", w);
      return { ok: true, tx };
    },
    /** 我编辑交易记录（合并 patch，必要时回滚余额再应用新值） */
    async updateTx(id, patch) {
      const Storage = global.Phone.Storage;
      const w = await Storage.get("wallet", "main");
      if (!w) return { ok: false, error: "钱包未初始化" };
      w.transactions = w.transactions || [];
      const tx = w.transactions.find((t) => t.id === id);
      if (!tx) return { ok: false, error: "找不到这笔交易呀" };
      const oldAmount = tx.amount || 0;
      const oldBalanceType = tx.balanceType || "user";
      // 我先合并 patch 字段
      Object.keys(patch).forEach((k) => { tx[k] = patch[k]; });
      tx.updatedAt = Date.now();
      // 如果金额 / 分类 / 账户变了，我先回滚旧值再应用新值
      const needRecalc = "amount" in patch || "category" in patch || "balanceType" in patch;
      if (needRecalc) {
        if (oldBalanceType === "user") w.userBalance = (w.userBalance || 0) - oldAmount;
        else if (oldBalanceType === "ai") w.aiBalance = (w.aiBalance || 0) - oldAmount;
        const newAmount = tx.amount || 0;
        const newBalanceType = tx.balanceType || "user";
        if (newBalanceType === "user") w.userBalance = (w.userBalance || 0) + newAmount;
        else if (newBalanceType === "ai") w.aiBalance = (w.aiBalance || 0) + newAmount;
      }
      await Storage.put("wallet", w);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.WALLET_CHANGED, {
        sourceApp: "wallet",
        data: { tx, action: "update" },
        summary: "我更新了一笔交易：" + (tx.note || "无备注"),
      });
      return { ok: true, tx };
    },
    /** 我删除交易（先回滚余额影响，再移除记录） */
    async removeTx(id) {
      const Storage = global.Phone.Storage;
      const w = await Storage.get("wallet", "main");
      if (!w) return { ok: false, error: "钱包未初始化" };
      w.transactions = w.transactions || [];
      const idx = w.transactions.findIndex((t) => t.id === id);
      if (idx < 0) return { ok: false, error: "找不到这笔交易呀" };
      const tx = w.transactions[idx];
      // 我先回滚这笔交易对余额的影响
      const oldAmount = tx.amount || 0;
      const oldBalanceType = tx.balanceType || "user";
      if (oldBalanceType === "user") w.userBalance = (w.userBalance || 0) - oldAmount;
      else if (oldBalanceType === "ai") w.aiBalance = (w.aiBalance || 0) - oldAmount;
      w.transactions.splice(idx, 1);
      await Storage.put("wallet", w);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.WALLET_CHANGED, {
        sourceApp: "wallet",
        data: { tx, action: "remove" },
        summary: "我删掉了一笔交易：" + (tx.note || "无备注"),
      });
      return { ok: true };
    },
    /** 我统计整体收支（按 filter 过滤后汇总） */
    async stats(filter) {
      const list = await this.listTxs(filter);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayEnd = todayStart + 24 * 3600 * 1000;
      let totalIn = 0, totalOut = 0, todayIn = 0, todayOut = 0;
      let userNet = 0, aiNet = 0;
      list.forEach((t) => {
        const amt = t.amount || 0;
        if (amt > 0) totalIn += amt;
        else totalOut += Math.abs(amt);
        if (t.createdAt >= todayStart && t.createdAt < todayEnd) {
          if (amt > 0) todayIn += amt;
          else todayOut += Math.abs(amt);
        }
        if ((t.balanceType || "user") === "user") userNet += amt;
        else if (t.balanceType === "ai") aiNet += amt;
      });
      return {
        totalIn, totalOut, net: totalIn - totalOut,
        count: list.length,
        byBalanceType: { user: userNet, ai: aiNet },
        todayIn, todayOut,
      };
    },
    /** 我做一笔通用转账（direction: ai-to-user / user-to-ai） */
    async transfer(amount, direction, note, category) {
      if (direction === "ai-to-user") return await this.aiToUser(amount, note, category);
      if (direction === "user-to-ai") return await this.userToAi(amount, note, category);
      return { ok: false, error: "不认识的转账方向呀：" + direction };
    },
    /** 我读钱包设置（key 不带 wallet 前缀，如 HideBalance） */
    getSetting(key) {
      return global.Phone.State.get("wallet" + key);
    },
    /** 我写钱包设置（key 不带 wallet 前缀） */
    async setSetting(key, value) {
      return await global.Phone.State.set("wallet" + key, value);
    },
    /** 我列出钱包当前全部设置 */
    listSettings() {
      const State = global.Phone.State;
      return {
        hideBalance: !!State.get("walletHideBalance"),
        currency: State.get("walletCurrency") || "元",
        lowThreshold: parseInt(State.get("walletLowThreshold"), 10) || 0,
        defaultCategory: State.get("walletDefaultCategory") || "other",
      };
    },
  };
})(window);
