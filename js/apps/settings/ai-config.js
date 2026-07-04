/* ============================================================
   ai-config.js — AI 与接口设置
   API 地址 / Key / 模型 / 说话风格 / 思维链 / 温度
   挂在 window.Phone.AIConfig
   ============================================================ */
(function (global) {
  "use strict";

  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;
    const Storage = global.Phone.Storage;

    const page = U.el("div", { class: "page settings-page" });
    page.appendChild(_nav("AI 与接口"));

    const content = U.el("div", { class: "scroll page-content" });

    const [endpoint, apiKey, model, speakingStyle, showThinking, temperature, maxTokens] = await Promise.all([
      State.get("aiEndpoint"), State.get("aiApiKey"), State.get("aiModel"),
      State.get("aiSpeakingStyle"), State.get("showThinking"),
      State.get("aiTemperature"), State.get("aiMaxTokens"),
    ]);

    content.appendChild(U.el("div", { class: "settings-section-title", text: "接口配置" }));

    content.appendChild(U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: "接口地址" }),
      U.el("input", { class: "input", id: "cfg-endpoint", placeholder: "https://api.openai.com/v1/chat/completions", value: endpoint || "" }),
      U.el("div", { class: "form-hint", text: "OpenAI 兼容格式接口地址" }),
    ]));

    content.appendChild(U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: "API Key" }),
      U.el("input", { class: "input", id: "cfg-apikey", type: "password", placeholder: "sk-...", value: apiKey || "" }),
      U.el("div", { class: "form-hint", text: "本地存储，不会上传到任何第三方" }),
    ]));

    content.appendChild(U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: "模型名称" }),
      U.el("input", { class: "input", id: "cfg-model", placeholder: "gpt-4o-mini", value: model || "" }),
    ]));

    content.appendChild(U.el("div", { class: "settings-section-title", text: "AI 行为" }));

    content.appendChild(U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: "说话风格（全局补充）" }),
      U.el("textarea", { class: "textarea", id: "cfg-style", placeholder: "例如：回复要短一点、爱用颜文字、偶尔撒娇", html: U.escapeHtml(speakingStyle || "") }),
      U.el("div", { class: "form-hint", text: "会和角色自身的说话方式叠加" }),
    ]));

    // 思维链开关
    const thinkRow = U.el("div", { class: "list-item" }, [
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: "展示思维链" }),
        U.el("div", { class: "li-sub", text: "显示 AI 的思考过程" }),
      ]),
    ]);
    const thinkSwitch = U.el("div", { class: "switch" + (showThinking ? " on" : "") });
    thinkSwitch.addEventListener("click", async () => {
      const v = !showThinking;
      await State.set("showThinking", v);
      thinkSwitch.classList.toggle("on", v);
    });
    thinkRow.appendChild(thinkSwitch);
    content.appendChild(thinkRow);

    // ---------- 我的主动行为 ----------
    content.appendChild(U.el("div", { class: "settings-section-title", text: "我的主动行为", style: { marginTop: "16px" } }));
    content.appendChild(U.el("div", { class: "form-hint", text: "我会像真人一样主动找你、发朋友圈、给你点赞评论", style: { marginBottom: "8px" } }));

    const proactiveSettings = await Storage.getAllSettings();
    const pEnabled = proactiveSettings.aiProactiveEnabled !== false;
    const pMoment = proactiveSettings.aiAutoMoment !== false;
    const pInteract = proactiveSettings.aiAutoInteract !== false;
    const pChat = proactiveSettings.aiAutoChat !== false;

    // 总开关
    const pRow = U.el("div", { class: "list-item" }, [
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: "启用主动行为" }),
        U.el("div", { class: "li-sub", text: "关闭后我不会主动打扰你" }),
      ]),
    ]);
    const pSwitch = U.el("div", { class: "switch" + (pEnabled ? " on" : "") });
    pSwitch.addEventListener("click", async () => {
      const v = !pEnabled;
      await Storage.setSetting("aiProactiveEnabled", v);
      pSwitch.classList.toggle("on", v);
      if (!v && global.Phone.AIProactive) global.Phone.AIProactive.stop();
      else if (v && global.Phone.AIProactive) global.Phone.AIProactive.start();
    });
    pRow.appendChild(pSwitch);
    content.appendChild(pRow);

    // 子开关：自动发朋友圈
    const mRow = U.el("div", { class: "list-item" }, [
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: "我会自动发朋友圈" }),
        U.el("div", { class: "li-sub", text: "每 6 小时发一条" }),
      ]),
    ]);
    const mSwitch = U.el("div", { class: "switch" + (pMoment ? " on" : "") });
    mSwitch.addEventListener("click", async () => {
      const v = !pMoment;
      await Storage.setSetting("aiAutoMoment", v);
      mSwitch.classList.toggle("on", v);
    });
    mRow.appendChild(mSwitch);
    content.appendChild(mRow);

    // 子开关：点赞评论
    const iRow = U.el("div", { class: "list-item" }, [
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: "我会点赞评论朋友圈" }),
        U.el("div", { class: "li-sub", text: "每 2 小时互动一次" }),
      ]),
    ]);
    const iSwitch = U.el("div", { class: "switch" + (pInteract ? " on" : "") });
    iSwitch.addEventListener("click", async () => {
      const v = !pInteract;
      await Storage.setSetting("aiAutoInteract", v);
      iSwitch.classList.toggle("on", v);
    });
    iRow.appendChild(iSwitch);
    content.appendChild(iRow);

    // 子开关：主动聊天
    const cRow = U.el("div", { class: "list-item" }, [
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: "我会主动找你聊天" }),
        U.el("div", { class: "li-sub", text: "每 4 小时来打个招呼（1小时内聊过则不打扰）" }),
      ]),
    ]);
    const cSwitch = U.el("div", { class: "switch" + (pChat ? " on" : "") });
    cSwitch.addEventListener("click", async () => {
      const v = !pChat;
      await Storage.setSetting("aiAutoChat", v);
      cSwitch.classList.toggle("on", v);
    });
    cRow.appendChild(cSwitch);
    content.appendChild(cRow);

    // 立即触发按钮（调试用）
    const triggerBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "立即触发一次（测试）", style: { marginTop: "8px", width: "100%" } });
    triggerBtn.addEventListener("click", () => {
      if (global.Phone.AIProactive) {
        global.Phone.AIProactive.trigger();
        global.Phone.Notify.push({ appId: "settings", title: "已触发，去看朋友圈/消息列表" });
      }
    });
    content.appendChild(triggerBtn);

    // 温度
    content.appendChild(U.el("div", { class: "form-group", style: { marginTop: "16px" } }, [
      U.el("div", { class: "form-label", text: "温度（创造性）：" + (temperature != null ? temperature : 0.7) }),
      (() => {
        const slider = U.el("input", { type: "range", min: "0", max: "1", step: "0.1", value: String(temperature != null ? temperature : 0.7), style: { width: "100%" } });
        slider.addEventListener("change", () => State.set("aiTemperature", parseFloat(slider.value)));
        return slider;
      })()
    ]));

    // 最大 token
    content.appendChild(U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: "最大回复长度（token）" }),
      U.el("input", { class: "input", id: "cfg-maxtokens", type: "number", value: String(maxTokens || 2000) }),
    ]));

    // 保存按钮
    content.appendChild(U.el("button", { class: "btn btn-block", style: { marginTop: "20px" }, text: "保存配置", id: "cfg-save" }));

    page.appendChild(content);
    container.appendChild(page);

    document.getElementById("cfg-save").addEventListener("click", async () => {
      const e = document.getElementById("cfg-endpoint").value.trim();
      const k = document.getElementById("cfg-apikey").value.trim();
      const m = document.getElementById("cfg-model").value.trim();
      const s = document.getElementById("cfg-style").value.trim();
      const mt = parseInt(document.getElementById("cfg-maxtokens").value) || 2000;
      await Promise.all([
        State.set("aiEndpoint", e), State.set("aiApiKey", k), State.set("aiModel", m),
        State.set("aiSpeakingStyle", s), State.set("aiMaxTokens", mt),
      ]);
      global.Phone.Notify.push({ appId: "settings", title: "AI 配置已保存", body: e ? "接口已就绪" : "记得填接口地址哦" });
      global.Phone.Router.back();
    });

    // 角色管理入口
    setTimeout(() => {
      const charLink = U.el("div", { class: "list-item", style: { marginTop: "20px" } }, [
        U.el("div", { class: "li-avatar", style: { background: "var(--color-accent-ultralight)", color: "var(--color-accent)" }, html: global.Phone.IconLibrary.get("app-characters", { size: 18 }) }),
        U.el("div", { class: "li-main" }, [
          U.el("div", { class: "li-title", text: "角色管理" }),
          U.el("div", { class: "li-sub", text: "创建 / 编辑 / 切换 AI 角色" }),
        ]),
        U.el("div", { class: "li-right", html: global.Phone.IconLibrary.get("chevron-right", { size: 18 }) }),
      ]);
      charLink.addEventListener("click", () => {
        if (global.Phone.Characters) global.Phone.Characters.open();
      });
      content.appendChild(charLink);
    }, 0);
  }

  function _nav(title) {
    const U = global.Phone.Utils;
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

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AIConfig = { mount };
})(window);
