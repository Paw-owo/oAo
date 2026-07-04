/* ============================================================
   shop.js — 商店 APP
   商品列表 / 购买 / 背包 / 赠送 AI / 自定义商品 / 事件联动
   挂在 window.Phone.Shop
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.AppRegistry.register({
    id: "shop",
    name: "商店",
    icon: "app-shop",
    entry: () => open(),
    events: ["shop_purchased", "shop_gifted"],
    settings: [],
    order: 71,
  });

  function open() { global.Phone.Router.push("shop", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const currentId = await State.get("currentCharacterId");
    const chars = await Storage.getAll("characters");
    const current = chars.find((c) => c.id === currentId) || chars[0];

    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(U, "商店"));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // ---------- 余额提示 ----------
    const wallet = await Storage.get("wallet", "main");
    const balance = wallet ? (wallet.userBalance || 0) : 0;
    content.appendChild(U.el("div", { class: "card-soft row", style: { justifyContent: "space-between", marginBottom: "12px" } }, [
      U.el("div", {}, [
        U.el("div", { class: "muted", text: "我的小金库", style: { fontSize: "var(--font-xs)" } }),
        U.el("div", { text: "💰 " + balance.toLocaleString(), style: { fontWeight: "600", fontSize: "var(--font-md)" } }),
      ]),
      U.el("div", { class: "muted", text: current ? ("要送给 " + current.name) : "选个礼物吧", style: { fontSize: "var(--font-xs)" } }),
    ]));

    // ---------- Tab：商店 / 背包 ----------
    const tabs = U.el("div", { class: "shop-tabs" });
    let curTab = "shop";
    const tShop = U.el("div", { class: "shop-tab active", text: "商店" });
    const tBag = U.el("div", { class: "shop-tab", text: "我的背包" });
    tabs.appendChild(tShop); tabs.appendChild(tBag);
    content.appendChild(tabs);

    const gridWrap = U.el("div", {});
    content.appendChild(gridWrap);

    async function _renderShop() {
      const items = await Storage.getAll("shop");
      // 按分类分组
      const cats = {};
      items.forEach((it) => {
        const c = it.category || "其他";
        if (!cats[c]) cats[c] = [];
        cats[c].push(it);
      });
      U.empty(gridWrap);
      if (items.length === 0) {
        gridWrap.appendChild(_empty(U, "商店还没货", "点右上角添加商品吧"));
        return;
      }
      Object.keys(cats).forEach((cat) => {
        gridWrap.appendChild(U.el("div", { class: "section-title", text: cat, style: { margin: "12px 0 8px" } }));
        const grid = U.el("div", { class: "shop-grid" });
        cats[cat].forEach((it) => {
          grid.appendChild(_shopCard(U, it, current, balance, () => _remount(container)));
        });
        gridWrap.appendChild(grid);
      });
    }

    async function _renderBag() {
      const invs = await Storage.getAll("inventory");
      U.empty(gridWrap);
      if (invs.length === 0) {
        gridWrap.appendChild(_empty(U, "背包空空的", "去商店买点东西吧~"));
        return;
      }
      const grid = U.el("div", { class: "shop-grid" });
      invs.forEach((inv) => {
        grid.appendChild(_bagCard(U, inv, current, () => _remount(container)));
      });
      gridWrap.appendChild(grid);
    }

    function _switchTab(tab) {
      curTab = tab;
      tShop.classList.toggle("active", tab === "shop");
      tBag.classList.toggle("active", tab === "bag");
      if (tab === "shop") _renderShop();
      else _renderBag();
    }
    tShop.addEventListener("click", () => _switchTab("shop"));
    tBag.addEventListener("click", () => _switchTab("bag"));

    // 右上角添加商品
    const addBtn = U.el("button", { class: "icon-btn" });
    addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    addBtn.addEventListener("click", () => _editItem(U, null, () => _renderShop()));
    page.querySelector(".nav-right").appendChild(addBtn);

    _renderShop();

    page.appendChild(content);
    container.appendChild(page);
  }

  // ---------- 商品卡 ----------
  function _shopCard(U, it, current, balance, onDone) {
    const card = U.el("div", { class: "shop-card" });
    const imgWrap = U.el("div", { class: "sc-img" });
    if (it.image && (it.image.startsWith("data:") || it.image.startsWith("http"))) {
      imgWrap.appendChild(U.el("img", { src: it.image, alt: it.name }));
    } else if (it.emoji) {
      imgWrap.appendChild(U.el("div", { text: it.emoji, style: { fontSize: "32px" } }));
    } else {
      imgWrap.appendChild(U.el("div", { html: global.Phone.IconLibrary.get("gift", { size: 28 }), style: { opacity: "0.4" } }));
    }
    card.appendChild(imgWrap);

    const body = U.el("div", { class: "sc-body" }, [
      U.el("div", { class: "sc-name", text: it.name }),
      U.el("div", { class: "sc-desc", text: it.description || "" }),
      U.el("div", { class: "sc-bottom" }, [
        U.el("div", { class: "sc-price", html: "<span class='unit'>💰</span>" + it.price }),
        U.el("div", { class: "row gap-4" }, [
          (() => {
            const b = U.el("button", { class: "icon-btn" });
            b.innerHTML = global.Phone.IconLibrary.get("gift", { size: 16 });
            b.title = "赠送给 AI";
            b.addEventListener("click", () => _gift(U, it, current, onDone));
            return b;
          })(),
          (() => {
            const b = U.el("button", { class: "icon-btn" });
            b.innerHTML = global.Phone.IconLibrary.get("edit", { size: 16 });
            b.addEventListener("click", () => _editItem(U, it, onDone));
            return b;
          })(),
          (() => {
            const b = U.el("button", { class: "btn btn-sm", text: "买" });
            b.addEventListener("click", () => _buy(U, it, onDone));
            return b;
          })(),
        ]),
      ]),
    ]);
    card.appendChild(body);
    return card;
  }

  // ---------- 背包卡 ----------
  function _bagCard(U, inv, current, onDone) {
    const card = U.el("div", { class: "shop-card" });
    const imgWrap = U.el("div", { class: "sc-img" });
    if (inv.image && (inv.image.startsWith("data:") || inv.image.startsWith("http"))) {
      imgWrap.appendChild(U.el("img", { src: inv.image, alt: inv.name }));
    } else if (inv.emoji) {
      imgWrap.appendChild(U.el("div", { text: inv.emoji, style: { fontSize: "32px" } }));
    } else {
      imgWrap.appendChild(U.el("div", { html: global.Phone.IconLibrary.get("gift", { size: 28 }), style: { opacity: "0.4" } }));
    }
    card.appendChild(imgWrap);
    const count = inv.count || 1;
    const body = U.el("div", { class: "sc-body" }, [
      U.el("div", { class: "sc-name", text: inv.name + (count > 1 ? " ×" + count : "") }),
      U.el("div", { class: "sc-desc", text: inv.description || "" }),
      U.el("div", { class: "sc-bottom" }, [
        U.el("div", { class: "muted", text: "获得于 " + global.Phone.Utils.relTime(inv.createdAt), style: { fontSize: "var(--font-xs)" } }),
        (() => {
          const b = U.el("button", { class: "btn btn-sm", text: "送给" + (current ? current.name : "AI") });
          b.addEventListener("click", () => _giftFromBag(U, inv, current, onDone));
          return b;
        })(),
      ]),
    ]);
    card.appendChild(body);
    return card;
  }

  // ---------- 购买 ----------
  async function _buy(U, it, onDone) {
    const ok = await global.Phone.Modal.confirm({
      title: "购买确认",
      message: "买「" + it.name + "」要花 " + it.price + "，确定吗？",
      okText: "购买",
    });
    if (!ok) return;
    const Wallet = global.Phone.Wallet;
    const res = await Wallet.deduct(it.price, "购买 " + it.name);
    if (!res.ok) {
      global.Phone.Notify.push({ appId: "shop", title: res.error });
      return;
    }
    // 加入背包（同商品合并计数）
    const Storage = global.Phone.Storage;
    const invs = await Storage.getAll("inventory");
    const exist = invs.find((v) => v.itemId === it.id);
    if (exist) {
      exist.count = (exist.count || 1) + 1;
      exist.updatedAt = Date.now();
      await Storage.put("inventory", exist);
    } else {
      const inv = {
        id: U.uid("inv"), itemId: it.id, characterId: null,
        name: it.name, description: it.description || "",
        image: it.image || "", emoji: it.emoji || "",
        category: it.category || "其他", count: 1,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await Storage.put("inventory", inv);
    }
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.SHOP_PURCHASED, {
      sourceApp: "shop", data: { itemId: it.id, name: it.name, price: it.price },
      summary: "买了「" + it.name + "」花了 " + it.price,
    });
    global.Phone.Notify.push({ appId: "shop", title: "购买成功，已加入背包" });
    onDone();
  }

  // ---------- 赠送（从商店直接送，需先购买） ----------
  async function _gift(U, it, current, onDone) {
    if (!current) {
      global.Phone.Notify.push({ appId: "shop", title: "还没有角色，没法送哦" });
      return;
    }
    // 检查背包有没有
    const Storage = global.Phone.Storage;
    const invs = await Storage.getAll("inventory");
    const inv = invs.find((v) => v.itemId === it.id);
    if (!inv || (inv.count || 1) <= 0) {
      global.Phone.Notify.push({ appId: "shop", title: "背包里没有这个，先买一个吧" });
      return;
    }
    await _giftFromBag(U, inv, current, onDone);
  }

  // ---------- 从背包赠送 ----------
  async function _giftFromBag(U, inv, current, onDone) {
    if (!current) {
      global.Phone.Notify.push({ appId: "shop", title: "还没有角色，没法送哦" });
      return;
    }
    const ok = await global.Phone.Modal.confirm({
      title: "赠送礼物",
      message: "把「" + inv.name + "」送给 " + current.name + " 吗？",
      okText: "送出",
    });
    if (!ok) return;
    const Storage = global.Phone.Storage;
    // 背包减一
    inv.count = (inv.count || 1) - 1;
    inv.updatedAt = Date.now();
    if (inv.count <= 0) {
      await Storage.del("inventory", inv.id);
    } else {
      await Storage.put("inventory", inv);
    }
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.SHOP_GIFTED, {
      sourceApp: "shop",
      data: { itemId: inv.itemId, name: inv.name, characterId: current.id, characterName: current.name },
      summary: "送了 " + current.name + " 一个「" + inv.name + "」",
    });
    global.Phone.Notify.push({ appId: "shop", title: "送出啦，" + current.name + " 会很开心的~" });
    onDone();
  }

  // ---------- 新增/编辑商品 ----------
  function _editItem(U, item, onDone) {
    const isEdit = !!item;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: isEdit ? "编辑商品" : "新增商品" }));

    const nameInput = U.el("input", { class: "input", placeholder: "商品名", style: { marginTop: "8px" } });
    if (item) nameInput.value = item.name || "";
    modal.appendChild(nameInput);

    const priceInput = U.el("input", { class: "input", type: "number", placeholder: "价格", style: { marginTop: "8px" } });
    if (item) priceInput.value = item.price || 0;
    modal.appendChild(priceInput);

    const catInput = U.el("input", { class: "input", placeholder: "分类（礼物/道具/功能）", style: { marginTop: "8px" } });
    if (item) catInput.value = item.category || "";
    modal.appendChild(catInput);

    const descInput = U.el("textarea", { class: "textarea", placeholder: "商品描述", style: { marginTop: "8px", minHeight: "60px" } });
    if (item) descInput.value = item.description || "";
    modal.appendChild(descInput);

    const emojiInput = U.el("input", { class: "input", placeholder: "emoji 图标（可选）", style: { marginTop: "8px" } });
    if (item) emojiInput.value = item.emoji || "";
    modal.appendChild(emojiInput);

    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "保存", onclick: async () => {
        const name = nameInput.value.trim();
        const price = parseInt(priceInput.value, 10);
        if (!name) { global.Phone.Notify.push({ appId: "shop", title: "得写商品名呀" }); return; }
        if (isNaN(price) || price < 0) { global.Phone.Notify.push({ appId: "shop", title: "价格不对" }); return; }
        const Storage = global.Phone.Storage;
        if (item) {
          item.name = name; item.price = price;
          item.category = catInput.value.trim() || "其他";
          item.description = descInput.value.trim();
          item.emoji = emojiInput.value.trim();
          await Storage.put("shop", item);
        } else {
          const it = {
            id: U.uid("shop"), name, price,
            category: catInput.value.trim() || "其他",
            description: descInput.value.trim(),
            emoji: emojiInput.value.trim(), image: "",
            createdAt: Date.now(),
          };
          await Storage.put("shop", it);
        }
        global.Phone.Notify.push({ appId: "shop", title: isEdit ? "已更新" : "已上架" });
        mask.remove(); onDone();
      }}),
      isEdit ? U.el("button", { class: "btn btn-ghost", text: "删除", onclick: async () => {
        const ok = await global.Phone.Modal.confirm({ title: "删除商品", message: "删除「" + item.name + "」？", danger: true });
        if (!ok) return;
        await global.Phone.Storage.del("shop", item.id);
        global.Phone.Notify.push({ appId: "shop", title: "已下架" });
        mask.remove(); onDone();
      }}) : null,
    ].filter(Boolean)));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
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

  function _empty(U, title, sub) {
    return U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-shop", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub }),
    ]);
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 ----------
  global.Phone.Shop = { open, mount };
})(window);
