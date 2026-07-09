/* ============================================================
   icon-library.js — 线条风 SVG 图标库
   所有图标 stroke-width 1.5，禁止填充实心
   挂在 window.Phone.IconLibrary
   ============================================================ */
(function (global) {
  "use strict";

  // 内置图标集合：key -> svg inner
  // 所有图标 viewBox=0 0 24 24，stroke="currentColor" fill="none" stroke-width="1.5"
  const ICONS = {
    // ---------- 状态栏 9 个装饰图标 ----------
    "sb-heart": '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    "sb-cat":    '<path d="M5 9V6l2.5 2M19 9V6l-2.5 2"/><circle cx="9.5" cy="13" r="0.6" fill="currentColor"/><circle cx="14.5" cy="13" r="0.6" fill="currentColor"/><path d="M5 9c0-2 2-3 7-3s7 1 7 3v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V9z"/><path d="M11 16c.5.4 1.5.4 2 0"/>',
    "sb-bear":   '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="13" r="6"/><circle cx="9.5" cy="12" r="0.6" fill="currentColor"/><circle cx="14.5" cy="12" r="0.6" fill="currentColor"/><path d="M11 15.5c.6.4 1.4.4 2 0"/>',
    "sb-paw":    '<circle cx="7.5" cy="9" r="1.5"/><circle cx="12" cy="7.5" r="1.5"/><circle cx="16.5" cy="9" r="1.5"/><circle cx="9" cy="13" r="1.3"/><circle cx="15" cy="13" r="1.3"/><path d="M8 17.5c0-1.7 1.8-3 4-3s4 1.3 4 3-1.8 2.5-4 2.5-4-.8-4-2.5z"/>',
    "sb-smile":  '<circle cx="12" cy="12" r="9"/><path d="M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"/><circle cx="9" cy="10" r="0.6" fill="currentColor"/><circle cx="15" cy="10" r="0.6" fill="currentColor"/>',
    "sb-music":  '<path d="M9 18V6l9-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="15.5" cy="16" r="2.5"/>',
    "sb-star":   '<path d="M12 4l2.2 5 5.3.5-4 3.5 1.2 5.2L12 16.8 7.3 18.2l1.2-5.2-4-3.5 5.3-.5z"/>',
    "sb-moon":   '<path d="M20 13.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 13.5z"/>',
    "sb-paw-big":'<circle cx="6" cy="8" r="1.6"/><circle cx="11" cy="6" r="1.6"/><circle cx="17" cy="8" r="1.6"/><circle cx="8" cy="12.5" r="1.4"/><circle cx="15" cy="12.5" r="1.4"/><path d="M7 18c0-2 2.2-3.5 5-3.5s5 1.5 5 3.5-2.2 3-5 3-5-1-5-3z"/>',

    // ---------- APP 图标（13 个） ----------
    "app-chat":       '<path d="M20 11.5a8 8 0 0 1-11.5 7.2L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"/><path d="M8.5 11.5h7M8.5 14.5h4"/>',
    "app-moments":    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
    "app-settings":   '<circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4"/>',
    "app-gallery":    '<rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4-4 3 3 4-5 3 4"/>',
    "app-characters": '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
    "app-worldbook":  '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M5 4a3 3 0 0 0-3 3v13h3"/><path d="M9 8h7M9 12h7M9 16h4"/>',
    "app-memory":     '<path d="M12 4a6 6 0 0 0-6 6v3l-2 3h16l-2-3v-3a6 6 0 0 0-6-6z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
    "app-wallet":     '<rect x="4" y="6" width="16" height="13" rx="3"/><path d="M4 10h16"/><circle cx="16" cy="14.5" r="1.3" fill="currentColor"/>',
    "app-shop":       '<path d="M5 8h14l-1 11a2 2 0 0 1-2 1.8H8A2 2 0 0 1 6 19L5 8z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    "app-memo":       '<rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    "app-anniversary":'<rect x="4" y="6" width="16" height="14" rx="3"/><path d="M4 10h16M8 4v4M16 4v4"/><path d="M10 15l2-2 2 2-1 3h-2z" fill="currentColor" stroke="none"/>',
    "app-games":      '<rect x="3" y="8" width="18" height="9" rx="4.5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r="0.9" fill="currentColor"/><circle cx="18" cy="13.5" r="0.9" fill="currentColor"/>',
    "app-music":      '<circle cx="6.5" cy="17" r="2.5"/><circle cx="17.5" cy="15" r="2.5"/><path d="M9 17V5l11-2v12"/>',

    // ---------- 通用 UI 图标 ----------
    "chevron-left":  '<path d="M15 5l-7 7 7 7"/>',
    "chevron-right": '<path d="M9 5l7 7-7 7"/>',
    "chevron-down":  '<path d="M5 9l7 7 7-7"/>',
    "chevron-up":    '<path d="M5 15l7-7 7 7"/>',
    "search":        '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    "plus":          '<path d="M12 5v14M5 12h14"/>',
    "close":         '<path d="M6 6l12 12M18 6L6 18"/>',
    "check":         '<path d="M5 12l5 5 9-11"/>',
    "send":          '<path d="M5 12l15-7-7 15-2-6-6-2z"/>',
    "mic":           '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    "image":         '<rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4-4 3 3 4-5 3 4"/>',
    "smile":         '<circle cx="12" cy="12" r="9"/><path d="M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"/><circle cx="9" cy="10" r="0.6" fill="currentColor"/><circle cx="15" cy="10" r="0.6" fill="currentColor"/>',
    "more":          '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
    "more-vertical": '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
    "edit":          '<path d="M5 19l1-4 11-11 3 3-11 11-4 1z"/><path d="M14 7l3 3"/>',
    "trash":         '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
    "play":          '<path d="M7 5l12 7-12 7z"/>',
    "pause":         '<rect x="7" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none"/>',
    "prev":          '<path d="M18 5L8 12l10 7zM6 5v14"/>',
    "next":          '<path d="M6 5l10 7-10 7zM18 5v14"/>',
    "shuffle":       '<path d="M4 7h4l8 10h4M4 17h4l3-4M14 7l3 4M14 7h4M14 7l3-3M14 17h4l-3 3"/>',
    "repeat":        '<path d="M4 9V7a3 3 0 0 1 3-3h11M20 15v2a3 3 0 0 1-3 3H6"/><path d="M16 2l3 2-3 2M8 22l-3-2 3-2"/>',
    "repeat-one":    '<path d="M4 9V7a3 3 0 0 1 3-3h11M20 15v2a3 3 0 0 1-3 3H6"/><path d="M16 2l3 2-3 2M8 22l-3-2 3-2"/><text x="12" y="14" font-size="8" text-anchor="middle" fill="currentColor" stroke="none">1</text>',
    "volume":        '<path d="M5 9h3l5-4v14l-5-4H5z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
    "volume-mute":   '<path d="M5 9h3l5-4v14l-5-4H5z"/><path d="M16 9l5 5M21 9l-5 5"/>',
    "heart":         '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    "heart-fill":    '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" fill="currentColor" stroke="none"/>',
    "comment":       '<path d="M20 11.5a8 8 0 0 1-11.5 7.2L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"/>',
    "share":         '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 11l8-4M8 13l8 4"/>',
    "bell":          '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
    "bell-off":      '<path d="M6 16V11a6 6 0 0 1 9-5M18 13v3l1.5 2H8"/><path d="M11 19a2 2 0 0 0 4 0M4 4l16 16"/>',
    "lock":          '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    "unlock":        '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7-2"/>',
    "backspace":     '<path d="M9 5h11v14H9L3 12z"/><path d="M12 9l5 6M17 9l-5 6"/>',
    "drag":          '<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>',
    "eye":           '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off":       '<path d="M3 3l18 18M10.5 10.7a3 3 0 0 0 4 4M9 5.5A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.8M6 8.5A17 17 0 0 0 2 12s4 7 10 7a10 10 0 0 0 3-.5"/>',
    "gift":          '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M4 13h16M12 9v11"/><path d="M12 9S9 4 7 5s2 4 5 4zM12 9s3-5 5-4-2 4-5 4z"/>',
    "coin":          '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
    "clock":         '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "calendar":      '<rect x="4" y="6" width="16" height="14" rx="3"/><path d="M4 10h16M8 4v4M16 4v4"/>',
    "cloud":         '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1A4 4 0 0 1 17 18z"/>',
    "sun":           '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/>',
    "rain":          '<path d="M7 14a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1A4 4 0 0 1 17 14"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    "snow":          '<path d="M12 4v16M5 8l14 8M19 8L5 16"/>',
    "info":          '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/>',
    "warning":       '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    "refresh":       '<path d="M4 12a8 8 0 0 1 14-5.5L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-14 5.5L4 16M4 20v-4h4"/>',
    "download":      '<path d="M12 4v11M7 11l5 4 5-4M5 20h14"/>',
    "upload":        '<path d="M12 16V5M7 9l5-4 5 4M5 20h14"/>',
    "filter":        '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
    "sort":          '<path d="M7 5v14M7 19l-3-3M7 19l3-3M17 19V5M17 5l-3 3M17 5l3 3"/>',
    "list":          '<path d="M4 7h2M4 12h2M4 17h2M9 7h11M9 12h11M9 17h11"/>',
    "grid":          '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    "tag":           '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/>',
    "pin":           '<path d="M12 3l5 5-2 2-1 5-4 4-1-4-3-1 4-4 1-5z"/>',
    "pin-fill":      '<path d="M12 3l5 5-2 2-1 5-4 4-1-4-3-1 4-4 1-5z" fill="currentColor" stroke="none"/>',
    "circle":        '<circle cx="12" cy="12" r="8"/>',
    "moon":          '<path d="M20 13.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 13.5z"/>',
    "palette":       '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-1-.5-1.5.5-1 1.5-1H18a3 3 0 0 0 3-3c0-5-4-9-9-9z"/><circle cx="7" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="8" r="1" fill="currentColor"/>',
    "user":          '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
    "users":         '<circle cx="9" cy="9" r="3.5"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8" r="2.5"/><path d="M16 13.2A6 6 0 0 1 21 19"/>',
    "phone":         '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M11 18h2"/>',
    "dot":           '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
    "out":           '<path d="M9 5H5v14h4M14 12h7M18 9l3 3-3 3"/>',
    "in":            '<path d="M15 5h4v14h-4M10 12H3M6 9L3 12l3 3"/>',
    "switch":        '<path d="M7 7h13l-3-3M7 7l3 3M17 17H4l3 3M17 17l-3-3"/>',
    "history":       '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4M12 8v4l3 2"/>',
    "copy":          '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    "forward":       '<path d="M4 12l7-7v4h7v6h-7v4z"/>',
    "quote":         '<path d="M9 7c-3 1-4 3-4 6v4h5v-5H7c0-2 1-3 3-4zM19 7c-3 1-4 3-4 6v4h5v-5h-3c0-2 1-3 3-4z"/>',
    "archive":       '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M4 10h16M9 14h6"/>',
    "vip":           '<path d="M3 7l4 5 5-7 5 7 4-5-2 12H5z"/>',
    "dice":          '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    "card-tarot":    '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 7l1.5 3-1.5 3-1.5-3z"/><circle cx="9" cy="16" r="0.7" fill="currentColor"/><circle cx="15" cy="16" r="0.7" fill="currentColor"/>',
    "lyrics":        '<path d="M5 4h14v12H5z"/><path d="M5 16l14 4M9 8h6M9 11h4"/>',
    "playlist":      '<path d="M4 5h12M4 9h12M4 13h8"/><circle cx="17" cy="16" r="3"/><path d="M14 16V6l5-1v10"/>',
    // ---------- 钱包分类图标 ----------
    "utensils":      '<path d="M4 3v7a2 2 0 0 0 2 2h0v9M7 3v9M9 3v7a2 2 0 0 1-2 2M16 3c-1.5 0-2 2-2 4v4h4V7c0-2-.5-4-2-4zM14 11v10"/>',
    "car":           '<path d="M5 13l1.5-5A2 2 0 0 1 8.4 6.6h7.2a2 2 0 0 1 1.9 1.4L19 13M5 13h14M5 13v5h2v-2h10v2h2v-5"/><circle cx="8" cy="16" r="0.6" fill="currentColor"/><circle cx="16" cy="16" r="0.6" fill="currentColor"/>',
    "bag":           '<path d="M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0"/>',
    "gamepad":       '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="15" cy="11" r="0.9" fill="currentColor"/><circle cx="18" cy="14" r="0.9" fill="currentColor"/>',
    "cake":          '<path d="M4 21h16v-7H4zM4 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2M12 7V3"/><circle cx="12" cy="6" r="0.8" fill="currentColor"/>',
    "flower":        '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-3 1-5 0-7-1 2 0 4 0 7zM12 14c0 3-1 5 0 7 1-2 0-4 0-7zM10 12c-3 0-5-1-7 0 2 1 4 0 7 0zM14 12c3 0 5 1 7 0-2-1-4 0-7 0z"/>',

    // ---------- 工具箱小抽屉图标（线条风） ----------
    "sliders":       '<path d="M4 6h9M19 6h1M4 12h2M10 12h10M4 18h6M16 18h4"/><circle cx="16" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="13" cy="18" r="2" fill="currentColor" stroke="none"/>',
    "thermometer":   '<path d="M14 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0z"/><path d="M12 9v6"/>',
    "github":        '<path d="M9 19c-4 1.5-4-2-6-2.5M15 22v-3.6a3 3 0 0 0-.9-2.2c3-.3 6-1.5 6-6.6a5 5 0 0 0-1.4-3.5 4.6 4.6 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.3 12.3 0 0 0-6.4 0C5.6 1.8 4.5 2.1 4.5 2.1A4.6 4.6 0 0 0 4.4 5.6 5 5 0 0 0 3 9.1c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.2V22"/>',
    "cpu":           '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    "file-text":     '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    "command":       '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    "brain":         '<path d="M9.5 4A2.5 2.5 0 0 0 7 6.5 2.5 2.5 0 0 0 5 9a2.5 2.5 0 0 0 1 2 2.5 2.5 0 0 0-1 2 2.5 2.5 0 0 0 2.5 2.5A2 2 0 0 0 12 17V5a1 1 0 0 0-1-1z"/><path d="M14.5 4A2.5 2.5 0 0 1 17 6.5 2.5 2.5 0 0 1 19 9a2.5 2.5 0 0 1-1 2 2.5 2.5 0 0 1 1 2 2.5 2.5 0 0 1-2.5 2.5A2 2 0 0 1 12 17"/>',
    "tool":          '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a2 2 0 0 0 2.8 2.8l6-6a4 4 0 0 0 5.4-5.4l-2.7 2.7-2.1-2.1z"/>',
    "eraser":        '<path d="M5 14l6-6 7 7-5 5H8z"/><path d="M11 8l7 7M3 21h18"/>',
    "square":        '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    "alert-circle":  '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16v.5"/>',
    "stop":          '<rect x="6" y="6" width="12" height="12"/>',
    "star-fill":     '<path d="M12 4l2.2 5 5.3.5-4 3.5 1.2 5.2L12 16.8 7.3 18.2l1.2-5.2-4-3.5 5.3-.5z" fill="currentColor" stroke="none"/>',
    "external-link": '<path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/><path d="M14 4h6v6M20 4l-8 8"/>',
    "x":             '<path d="M6 6l12 12M18 6L6 18"/>',
  };

  /**
   * 渲染 SVG 图标
   * @param {string} key 图标 key
   * @param {object} opts { size, strokeWidth, color, className }
   */
  function get(key, opts) {
    opts = opts || {};
    const size = opts.size || 24;
    const sw = opts.strokeWidth || 1.5;
    const cls = opts.className ? ' class="' + opts.className + '"' : "";
    const colorStyle = opts.color ? ' style="color:' + opts.color + '"' : "";
    const inner = ICONS[key] || ICONS["dot"];
    return '<svg' + cls + colorStyle +
      ' viewBox="0 0 24 24" width="' + size + '" height="' + size +
      '" fill="none" stroke="currentColor" stroke-width="' + sw +
      '" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      inner + '</svg>';
  }

  // 创建 SVG 元素节点
  function create(key, opts) {
    const wrap = document.createElement("template");
    wrap.innerHTML = get(key, opts).trim();
    return wrap.content.firstChild;
  }

  // 列出所有 key
  function list() { return Object.keys(ICONS); }

  // 状态栏装饰图标 key 列表
  const STATUS_BAR_ICONS = [
    "sb-heart", "sb-cat", "sb-bear", "sb-paw", "sb-smile",
    "sb-music", "sb-star", "sb-moon", "sb-paw-big"
  ];

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.IconLibrary = {
    get, create, list,
    ICONS: ICONS,
    STATUS_BAR_ICONS: STATUS_BAR_ICONS,
    has: (k) => !!ICONS[k],
  };
})(window);
