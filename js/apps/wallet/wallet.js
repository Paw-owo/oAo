/* ============================================================
   wallet.js — 钱包 APP
   用户余额 / AI 余额 / 转账 / 交易明细 / 事件中心联动
   挂在 window.Phone.Wallet
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
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

    // 读取当前角色（用于 AI 余额归属）
    const currentId = await State.get("currentCharacterId");
    const chars = await Storage.getAll("characters");
    const current = chars.find((c) => c.id === currentId) || chars[0];

    // 读取钱包（单例 main）
    const wallet = await Storage.get("wallet", "main");
    if (!wallet) {
      container.appendChild(_fatal(U, "钱包还没初始化"));
      return;
    }
    const userBalance = wallet.userBalance || 0;
    const aiBalance = wallet.aiBalance || 0;
    const txs = wallet.transactions || [];

    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(U, "钱包"));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // ---------- 用户余额卡 ----------
    const userCard = U.el("div", { class: "wallet-card" }, [
      U.el("div", { class: "wc-label", text: "我的小金库" }),
      U.el("div", { class: "wc-amount", text: "💰 " + userBalance.toLocaleString() }),
      U.el("div", { class: "wc-row" }, [
        U.el("div", {}, [
          U.el("div", { class: "wc-label", text: current ? (current.name + " 的零花钱") : "AI 零花钱" }),
          U.el("div", { class: "wc-amount", text: "🎁 " + aiBalance.toLocaleString(), style: { fontSize: "20px", marginTop: "2px" } }),
        ]),
      ]),
    ]);
    content.appendChild(userCard);

    // ---------- 操作按钮 ----------
    const actions = U.el("div", { class: "wallet-actions" });
    actions.appendChild(_action(U, "edit", "修改余额", () => _editBalance(U, wallet, current, () => _remount(container))));
    actions.appendChild(_action(U, "transfer", "转账给" + (current ? current.name : "AI"), () => _transfer(U, wallet, current, "user_to_ai", () => _remount(container))));
    actions.appendChild(_action(U, "gift", (current ? current.name : "AI") + "转账给我", () => _transfer(U, wallet, current, "ai_to_user", () => _remount(container))));
    content.appendChild(actions);

    // ---------- 交易明细 ----------
    content.appendChild(U.el("div", { class: "section-title", text: "交易明细", style: { margin: "16px 0 8px" } }));

    // 筛选
    const filterSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "12px" } });
    const filters = [
      { v: "all", l: "全部" },
      { v: "income", l: "收入" },
      { v: "expense", l: "支出" },
    ];
    let curFilter = "all";
    const listWrap = U.el("div", { class: "tx-list" });

    function _renderList() {
      let list = txs.slice().sort((a, b) => b.createdAt - a.createdAt);
      if (curFilter === "income") list = list.filter((t) => t.amount > 0);
      if (curFilter === "expense") list = list.filter((t) => t.amount < 0);
      U.empty(listWrap);
      if (list.length === 0) {
        listWrap.appendChild(_empty(U, "还没有交易记录", "改一下余额或转个账试试~"));
        return;
      }
      list.forEach((t) => {
        const isIn = t.amount > 0;
        const iconHtml = global.Phone.IconLibrary.get(isIn ? "plus" : "transfer", { size: 18 });
        const item = U.el("div", { class: "tx-item " + (isIn ? "income" : "expense") }, [
          U.el("div", { class: "ti-icon", html: iconHtml }),
          U.el("div", { class: "ti-main" }, [
            U.el("div", { class: "ti-title", text: t.note || (isIn ? "收入" : "支出") }),
            U.el("div", { class: "ti-time", text: U.relTime(t.createdAt) + " · " + (t.balanceType === "ai" ? "AI" : "我") }),
          ]),
          U.el("div", { class: "ti-amount", text: (isIn ? "+" : "") + t.amount }),
        ]);
        listWrap.appendChild(item);
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
    content.appendChild(listWrap);
    _renderList();

    page.appendChild(content);
    container.appendChild(page);
  }

  // ---------- 修改余额 ----------
  function _editBalance(U, wallet, current, onDone) {
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "修改余额" }));

    const seg = U.el("div", { class: "segment", style: { display: "flex", margin: "12px 0" } });
    let target = "user";
    const sUser = U.el("div", { class: "segment-item active", text: "我的小金库" });
    const sAi = U.el("div", { class: "segment-item", text: current ? current.name + " 的零花钱" : "AI 零花钱" });
    sUser.addEventListener("click", () => { target = "user"; sUser.classList.add("active"); sAi.classList.remove("active"); });
    sAi.addEventListener("click", () => { target = "ai"; sAi.classList.add("active"); sUser.classList.remove("active"); });
    seg.appendChild(sUser); seg.appendChild(sAi);
    modal.appendChild(seg);

    const input = U.el("input", { class: "input", type: "number", placeholder: "输入新余额", style: { marginTop: "8px" } });
    modal.appendChild(input);

    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "保存", onclick: async () => {
        const val = parseInt(input.value, 10);
        if (isNaN(val) || val < 0) {
          global.Phone.Notify.push({ appId: "wallet", title: "请输入有效的金额" });
          return;
        }
        const Storage = global.Phone.Storage;
        if (target === "user") {
          const diff = val - (wallet.userBalance || 0);
          wallet.userBalance = val;
          wallet.transactions = wallet.transactions || [];
          wallet.transactions.push({
            id: U.uid("tx"), type: "adjust", amount: diff,
            balanceType: "user", note: "修改余额", createdAt: Date.now(),
          });
        } else {
          const diff = val - (wallet.aiBalance || 0);
          wallet.aiBalance = val;
          wallet.transactions = wallet.transactions || [];
          wallet.transactions.push({
            id: U.uid("tx"), type: "adjust", amount: diff,
            balanceType: "ai", note: "修改 AI 余额", createdAt: Date.now(),
          });
        }
        await Storage.put("wallet", wallet);
        _emitWallet(U, target === "user" ? "user" : "ai", val, "修改余额", current);
        global.Phone.Notify.push({ appId: "wallet", title: "余额已更新" });
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

    const note = U.el("input", { class: "input", placeholder: "备注（可选）", style: { marginTop: "8px" } });
    modal.appendChild(note);

    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "转账", onclick: async () => {
        const amount = parseInt(input.value, 10);
        if (isNaN(amount) || amount <= 0) {
          global.Phone.Notify.push({ appId: "wallet", title: "请输入正整数金额" });
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
          note: noteText || (isUserToAi ? "转账给 AI" : "AI 转账给我"),
          createdAt: Date.now(),
        });
        wallet.transactions.push({
          id: U.uid("tx"), type: "transfer", amount: amount,
          balanceType: isUserToAi ? "ai" : "user",
          note: noteText || (isUserToAi ? "收到用户转账" : "收到 AI 转账"),
          createdAt: Date.now(),
        });
        await Storage.put("wallet", wallet);
        _emitWallet(U, isUserToAi ? "ai" : "user", amount, noteText || (isUserToAi ? "转账给 AI" : "AI 转账给我"), current);
        global.Phone.Notify.push({ appId: "wallet", title: "转账成功" });
        mask.remove(); onDone();
      }}),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // 触发钱包事件（供 AI / 消息中心读取）
  function _emitWallet(U, target, amount, note, current) {
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.WALLET_CHANGED, {
      sourceApp: "wallet",
      data: { target, amount, note, characterId: current ? current.id : null },
      summary: (target === "ai" ? "给" + (current ? current.name : "AI") : "我的小金库") + " " + (amount >= 0 ? "+" : "") + amount + "（" + note + "）",
    });
  }

  // ---------- 工具函数 ----------
  function _nav(U, title) {
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    nav.appendChild(U.el("div", { class: "nav-right" }));
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
    page.appendChild(_nav(U, "钱包"));
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

  // ---------- 暴露 ----------
  global.Phone.Wallet = {
    open, mount,
    // 供 shop / AI 调用：扣款 + 记录交易
    async deduct(amount, note) {
      const Storage = global.Phone.Storage;
      const w = await Storage.get("wallet", "main");
      if (!w) return { ok: false, error: "钱包未初始化" };
      if ((w.userBalance || 0) < amount) return { ok: false, error: "余额不够啦" };
      w.userBalance = (w.userBalance || 0) - amount;
      w.transactions = w.transactions || [];
      w.transactions.push({
        id: global.Phone.Utils.uid("tx"), type: "purchase", amount: -amount,
        balanceType: "user", note: note || "购买", createdAt: Date.now(),
      });
      await Storage.put("wallet", w);
      _emitWallet(global.Phone.Utils, "user", -amount, note || "购买", null);
      return { ok: true };
    },
    // 供 AI 调用：AI 转账给用户
    async aiToUser(amount, note) {
      const Storage = global.Phone.Storage;
      const w = await Storage.get("wallet", "main");
      if (!w) return { ok: false, error: "钱包未初始化" };
      if ((w.aiBalance || 0) < amount) return { ok: false, error: "AI 余额不够" };
      w.aiBalance = (w.aiBalance || 0) - amount;
      w.userBalance = (w.userBalance || 0) + amount;
      w.transactions = w.transactions || [];
      w.transactions.push({
        id: global.Phone.Utils.uid("tx"), type: "transfer", amount: amount,
        balanceType: "user", note: note || "AI 转账", createdAt: Date.now(),
      });
      w.transactions.push({
        id: global.Phone.Utils.uid("tx"), type: "transfer", amount: -amount,
        balanceType: "ai", note: note || "AI 转账", createdAt: Date.now(),
      });
      await Storage.put("wallet", w);
      const currentId = await global.Phone.State.get("currentCharacterId");
      const chars = await Storage.getAll("characters");
      const current = chars.find((c) => c.id === currentId) || chars[0];
      _emitWallet(global.Phone.Utils, "user", amount, note || "AI 转账", current);
      return { ok: true };
    },
  };
})(window);
