/* ============================================================
   utils.js — 工具函数集合
   提供 DOM / 时间 / 随机 / 文件 / 格式化等通用能力
   挂在 window.Phone.Utils
   ============================================================ */
(function (global) {
  "use strict";

  // ---------- DOM ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /**
   * 创建元素
   * @param {string} tag 标签
   * @param {object} props 属性 / 事件 / 子节点
   * @param {(Node|string)[]} children 子节点
   */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const key in props) {
        const val = props[key];
        if (val == null) continue;
        if (key === "class") node.className = val;
        else if (key === "style" && typeof val === "object") {
          Object.assign(node.style, val);
        } else if (key === "dataset" && typeof val === "object") {
          for (const k in val) node.dataset[k] = val[k];
        } else if (key === "html") node.innerHTML = val;
        else if (key === "text") node.textContent = val;
        else if (key.startsWith("on") && typeof val === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), val);
        } else if (key in node && key !== "list") {
          try { node[key] = val; } catch { node.setAttribute(key, val); }
        } else {
          node.setAttribute(key, val);
        }
      }
    }
    if (children != null) {
      if (!Array.isArray(children)) children = [children];
      children.forEach((c) => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === "string" || typeof c === "number"
          ? document.createTextNode(String(c)) : c);
      });
    }
    return node;
  }

  // 清空节点
  function empty(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  // ---------- ID / 随机 ----------
  function uid(prefix) {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return (prefix || "id") + "_" + t + r;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- 时间 ----------
  const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  // HH:MM
  function fmtHM(ts) {
    const d = new Date(ts);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  // HH:MM:SS
  function fmtHMS(ts) {
    const d = new Date(ts);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  // 月日
  function fmtMD(ts) {
    const d = new Date(ts);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  // 完整日期
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  // 完整时间
  function fmtDateTime(ts) {
    const d = new Date(ts);
    return fmtDate(ts) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  // 相对时间（刚刚 / N分钟前 / N小时前 / 昨天 / 月日 / 年月日）
  function relTime(ts) {
    const now = Date.now();
    const diff = now - ts;
    const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
    if (diff < min) return "刚刚";
    if (diff < hour) return Math.floor(diff / min) + "分钟前";
    const isToday = new Date(now).toDateString() === new Date(ts).toDateString();
    if (isToday) return fmtHM(ts);
    const yesterday = new Date(now - day).toDateString() === new Date(ts).toDateString();
    if (yesterday) return "昨天 " + fmtHM(ts);
    if (diff < day * 7) {
      const d = new Date(ts);
      return WEEK_CN[d.getDay()] + " " + fmtHM(ts);
    }
    if (new Date(now).getFullYear() === new Date(ts).getFullYear()) return fmtMD(ts);
    return fmtDate(ts);
  }

  // 倒计时天数
  function daysTo(ts) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(ts);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / (24 * 3600 * 1000));
  }

  // 时长 mm:ss
  function fmtDur(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return pad2(m) + ":" + pad2(s);
  }

  // ---------- 文本 ----------
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function truncate(str, n) {
    if (!str) return "";
    return str.length > n ? str.slice(0, n) + "…" : str;
  }

  // ---------- 函数工具 ----------
  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  }

  function throttle(fn, wait) {
    let last = 0, t = null;
    return function () {
      const now = Date.now();
      const args = arguments, ctx = this;
      if (now - last >= wait) {
        last = now;
        fn.apply(ctx, args);
      } else {
        clearTimeout(t);
        t = setTimeout(() => { last = Date.now(); fn.apply(ctx, args); }, wait - (now - last));
      }
    };
  }

  // ---------- 文件 ----------
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function bytesToSize(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  }

  // 触发文件下载
  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- 颜色 / 其他 ----------
  // hex 转 rgba 字符串
  function hexToRgba(hex, alpha) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + (alpha == null ? 1 : alpha) + ")";
  }

  // 振动反馈（如支持）
  function vibrate(ms) {
    if (navigator.vibrate) try { navigator.vibrate(ms || 8); } catch {}
  }

  // ---------- Storage quota ----------
  async function storageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const e = await navigator.storage.estimate();
        return { usage: e.usage, quota: e.quota };
      } catch { return null; }
    }
    return null;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Utils = {
    $, $$, el, empty, uid, randInt, pick, shuffle,
    pad2, fmtHM, fmtHMS, fmtMD, fmtDate, fmtDateTime, relTime, daysTo, fmtDur,
    escapeHtml, truncate, debounce, throttle,
    fileToBase64, bytesToSize, download,
    hexToRgba, vibrate, storageEstimate,
    WEEK_CN,
  };
})(window);
