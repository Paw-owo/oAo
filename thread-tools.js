// apps/chat/thread-tools.js
// imports:
//   from '../../core/ui.js': showBottomSheet, hideBottomSheet, showToast
//   from '../../core/storage.js': getData, setData
//   from './thread-sheets.js': openTransferSheet, openClearContextSheet, openMcpSheet
//   from './thread-relationship.js': openRelationshipLockSheet
//   from './thread-actions.js': sendDiceMessage, sendRpsMessage

import { showBottomSheet, hideBottomSheet, showToast } from '../../core/ui.js';
import { getData, setData } from '../../core/storage.js';
import { openTransferSheet, openClearContextSheet, openMcpSheet } from './thread-sheets.js';
import { openRelationshipLockSheet } from './thread-relationship.js';
import { sendDiceMessage, sendRpsMessage } from './thread-actions.js';
import { openGithubToolSheet } from './github-tool.js';

const STYLE_ID = 'thread-tools-style-v2';

// ═══════════════════════════════════════
// 【工具分组】3 组 10 个工具
// ═══════════════════════════════════════

const TOOL_GROUPS = [
  {
    label: '一起玩',
    tools: [
      { id: 'dice', title: '骰子', icon: 'dice' },
      { id: 'rps', title: '猜拳', icon: 'rps' },
      { id: 'task', title: '小任务', icon: 'task' },
      { id: 'quiz', title: '默契问答', icon: 'quiz' },
    ]
  },
  {
    label: '日常',
    tools: [
      { id: 'quickReply', title: '快捷回复', icon: 'chat' },
      { id: 'transfer', title: '转账', icon: 'transfer' },
      { id: 'phone', title: '电话', icon: 'phone' },
    ]
  },
  {
    label: '管理',
    tools: [
      { id: 'clearCtx', title: '清上下文', icon: 'clean' },
      { id: 'relLock', title: '关系锁', icon: 'lock' },
      { id: 'mcp', title: 'MCP', icon: 'mcp' },
      { id: 'github', title: 'GitHub', icon: 'github' },
    ]
  }
];

// ═══════════════════════════════════════
// 【可爱小贴纸 SVG 图标】圆润块面 + 描边，currentColor 半透明块面
//   - viewBox 0 0 16 16，内容占约 72-78%，stroke-linecap/linejoin=round
//   - 颜色只用 currentColor + opacity，不硬编码，日间/夜间通用
// ═══════════════════════════════════════

const TOOL_ICONS = {
  // 快捷回复：圆润小气泡，尾巴朝下
  chat: '<path d="M2.5 4.5C2.5 3.4 3.4 2.5 4.5 2.5H11.5C12.6 2.5 13.5 3.4 13.5 4.5V8.5C13.5 9.6 12.6 10.5 11.5 10.5H7L4.2 13C3.8 13.3 3.3 13 3.3 12.5V10.5C2.8 10.4 2.5 9.9 2.5 9.5V4.5Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="6.5" r="0.9" fill="currentColor"/><circle cx="8" cy="6.5" r="0.9" fill="currentColor"/><circle cx="10" cy="6.5" r="0.9" fill="currentColor"/>',
  // 小任务：剪贴板 + 勾选
  task: '<rect x="3" y="2.8" width="10" height="11.2" rx="2.6" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="5.5" y="1.8" width="5" height="2.4" rx="1.2" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 8.2L7 9.7L10.3 6.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  // 默契问答：两个小气泡叠在一起 + 问号
  quiz: '<path d="M2.2 7.5C2.2 6.7 2.9 6 3.7 6H7C7.8 6 8.5 6.7 8.5 7.5V10C8.5 10.8 7.8 11.5 7 11.5H4.8L2.8 13V11.3C2.4 11.1 2.2 10.7 2.2 10.3V7.5Z" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 4.2C8 3.3 8.8 2.5 9.8 2.5H12.5C13.4 2.5 14.2 3.3 14.2 4.2V6.5C14.2 7.4 13.4 8.2 12.5 8.2H11L9.2 9.5V8.1C8.5 7.8 8 7.2 8 6.5V4.2Z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.6 4.3C10.2 4.3 9.9 4.6 9.9 5C9.9 5.4 10.2 5.7 10.6 5.7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="10.8" cy="6.7" r="0.5" fill="currentColor"/>',
  // 转账：圆润钱币 + ¥
  transfer: '<circle cx="8" cy="8" r="6" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.6 5.8L8 8.2L10.4 5.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 8.2V11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6.2 6.6H9.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6.2 9.4H9.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  // 电话：圆润听筒
  phone: '<path d="M3 2.8C3 2.2 3.4 1.8 4 1.8H5.8C6.3 1.8 6.7 2.1 6.8 2.6L7.5 5.2C7.6 5.6 7.4 6 7.1 6.3L5.9 7.3C6.7 9.2 8.2 10.7 10.1 11.5L11.1 10.3C11.4 10 11.8 9.8 12.2 9.9L14.8 10.6C15.3 10.7 15.6 11.1 15.6 11.6V13.4C15.6 14 15.2 14.4 14.6 14.4C8 14.4 3 9.4 3 2.8Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  // 骰子：圆润方块 + 五点
  dice: '<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="3.4" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5.2" cy="5.2" r="1.15" fill="currentColor"/><circle cx="10.8" cy="5.2" r="1.15" fill="currentColor"/><circle cx="8" cy="8" r="1.15" fill="currentColor"/><circle cx="5.2" cy="10.8" r="1.15" fill="currentColor"/><circle cx="10.8" cy="10.8" r="1.15" fill="currentColor"/>',
  // 猜拳：圆润石头拳头
  rps: '<path d="M4.5 7.5C4.5 6 5.7 4.8 7.2 4.8H9.5C11 4.8 12.2 6 12.2 7.5V10C12.2 12.2 10.4 14 8.2 14C6 14 4.2 12.2 4.2 10V7.5Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.3 7.2V6.2C6.3 5.7 6.7 5.3 7.2 5.3C7.7 5.3 8.1 5.7 8.1 6.2V7.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 7.2V5.8C8.5 5.3 8.9 4.9 9.4 4.9C9.9 4.9 10.3 5.3 10.3 5.8V7.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  // 清上下文：软橡皮擦
  clean: '<path d="M3 9.5L6.5 6L11.5 11L9.5 13H5.5L3 10.5Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 6L9 3L13 7L11 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 10.5L5.5 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 8.5L8.5 10.5" fill="none" stroke="currentColor" opacity="0.5" stroke-width="1.4" stroke-linecap="round"/>',
  // 关系锁：爱心锁
  lock: '<path d="M8 12.8L4.6 9.4C3.2 8 3.2 5.8 4.6 4.4C6 3 8.2 3 9.6 4.4L8 6L6.4 4.4C5.6 3.6 4.4 3.6 3.6 4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/><path d="M8 12.8L11.4 9.4C12.8 8 12.8 5.8 11.4 4.4C10 3 7.8 3 6.4 4.4L8 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 8.5H11.5V13.5C11.5 14 11.1 14.4 10.6 14.4H5.4C4.9 14.4 4.5 14 4.5 13.5V8.5Z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="10.8" r="1.1" fill="currentColor"/><path d="M8 11.9V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  // MCP：连接节点 + 小插头
  mcp: '<circle cx="4" cy="4" r="2" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="4" r="2" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="12" r="2.2" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 6V8.5C4 9.3 4.7 10 5.5 10H6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 6V8.5C12 9.3 11.3 10 10.5 10H9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  // GitHub：代码猫头（猫耳 + 圆脸 + 代码括号）
  github: '<path d="M3 7C3 4.2 5.2 2 8 2C10.8 2 13 4.2 13 7V10C13 11.1 12.1 12 11 12H8.5L6.5 13.5V12H5C3.9 12 3 11.1 3 10V7Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 2.5L4 1.2L5.2 3.2" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 2.5L12 1.2L10.8 3.2" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.3 7.5L5 9L6.3 10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.7 7.5L11 9L9.7 10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
};

// ═══════════════════════════════════════
// 【CSS 注入】
// ═══════════════════════════════════════

function injectStyle() {
  var old = document.getElementById(STYLE_ID);
  if (old) old.remove();

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .tools-container{display:flex;flex-direction:column;min-height:0;max-height:min(52vh,420px);overflow:hidden}
    .tools-scroll{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 4px 8px}
    .tools-pager-wrap{display:flex;flex-direction:column;min-height:0;flex:1;gap:4px}
    .tools-pager{display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;flex:1;min-height:0;scrollbar-width:none}
    .tools-pager::-webkit-scrollbar{display:none}
    .tools-page{flex:0 0 100%;width:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 4px 4px}
    .tools-dots{display:flex;justify-content:center;align-items:center;gap:6px;padding:8px 0 2px;flex:0 0 auto}
    .tools-dot{width:6px;height:6px;border-radius:999px;background:var(--text-hint);opacity:0.4;transition:all 250ms ease;cursor:pointer;border:none;padding:0}
    .tools-dot.active{width:18px;background:var(--accent);opacity:1}
    .tools-section-label{display:flex;align-items:center;gap:8px;margin:14px 0 10px;padding:0 4px;font-size:12px;font-weight:600;color:var(--text-hint);letter-spacing:0.04em}
    .tools-section-label::after{content:"";flex:1;height:1px;background:var(--surface-muted);border-radius:999px}
    .tools-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:0 4px}
    .tool-cell{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:12px 4px 10px;border:none;outline:none;border-radius:var(--radius-lg);background:transparent;cursor:pointer;transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);-webkit-tap-highlight-color:transparent;user-select:none}
    .tool-cell:active{transform:scale(0.9)}
    .tool-icon-wrap{width:42px;height:42px;display:flex;align-items:center;justify-content:center;color:var(--accent);background:var(--surface-muted);border-radius:var(--radius-md);padding:3px;box-shadow:var(--shadow-sm);transition:all 0.2s ease}
    .tool-cell:active .tool-icon-wrap{transform:scale(0.92)}
    .tool-icon-wrap svg{width:100%;height:100%}
    .tool-name{font-size:11px;font-weight:500;color:var(--text-secondary);line-height:1.2;text-align:center;white-space:nowrap}
    .tools-detail-wrap{display:flex;flex-direction:column;gap:14px;padding:4px 4px 8px;animation:toolsFadeIn 200ms ease both}
    .tools-detail-header{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;margin-bottom:4px}
    .tools-back-btn{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border:none;outline:none;border-radius:var(--radius-md);background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm);transition:all 200ms ease}
    .tools-back-btn:active{transform:scale(0.92)}
    .tools-back-btn svg{width:18px;height:18px}
    .tools-detail-title{min-width:0;color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .tools-detail-spacer{width:38px;height:38px}
    .tools-option-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .tools-option-btn{min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px;border:none;outline:none;border-radius:var(--radius-lg);background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);cursor:pointer;transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);-webkit-tap-highlight-color:transparent;font-family:inherit;text-align:center}
    .tools-option-btn:active{transform:scale(0.94)}
    .tools-option-icon{width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--accent)}
    .tools-option-icon svg{width:100%;height:100%}
    .tools-option-label{font-size:13px;font-weight:600;color:var(--text-primary)}
    .tools-option-sub{font-size:11px;color:var(--text-hint)}
    .tools-stat-row{display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 14px;border-radius:var(--radius-lg);background:var(--surface-muted);box-shadow:var(--shadow-sm)}
    .tools-stat-item{display:flex;flex-direction:column;align-items:center;gap:2px}
    .tools-stat-num{font-size:18px;font-weight:700;color:var(--text-primary)}
    .tools-stat-label{font-size:11px;color:var(--text-hint)}
    .tools-stat-divider{width:1px;height:24px;background:var(--bg-hover)}
    .tools-chip-list{display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
    .tools-chip{display:flex;align-items:center;gap:8px;padding:12px 14px;border:none;outline:none;border-radius:var(--radius-lg);background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);cursor:pointer;transition:all 0.2s ease;font-family:inherit;font-size:14px;text-align:left;-webkit-tap-highlight-color:transparent}
    .tools-chip:active{transform:scale(0.97)}
    .tools-chip-text{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .tools-chip-del{width:26px;height:26px;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:999px;background:transparent;color:var(--text-hint);cursor:pointer;transition:all 0.2s ease}
    .tools-chip-del:active{transform:scale(0.85)}
    .tools-input-row{display:flex;gap:8px;margin-top:4px}
    .tools-input{flex:1;padding:0 12px;min-height:44px;border:none;outline:none;border-radius:var(--radius-md);background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);font-family:inherit;font-size:14px;line-height:1.5;-webkit-appearance:none;appearance:none}
    .tools-send-btn{padding:0 16px;min-height:44px;border:none;outline:none;border-radius:var(--radius-md);background:var(--accent);color:var(--bubble-user-text);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s ease}
    .tools-send-btn:active{transform:scale(0.95)}
    .tools-empty{padding:20px 12px;border-radius:var(--radius-lg);background:var(--surface-muted);color:var(--text-hint);font-size:13px;line-height:1.6;text-align:center}
    .tools-section-title{font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:2px}
    .tools-section-desc{font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px}
    @keyframes toolsFadeIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
    @media(max-width:430px){.tools-option-grid{grid-template-columns:repeat(2,1fr)}}
    @media(prefers-reduced-motion:reduce){.tool-cell,.tool-icon-wrap,.tools-option-btn,.tools-chip,.tools-back-btn,.tools-send-btn{transition:none}.tools-detail-wrap{animation:none}}
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════
// 【图标创建】
// ═══════════════════════════════════════

function createToolIcon(type) {
  var wrap = document.createElement('div');
  wrap.className = 'tool-icon-wrap';
  wrap.innerHTML = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' + (TOOL_ICONS[type] || TOOL_ICONS.chat) + '</svg>';
  return wrap;
}

function createBackIcon() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M15 18l-6-6 6-6');
  svg.appendChild(path);
  return svg;
}

// ═══════════════════════════════════════
// 【宫格创建】导出给 thread-panels.js
// ═══════════════════════════════════════

export function createThreadToolsGrid(state, options = {}) {
  injectStyle();

  var container = document.createElement('div');
  container.className = 'tools-container';

  function showGrid() {
    container.replaceChildren(buildGridView(state, options, showDetail));
  }

  function showDetail(title, detailEl) {
    container.replaceChildren(buildDetailView(title, detailEl, showGrid));
  }

  showGrid();
  return container;
}

function buildGridView(state, options, showDetail) {
  var wrap = document.createElement('div');
  wrap.className = 'tools-pager-wrap';

  var pager = document.createElement('div');
  pager.className = 'tools-pager';

  // 两页：第一页=一起玩+日常（常用类），第二页=管理（代码类，GitHub 在此）
  var pages = [
    { groups: [TOOL_GROUPS[0], TOOL_GROUPS[1]] },
    { groups: [TOOL_GROUPS[2]] }
  ];

  pages.forEach(function(page) {
    var pageEl = document.createElement('div');
    pageEl.className = 'tools-page';

    page.groups.forEach(function(group) {
      var label = document.createElement('div');
      label.className = 'tools-section-label';
      label.textContent = group.label;
      pageEl.appendChild(label);

      var grid = document.createElement('div');
      grid.className = 'tools-grid';

      group.tools.forEach(function(tool) {
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'tool-cell';
        cell.appendChild(createToolIcon(tool.icon));

        var name = document.createElement('div');
        name.className = 'tool-name';
        name.textContent = tool.title;
        cell.appendChild(name);

        cell.addEventListener('click', async function() {
          await handleToolClick(tool.id, state, options, showDetail);
        });

        grid.appendChild(cell);
      });

      pageEl.appendChild(grid);
    });

    pager.appendChild(pageEl);
  });

  wrap.appendChild(pager);

  // 页码圆点指示器
  var dots = document.createElement('div');
  dots.className = 'tools-dots';
  for (var i = 0; i < pages.length; i++) {
    (function(idx) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'tools-dot' + (idx === 0 ? ' active' : '');
      dot.setAttribute('aria-label', '第' + (idx + 1) + '页');
      dot.addEventListener('click', function() {
        pager.scrollTo({ left: idx * pager.clientWidth, behavior: 'smooth' });
      });
      dots.appendChild(dot);
    })(i);
  }
  wrap.appendChild(dots);

  // 滑动同步圆点
  var dotEls = dots.querySelectorAll('.tools-dot');
  var ticking = false;
  pager.addEventListener('scroll', function() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      var idx = Math.round(pager.scrollLeft / pager.clientWidth);
      dotEls.forEach(function(d, i) { d.classList.toggle('active', i === idx); });
      ticking = false;
    });
  });

  return wrap;
}

function buildDetailView(title, contentEl, onBack) {
  var wrap = document.createElement('div');
  wrap.className = 'tools-detail-wrap';

  var header = document.createElement('div');
  header.className = 'tools-detail-header';

  var back = document.createElement('button');
  back.type = 'button';
  back.className = 'tools-back-btn';
  back.setAttribute('aria-label', '返回');
  back.appendChild(createBackIcon());
  back.addEventListener('click', onBack);

  var titleEl = document.createElement('div');
  titleEl.className = 'tools-detail-title';
  titleEl.textContent = title;

  var spacer = document.createElement('div');
  spacer.className = 'tools-detail-spacer';

  header.append(back, titleEl, spacer);
  wrap.append(header, contentEl);
  return wrap;
}

// ═══════════════════════════════════════
// 【工具点击分发】
// ═══════════════════════════════════════

async function handleToolClick(toolId, state, options, showDetail) {
  switch (toolId) {
    case 'dice':
      showDetail('骰子', buildDiceDetail(state, options));
      break;
    case 'rps':
      showDetail('猜拳', buildRpsDetail(state, options));
      break;
    case 'quickReply':
      showDetail('快捷回复', buildQuickReplyDetail(state, options));
      break;
    case 'task':
      showDetail('小任务', buildTaskDetail(state, options));
      break;
    case 'quiz':
      showDetail('默契问答', buildQuizDetail(state, options));
      break;
    case 'transfer':
      closeToolsSheet(options);
      openTransferSheet(state, options);
      break;
    case 'phone':
      closeToolsSheet(options);
      if (typeof options?.onPick === 'function') {
        options.onPick({ id: 'phone' });
      }
      break;
    case 'clearCtx':
      closeToolsSheet(options);
      openClearContextSheet(state, options);
      break;
    case 'relLock':
      closeToolsSheet(options);
      openRelationshipLockSheet(state, options);
      break;
    case 'mcp':
      closeToolsSheet(options);
      openMcpSheet(state, options);
      break;
    case 'github':
      closeToolsSheet(options);
      openGithubToolSheet();
      break;
    default:
      break;
  }
}

// ═══════════════════════════════════════
// 【通用辅助】关闭抽屉、发送消息
// ═══════════════════════════════════════

function closeToolsSheet(options) {
  if (typeof options?.onClose === 'function') {
    options.onClose();
  } else {
    hideBottomSheet();
  }
}

async function sendMessageToChat(text, options) {
  if (typeof options?.onSend === 'function') {
    await options.onSend(text);
  }
}

// ═══════════════════════════════════════
// 【存储辅助】按角色 ID 存取
// ═══════════════════════════════════════

function getCharacterId(state) {
  return state?.characterId || '';
}

function getQuickReplies(state) {
  var id = getCharacterId(state);
  return getData('chat_' + id + '_quick_replies') || [
    '在忙吗~',
    '想你了',
    '晚安',
    '今天辛苦啦',
  ];
}

function saveQuickReplies(state, replies) {
  setData('chat_' + getCharacterId(state) + '_quick_replies', replies);
}

function getRpsRecord(state) {
  return getData('chat_' + getCharacterId(state) + '_rps_record') || { wins: 0, losses: 0, draws: 0 };
}

function saveRpsRecord(state, record) {
  setData('chat_' + getCharacterId(state) + '_rps_record', record);
}

function getTaskList(state) {
  return getData('chat_' + getCharacterId(state) + '_task_list') || [];
}

function saveTaskList(state, tasks) {
  setData('chat_' + getCharacterId(state) + '_task_list', tasks);
}

function getQuizScore(state) {
  return getData('chat_' + getCharacterId(state) + '_quiz_score') || { correct: 0, total: 0 };
}

function saveQuizScore(state, score) {
  setData('chat_' + getCharacterId(state) + '_quiz_score', score);
}
// ═══════════════════════════════════════
// 【骰子详情】选择面数后直接发送
// ═══════════════════════════════════════

function buildDiceDetail(state, options) {
  var wrap = document.createElement('div');

  var desc = document.createElement('div');
  desc.className = 'tools-section-desc';
  desc.textContent = '选一个面数，掷出去看看运气~';
  wrap.appendChild(desc);

  var grid = document.createElement('div');
  grid.className = 'tools-option-grid';

  var diceTypes = [
    { sides: 6, label: 'D6', sub: '经典骰子' },
    { sides: 20, label: 'D20', sub: '跑团骰子' },
    { sides: 100, label: 'D100', sub: '百分骰子' },
  ];

  diceTypes.forEach(function(d) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tools-option-btn';

    var icon = document.createElement('div');
    icon.className = 'tools-option-icon';
    icon.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>';

    var label = document.createElement('div');
    label.className = 'tools-option-label';
    label.textContent = d.label;

    var sub = document.createElement('div');
    sub.className = 'tools-option-sub';
    sub.textContent = d.sub;

    btn.append(icon, label, sub);
    btn.addEventListener('click', async function() {
      closeToolsSheet(options);
      await sendDiceMessage(state, { sides: d.sides, triggerAI: true });
      if (typeof state?.reloadAndRender === 'function') {
        await state.reloadAndRender();
      }
    });

    grid.appendChild(btn);
  });

  wrap.appendChild(grid);
  return wrap;
}

// ═══════════════════════════════════════
// 【猜拳详情】胜负记录 + 出手
// ═══════════════════════════════════════

function computeRpsOutcome(userChoice, aiChoice) {
  if (userChoice === aiChoice) return 'draw';
  if (
    (userChoice === 'rock' && aiChoice === 'scissors') ||
    (userChoice === 'scissors' && aiChoice === 'paper') ||
    (userChoice === 'paper' && aiChoice === 'rock')
  ) return 'win';
  return 'lose';
}

function buildRpsDetail(state, options) {
  var wrap = document.createElement('div');

  var record = getRpsRecord(state);

  var statRow = document.createElement('div');
  statRow.className = 'tools-stat-row';

  var stats = [
    { num: record.wins || 0, label: '胜' },
    { num: record.losses || 0, label: '负' },
    { num: record.draws || 0, label: '平' },
  ];

  stats.forEach(function(stat, index) {
    if (index > 0) {
      var divider = document.createElement('div');
      divider.className = 'tools-stat-divider';
      statRow.appendChild(divider);
    }
    var item = document.createElement('div');
    item.className = 'tools-stat-item';
    item.append(
      createText('div', 'tools-stat-num', String(stat.num)),
      createText('div', 'tools-stat-label', stat.label)
    );
    statRow.appendChild(item);
  });

  wrap.appendChild(statRow);

  var desc = document.createElement('div');
  desc.className = 'tools-section-desc';
  desc.style.marginTop = '12px';
  desc.textContent = '出招吧~';
  wrap.appendChild(desc);

  var grid = document.createElement('div');
  grid.className = 'tools-option-grid';

  var choices = [
    { choice: 'rock', label: '石头', svg: '<path d="M7 11c0-2 1.3-3.5 3-3.5h3.5c2 0 3.5 1.5 3.5 3.5v2.5c0 2.8-2.2 5-5 5s-5-2.2-5-5V11Z" fill="none" stroke="currentColor" stroke-width="2.5"/>' },
    { choice: 'paper', label: '布', svg: '<path d="M6 12V7.5a1.5 1.5 0 0 1 3 0V12M9 12V5.5a1.5 1.5 0 0 1 3 0V12M12 12V6.5a1.5 1.5 0 0 1 3 0V12M15 12V8.5a1.5 1.5 0 0 1 3 0v5c0 3-2.3 5.5-6 5.5-3.2 0-6-2.2-6-5.5V12" fill="none" stroke="currentColor" stroke-width="2.5"/>' },
    { choice: 'scissors', label: '剪刀', svg: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="6" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="6" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2.5"/>' },
  ];

  choices.forEach(function(c) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tools-option-btn';

    var icon = document.createElement('div');
    icon.className = 'tools-option-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + c.svg + '</svg>';

    var label = document.createElement('div');
    label.className = 'tools-option-label';
    label.textContent = c.label;

    btn.append(icon, label);
    btn.addEventListener('click', async function() {
      // 先生成 AI 的随机出手，算出胜负
      var aiChoices = ['rock', 'paper', 'scissors'];
      var aiChoice = aiChoices[Math.floor(Math.random() * 3)];
      var outcome = computeRpsOutcome(c.choice, aiChoice);

      // 更新胜负记录
      var rec = getRpsRecord(state);
      if (outcome === 'win') rec.wins = (rec.wins || 0) + 1;
      else if (outcome === 'lose') rec.losses = (rec.losses || 0) + 1;
      else rec.draws = (rec.draws || 0) + 1;
      saveRpsRecord(state, rec);

      closeToolsSheet(options);
      await sendRpsMessage(state, {
        choice: c.choice,
        opponentChoice: aiChoice,
        triggerAI: true
      });

      if (typeof state?.reloadAndRender === 'function') {
        await state.reloadAndRender();
      }
    });

    grid.appendChild(btn);
  });

  wrap.appendChild(grid);
  return wrap;
}

// ═══════════════════════════════════════
// 【快捷回复】自定义常用语
// ═══════════════════════════════════════

function buildQuickReplyDetail(state, options) {
  var wrap = document.createElement('div');

  var replies = getQuickReplies(state);

  var list = document.createElement('div');
  list.className = 'tools-chip-list';

  function renderList() {
    list.replaceChildren();
    var current = getQuickReplies(state);

    if (!current.length) {
      var empty = document.createElement('div');
      empty.className = 'tools-empty';
      empty.textContent = '还没有常用语，下面加几句吧~';
      list.appendChild(empty);
      return;
    }

    current.forEach(function(text, index) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tools-chip';

      var chipText = document.createElement('span');
      chipText.className = 'tools-chip-text';
      chipText.textContent = text;

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'tools-chip-del';
      del.setAttribute('aria-label', '删除');
      del.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      del.addEventListener('click', function(e) {
        e.stopPropagation();
        var updated = getQuickReplies(state).filter(function(_, i) { return i !== index; });
        saveQuickReplies(state, updated);
        renderList();
      });

      chip.append(chipText, del);
      chip.addEventListener('click', async function() {
        closeToolsSheet(options);
        await sendMessageToChat(text, options);
      });
      list.appendChild(chip);
    });
  }

  renderList();
  wrap.appendChild(list);

  var inputRow = document.createElement('div');
  inputRow.className = 'tools-input-row';

  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'tools-input';
  input.placeholder = '加一句常用语...';
  input.maxLength = 50;

  var addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'tools-send-btn';
  addBtn.textContent = '添加';
  addBtn.addEventListener('click', function() {
    var val = input.value.trim();
    if (!val) return;
    var current = getQuickReplies(state);
    current.push(val);
    saveQuickReplies(state, current);
    input.value = '';
    renderList();
    showToast('加好啦');
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBtn.click();
    }
  });

  inputRow.append(input, addBtn);
  wrap.appendChild(inputRow);

  return wrap;
}

// ═══════════════════════════════════════
// 【小任务】预设 + 自定义 + 完成状态
// ═══════════════════════════════════════

function buildTaskDetail(state, options) {
  var wrap = document.createElement('div');

  var tasks = getTaskList(state);
  var pendingTasks = tasks.filter(function(t) { return !t.done; });

  // 未完成任务
  if (pendingTasks.length) {
    var taskTitle = document.createElement('div');
    taskTitle.className = 'tools-section-title';
    taskTitle.textContent = '进行中';
    wrap.appendChild(taskTitle);

    var taskList = document.createElement('div');
    taskList.className = 'tools-chip-list';
    taskList.style.marginBottom = '14px';

    pendingTasks.forEach(function(task) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tools-chip';

      var chipText = document.createElement('span');
      chipText.className = 'tools-chip-text';
      chipText.textContent = task.text;

      var doneBtn = document.createElement('button');
      doneBtn.type = 'button';
      doneBtn.className = 'tools-chip-del';
      doneBtn.setAttribute('aria-label', '标记完成');
      doneBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l4 4L19 6"/></svg>';
      doneBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var all = getTaskList(state);
        var idx = all.findIndex(function(t) { return t.id === task.id; });
        if (idx >= 0) {
          all[idx].done = true;
          all[idx].completedAt = Date.now();
          saveTaskList(state, all);
          showToast('完成啦~');
          var newWrap = buildTaskDetail(state, options);
          wrap.replaceWith(newWrap);
        }
      });

      chip.append(chipText, doneBtn);
      taskList.appendChild(chip);
    });

    wrap.appendChild(taskList);
  }

  // 预设任务
  var presetTitle = document.createElement('div');
  presetTitle.className = 'tools-section-title';
  presetTitle.textContent = '快速派发';
  wrap.appendChild(presetTitle);

  var desc = document.createElement('div');
  desc.className = 'tools-section-desc';
  desc.textContent = '点一下就把任务交给 TA 啦';
  wrap.appendChild(desc);

  var grid = document.createElement('div');
  grid.className = 'tools-option-grid';

  var presets = [
    { text: '提醒喝水', prompt: '提醒我要多喝水，关心一下我~' },
    { text: '讲个故事', prompt: '给我讲一个温馨可爱的小故事吧~' },
    { text: '加油打气', prompt: '我今天有点累，给我加油打气吧~' },
    { text: '哄我睡觉', prompt: '现在该睡觉了，哄我入睡吧~' },
    { text: '帮我决定', prompt: '我有两个选择拿不定主意，帮我选一个~' },
    { text: '说个笑话', prompt: '说个笑话逗我开心吧~' },
  ];

  presets.forEach(function(p) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tools-option-btn';

    var label = document.createElement('div');
    label.className = 'tools-option-label';
    label.textContent = p.text;

    btn.appendChild(label);
    btn.addEventListener('click', async function() {
      var all = getTaskList(state);
      all.push({
        id: 'task_' + Date.now(),
        text: p.text,
        prompt: p.prompt,
        done: false,
        createdAt: Date.now()
      });
      saveTaskList(state, all);
      closeToolsSheet(options);
      await sendMessageToChat(p.prompt, options);
    });

    grid.appendChild(btn);
  });

  wrap.appendChild(grid);

  // 自定义输入
  var inputRow = document.createElement('div');
  inputRow.className = 'tools-input-row';

  var input = document.createElement('textarea');
  input.className = 'tools-input';
  input.placeholder = '或者自己写个任务...';
  input.rows = 1;
  input.style.minHeight = '44px';
  input.style.paddingTop = '10px';

  var sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'tools-send-btn';
  sendBtn.textContent = '派发';
  sendBtn.addEventListener('click', async function() {
    var val = input.value.trim();
    if (!val) return;
    var all = getTaskList(state);
    all.push({
      id: 'task_' + Date.now(),
      text: val,
      prompt: val,
      done: false,
      createdAt: Date.now()
    });
    saveTaskList(state, all);
    closeToolsSheet(options);
    await sendMessageToChat(val, options);
  });

  inputRow.append(input, sendBtn);
  wrap.appendChild(inputRow);

  return wrap;
}

// ═══════════════════════════════════════
// 【默契问答】分类出题 + 手动记分
// ═══════════════════════════════════════

function buildQuizDetail(state, options) {
  var wrap = document.createElement('div');

  // 积分显示
  var score = getQuizScore(state);
  if (score.total > 0) {
    var statRow = document.createElement('div');
    statRow.className = 'tools-stat-row';

    var accuracy = Math.round((score.correct / score.total) * 100);

    var stats = [
      { num: String(score.correct), label: '答对' },
      { num: String(score.total), label: '总题数' },
      { num: accuracy + '%', label: '正确率' },
    ];

    stats.forEach(function(stat, index) {
      if (index > 0) {
        var divider = document.createElement('div');
        divider.className = 'tools-stat-divider';
        statRow.appendChild(divider);
      }
      var item = document.createElement('div');
      item.className = 'tools-stat-item';
      item.append(
        createText('div', 'tools-stat-num', stat.num),
        createText('div', 'tools-stat-label', stat.label)
      );
      statRow.appendChild(item);
    });

    wrap.appendChild(statRow);
  }

  // 手动记分按钮（玩完一轮回来自己记）
  if (score.total > 0) {
    var scoreRow = document.createElement('div');
    scoreRow.className = 'tools-input-row';
    scoreRow.style.marginTop = '10px';

    var correctBtn = document.createElement('button');
    correctBtn.type = 'button';
    correctBtn.className = 'tools-send-btn';
    correctBtn.style.flex = '1';
    correctBtn.style.background = 'var(--surface-muted)';
    correctBtn.style.color = 'var(--text-primary)';
    correctBtn.textContent = '上一轮答对了';
    correctBtn.addEventListener('click', function() {
      var s = getQuizScore(state);
      s.correct = (s.correct || 0) + 1;
      saveQuizScore(state, s);
      showToast('记好啦~');
      var newWrap = buildQuizDetail(state, options);
      wrap.replaceWith(newWrap);
    });

    var wrongBtn = document.createElement('button');
    wrongBtn.type = 'button';
    wrongBtn.className = 'tools-send-btn';
    wrongBtn.style.flex = '1';
    wrongBtn.style.background = 'var(--surface-muted)';
    wrongBtn.style.color = 'var(--text-secondary)';
    wrongBtn.textContent = '上一轮答错了';
    wrongBtn.addEventListener('click', function() {
      showToast('没关系，下次加油~');
    });

    scoreRow.append(correctBtn, wrongBtn);
    wrap.appendChild(scoreRow);
  }

  var desc = document.createElement('div');
  desc.className = 'tools-section-desc';
  desc.style.marginTop = score.total > 0 ? '12px' : '0';
  desc.textContent = '选一个类型，让 TA 出题考考你~';
  wrap.appendChild(desc);

  var categories = [
    { title: '你有多了解我', desc: 'TA 出题考你', prompt: '我们来玩默契问答吧~你来出题考考我，看你对我有多了解！问我一些关于我的喜好和习惯的问题，我来回答~' },
    { title: '我有多了解你', desc: '你出题考 TA', prompt: '我们来玩默契问答吧~我来出题考考你，看我对你有多了解！问我一些关于你的问题，看你记不记得~' },
    { title: '生活小测验', desc: '聊聊日常', prompt: '我们来玩默契问答吧~聊一聊日常生活的小事，你问我一些关于生活习惯、喜好的问题~' },
    { title: '脑洞大开', desc: '奇怪假设题', prompt: '我们来玩默契问答吧~来点脑洞大开的假设问题！比如如果我是动物会是什么、如果穿越到古代会干什么~' },
    { title: '情感默契', desc: '测测心意', prompt: '我们来玩默契问答吧~来测测彼此的情感默契！你问我一些关于感情、心情、小确幸的问题~' },
    { title: '随机挑战', desc: '随机出题', prompt: '我们来玩默契问答吧~来个随机挑战！你可以随便问我任何有趣的问题，越出乎意料越好~' },
  ];

  categories.forEach(function(cat) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'tools-chip';
    card.style.marginBottom = '8px';
    card.style.width = '100%';

    var textWrap = document.createElement('div');
    textWrap.style.cssText = 'min-width:0;flex:1;display:flex;flex-direction:column;gap:3px;';

    var titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'font-size:14px;font-weight:600;color:var(--text-primary);';
    titleDiv.textContent = cat.title;

    var descDiv = document.createElement('div');
    descDiv.style.cssText = 'font-size:12px;color:var(--text-secondary);';
    descDiv.textContent = cat.desc;

    textWrap.append(titleDiv, descDiv);
    card.appendChild(textWrap);

    card.addEventListener('click', async function() {
      // 更新总题数
      var s = getQuizScore(state);
      s.total = (s.total || 0) + 1;
      saveQuizScore(state, s);

      closeToolsSheet(options);
      await sendMessageToChat(cat.prompt, options);
    });

    wrap.appendChild(card);
  });

  return wrap;
}

// ═══════════════════════════════════════
// 【独立面板入口】导出给 thread-panels.js
// ═══════════════════════════════════════

export function showToolsPanel(state, options = {}) {
  var sheet = document.createElement('div');
  sheet.className = 'thread-tools-panel-wrap';
  sheet.style.cssText = 'display:flex;flex-direction:column;gap:0;padding:6px 20px 20px;';

  var head = document.createElement('div');
  head.style.cssText = 'margin-bottom:10px;';
  head.appendChild(buildDetailView('小工具箱', document.createElement('div'), function() {
    if (typeof options.onClose === 'function') {
      options.onClose();
    } else {
      hideBottomSheet();
    }
  }).querySelector('.tools-detail-header'));

  var backBtn = head.querySelector('.tools-back-btn');
  if (backBtn) {
    backBtn.setAttribute('aria-label', '关闭工具箱');
    backBtn.replaceChildren();
    backBtn.appendChild(createCloseIcon());
  }

  sheet.appendChild(head);

  var grid = createThreadToolsGrid(state, options);
  sheet.appendChild(grid);

  showBottomSheet(sheet);
}

function createCloseIcon() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  var p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'M6 6l12 12');
  var p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p2.setAttribute('d', 'M18 6 6 18');
  svg.append(p1, p2);
  return svg;
}

// ═══════════════════════════════════════
// 【DOM 辅助】
// ═══════════════════════════════════════

function createText(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【导出】
// ═══════════════════════════════════════

export { showToolsPanel as default };
