/* ============================================================
   shop.js — 商店 APP（专业版）
   对齐参考：淘宝 / 京东 / 小红书好物 / Apple Store
   功能：
     - 商品列表：搜索 + 排序（最近/价格升降/名称）+ 分类筛选
     - 收藏夹：星标商品单独一个 Tab
     - 购物车：批量加购 / 一次结算
     - 背包：拥有的物品 + 数量 + 赠送 / 使用
     - 订单历史：所有购买记录 / 时间 / 价格
     - 商品支持：图片上传 + 内置图标选择器（不用 emoji）
     - 赠送 AI：从背包送出，事件中心联动
     - 设置页：默认排序 / 显示价格 / 自动赠送 / 清空数据
   挂在 window.Phone.Shop
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  // 内置可选图标（替代 emoji）
  const ICON_CHOICES = [
    "gift", "cake", "star", "heart", "sb-music", "app-music",
    "app-gallery", "image", "vip", "coin", "dice", "card-tarot",
    "palette", "bell", "lyrics", "playlist", "app-shop", "app-games",
    "app-memo", "app-anniversary", "app-wallet", "app-characters",
    "users", "user", "smile", "sun", "moon", "cloud", "flower",
  ];

  // 内置默认商品模板（添加自定义时可选）
  const TEMPLATES = [
    { name: "草莓蛋糕", price: 30, description: "软软的草莓奶油蛋糕，甜到心里。", icon: "cake", category: "礼物" },
    { name: "棉花糖抱枕", price: 88, description: "比 AI 还软的抱枕。", icon: "heart", category: "礼物" },
    { name: "魔法星星", price: 5, description: "可以许一个小愿望。", icon: "star", category: "道具" },
    { name: "解锁新话题", price: 50, description: "AI 会主动聊一个新话题。", icon: "bell", category: "功能" },
    { name: "原谅卡", price: 10, description: "用它可以请求原谅一次记仇。", icon: "gift", category: "道具" },
    { name: "唱片", price: 60, description: "送给爱听歌的 TA。", icon: "app-music", category: "礼物" },
    { name: "调色板", price: 45, description: "一起涂鸦的小道具。", icon: "palette", category: "道具" },
    { name: "会员徽章", price: 199, description: "成为 TA 的尊贵会员。", icon: "vip", category: "功能" },
  ];

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

    const wallet = await Storage.get("wallet", "main");
    const balance = wallet ? (wallet.userBalance || 0) : 0;
    const currency = State.get("walletCurrency") || "元";
    const showPrices = State.get("shopShowPrices") !== false; // 默认 true

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "shop");
    }
    page.appendChild(_nav(U, "商店", () => _openSettings(U, () => _remount(container))));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // ---------- 余额提示 ----------
    content.appendChild(U.el("div", { class: "card-soft row", style: { justifyContent: "space-between", marginBottom: "12px" } }, [
      U.el("div", {}, [
        U.el("div", { class: "muted", text: "我的小金库", style: { fontSize: "var(--font-xs)" } }),
        U.el("div", { text: balance.toLocaleString() + " " + currency, style: { fontWeight: "600", fontSize: "var(--font-md)" } }),
      ]),
      U.el("div", { class: "muted", text: current ? ("要送给 " + current.name) : "选个礼物吧", style: { fontSize: "var(--font-xs)" } }),
    ]));

    // ---------- Tab：商店 / 收藏 / 购物车 / 背包 / 订单 ----------
    const tabs = U.el("div", { class: "shop-tabs" });
    let curTab = "shop";
    const TABS = [
      { v: "shop", l: "商店" },
      { v: "fav", l: "收藏" },
      { v: "cart", l: "购物车" },
      { v: "bag", l: "背包" },
      { v: "orders", l: "订单" },
    ];
    TABS.forEach((t) => {
      const node = U.el("div", { class: "shop-tab" + (curTab === t.v ? " active" : ""), text: t.l, dataset: { tab: t.v } });
      tabs.appendChild(node);
    });
    content.appendChild(tabs);

    const gridWrap = U.el("div", {});
    content.appendChild(gridWrap);

    function _switchTab(tab) {
      curTab = tab;
      tabs.querySelectorAll(".shop-tab").forEach((n) => n.classList.toggle("active", n.dataset.tab === tab));
      if (tab === "shop") _renderShop();
      else if (tab === "fav") _renderFav();
      else if (tab === "cart") _renderCart();
      else if (tab === "bag") _renderBag();
      else if (tab === "orders") _renderOrders();
    }
    tabs.querySelectorAll(".shop-tab").forEach((n) => n.addEventListener("click", () => _switchTab(n.dataset.tab)));

    // ---------- 商店渲染 ----------
    async function _renderShop() {
      const items = await Storage.getAll("shop");
      const favorites = await Storage.getAll("favorites");
      const favIds = new Set(favorites.map((f) => f.itemId));

      // 搜索 + 排序工具栏
      U.empty(gridWrap);
      const toolbar = U.el("div", { class: "shop-toolbar", style: { display: "flex", gap: "8px", margin: "12px 0" } });
      const searchInput = U.el("input", { class: "input", placeholder: "搜索商品...", style: { flex: "1" } });
      const sortSelect = U.el("select", { class: "input", style: { width: "auto" } });
      const sortOpt = State.get("shopDefaultSort") || "recent";
      [
        { v: "recent", l: "最近添加" },
        { v: "price-asc", l: "价格升序" },
        { v: "price-desc", l: "价格降序" },
        { v: "name", l: "按名称" },
      ].forEach((o) => {
        const opt = U.el("option", { value: o.v, text: o.l });
        if (sortOpt === o.v) opt.selected = true;
        sortSelect.appendChild(opt);
      });
      toolbar.appendChild(searchInput);
      toolbar.appendChild(sortSelect);
      gridWrap.appendChild(toolbar);

      const listWrap = U.el("div", {});
      gridWrap.appendChild(listWrap);

      function _filter() {
        const kw = searchInput.value.trim().toLowerCase();
        const sort = sortSelect.value;
        let list = items.slice();
        if (kw) list = list.filter((it) => (it.name || "").toLowerCase().includes(kw) || (it.description || "").toLowerCase().includes(kw));
        if (sort === "price-asc") list.sort((a, b) => (a.price || 0) - (b.price || 0));
        else if (sort === "price-desc") list.sort((a, b) => (b.price || 0) - (a.price || 0));
        else if (sort === "name") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        // 按分类分组
        const cats = {};
        list.forEach((it) => {
          const c = it.category || "其他";
          if (!cats[c]) cats[c] = [];
          cats[c].push(it);
        });
        U.empty(listWrap);
        if (list.length === 0) {
          listWrap.appendChild(_empty(U, "没找到商品", "换个关键词或自己加一个~"));
          return;
        }
        Object.keys(cats).forEach((cat) => {
          listWrap.appendChild(U.el("div", { class: "section-title", text: cat, style: { margin: "12px 0 8px" } }));
          const grid = U.el("div", { class: "shop-grid" });
          cats[cat].forEach((it) => {
            grid.appendChild(_shopCard(U, it, current, balance, currency, showPrices, favIds.has(it.id), () => _renderShop()));
          });
          listWrap.appendChild(grid);
        });
      }
      searchInput.addEventListener("input", U.debounce(_filter, 200));
      sortSelect.addEventListener("change", async () => {
        await State.set("shopDefaultSort", sortSelect.value);
        _filter();
      });
      _filter();
    }

    async function _renderFav() {
      const favs = await Storage.getAll("favorites");
      const items = [];
      for (const f of favs) {
        const it = await Storage.get("shop", f.itemId);
        if (it) items.push(it);
      }
      U.empty(gridWrap);
      if (items.length === 0) {
        gridWrap.appendChild(_empty(U, "还没有收藏", "点商品上的星星就能收藏啦~"));
        return;
      }
      const grid = U.el("div", { class: "shop-grid" });
      items.forEach((it) => grid.appendChild(_shopCard(U, it, current, balance, currency, showPrices, true, () => _renderFav())));
      gridWrap.appendChild(grid);
    }

    async function _renderCart() {
      const cart = await Storage.getAll("cart");
      U.empty(gridWrap);
      if (cart.length === 0) {
        gridWrap.appendChild(_empty(U, "购物车空空的", "去商店逛逛吧~"));
        return;
      }
      // 列出商品
      const list = U.el("div", { class: "shop-cart-list" });
      let total = 0;
      for (const c of cart) {
        const it = await Storage.get("shop", c.itemId);
        if (!it) continue;
        total += (it.price || 0) * (c.count || 1);
        const row = U.el("div", { class: "shop-cart-row" });
        row.appendChild(_itemThumb(U, it, 48));
        row.appendChild(U.el("div", { class: "scr-main" }, [
          U.el("div", { class: "scr-name", text: it.name }),
          U.el("div", { class: "scr-price", text: (it.price || 0) + " " + currency + " × " + (c.count || 1) }),
        ]));
        // 数量增减
        const qty = U.el("div", { class: "scr-qty" });
        const minusBtn = U.el("button", { class: "icon-btn btn-sm", html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>' });
        const plusBtn = U.el("button", { class: "icon-btn btn-sm", html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' });
        const qtyLabel = U.el("span", { text: String(c.count || 1), style: { minWidth: "20px", textAlign: "center" } });
        minusBtn.addEventListener("click", async () => {
          c.count = (c.count || 1) - 1;
          if (c.count <= 0) await Storage.del("cart", c.id);
          else await Storage.put("cart", c);
          _renderCart();
        });
        plusBtn.addEventListener("click", async () => {
          c.count = (c.count || 1) + 1;
          await Storage.put("cart", c);
          _renderCart();
        });
        qty.appendChild(minusBtn);
        qty.appendChild(qtyLabel);
        qty.appendChild(plusBtn);
        row.appendChild(qty);
        // 删除
        const delBtn = U.el("button", { class: "icon-btn btn-sm" });
        delBtn.innerHTML = global.Phone.IconLibrary.get("trash", { size: 16 });
        delBtn.addEventListener("click", async () => {
          await Storage.del("cart", c.id);
          _renderCart();
        });
        row.appendChild(delBtn);
        list.appendChild(row);
      }
      gridWrap.appendChild(list);

      // 总价 + 结算
      gridWrap.appendChild(U.el("div", { class: "shop-cart-footer" }, [
        U.el("div", {}, [
          U.el("span", { class: "muted", text: "合计：", style: { fontSize: "var(--font-sm)" } }),
          U.el("span", { text: total.toLocaleString() + " " + currency, style: { fontWeight: "600", fontSize: "var(--font-md)", color: "var(--color-primary-deep)" } }),
        ]),
        U.el("button", { class: "btn", text: "全部购买", onclick: async () => {
          const ok = await global.Phone.Modal.confirm({
            title: "结算确认",
            message: "一共要花 " + total.toLocaleString() + " " + currency + "，确定买下购物车里所有东西吗？",
            okText: "买下",
          });
          if (!ok) return;
          const cart2 = await Storage.getAll("cart");
          let successCount = 0;
          for (const c of cart2) {
            const it = await Storage.get("shop", c.itemId);
            if (!it) continue;
            const count = c.count || 1;
            const res = await global.Phone.Wallet.deduct((it.price || 0) * count, "购买 " + it.name + " x" + count);
            if (!res.ok) {
              global.Phone.Notify.push({ appId: "shop", title: "余额不够啦：" + it.name });
              break;
            }
            await _addToBag(it, count);
            await Storage.del("cart", c.id);
            global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.SHOP_PURCHASED, {
              sourceApp: "shop",
              data: { itemId: it.id, name: it.name, price: it.price, count },
              summary: "买了「" + it.name + "」×" + count + "，花了 " + (it.price * count),
            });
            // 订单
            await Storage.put("orders", {
              id: U.uid("order"), itemId: it.id, name: it.name,
              price: it.price, count, total: it.price * count,
              type: "purchase", createdAt: Date.now(),
            });
            successCount++;
          }
          if (successCount > 0) {
            global.Phone.Notify.push({ appId: "shop", title: "结算成功 " + successCount + " 件，已加入背包" });
          }
          _renderCart();
        }}),
      ]));
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
        grid.appendChild(_bagCard(U, inv, current, currency, () => _renderBag()));
      });
      gridWrap.appendChild(grid);
    }

    async function _renderOrders() {
      const orders = await Storage.getAll("orders");
      U.empty(gridWrap);
      if (orders.length === 0) {
        gridWrap.appendChild(_empty(U, "还没有订单", "买点东西就会出现在这里~"));
        return;
      }
      orders.sort((a, b) => b.createdAt - a.createdAt);
      const list = U.el("div", { class: "tx-list" });
      orders.forEach((o) => {
        const item = U.el("div", { class: "tx-item expense" });
        item.appendChild(U.el("div", { class: "ti-icon", html: global.Phone.IconLibrary.get("app-shop", { size: 18 }) }));
        item.appendChild(U.el("div", { class: "ti-main" }, [
          U.el("div", { class: "ti-title", text: o.name + (o.count > 1 ? " ×" + o.count : "") }),
          U.el("div", { class: "ti-time", text: U.relTime(o.createdAt) + " · " + (o.type === "gift" ? "赠送" : "购买") }),
        ]));
        item.appendChild(U.el("div", { class: "ti-amount", text: "-" + (o.total || 0) }));
        list.appendChild(item);
      });
      gridWrap.appendChild(list);
    }

    // 右上角添加商品
    const addBtn = U.el("button", { class: "icon-btn" });
    addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    addBtn.addEventListener("click", () => _editItem(U, null, () => _renderShop()));
    page.querySelector(".nav-right").appendChild(addBtn);

    _renderShop();

    page.appendChild(content);
    container.appendChild(page);
  }

  // ---------- 商品缩略图（统一处理 image / icon） ----------
  function _itemThumb(U, it, size) {
    const wrap = U.el("div", { class: "sc-img", style: { width: size + "px", height: size + "px", flexShrink: "0" } });
    if (it.image && (it.image.startsWith("data:") || it.image.startsWith("http"))) {
      wrap.appendChild(U.el("img", { src: it.image, alt: it.name }));
    } else if (it.icon && global.Phone.IconLibrary.has(it.icon)) {
      wrap.appendChild(U.el("div", { html: global.Phone.IconLibrary.get(it.icon, { size: Math.floor(size * 0.6) }), style: { opacity: "0.85" } }));
    } else {
      wrap.appendChild(U.el("div", { html: global.Phone.IconLibrary.get("gift", { size: Math.floor(size * 0.6) }), style: { opacity: "0.4" } }));
    }
    return wrap;
  }

  // ---------- 商品卡 ----------
  function _shopCard(U, it, current, balance, currency, showPrices, isFav, onReload) {
    const card = U.el("div", { class: "shop-card" });
    const imgWrap = U.el("div", { class: "sc-img" });
    if (it.image && (it.image.startsWith("data:") || it.image.startsWith("http"))) {
      imgWrap.appendChild(U.el("img", { src: it.image, alt: it.name }));
    } else if (it.icon && global.Phone.IconLibrary.has(it.icon)) {
      imgWrap.appendChild(U.el("div", { html: global.Phone.IconLibrary.get(it.icon, { size: 36 }), style: { opacity: "0.85" } }));
    } else {
      imgWrap.appendChild(U.el("div", { html: global.Phone.IconLibrary.get("gift", { size: 28 }), style: { opacity: "0.4" } }));
    }
    // 收藏按钮
    const favBtn = U.el("button", { class: "sc-fav" + (isFav ? " active" : "") });
    favBtn.innerHTML = global.Phone.IconLibrary.get(isFav ? "heart-fill" : "heart", { size: 16 });
    favBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const Storage = global.Phone.Storage;
      const favs = await Storage.getAll("favorites");
      const exist = favs.find((f) => f.itemId === it.id);
      if (exist) {
        await Storage.del("favorites", exist.id);
      } else {
        await Storage.put("favorites", { id: U.uid("fav"), itemId: it.id, createdAt: Date.now() });
      }
      onReload();
    });
    imgWrap.appendChild(favBtn);
    card.appendChild(imgWrap);

    const body = U.el("div", { class: "sc-body" }, [
      U.el("div", { class: "sc-name", text: it.name }),
      U.el("div", { class: "sc-desc", text: it.description || "" }),
      U.el("div", { class: "sc-bottom" }, [
        showPrices ? U.el("div", { class: "sc-price", html: "<span class='unit'>" + currency + "</span>" + (it.price || 0) }) : U.el("div", {}),
        U.el("div", { class: "row gap-4" }, [
          (() => {
            const b = U.el("button", { class: "icon-btn" });
            b.innerHTML = global.Phone.IconLibrary.get("gift", { size: 16 });
            b.title = "赠送给 AI";
            b.addEventListener("click", () => _gift(U, it, current, onReload));
            return b;
          })(),
          (() => {
            const b = U.el("button", { class: "icon-btn" });
            b.innerHTML = global.Phone.IconLibrary.get("plus", { size: 16 });
            b.title = "加入购物车";
            b.addEventListener("click", async () => {
              const Storage = global.Phone.Storage;
              const cart = await Storage.getAll("cart");
              const exist = cart.find((c) => c.itemId === it.id);
              if (exist) {
                exist.count = (exist.count || 1) + 1;
                exist.updatedAt = Date.now();
                await Storage.put("cart", exist);
              } else {
                await Storage.put("cart", {
                  id: U.uid("cart"), itemId: it.id, count: 1,
                  createdAt: Date.now(), updatedAt: Date.now(),
                });
              }
              global.Phone.Notify.push({ appId: "shop", title: "已加入购物车" });
            });
            return b;
          })(),
          (() => {
            const b = U.el("button", { class: "icon-btn" });
            b.innerHTML = global.Phone.IconLibrary.get("edit", { size: 16 });
            b.addEventListener("click", () => _editItem(U, it, onReload));
            return b;
          })(),
          (() => {
            const b = U.el("button", { class: "btn btn-sm", text: "买" });
            b.addEventListener("click", () => _buy(U, it, onReload));
            return b;
          })(),
        ]),
      ]),
    ]);
    card.appendChild(body);
    return card;
  }

  // ---------- 背包卡 ----------
  function _bagCard(U, inv, current, currency, onDone) {
    const card = U.el("div", { class: "shop-card" });
    const imgWrap = U.el("div", { class: "sc-img" });
    if (inv.image && (inv.image.startsWith("data:") || inv.image.startsWith("http"))) {
      imgWrap.appendChild(U.el("img", { src: inv.image, alt: inv.name }));
    } else if (inv.icon && global.Phone.IconLibrary.has(inv.icon)) {
      imgWrap.appendChild(U.el("div", { html: global.Phone.IconLibrary.get(inv.icon, { size: 36 }), style: { opacity: "0.85" } }));
    } else {
      imgWrap.appendChild(U.el("div", { html: global.Phone.IconLibrary.get("gift", { size: 28 }), style: { opacity: "0.4" } }));
    }
    // 数量角标
    const count = inv.count || 1;
    if (count > 1) {
      imgWrap.appendChild(U.el("div", { class: "sc-badge", text: "×" + count }));
    }
    card.appendChild(imgWrap);
    const body = U.el("div", { class: "sc-body" }, [
      U.el("div", { class: "sc-name", text: inv.name }),
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

  // ---------- 加入背包 ----------
  async function _addToBag(it, count) {
    const Storage = global.Phone.Storage;
    const invs = await Storage.getAll("inventory");
    const exist = invs.find((v) => v.itemId === it.id);
    if (exist) {
      exist.count = (exist.count || 1) + (count || 1);
      exist.updatedAt = Date.now();
      await Storage.put("inventory", exist);
    } else {
      const inv = {
        id: global.Phone.Utils.uid("inv"), itemId: it.id, characterId: null,
        name: it.name, description: it.description || "",
        image: it.image || "", icon: it.icon || "", category: it.category || "其他",
        count: count || 1, createdAt: Date.now(), updatedAt: Date.now(),
      };
      await Storage.put("inventory", inv);
    }
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
    const res = await Wallet.deduct(it.price, "购买 " + it.name, "shopping");
    if (!res.ok) {
      global.Phone.Notify.push({ appId: "shop", title: res.error });
      return;
    }
    await _addToBag(it, 1);
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.SHOP_PURCHASED, {
      sourceApp: "shop", data: { itemId: it.id, name: it.name, price: it.price },
      summary: "买了「" + it.name + "」花了 " + it.price,
    });
    // 订单
    await global.Phone.Storage.put("orders", {
      id: U.uid("order"), itemId: it.id, name: it.name,
      price: it.price, count: 1, total: it.price,
      type: "purchase", createdAt: Date.now(),
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
    // 订单
    await Storage.put("orders", {
      id: U.uid("order"), itemId: inv.itemId, name: inv.name,
      price: 0, count: 1, total: 0, type: "gift", createdAt: Date.now(),
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

    // 图标选择器
    modal.appendChild(U.el("div", { class: "form-label", text: "图标", style: { marginTop: "12px" } }));
    const iconGrid = U.el("div", { class: "shop-icon-grid" });
    let curIcon = (item && item.icon) || "gift";
    ICON_CHOICES.forEach((key) => {
      const chip = U.el("div", { class: "sig-chip" + (curIcon === key ? " active" : "") });
      chip.innerHTML = global.Phone.IconLibrary.get(key, { size: 18 });
      chip.addEventListener("click", () => {
        curIcon = key;
        iconGrid.querySelectorAll(".sig-chip").forEach((n) => n.classList.remove("active"));
        chip.classList.add("active");
      });
      iconGrid.appendChild(chip);
    });
    modal.appendChild(iconGrid);

    // 图片上传
    modal.appendChild(U.el("div", { class: "form-label", text: "图片（可选）", style: { marginTop: "12px" } }));
    const imgInput = U.el("input", { class: "input", type: "file", accept: "image/*" });
    let imgData = item && item.image ? item.image : "";
    const imgPreview = U.el("div", { class: "shop-img-preview", style: { marginTop: "8px" } });
    function _renderPreview() {
      U.empty(imgPreview);
      if (imgData) {
        const img = U.el("img", { src: imgData, alt: "preview", style: { width: "80px", height: "80px", objectFit: "cover", borderRadius: "var(--radius-md)" } });
        const del = U.el("button", { class: "icon-btn btn-sm", html: global.Phone.IconLibrary.get("trash", { size: 16 }) });
        del.addEventListener("click", () => { imgData = ""; _renderPreview(); });
        imgPreview.appendChild(img);
        imgPreview.appendChild(del);
      } else {
        imgPreview.appendChild(U.el("div", { class: "muted", text: "未上传图片，会使用上面选的图标。", style: { fontSize: "var(--font-xs)" } }));
      }
    }
    _renderPreview();
    imgInput.addEventListener("change", () => {
      const file = imgInput.files[0];
      if (!file) return;
      if (file.size > 1.5 * 1024 * 1024) {
        global.Phone.Notify.push({ appId: "shop", title: "图片太大了，请小于 1.5MB" });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => { imgData = reader.result; _renderPreview(); };
      reader.readAsDataURL(file);
    });
    modal.appendChild(imgInput);
    modal.appendChild(imgPreview);

    // 模板快捷填充（仅新建时）
    if (!isEdit) {
      modal.appendChild(U.el("div", { class: "form-label", text: "或从模板快速添加", style: { marginTop: "12px" } }));
      const tmplWrap = U.el("div", { class: "shop-tmpl-list" });
      TEMPLATES.forEach((t) => {
        const chip = U.el("button", { class: "btn btn-ghost btn-sm", text: t.name, style: { padding: "4px 10px" } });
        chip.addEventListener("click", () => {
          nameInput.value = t.name;
          priceInput.value = t.price;
          catInput.value = t.category;
          descInput.value = t.description;
          curIcon = t.icon;
          iconGrid.querySelectorAll(".sig-chip").forEach((n) => n.classList.remove("active"));
          const target = Array.from(iconGrid.querySelectorAll(".sig-chip"))[ICON_CHOICES.indexOf(t.icon)];
          if (target) target.classList.add("active");
        });
        tmplWrap.appendChild(chip);
      });
      modal.appendChild(tmplWrap);
    }

    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      isEdit ? U.el("button", { class: "btn btn-ghost", text: "删除", style: { color: "var(--color-danger)" }, onclick: async () => {
        const ok = await global.Phone.Modal.confirm({ title: "删除商品", message: "删除「" + item.name + "」？", danger: true });
        if (!ok) return;
        await global.Phone.Storage.del("shop", item.id);
        global.Phone.Notify.push({ appId: "shop", title: "已下架" });
        mask.remove(); onDone();
      }}) : null,
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
          item.icon = curIcon;
          item.image = imgData;
          await Storage.put("shop", item);
        } else {
          const it = {
            id: U.uid("shop"), name, price,
            category: catInput.value.trim() || "其他",
            description: descInput.value.trim(),
            icon: curIcon, image: imgData,
            createdAt: Date.now(),
          };
          await Storage.put("shop", it);
        }
        global.Phone.Notify.push({ appId: "shop", title: isEdit ? "已更新" : "已上架" });
        mask.remove(); onDone();
      }}),
    ].filter(Boolean)));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "shop",
      title: "商店设置",
      build: (content, tools) => {
        tools.section("显示");
        tools.toggle("显示商品价格", "关掉后商店卡片不展示价格", "shopShowPrices", null);

        tools.section("排序");
        const curSort = global.Phone.State.get("shopDefaultSort") || "recent";
        const sortGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } });
        const sortSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        [
          { v: "recent", l: "最近" },
          { v: "price-asc", l: "价格升" },
          { v: "price-desc", l: "价格降" },
          { v: "name", l: "名称" },
        ].forEach((s) => {
          const node = U.el("div", { class: "segment-item" + (curSort === s.v ? " active" : ""), text: s.l });
          node.addEventListener("click", async () => {
            await global.Phone.State.set("shopDefaultSort", s.v);
            sortSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          sortSeg.appendChild(node);
        });
        sortGroup.appendChild(sortSeg);
        content.appendChild(sortGroup);

        tools.section("行为");
        tools.toggle("自动赠送", "AI 主动要礼物时，自动从背包送出最便宜的", "shopAutoGift", null);

        tools.section("数据");
        tools.action("清空购物车", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空购物车", message: "确定要清空购物车吗？", danger: true });
          if (!ok) return;
          const cart = await global.Phone.Storage.getAll("cart");
          for (const c of cart) await global.Phone.Storage.del("cart", c.id);
          global.Phone.Notify.push({ appId: "shop", title: "购物车已清空" });
          onDone && onDone();
        }, { danger: true });
        tools.action("清空收藏夹", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空收藏", message: "确定要清空所有收藏吗？", danger: true });
          if (!ok) return;
          const favs = await global.Phone.Storage.getAll("favorites");
          for (const f of favs) await global.Phone.Storage.del("favorites", f.id);
          global.Phone.Notify.push({ appId: "shop", title: "收藏已清空" });
          onDone && onDone();
        }, { danger: true });
        tools.action("清空订单记录", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空订单", message: "确定要清空所有订单记录吗？", danger: true });
          if (!ok) return;
          const orders = await global.Phone.Storage.getAll("orders");
          for (const o of orders) await global.Phone.Storage.del("orders", o.id);
          global.Phone.Notify.push({ appId: "shop", title: "订单已清空" });
        }, { danger: true });

        tools.section("关于");
        tools.hint("商店 APP 让你买礼物送给 TA。所有数据保存在本地，不会上传。");
      },
    });
  }

  // ---------- 工具函数 ----------
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

  // ---------- 暴露 API ----------
  global.Phone.Shop = {
    open, mount,
    ICON_CHOICES, TEMPLATES,
    /** 列出商品（支持过滤/排序） */
    async listItems(filter) {
      let list = await global.Phone.Storage.getAll("shop");
      if (filter) {
        if (filter.category) list = list.filter((it) => it.category === filter.category);
        if (filter.keyword) {
          const kw = filter.keyword.toLowerCase();
          list = list.filter((it) => (it.name || "").toLowerCase().includes(kw) || (it.description || "").toLowerCase().includes(kw));
        }
      }
      return list;
    },
    /** 列出背包物品 */
    async listInventory() {
      return await global.Phone.Storage.getAll("inventory");
    },
    /** 列出收藏商品 */
    async listFavorites() {
      const favs = await global.Phone.Storage.getAll("favorites");
      const items = [];
      for (const f of favs) {
        const it = await global.Phone.Storage.get("shop", f.itemId);
        if (it) items.push(it);
      }
      return items;
    },
    /** 列出订单 */
    async listOrders() {
      const orders = await global.Phone.Storage.getAll("orders");
      return orders.sort((a, b) => b.createdAt - a.createdAt);
    },
    /** 加入购物车 */
    async addToCart(itemId, count) {
      const Storage = global.Phone.Storage;
      const cart = await Storage.getAll("cart");
      const exist = cart.find((c) => c.itemId === itemId);
      if (exist) {
        exist.count = (exist.count || 1) + (count || 1);
        exist.updatedAt = Date.now();
        await Storage.put("cart", exist);
      } else {
        await Storage.put("cart", {
          id: global.Phone.Utils.uid("cart"), itemId, count: count || 1,
          createdAt: Date.now(),
        });
      }
    },
    /** 购买商品（API 调用，不弹确认） */
    async purchase(itemId, count) {
      const it = await global.Phone.Storage.get("shop", itemId);
      if (!it) return { ok: false, error: "商品不存在" };
      count = count || 1;
      const total = (it.price || 0) * count;
      const res = await global.Phone.Wallet.deduct(total, "购买 " + it.name + " x" + count, "shopping");
      if (!res.ok) return res;
      await _addToBag(it, count);
      await global.Phone.Storage.put("orders", {
        id: global.Phone.Utils.uid("order"), itemId, name: it.name,
        price: it.price, count, total, type: "purchase", createdAt: Date.now(),
      });
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.SHOP_PURCHASED, {
        sourceApp: "shop",
        data: { itemId, name: it.name, price: it.price, count },
        summary: "买了「" + it.name + "」×" + count,
      });
      return { ok: true };
    },
    /** 从背包赠送礼物 */
    async giftFromBag(itemId, characterId) {
      const Storage = global.Phone.Storage;
      const invs = await Storage.getAll("inventory");
      const inv = invs.find((v) => v.itemId === itemId);
      if (!inv || (inv.count || 1) <= 0) return { ok: false, error: "背包里没有这个" };
      inv.count -= 1;
      if (inv.count <= 0) await Storage.del("inventory", inv.id);
      else await Storage.put("inventory", inv);
      const char = await Storage.get("characters", characterId);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.SHOP_GIFTED, {
        sourceApp: "shop",
        data: { itemId, name: inv.name, characterId, characterName: char ? char.name : "" },
        summary: "送了 " + (char ? char.name : "AI") + " 一个「" + inv.name + "」",
      });
      await Storage.put("orders", {
        id: global.Phone.Utils.uid("order"), itemId, name: inv.name,
        price: 0, count: 1, total: 0, type: "gift", createdAt: Date.now(),
      });
      return { ok: true };
    },
    // 我上架新商品：opts={name, desc, price, icon, category, rarity}
    async addItem(opts) {
      const o = opts || {};
      const it = {
        id: global.Phone.Utils.uid("shop"),
        name: o.name || "未命名商品",
        description: o.desc != null ? o.desc : (o.description || ""),
        price: o.price || 0,
        icon: o.icon || "gift",
        image: o.image || "",
        category: o.category || "其他",
        rarity: o.rarity || "",
        createdAt: Date.now(),
      };
      await global.Phone.Storage.put("shop", it);
      return it;
    },
    // 我编辑商品（兼容 desc -> description）
    async updateItem(id, patch) {
      const Storage = global.Phone.Storage;
      const it = await Storage.get("shop", id);
      if (!it) return { ok: false, error: "找不到商品呀" };
      const p = Object.assign({}, patch || {});
      if (p.desc !== undefined) { p.description = p.desc; delete p.desc; }
      Object.assign(it, p);
      it.updatedAt = Date.now();
      await Storage.put("shop", it);
      return { ok: true, item: it };
    },
    // 我下架商品：顺手清掉购物车和收藏里的引用
    async removeItem(id) {
      const Storage = global.Phone.Storage;
      const it = await Storage.get("shop", id);
      if (!it) return { ok: false, error: "找不到商品呀" };
      await Storage.del("shop", id);
      const cart = await Storage.getAll("cart");
      for (const c of cart) {
        if (c.itemId === id) await Storage.del("cart", c.id);
      }
      const favs = await Storage.getAll("favorites");
      for (const f of favs) {
        if (f.itemId === id) await Storage.del("favorites", f.id);
      }
      return { ok: true };
    },
    // 我列购物车
    async listCart() {
      return await global.Phone.Storage.getAll("cart");
    },
    // 我从购物车移除商品
    async removeFromCart(itemId) {
      const Storage = global.Phone.Storage;
      const cart = await Storage.getAll("cart");
      for (const c of cart) {
        if (c.itemId === itemId) await Storage.del("cart", c.id);
      }
      return { ok: true };
    },
    // 我清空购物车
    async clearCart() {
      const Storage = global.Phone.Storage;
      const cart = await Storage.getAll("cart");
      for (const c of cart) await Storage.del("cart", c.id);
      return { ok: true };
    },
    // 我切换收藏：返回当前是否已收藏
    async toggleFavorite(itemId) {
      const Storage = global.Phone.Storage;
      const favs = await Storage.getAll("favorites");
      const exist = favs.find((f) => f.itemId === itemId);
      if (exist) {
        await Storage.del("favorites", exist.id);
        return false;
      }
      await Storage.put("favorites", {
        id: global.Phone.Utils.uid("fav"), itemId, createdAt: Date.now(),
      });
      return true;
    },
    // 我清空订单记录
    async clearOrders() {
      const Storage = global.Phone.Storage;
      const orders = await Storage.getAll("orders");
      for (const o of orders) await Storage.del("orders", o.id);
      return { ok: true };
    },
    // 我读设置（key 不带 shop 前缀）
    getSetting(key) {
      const full = "shop" + key.charAt(0).toUpperCase() + key.slice(1);
      return global.Phone.State.get(full);
    },
    // 我写设置
    async setSetting(key, value) {
      const full = "shop" + key.charAt(0).toUpperCase() + key.slice(1);
      await global.Phone.State.set(full, value);
    },
    // 我列出全部设置
    listSettings() {
      const S = global.Phone.State;
      return {
        defaultSort: S.get("shopDefaultSort") || "recent",
        showPrices: S.get("shopShowPrices"),
        autoGift: S.get("shopAutoGift"),
      };
    },
  };
})(window);
