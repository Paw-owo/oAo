/* ============================================================
   api-switcher.js — AI 接口切换小弹窗
   在聊天里快速切换 API 分组 + 模型，不跳转到设置页
   挂在 window.Phone.ApiSwitcher
   用法：ApiSwitcher.show({ conversationId, characterId, onError })
   ============================================================ */
(function (global) {
  "use strict";

  /**
   * 我（接口切换弹窗）展示并处理用户选择
   * @param {object} opts {
   *   conversationId?, characterId?,
   *   onError?: (msg) => void,    // 失败提示回调（外层决定怎么提示）
   *   failed?: boolean,            // 外层传 true 表示当前接口失败了，要显示"这个接口好像不太行"
   * }
   */
  function show(opts) {
    opts = opts || {};
    const U = global.Phone.Utils;
    const AIClient = global.Phone.AIClient;
    if (!AIClient || !AIClient.getApiGroups) {
      global.Phone.Notify.push({ appId: "chat", title: "AI 模块还没加载好呀" });
      return;
    }

    // 防止重复弹出
    const existed = document.querySelector(".api-switcher-mask");
    if (existed) existed.remove();

    const mask = U.el("div", { class: "api-switcher-mask" });
    mask.addEventListener("click", (e) => { if (e.target === mask) close(); });

    const card = U.el("div", { class: "api-switcher-card anim-pop", role: "dialog" });

    // 标题栏
    const head = U.el("div", { class: "as-head" }, [
      U.el("div", { class: "as-title", text: "切换 AI 接口" }),
      U.el("button", { class: "as-close icon-btn", html: global.Phone.IconLibrary.get("close", { size: 18 }) }),
    ]);
    head.querySelector(".as-close").addEventListener("click", close);
    card.appendChild(head);

    // 失败提示
    if (opts.failed) {
      card.appendChild(U.el("div", { class: "as-fail-hint", text: "这个接口好像不太行，换一个试试～" }));
    }

    // 分组列表区
    const groupSection = U.el("div", { class: "as-section" }, [
      U.el("div", { class: "as-section-label", text: "接口分组" }),
    ]);
    const groupList = U.el("div", { class: "as-list" });
    groupSection.appendChild(groupList);
    card.appendChild(groupSection);

    // 模型列表区
    const modelSection = U.el("div", { class: "as-section" }, [
      U.el("div", { class: "as-section-label", text: "模型" }),
    ]);
    const modelList = U.el("div", { class: "as-list as-model-list" });
    modelSection.appendChild(modelList);
    card.appendChild(modelSection);

    // 底部"管理分组"链接 + 关闭按钮
    const foot = U.el("div", { class: "as-foot" }, [
      U.el("button", { class: "btn btn-text btn-sm", text: "去设置页管理" }),
      U.el("button", { class: "btn btn-ghost btn-sm", text: "好啦" }),
    ]);
    foot.querySelector(".btn-text").addEventListener("click", () => {
      close();
      if (global.Phone.AIConfig && global.Phone.AIConfig.mount) {
        global.Phone.Router.push("ai-config", global.Phone.AIConfig.mount, {});
      }
    });
    foot.querySelector(".btn-ghost").addEventListener("click", close);
    card.appendChild(foot);

    mask.appendChild(card);
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add("open"));

    // ---------- 渲染 ----------
    let currentGroupId = null;
    let groups = [];

    async function render() {
      const cur = await AIClient.getCurrentGroup();
      currentGroupId = cur ? cur.id : null;
      const currentModel = cur ? cur.model : "";
      groups = await AIClient.getApiGroups();

      // 渲染分组列表
      U.empty(groupList);
      if (!groups.length) {
        groupList.appendChild(U.el("div", { class: "as-empty", text: "还没有分组，去设置页加一个吧" }));
      }
      groups.forEach((g) => {
        const isCurrent = g.id === currentGroupId;
        const item = U.el("div", { class: "as-item" + (isCurrent ? " active" : "") }, [
          U.el("div", { class: "asi-icon", html: global.Phone.IconLibrary.get("app-settings", { size: 16 }) }),
          U.el("div", { class: "asi-main" }, [
            U.el("div", { class: "asi-title", text: g.name || "未命名分组" }),
            U.el("div", { class: "asi-sub", text: _truncateMid(g.baseUrl || "未配置接口地址") }),
          ]),
          g.isDefault ? U.el("div", { class: "asi-tag", text: "默认" }) : null,
          U.el("div", { class: "asi-check" + (isCurrent ? " on" : ""), html: global.Phone.IconLibrary.get("check", { size: 16 }) }),
        ]);
        item.addEventListener("click", async () => {
          if (g.id === currentGroupId) return;
          await global.Phone.State.set("currentApiGroupId", g.id);
          // 切换分组后默认选第一个模型（如果有）
          if (g.models && g.models.length) {
            await AIClient.setCurrentModel(g.id, g.models[0]);
          } else {
            await AIClient.setCurrentModel(g.id, "");
          }
          currentGroupId = g.id;
          render();
        });
        groupList.appendChild(item);
      });

      // 渲染当前分组的模型列表
      U.empty(modelList);
      const curGroup = groups.find((g) => g.id === currentGroupId) || groups[0];
      if (!curGroup) {
        modelList.appendChild(U.el("div", { class: "as-empty", text: "先选一个分组吧" }));
        return;
      }
      const models = curGroup.models || [];
      if (!models.length) {
        modelList.appendChild(U.el("div", { class: "as-empty", text: "这个分组还没模型，去设置页添加吧～" }));
      }
      // 常用模型快捷填入区
      const popular = (AIClient.POPULAR_MODELS || []).slice(0, 6);
      if (popular.length) {
        const chipWrap = U.el("div", { class: "as-chip-wrap" });
        popular.forEach((m) => {
          const chip = U.el("div", {
            class: "as-chip" + (m.id === currentModel ? " active" : ""),
            text: m.name,
          });
          chip.addEventListener("click", async () => {
            await AIClient.setCurrentModel(curGroup.id, m.id);
            // 若分组里没这个模型，加进去
            if ((curGroup.models || []).indexOf(m.id) < 0) {
              await AIClient.saveApiGroup({
                id: curGroup.id,
                name: curGroup.name,
                baseUrl: curGroup.baseUrl,
                apiKey: curGroup.apiKey,
                models: (curGroup.models || []).concat([m.id]),
                isDefault: curGroup.isDefault,
              });
            }
            render();
          });
          chipWrap.appendChild(chip);
        });
        modelList.appendChild(chipWrap);
        modelList.appendChild(U.el("div", { class: "as-divider" }));
      }
      // 分组内已有模型列表
      models.forEach((m) => {
        const isCurrent = m === currentModel;
        const item = U.el("div", { class: "as-item" + (isCurrent ? " active" : "") }, [
          U.el("div", { class: "asi-icon", html: global.Phone.IconLibrary.get("app-memory", { size: 16 }) }),
          U.el("div", { class: "asi-main" }, [
            U.el("div", { class: "asi-title", text: m }),
          ]),
          U.el("div", { class: "asi-check" + (isCurrent ? " on" : ""), html: global.Phone.IconLibrary.get("check", { size: 16 }) }),
        ]);
        item.addEventListener("click", async () => {
          if (m === currentModel) return;
          await AIClient.setCurrentModel(curGroup.id, m);
          render();
        });
        modelList.appendChild(item);
      });

      // 添加自定义模型输入
      const addRow = U.el("div", { class: "as-add-model" }, [
        U.el("input", { class: "as-add-input", placeholder: "输入模型名，回车添加", type: "text" }),
        U.el("button", { class: "btn btn-ghost btn-sm", text: "添加" }),
      ]);
      const inp = addRow.querySelector("input");
      const addBtn = addRow.querySelector("button");
      async function addModel() {
        const v = (inp.value || "").trim();
        if (!v) return;
        if ((curGroup.models || []).indexOf(v) >= 0) {
          global.Phone.Notify.push({ appId: "chat", title: "这个模型已经在了" });
          return;
        }
        await AIClient.saveApiGroup({
          id: curGroup.id,
          name: curGroup.name,
          baseUrl: curGroup.baseUrl,
          apiKey: curGroup.apiKey,
          models: (curGroup.models || []).concat([v]),
          isDefault: curGroup.isDefault,
        });
        await AIClient.setCurrentModel(curGroup.id, v);
        inp.value = "";
        render();
      }
      addBtn.addEventListener("click", addModel);
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addModel(); } });
      modelList.appendChild(addRow);
    }

    function close() {
      mask.classList.remove("open");
      mask.classList.add("closing");
      setTimeout(() => { if (mask.parentNode) mask.remove(); }, 200);
    }

    render();
    return { close, el: mask };
  }

  function _truncateMid(s) {
    if (!s) return "";
    if (s.length <= 40) return s;
    return s.slice(0, 20) + "…" + s.slice(-12);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.ApiSwitcher = { show };
})(window);
