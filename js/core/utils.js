/* ============================================================
   小手机系统 · 通用工具
   ============================================================ */
(function (global) {
  'use strict';

  const Utils = {
    /* ---------- DOM ---------- */
    /**
     * 创建 DOM 元素
     * @param {string} tag 标签名
     * @param {object} attrs 属性键值对（class/innerHTML/textContent/style/dataset/事件等）
     * @param {Array} children 子元素
     */
    el(tag, attrs = {}, children = []) {
      const node = document.createElement(tag);
      for (const key in attrs) {
        const val = attrs[key];
        if (val == null) continue;
        if (key === 'class') node.className = val;
        else if (key === 'html') node.innerHTML = val;
        else if (key === 'text') node.textContent = val;
        else if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
        else if (key === 'dataset') Object.assign(node.dataset, val);
        else if (key.startsWith('on') && typeof val === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), val);
        } else if (key === 'attrs') {
          for (const a in val) node.setAttribute(a, val[a]);
        } else {
          node[key] = val;
        }
      }
      const kids = Array.isArray(children) ? children : [children];
      kids.forEach(c => {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
      return node;
    },

    /** 查询单个元素 */
    $(sel, root = document) { return root.querySelector(sel); },
    /** 查询全部 */
    $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },

    /** 清空子节点 */
    clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; },

    /* ---------- 事件 ---------- */
    /** 防抖 */
    debounce(fn, wait = 200) {
      let t = null;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    },
    /** 节流 */
    throttle(fn, wait = 100) {
      let last = 0, timer = null;
      return function (...args) {
        const now = Date.now();
        const remain = wait - (now - last);
        if (remain <= 0) {
          clearTimeout(timer);
          timer = null;
          last = now;
          fn.apply(this, args);
        } else if (!timer) {
          timer = setTimeout(() => {
            last = Date.now();
            timer = null;
            fn.apply(this, args);
          }, remain);
        }
      };
    },

    /* ---------- 日期 ---------- */
    pad2(n) { return n < 10 ? '0' + n : '' + n; },

    /** 格式化时间 HH:MM */
    formatTime(ts) {
      const d = new Date(ts);
      return Utils.pad2(d.getHours()) + ':' + Utils.pad2(d.getMinutes());
    },

    /** 格式化日期 YYYY-MM-DD */
    formatDate(ts) {
      const d = new Date(ts);
      return d.getFullYear() + '-' + Utils.pad2(d.getMonth() + 1) + '-' + Utils.pad2(d.getDate());
    },

    /** 聊天列表时间显示（今天显示时分，昨天显示"昨天"，本周显示周几，更早显示日期） */
    formatChatTime(ts) {
      const d = new Date(ts);
      const now = new Date();
      const isSameDay = d.toDateString() === now.toDateString();
      if (isSameDay) return Utils.formatTime(ts);
      const yest = new Date(now); yest.setDate(now.getDate() - 1);
      if (d.toDateString() === yest.toDateString()) return '昨天';
      const diffDays = (now - d) / (24 * 3600 * 1000);
      if (diffDays < 7) {
        const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return week[d.getDay()];
      }
      return (d.getMonth() + 1) + '/' + d.getDate();
    },

    /** 日期分组标签 */
    formatDateGroup(ts) {
      const d = new Date(ts);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) return '今天';
      const yest = new Date(now); yest.setDate(now.getDate() - 1);
      if (d.toDateString() === yest.toDateString()) return '昨天';
      return Utils.formatDate(ts);
    },

    /** 倒计时天数（参数为日期字符串或时间戳） */
    daysTo(target) {
      const t = typeof target === 'string' ? new Date(target).getTime() : target;
      const now = Date.now();
      return Math.ceil((t - now) / (24 * 3600 * 1000));
    },

    /** 友好的相对时间 */
    fromNow(ts) {
      const diff = (Date.now() - ts) / 1000;
      if (diff < 60) return '刚刚';
      if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
      if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
      if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
      return Utils.formatDate(ts);
    },

    /* ---------- 文本 ---------- */
    /** 截断 */
    truncate(str, n = 20) {
      if (!str) return '';
      return str.length > n ? str.slice(0, n) + '…' : str;
    },

    /** 转义 HTML */
    escape(str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    /** 将文本转成带链接、换行的 HTML（极简版） */
    textToHtml(str) {
      return Utils.escape(str)
        .replace(/\n/g, '<br/>')
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
    },

    /* ---------- ID ---------- */
    /** 生成唯一 ID */
    uid(prefix = 'id') {
      return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    },

    /* ---------- 文件 ---------- */
    /** 读取文件为 base64 */
    fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    /** 下载文本文件 */
    downloadText(filename, text) {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    /* ---------- 缓动滚动 ---------- */
    scrollToBottom(node, smooth = true) {
      node.scrollTo({ top: node.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    },

    /* ---------- 提示（轻量浮层） ---------- */
    toast(msg, duration = 1800) {
      let host = document.getElementById('__toast_host__');
      if (!host) {
        host = document.createElement('div');
        host.id = '__toast_host__';
        host.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;';
        document.body.appendChild(host);
      }
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = `
        background: var(--bg-surface, #fff);
        color: var(--text-primary, #4a4458);
        padding: 12px 20px;
        border-radius: 999px;
        box-shadow: var(--shadow-card, 0 8px 28px rgba(155,143,216,0.16));
        font-size: 14px;
        animation: popIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        border: 1px solid var(--color-primary-ultralight, #ece6fa);
      `;
      host.appendChild(t);
      setTimeout(() => {
        t.style.transition = 'opacity 0.3s, transform 0.3s';
        t.style.opacity = '0';
        t.style.transform = 'scale(0.9)';
        setTimeout(() => t.remove(), 300);
      }, duration);
    },

    /* ---------- 长按检测 ---------- */
    onLongPress(node, handler, duration = 500) {
      let timer = null;
      let startX = 0, startY = 0;
      const start = (e) => {
        const t = e.touches ? e.touches[0] : e;
        startX = t.clientX; startY = t.clientY;
        timer = setTimeout(() => {
          handler(e);
          timer = null;
        }, duration);
      };
      const move = (e) => {
        if (!timer) return;
        const t = e.touches ? e.touches[0] : e;
        if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
          clearTimeout(timer);
          timer = null;
        }
      };
      const end = () => {
        if (timer) { clearTimeout(timer); timer = null; }
      };
      node.addEventListener('touchstart', start, { passive: true });
      node.addEventListener('touchmove', move, { passive: true });
      node.addEventListener('touchend', end);
      node.addEventListener('touchcancel', end);
      node.addEventListener('mousedown', start);
      node.addEventListener('mousemove', move);
      node.addEventListener('mouseup', end);
      node.addEventListener('mouseleave', end);
      return () => {
        node.removeEventListener('touchstart', start);
        node.removeEventListener('touchmove', move);
        node.removeEventListener('touchend', end);
        node.removeEventListener('mousedown', start);
        node.removeEventListener('mousemove', move);
        node.removeEventListener('mouseup', end);
        node.removeEventListener('mouseleave', end);
      };
    },

    /* ---------- 滑动返回（左滑手势） ---------- */
    onSwipeBack(node, handler) {
      let startX = 0, startY = 0, tracking = false;
      node.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        if (t.clientX < 40) {
          tracking = true;
          startX = t.clientX; startY = t.clientY;
        }
      }, { passive: true });
      node.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = Math.abs(t.clientY - startY);
        if (dx > 80 && dy < 50) {
          tracking = false;
          handler();
        }
      }, { passive: true });
      node.addEventListener('touchend', () => { tracking = false; });
    }
  };

  global.Phone = global.Phone || {};
  global.Phone.Utils = Utils;
})(window);
