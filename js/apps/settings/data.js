/* ============================================================
   data.js — 数据管理
   导出 JSON / 导入 / 清空 / 重置系统
   挂在 window.Phone.DataMgr
   ============================================================ */
(function (global) {
  "use strict";

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;

    const page = U.el("div", { class: "page settings-page" });
    page.appendChild(_nav("数据管理"));

    const content = U.el("div", { class: "scroll page-content" });

    // 存储占用
    const est = await global.Phone.Utils.storageEstimate();
    if (est && est.quota) {
      const used = est.usage || 0;
      const total = est.quota;
      const pct = Math.min(100, Math.round(used / total * 100));
      content.appendChild(U.el("div", { class: "card-soft", style: { margin: "16px" } }, [
        U.el("div", { class: "row between", style: { marginBottom: "8px" } }, [
          U.el("div", { text: "存储占用", style: { fontSize: "var(--font-sm)", color: "var(--text-secondary)" } }),
          U.el("div", { text: U.bytesToSize(used) + " / " + U.bytesToSize(total), style: { fontSize: "var(--font-sm)", color: "var(--text-primary)" } }),
        ]),
        U.el("div", { class: "progress" }, [U.el("div", { class: "progress-fill", style: { width: pct + "%" } })]),
        U.el("div", { class: "form-hint", text: "浏览器分配给小手机的存储空间" }),
      ]));
    }

    // 导出
    content.appendChild(U.el("div", { class: "settings-section-title", text: "备份与恢复" }));
    const exportRow = U.el("div", { class: "list-item" }, [
      U.el("div", { class: "li-avatar", style: { background: "var(--color-primary-ultralight)", color: "var(--color-primary-deep)" }, html: global.Phone.IconLibrary.get("download", { size: 18 }) }),
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: "导出全部数据" }),
        U.el("div", { class: "li-sub", text: "保存为 JSON 文件，可作备份" }),
      ]),
    ]);
    exportRow.addEventListener("click", async () => {
      const data = await Storage.exportAll();
      const json = JSON.stringify(data, null, 2);
      U.download("小手机备份_" + U.fmtDate(Date.now()) + ".json", json, "application/json");
      global.Phone.Notify.push({ appId: "settings", title: "已导出全部数据" });
    });
    content.appendChild(exportRow);

    const importRow = U.el("div", { class: "list-item" }, [
      U.el("div", { class: "li-avatar", style: { background: "var(--color-primary-ultralight)", color: "var(--color-primary-deep)" }, html: global.Phone.IconLibrary.get("upload", { size: 18 }) }),
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: "导入数据" }),
        U.el("div", { class: "li-sub", text: "从 JSON 备份恢复" }),
      ]),
    ]);
    importRow.addEventListener("click", () => {
      const inp = U.el("input", { type: "file", accept: "application/json", style: "display:none" });
      document.body.appendChild(inp);
      inp.addEventListener("change", async () => {
        const f = inp.files[0]; if (!f) return;
        try {
          const text = await f.text();
          const data = JSON.parse(text);
          await Storage.importAll(data, "merge");
          global.Phone.Notify.push({ appId: "settings", title: "导入成功", body: "刷新后生效" });
          setTimeout(() => location.reload(), 1000);
        } catch (e) {
          global.Phone.Notify.push({ appId: "settings", title: "导入失败", body: "文件格式不对哦" });
        }
        inp.remove();
      });
      inp.click();
    });
    content.appendChild(importRow);

    // 危险区
    content.appendChild(U.el("div", { class: "danger-zone" }, [
      U.el("div", { class: "settings-section-title", text: "危险操作（不可恢复）" }),
      U.el("button", { class: "btn btn-ghost btn-block", id: "btn-clear", text: "清空所有数据（保留设置）" }),
      U.el("button", { class: "btn btn-danger btn-block", id: "btn-reset", text: "重置系统（恢复出厂）" }),
    ]));

    page.appendChild(content);
    container.appendChild(page);

    document.getElementById("btn-clear").addEventListener("click", async () => {
      const ok = await global.Phone.Modal.confirm({
        title: "清空数据", message: "确定清空所有数据吗？\n角色/聊天/记忆等都会消失，设置保留。", danger: true, okText: "清空",
      });
      if (!ok) return;
      await Storage.clearAll();
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.SETTINGS_CHANGED, {
        sourceApp: "settings", data: { action: "clearAll" }, summary: "清空了所有数据",
      });
      global.Phone.Notify.push({ appId: "settings", title: "已清空数据" });
      setTimeout(() => location.reload(), 1000);
    });
    document.getElementById("btn-reset").addEventListener("click", async () => {
      const ok1 = await global.Phone.Modal.confirm({
        title: "重置系统", message: "确定重置系统吗？\n所有数据包括设置都会恢复到初始状态！", danger: true, okText: "继续",
      });
      if (!ok1) return;
      const ok2 = await global.Phone.Modal.confirm({
        title: "再确认一次", message: "真的要全部重来吗？", danger: true, okText: "全部重来",
      });
      if (!ok2) return;
      await Storage.resetSystem();
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.SETTINGS_CHANGED, {
        sourceApp: "settings", data: { action: "resetSystem" }, summary: "重置了系统",
      });
      global.Phone.Notify.push({ appId: "settings", title: "系统已重置" });
      setTimeout(() => location.reload(), 1000);
    });
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
  global.Phone.DataMgr = { mount };
})(window);
