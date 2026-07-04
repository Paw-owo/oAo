/* ============================================================
   collapsible-card.js — 可折叠卡片通用组件
   用于设置页等"繁琐选项"收纳：标题栏可点击折叠/展开
   - 标题 + 副标题（可选）+ 右侧 chevron（展开旋转 90°）
   - max-height + transition 平滑动画
   - defaultOpen 可配置默认展开/折叠
   - 支持嵌套（卡片里套卡片）
   - 主题变量：--bg-surface / --color-primary / --border-soft 等
   挂在 window.Phone.Components.CollapsibleCard

   用法：
     CollapsibleCard.mount(container, {
       title: "接口配置",
       subtitle: "API 地址和密钥",
       defaultOpen: true,
       icon: "settings",          // 可选，icon-library 名
       content: (body) => { body.appendChild(...) }
     });
   // 或直接传 DOM 节点 / HTML 字符串：
   //   content: elNode
   //   content: "<p>一段说明</p>"
   ============================================================ */
(function (global) {
  "use strict";

  const U = () => global.Phone.Utils;

  /**
   * 我（可折叠卡片）挂载到容器
   * @param {HTMLElement} container 父容器
   * @param {object} opts
   *   - title: 标题（必填）
   *   - subtitle: 副标题（可选）
   *   - defaultOpen: 默认是否展开，默认 false
   *   - icon: icon-library 中的图标名（可选）
   *   - content: HTMLElement | string(HTML) | function(bodyEl) => void
   *   - onToggle: (isOpen) => void  切换时回调
   *   - id: 可选，用于持久化（暂未实现，预留）
   * @returns {HTMLElement} 卡片根节点（含 .open / 折叠态类）
   */
  function mount(container, opts) {
    opts = opts || {};
    const utils = U();
    if (!utils || !utils.el) {
      console.warn("[CollapsibleCard] Phone.Utils 未就绪");
      return null;
    }

    const card = utils.el("div", { class: "card-section" + (opts.defaultOpen ? " open" : "") });
    if (opts.id) card.dataset.id = opts.id;

    // ---------- 标题栏 ----------
    const header = utils.el("div", { class: "card-section-header", role: "button", tabindex: "0" });

    if (opts.icon) {
      try {
        const ic = utils.el("div", { class: "csh-icon" });
        ic.innerHTML = global.Phone.IconLibrary.get(opts.icon, { size: 18 });
        header.appendChild(ic);
      } catch {}
    }

    const titles = utils.el("div", { class: "csh-titles" });
    titles.appendChild(utils.el("div", { class: "csh-title", text: opts.title || "" }));
    if (opts.subtitle) {
      titles.appendChild(utils.el("div", { class: "csh-subtitle", text: opts.subtitle }));
    }
    header.appendChild(titles);

    const chevron = utils.el("div", { class: "csh-chevron" });
    chevron.innerHTML = global.Phone.IconLibrary
      ? global.Phone.IconLibrary.get("chevron-right", { size: 18 })
      : "";
    header.appendChild(chevron);

    card.appendChild(header);

    // ---------- 内容区 ----------
    const bodyWrap = utils.el("div", { class: "card-section-body-wrap" });
    const body = utils.el("div", { class: "card-section-body" });
    bodyWrap.appendChild(body);

    // 注入内容
    const content = opts.content;
    if (content) {
      if (typeof content === "function") {
        try { content(body); } catch (e) { console.warn("[CollapsibleCard] content 函数执行失败", e); }
      } else if (typeof content === "string") {
        body.innerHTML = content;
      } else if (content.nodeType === 1) {
        body.appendChild(content);
      } else if (Array.isArray(content)) {
        content.forEach((n) => { if (n && n.nodeType) body.appendChild(n); });
      }
    }
    card.appendChild(bodyWrap);

    // ---------- 折叠/展开 ----------
    function setOpen(open) {
      card.classList.toggle("open", open);
      // 用 scrollHeight 计算实际高度，做平滑 max-height 动画
      if (open) {
        // 展开：先设为 scrollHeight 触发过渡，过渡完设 none 让内容自由扩展
        bodyWrap.style.maxHeight = bodyWrap.scrollHeight + "px";
        const onEnd = (e) => {
          if (e.propertyName !== "max-height") return;
          if (card.classList.contains("open")) {
            bodyWrap.style.maxHeight = "none";
          }
          bodyWrap.removeEventListener("transitionend", onEnd);
        };
        bodyWrap.addEventListener("transitionend", onEnd);
      } else {
        // 折叠：先把 none 改成具体 px（让 transition 生效），下一帧再设 0
        bodyWrap.style.maxHeight = bodyWrap.scrollHeight + "px";
        // 强制重排
        // eslint-disable-next-line no-unused-expressions
        bodyWrap.offsetHeight;
        requestAnimationFrame(() => { bodyWrap.style.maxHeight = "0px"; });
      }
      if (typeof opts.onToggle === "function") {
        try { opts.onToggle(open); } catch {}
      }
    }

    header.addEventListener("click", () => {
      setOpen(!card.classList.contains("open"));
    });
    // 键盘可达性：Enter / Space 触发
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setOpen(!card.classList.contains("open"));
      }
    });

    // 初始化折叠态：默认折叠 → maxHeight 0；默认展开 → maxHeight none
    if (opts.defaultOpen) {
      bodyWrap.style.maxHeight = "none";
    } else {
      bodyWrap.style.maxHeight = "0px";
    }

    container.appendChild(card);

    // 暴露 API
    card._collapsible = {
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen(!card.classList.contains("open")),
      isOpen: () => card.classList.contains("open"),
    };
    return card;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Components = global.Phone.Components || {};
  global.Phone.Components.CollapsibleCard = { mount };
})(window);
