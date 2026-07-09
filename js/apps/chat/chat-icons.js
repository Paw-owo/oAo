/* ============================================================
 * chat-icons.js — 消息APP SVG 图标集合
 * 严格对齐预览稿 v4 中的所有 SVG 路径
 * 全部线条图标 stroke-width:1.5 fill:none
 * 挂在 window.Phone.ChatIcons
 * ============================================================ */
(function (global) {
  "use strict";

  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>',
    plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
    close: '<path d="M6 6l12 12"></path><path d="M18 6 6 18"></path>',
    "chevron-left": '<path d="M15 18l-6-6 6-6"></path>',
    "chevron-right": '<path d="M9 6l6 6-6 6"></path>',
    heart: '<path d="M12 21c4-3.2 7-6 7-10a4 4 0 0 0-7-2.5A4 4 0 0 0 5 11c0 4 3 6.8 7 10z"></path>',
    more: '<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>',
    refresh: '<path d="M4 12a8 8 0 1 0 2.34-5.66"></path><path d="M4 4v6h6"></path>',
    volume: '<path d="M11 5 6 9H3v6h3l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path>',
    copy: '<rect x="9" y="9" width="10" height="10" rx="2"></rect><rect x="5" y="5" width="10" height="10" rx="2"></rect>',
    send: '<path d="M5 12h11"></path><path d="M13 6l6 6-6 6"></path>',
    smile: '<circle cx="12" cy="12" r="7"></circle><path d="M9 10h.01"></path><path d="M15 10h.01"></path><path d="M8.5 14c1 1 2.1 1.5 3.5 1.5s2.5-.5 3.5-1.5"></path>',
    mcp: '<rect x="5" y="5" width="14" height="14" rx="5"></rect><path d="M9 9h6"></path><path d="M9 12h6"></path><path d="M9 15h3"></path>',
    emoji: '<circle cx="9" cy="10" r="2.5"></circle><circle cx="15" cy="10" r="2.5"></circle><path d="M7 16c1.5 1.2 3 1.8 5 1.8s3.5-.6 5-1.8"></path>',
    image: '<rect x="4" y="6" width="16" height="12" rx="4"></rect><path d="M8 14l2-2 3 3 2-2 2 2"></path><circle cx="9" cy="10" r="1"></circle>',
    file: '<path d="M14 4H8a2 2 0 0 0-2 2v12l3-2 3 2 3-2 3 2V6z"></path><path d="M10 9h4"></path>',
    voice: '<path d="M12 17a5 5 0 0 0 5-5V8a5 5 0 0 0-10 0v4a5 5 0 0 0 5 5z"></path><path d="M12 17v3"></path><path d="M9 20h6"></path>',
    context: '<path d="M5 8h14"></path><path d="M5 12h9"></path><path d="M5 16h6"></path>',
    temperature: '<path d="M6 15a6 6 0 0 1 12 0"></path><path d="M12 9v6"></path><path d="M14.5 6h3.5"></path>',
    clear: '<path d="M6 12h12"></path><path d="M9 8l-4 4 4 4"></path><path d="M15 8l4 4-4 4"></path>',
    slash: '<path d="M8 9h8"></path><path d="M8 13h5"></path><path d="M8 17h3"></path><path d="M6 4h12a2 2 0 0 1 2 2v10l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z"></path>',
    github: '<path d="M9 18c-4 1.3-4-2.2-6-2.8"></path><path d="M15 21v-3.5a3 3 0 0 0-.8-2.3c2.8 0 5.6-1.4 5.6-6.4a5 5 0 0 0-1.4-3.4 4.6 4.6 0 0 0-.1-3.3s-1.1-.4-3.6 1.3a12 12 0 0 0-6.4 0C5.4 1 4.3 1.4 4.3 1.4a4.6 4.6 0 0 0-.1 3.3A5 5 0 0 0 2.8 8c0 5 2.8 6.4 5.6 6.4A3 3 0 0 0 7.6 16.5V21"></path>',
    cot: '<rect x="5" y="5" width="14" height="14" rx="5"></rect><path d="M9 10h6"></path><path d="M9 14h4"></path><path d="M9 17h3"></path>',
    model: '<rect x="5" y="5" width="14" height="14" rx="4"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path>',
    edit: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
    forward: '<path d="M15 17l5-5-5-5"></path><path d="M4 18v-2a4 4 0 0 1 4-4h11"></path>',
    quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M14 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"></path>',
    trash: '<path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
    "msg-empty": '<path d="M16 30a10 10 0 0 1 10-10h44a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H38l-14 12v-12h-2a6 6 0 0 1-6-6V30z"></path><path d="M34 41h28M34 50h20"></path>',
  };

  function get(name, size) {
    var path = ICONS[name];
    if (!path) return "";
    var s = size || 16;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '">' + path + "</svg>";
  }

  global.Phone = global.Phone || {};
  global.Phone.ChatIcons = { get: get, ICONS: ICONS };
})(window);
