/* ============================================================
   settings.js — 设置中心主页 + APP 注册
   入口聚合：个性化 / AI / 通知与安全 / 数据 / 关于
   改造成可折叠卡片：默认展开"个性化"，其余折叠
   挂在 window.Phone.Settings
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.AppRegistry.register({
    id: "settings",
    name: "设置",
    icon: "app-settings",
    entry: () => open(),
    events: ["settings_changed"],
    settings: [],
    order: 100,
  });

  function open() {
    global.Phone.Router.push("settings", mount, {});
  }

  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;
    const CC = global.Phone.Components && global.Phone.Components.CollapsibleCard;

    const page = U.el("div", { class: "page settings-page" });

    // 导航
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: "设置" }));
    nav.appendChild(U.el("div", { class: "nav-right" }));
    page.appendChild(nav);

    const content = U.el("div", { class: "scroll page-content no-pad" });
    content.style.paddingTop = "12px";

    if (CC) {
      // ============== 个性化（默认展开） ==============
      CC.mount(content, {
        title: "个性化",
        subtitle: "主题 / 壁纸 / 字号 / 聊天",
        icon: "palette",
        defaultOpen: true,
        content: (body) => {
          body.appendChild(_group([
            _row("palette", "个性化", "主题 / 壁纸 / 字号 / 布局 / Dock", () => global.Phone.Router.push("personalization", global.Phone.Personalization.mount, {})),
            _row("app-chat", "聊天设置", "气泡 / 字号 / 默认背景 / 收藏", () => global.Phone.Router.push("chat-settings", global.Phone.ChatSettings.mount, {})),
          ]));
        },
      });

      // ============== AI ==============
      CC.mount(content, {
        title: "AI 与记忆",
        subtitle: "接口 / 角色 / 世界书 / 记忆",
        icon: "app-characters",
        defaultOpen: false,
        content: (body) => {
          body.appendChild(_group([
            _row("app-settings", "AI 与接口", "API 地址 / Key / 模型 / 思维链", () => global.Phone.Router.push("ai-config", global.Phone.AIConfig.mount, {})),
            _row("app-characters", "角色管理", "创建 / 编辑 / 切换 AI 角色", () => {
              if (global.Phone.Characters) global.Phone.Characters.open();
            }),
            _row("app-worldbook", "世界书", "世界观设定 / 关键词触发", () => {
              if (global.Phone.Worldbook) global.Phone.Worldbook.open();
            }),
            _row("app-memory", "记忆系统", "AI 记忆管理（按角色隔离）", () => {
              if (global.Phone.Memory) global.Phone.Memory.open();
            }),
          ]));
        },
      });

      // ============== 通知与安全 ==============
      CC.mount(content, {
        title: "通知与安全",
        subtitle: "通知 / 锁屏 / 密码",
        icon: "bell",
        defaultOpen: false,
        content: (body) => {
          body.appendChild(_group([
            _row("bell", "通知", "总开关 / 免打扰 / 角标", () => global.Phone.Router.push("notifications", global.Phone.Notifications.mount, {})),
            _row("lock", "锁屏与安全", "密码 / 壁纸 / 头像 / 文案", () => global.Phone.Router.push("lock-security", global.Phone.LockSecurity.mount, {})),
          ]));
        },
      });

      // ============== 数据 ==============
      CC.mount(content, {
        title: "数据",
        subtitle: "导出 / 导入 / 清空 / 重置",
        icon: "download",
        defaultOpen: false,
        content: (body) => {
          body.appendChild(_group([
            _row("download", "数据管理", "导出 / 导入 / 清空 / 重置", () => global.Phone.Router.push("data", global.Phone.DataMgr.mount, {})),
          ]));
        },
      });

      // ============== 关于 ==============
      CC.mount(content, {
        title: "关于",
        subtitle: "小手机的故事",
        icon: "info",
        defaultOpen: false,
        content: (body) => {
          body.appendChild(_about());
        },
      });
    } else {
      // 兜底：组件未加载时使用旧布局
      content.appendChild(_sectionTitle("个性化"));
      content.appendChild(_group([
        _row("palette", "个性化", "主题 / 壁纸 / 字号 / 布局 / Dock", () => global.Phone.Router.push("personalization", global.Phone.Personalization.mount, {})),
        _row("app-chat", "聊天设置", "气泡 / 字号 / 默认背景 / 收藏", () => global.Phone.Router.push("chat-settings", global.Phone.ChatSettings.mount, {})),
      ]));
      content.appendChild(_sectionTitle("AI"));
      content.appendChild(_group([
        _row("app-settings", "AI 与接口", "API 地址 / Key / 模型 / 思维链", () => global.Phone.Router.push("ai-config", global.Phone.AIConfig.mount, {})),
        _row("app-characters", "角色管理", "创建 / 编辑 / 切换 AI 角色", () => {
          if (global.Phone.Characters) global.Phone.Characters.open();
        }),
        _row("app-worldbook", "世界书", "世界观设定 / 关键词触发", () => {
          if (global.Phone.Worldbook) global.Phone.Worldbook.open();
        }),
        _row("app-memory", "记忆系统", "AI 记忆管理（按角色隔离）", () => {
          if (global.Phone.Memory) global.Phone.Memory.open();
        }),
      ]));
      content.appendChild(_sectionTitle("通知与安全"));
      content.appendChild(_group([
        _row("bell", "通知", "总开关 / 免打扰 / 角标", () => global.Phone.Router.push("notifications", global.Phone.Notifications.mount, {})),
        _row("lock", "锁屏与安全", "密码 / 壁纸 / 头像 / 文案", () => global.Phone.Router.push("lock-security", global.Phone.LockSecurity.mount, {})),
      ]));
      content.appendChild(_sectionTitle("数据"));
      content.appendChild(_group([
        _row("download", "数据管理", "导出 / 导入 / 清空 / 重置", () => global.Phone.Router.push("data", global.Phone.DataMgr.mount, {})),
      ]));
      content.appendChild(_sectionTitle("关于"));
      content.appendChild(_about());
    }

    page.appendChild(content);
    container.appendChild(page);
  }

  function _sectionTitle(text) {
    return global.Phone.Utils.el("div", { class: "settings-section-title", text: text });
  }

  function _group(rows) {
    const U = global.Phone.Utils;
    const g = U.el("div", { class: "settings-group", style: { margin: "0" } });
    rows.forEach((r) => g.appendChild(r));
    return g;
  }

  function _row(icon, title, sub, onClick) {
    const U = global.Phone.Utils;
    const row = U.el("div", { class: "settings-row" });
    row.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get(icon, { size: 18 }) }));
    row.appendChild(U.el("div", { class: "sr-main" }, [
      U.el("div", { class: "sr-title", text: title }),
      U.el("div", { class: "sr-sub", text: sub }),
    ]));
    row.appendChild(U.el("div", { class: "sr-right" }, [U.el("span", { class: "chevron", html: global.Phone.IconLibrary.get("chevron-right", { size: 18 }) })]));
    row.addEventListener("click", onClick);
    return row;
  }

  function _about() {
    const U = global.Phone.Utils;
    const card = U.el("div", { class: "about-card", style: { margin: "0" } });
    card.appendChild(U.el("div", { class: "about-logo", html: U.el("template", {}).innerHTML || "" }));
    card.querySelector(".about-logo").innerHTML = global.Phone.IconLibrary.get("sb-paw-big", { size: 36, strokeWidth: 1.4 });
    card.appendChild(U.el("div", { class: "about-name", text: global.Phone.State.get("systemName") || "小手机" }));
    card.appendChild(U.el("div", { class: "about-version", text: "v" + (global.Phone.State.get("version") || "1.0.0") }));
    card.appendChild(U.el("div", { class: "about-desc", text: "一台温柔的虚拟伴侣手机\n棉花糖甜，不是硬糖甜" }));
    return card;
  }

  // ---------- 暴露 ----------
  global.Phone.Settings = { open, mount };
})(window);
