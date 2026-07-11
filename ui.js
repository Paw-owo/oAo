/* core/ui.js */
/* imports: none */

let toastTimer = null;
let activeOverlay = null;
let activeSheet = null;
let activeDialog = null;
let lastFocusedElement = null;
let activeSheetKeydownHandler = null;
let dialogCloseToken = 0;
let sheetCloseToken = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_TOAST_DURATION = 2200;
const CLOSE_ANIMATION_DELAY = 220;

const ICON_PATHS = {
  back: [["path", { d: "M15 18l-6-6 6-6" }]],
  forward: [["path", { d: "M9 6l6 6-6 6" }]],
  close: [
    ["path", { d: "M6 6l12 12" }],
    ["path", { d: "M18 6L6 18" }]
  ],
  more: [
    ["circle", { cx: "12", cy: "6", r: "1.1" }],
    ["circle", { cx: "12", cy: "12", r: "1.1" }],
    ["circle", { cx: "12", cy: "18", r: "1.1" }]
  ],
  send: [
    ["path", { d: "M4 11.5l15-7-5.5 15-2.6-6.4L4 11.5z" }],
    ["path", { d: "M10.8 13.1l3.8-3.8" }]
  ],
  add: [
    ["path", { d: "M12 5v14" }],
    ["path", { d: "M5 12h14" }]
  ],
  search: [
    ["circle", { cx: "11", cy: "11", r: "6" }],
    ["path", { d: "M15.5 15.5L20 20" }]
  ],
  phone: [["path", { d: "M8.2 5.4l2 3.2-1.5 1.6c.9 1.8 2.3 3.2 4.1 4.1l1.6-1.5 3.2 2c.4.3.6.8.4 1.3-.5 1.5-1.7 2.7-3.2 2.9-5.1-.8-9-4.7-9.8-9.8.2-1.5 1.4-2.7 2.9-3.2.5-.2 1 .1 1.3.4z" }]],
  mic: [
    ["rect", { x: "9", y: "4", width: "6", height: "10", rx: "3" }],
    ["path", { d: "M5.5 11.5a6.5 6.5 0 0013 0" }],
    ["path", { d: "M12 18v3" }]
  ],
  image: [
    ["rect", { x: "4", y: "5", width: "16", height: "14", rx: "3" }],
    ["circle", { cx: "9", cy: "10", r: "1.5" }],
    ["path", { d: "M6.5 17l4.2-4.2 3 3 1.8-1.8L19 17.5" }]
  ],
  smile: [
    ["circle", { cx: "12", cy: "12", r: "8" }],
    ["path", { d: "M8.8 14.2c1.6 1.5 4.8 1.5 6.4 0" }],
    ["path", { d: "M9 10h.1" }],
    ["path", { d: "M15 10h.1" }]
  ],
  settings: [
    ["path", { d: "M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" }],
    ["path", { d: "M18.4 13.8l1.3 1-1.8 3.1-1.6-.6c-.5.4-1 .7-1.6.9l-.3 1.7h-3.6l-.3-1.7c-.6-.2-1.1-.5-1.6-.9l-1.6.6-1.8-3.1 1.3-1c-.1-.6-.1-1.2 0-1.8l-1.3-1 1.8-3.1 1.6.6c.5-.4 1-.7 1.6-.9l.3-1.7h3.6l.3 1.7c.6.2 1.1.5 1.6.9l1.6-.6 1.8 3.1-1.3 1c.1.6.1 1.2 0 1.8z" }]
  ],
  memory: [
    ["path", { d: "M8 5.5h8a3 3 0 013 3v7a3 3 0 01-3 3H8a3 3 0 01-3-3v-7a3 3 0 013-3z" }],
    ["path", { d: "M9 9h6" }],
    ["path", { d: "M9 12h4" }],
    ["path", { d: "M9 15h6" }]
  ],
  clear: [
    ["path", { d: "M5 12a7 7 0 111.8 4.7" }],
    ["path", { d: "M5 17h4v-4" }]
  ],
  transfer: [
    ["path", { d: "M7 8h11" }],
    ["path", { d: "M15 5l3 3-3 3" }],
    ["path", { d: "M17 16H6" }],
    ["path", { d: "M9 13l-3 3 3 3" }]
  ],
  mcp: [
    ["rect", { x: "5", y: "5", width: "14", height: "14", rx: "4" }],
    ["path", { d: "M9 9h6v6H9z" }],
    ["path", { d: "M12 2.8v2.2" }],
    ["path", { d: "M12 19v2.2" }],
    ["path", { d: "M2.8 12h2.2" }],
    ["path", { d: "M19 12h2.2" }]
  ],
  edit: [
    ["path", { d: "M5 19l3.8-.8 9-9a2.1 2.1 0 00-3-3l-9 9L5 19z" }],
    ["path", { d: "M13.5 7.5l3 3" }]
  ],
  delete: [
    ["path", { d: "M6 7h12" }],
    ["path", { d: "M10 7V5h4v2" }],
    ["path", { d: "M8 7l.7 12h6.6L16 7" }],
    ["path", { d: "M10.5 10.5v5" }],
    ["path", { d: "M13.5 10.5v5" }]
  ],
  copy: [
    ["rect", { x: "8", y: "8", width: "10", height: "10", rx: "2" }],
    ["path", { d: "M6 14H5a2 2 0 01-2-2V6a2 2 0 012-2h6a2 2 0 012 2v1" }]
  ],
  refresh: [
    ["path", { d: "M18 9a6.5 6.5 0 00-11.2-2.8L5 8" }],
    ["path", { d: "M5 4v4h4" }],
    ["path", { d: "M6 15a6.5 6.5 0 0011.2 2.8L19 16" }],
    ["path", { d: "M19 20v-4h-4" }]
  ],
  expand: [
    ["path", { d: "M8 4H4v4" }],
    ["path", { d: "M4 4l6 6" }],
    ["path", { d: "M16 20h4v-4" }],
    ["path", { d: "M20 20l-6-6" }]
  ],
  collapse: [
    ["path", { d: "M10 4v6H4" }],
    ["path", { d: "M4 10l6-6" }],
    ["path", { d: "M14 20v-6h6" }],
    ["path", { d: "M20 14l-6 6" }]
  ],
  play: [["path", { d: "M8 6.5v11l9-5.5-9-5.5z" }]],
  pause: [
    ["rect", { x: "7", y: "6", width: "3.5", height: "12", rx: "1" }],
    ["rect", { x: "13.5", y: "6", width: "3.5", height: "12", rx: "1" }]
  ],
  stop: [["rect", { x: "7", y: "7", width: "10", height: "10", rx: "2" }]],
  check: [["path", { d: "M5 12.5l4 4L19 6.5" }]],
  "arrow-right": [["path", { d: "M9 5l7 7-7 7" }]],
  "arrow-down": [["path", { d: "M5 9l7 7 7-7" }]],
  star: [["path", { d: "M12 4.5l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 4.5z" }]],
  heart: [["path", { d: "M12 19s-7-4.4-7-9.4A3.7 3.7 0 018.8 6c1.3 0 2.5.7 3.2 1.8A3.8 3.8 0 0115.2 6 3.7 3.7 0 0119 9.6C19 14.6 12 19 12 19z" }]],
  camera: [
    ["path", { d: "M8.5 7l1.2-2h4.6l1.2 2H18a2 2 0 012 2v7.5a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2.5z" }],
    ["circle", { cx: "12", cy: "12.5", r: "3.5" }]
  ],
  download: [
    ["path", { d: "M12 4v10" }],
    ["path", { d: "M8 10l4 4 4-4" }],
    ["path", { d: "M5 19h14" }]
  ],
  upload: [
    ["path", { d: "M12 20V10" }],
    ["path", { d: "M8 14l4-4 4 4" }],
    ["path", { d: "M5 5h14" }]
  ],
  eye: [
    ["path", { d: "M3.5 12s3-5.5 8.5-5.5S20.5 12 20.5 12s-3 5.5-8.5 5.5S3.5 12 3.5 12z" }],
    ["circle", { cx: "12", cy: "12", r: "2.5" }]
  ],
  "eye-off": [
    ["path", { d: "M4 4l16 16" }],
    ["path", { d: "M9.4 6.9A8.8 8.8 0 0112 6.5c5.5 0 8.5 5.5 8.5 5.5a14 14 0 01-2.2 2.8" }],
    ["path", { d: "M14.1 14.2A2.5 2.5 0 019.8 9.9" }],
    ["path", { d: "M6.2 8.5A14.2 14.2 0 003.5 12s3 5.5 8.5 5.5c1 0 1.9-.2 2.7-.5" }]
  ],
  grudge: [
    ["path", { d: "M7.5 4.5h9a2.5 2.5 0 012.5 2.5v10a2.5 2.5 0 01-2.5 2.5h-9A2.5 2.5 0 015 17V7a2.5 2.5 0 012.5-2.5z" }],
    ["path", { d: "M9 8.5h6" }],
    ["path", { d: "M9 12h4.8" }],
    ["path", { d: "M9 15.5h3" }],
    ["path", { d: "M15 14.8c.8-.9 2.3-.4 2.3.8 0 1.4-2.3 2.6-2.3 2.6s-2.3-1.2-2.3-2.6c0-1.2 1.5-1.7 2.3-.8z" }]
  ],
  lock: [
    ["rect", { x: "5.5", y: "10", width: "13", height: "9", rx: "2.5" }],
    ["path", { d: "M8.5 10V7.8a3.5 3.5 0 017 0V10" }],
    ["path", { d: "M12 13.5v2" }]
  ],
  unlock: [
    ["rect", { x: "5.5", y: "10", width: "13", height: "9", rx: "2.5" }],
    ["path", { d: "M8.5 10V7.8a3.5 3.5 0 016.7-1.4" }],
    ["path", { d: "M12 13.5v2" }]
  ],
  timer: [
    ["circle", { cx: "12", cy: "13", r: "7" }],
    ["path", { d: "M9.5 3.5h5" }],
    ["path", { d: "M12 6v2" }],
    ["path", { d: "M12 13l3-2" }]
  ],
  warning: [
    ["path", { d: "M12 4.5l8 14H4l8-14z" }],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 16.5h.1" }]
  ],
  ban: [
    ["circle", { cx: "12", cy: "12", r: "8" }],
    ["path", { d: "M7 7l10 10" }]
  ],
  "message-off": [
    ["path", { d: "M4 5l16 16" }],
    ["path", { d: "M6.2 6.2A3 3 0 004 9v5a3 3 0 003 3h6l4 3v-3" }],
    ["path", { d: "M9 5h8a3 3 0 013 3v6.5" }]
  ],
  music: [
    ["circle", { cx: "8", cy: "17", r: "3" }],
    ["circle", { cx: "17", cy: "15", r: "3" }],
    ["path", { d: "M11 17V5l9-2v12" }]
  ],
  dream: [
    ["circle", { cx: "12", cy: "12", r: "7" }],
    ["path", { d: "M9 10h.1" }],
    ["path", { d: "M15 10h.1" }],
    ["path", { d: "M9.5 14c1.2 1.2 3.8 1.2 5 0" }],
    ["path", { d: "M17.5 4.5a1.5 1.5 0 00-1 1" }],
    ["path", { d: "M20 6.5a1.5 1.5 0 00-1 1" }]
  ]
};

function ensureCoreUiStyle() {
  if (document.getElementById("core-ui-style")) return;

  const style = document.createElement("style");
  style.id = "core-ui-style";
  style.textContent = `
    .toast {
      position: fixed;
      left: 50%;
      bottom: calc(34px + env(safe-area-inset-bottom));
      z-index: 10020;
      max-width: min(360px, calc(100vw - 40px));
      transform: translate3d(-50%, 16px, 0) scale(0.98);
      opacity: 0;
      pointer-events: none;
      padding: 12px 16px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-md);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: 1.6;
      text-align: center;
      transition: all 200ms ease;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .toast.show {
      opacity: 1;
      transform: translate3d(-50%, 0, 0) scale(1);
    }

    .sheet-overlay,
    .cute-dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: var(--bg-overlay);
      opacity: 0;
      pointer-events: none;
      transition: all 200ms ease;
    }

    .sheet-overlay.open,
    .cute-dialog-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .bottom-sheet {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: calc(12px + env(safe-area-inset-bottom));
      z-index: 10010;
      max-height: min(74vh, 680px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding: 10px 0 18px;
      border-radius: 28px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-lg);
      font-family: var(--font-main);
      transform: translate3d(0, calc(100% + 24px), 0) scale(0.98);
      opacity: 0;
      transition: all 200ms ease;
      outline: transparent solid 2px;
      outline-offset: 2px;
    }

    .bottom-sheet.open {
      transform: translate3d(0, 0, 0) scale(1);
      opacity: 1;
    }

    .sheet-handle {
      width: 42px;
      height: 5px;
      margin: 0 auto 12px;
      border-radius: 999px;
      background: var(--text-hint);
      opacity: 0.55;
      flex: 0 0 auto;
    }

    .bottom-sheet > :not(.sheet-handle) {
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      padding-left: 20px;
      padding-right: 20px;
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: 1.6;
    }

    .sheet-description {
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      padding-bottom: 8px;
      white-space: pre-wrap;
    }

    .cute-dialog-layer,
    .guide-overlay {
      position: fixed;
      inset: 0;
      z-index: 10010;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      pointer-events: none;
    }

    .cute-dialog-card,
    .guide-card {
      width: min(360px, calc(100vw - 48px));
      max-height: min(76vh, 560px);
      overflow: auto;
      padding: 22px 20px 18px;
      border-radius: 28px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-lg);
      font-family: var(--font-main);
      transform: translate3d(0, 12px, 0) scale(0.96);
      opacity: 0;
      pointer-events: auto;
      outline: transparent solid 2px;
      outline-offset: 2px;
      transition: all 200ms ease;
    }

    .cute-dialog-card.open,
    .guide-card.open {
      transform: translate3d(0, 0, 0) scale(1);
      opacity: 1;
    }

    .cute-dialog-card:focus-visible,
    .guide-card:focus-visible,
    .bottom-sheet:focus-visible {
      box-shadow: var(--shadow-sm);
    }

    .cute-dialog-icon {
      width: 44px;
      height: 44px;
      margin: 0 auto 14px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: var(--accent-light);
      color: var(--accent);
    }

    .cute-dialog-icon svg {
      width: 23px;
      height: 23px;
    }

    .cute-dialog-title,
    .guide-title {
      margin: 0;
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: var(--font-size-title);
      line-height: 1.45;
      font-weight: 600;
      text-align: center;
    }

    .cute-dialog-text,
    .guide-text {
      margin: 10px 0 0;
      color: var(--text-secondary);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: 1.6;
      text-align: center;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .cute-dialog-actions {
      display: flex;
      gap: 10px;
      margin-top: 18px;
    }

    .cute-dialog-actions .btn-primary,
    .cute-dialog-actions .btn-ghost,
    .guide-card .btn-primary,
    .guide-card .btn-ghost {
      min-height: 44px;
      flex: 1;
      appearance: none;
      -webkit-appearance: none;
      padding: 11px 14px;
      border-radius: 18px;
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: 1.4;
      font-weight: 600;
      cursor: pointer;
      transition: all 200ms ease;
      box-shadow: none;
      outline: transparent solid 2px;
      outline-offset: 2px;
    }

    .cute-dialog-actions .btn-primary,
    .guide-card .btn-primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .cute-dialog-actions .btn-ghost,
    .guide-card .btn-ghost {
      background: var(--bg-secondary);
      color: var(--text-secondary);
    }

    .cute-dialog-actions .btn-primary:active,
    .cute-dialog-actions .btn-ghost:active,
    .guide-card .btn-primary:active,
    .guide-card .btn-ghost:active {
      transform: scale(0.96);
    }

    .cute-dialog-actions .btn-primary:focus-visible,
    .cute-dialog-actions .btn-ghost:focus-visible,
    .guide-card .btn-primary:focus-visible,
    .guide-card .btn-ghost:focus-visible {
      box-shadow: var(--shadow-sm);
    }

    @media (max-width: 420px) {
      .cute-dialog-layer,
      .guide-overlay {
        align-items: flex-end;
        padding: 14px 12px calc(14px + env(safe-area-inset-bottom));
      }

      .cute-dialog-card,
      .guide-card {
        width: 100%;
        border-radius: 28px;
      }

      .bottom-sheet {
        left: 8px;
        right: 8px;
        bottom: calc(8px + env(safe-area-inset-bottom));
      }
    }
  `;

  document.head.appendChild(style);
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  return element;
}

function createElement(tagName, classNames = [], textContent) {
  const element = document.createElement(tagName);
  const normalizedClassNames = Array.isArray(classNames) ? classNames : [classNames];

  normalizedClassNames.filter(Boolean).forEach((className) => {
    element.classList.add(className);
  });

  if (textContent !== undefined && textContent !== null) {
    element.textContent = String(textContent);
  }

  return element;
}

function rememberFocus() {
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLElement && activeElement !== document.body) {
    lastFocusedElement = activeElement;
  }
}

function restoreFocus() {
  if (lastFocusedElement instanceof HTMLElement && document.contains(lastFocusedElement)) {
    lastFocusedElement.focus({ preventScroll: true });
  }

  lastFocusedElement = null;
}

function getFocusableElement(container) {
  return container.querySelector("button, [href], input, textarea, select, summary, [tabindex]:not([tabindex='-1'])");
}

function focusInto(container) {
  const focusableElement = getFocusableElement(container);

  if (focusableElement instanceof HTMLElement) {
    focusableElement.focus({ preventScroll: true });
    return;
  }

  if (container instanceof HTMLElement) {
    container.focus({ preventScroll: true });
  }
}

function ensureToast() {
  ensureCoreUiStyle();

  let toast = document.querySelector(".toast");

  if (!toast) {
    toast = createElement("div", "toast");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  return toast;
}

function normalizeSheetContent(contentEl) {
  if (contentEl instanceof HTMLElement) {
    return contentEl;
  }

  return createElement("div", "sheet-description", contentEl ?? "");
}

function clearActiveDialog(result, options = {}) {
  if (!activeDialog) return;

  const dialog = activeDialog;
  const currentToken = ++dialogCloseToken;
  const shouldRestoreFocus = options.restoreFocus !== false;

  activeDialog = null;

  document.removeEventListener("keydown", dialog.keydownHandler);

  dialog.backdrop.classList.remove("open");
  dialog.card.classList.remove("open");

  window.setTimeout(() => {
    dialog.backdrop.remove();
    dialog.layer.remove();

    if (shouldRestoreFocus && currentToken === dialogCloseToken && !activeDialog) {
      restoreFocus();
    }

    dialog.resolve(result);
  }, CLOSE_ANIMATION_DELAY);
}

function createDialog(message, resolve, cancelValue, options = {}) {
  ensureCoreUiStyle();

  if (activeDialog) {
    clearActiveDialog(cancelValue, { restoreFocus: false });
  }

  dialogCloseToken++;
  rememberFocus();

  const backdrop = createElement("div", ["sheet-overlay", "cute-dialog-backdrop"]);
  const layer = createElement("div", ["guide-overlay", "cute-dialog-layer"]);
  const card = createElement("div", ["guide-card", "cute-dialog-card"]);
  const iconWrap = createElement("div", "cute-dialog-icon");
  const title = createElement("h2", ["guide-title", "cute-dialog-title"], options.title || "小提示");
  const text = createElement("p", ["guide-text", "cute-dialog-text"], message ?? "");
  const actions = createElement("div", "cute-dialog-actions");

  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.tabIndex = -1;

  iconWrap.append(createIcon(options.icon || "heart", 24));
  card.append(iconWrap, title, text, actions);
  layer.append(card);
  document.body.append(backdrop, layer);

  const keydownHandler = (event) => {
    if (event.key !== "Escape") return;

    event.preventDefault();
    clearActiveDialog(cancelValue);
  };

  backdrop.addEventListener("click", () => clearActiveDialog(cancelValue));
  document.addEventListener("keydown", keydownHandler);

  activeDialog = {
    backdrop,
    layer,
    card,
    keydownHandler,
    resolve
  };

  requestAnimationFrame(() => {
    backdrop.classList.add("open");
    card.classList.add("open");
  });

  return { card, actions };
}

export function showToast(message, duration = DEFAULT_TOAST_DURATION) {
  const toast = ensureToast();

  window.clearTimeout(toastTimer);
  toast.textContent = String(message ?? "");
  toast.classList.add("show");

  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, Number.isFinite(duration) ? duration : DEFAULT_TOAST_DURATION);
}

export function showBottomSheet(contentEl) {
  ensureCoreUiStyle();
  hideBottomSheet();
  sheetCloseToken++;
  rememberFocus();

  activeOverlay = createElement("div", "sheet-overlay");
  activeSheet = createElement("div", "bottom-sheet");

  const handle = createElement("div", "sheet-handle");
  const content = normalizeSheetContent(contentEl);

  activeSheet.setAttribute("role", "dialog");
  activeSheet.setAttribute("aria-modal", "true");
  activeSheet.tabIndex = -1;

  activeSheet.append(handle, content);
  document.body.append(activeOverlay, activeSheet);

  activeSheetKeydownHandler = (event) => {
    if (event.key !== "Escape") return;

    event.preventDefault();
    hideBottomSheet();
  };

  activeOverlay.addEventListener("click", hideBottomSheet);
  document.addEventListener("keydown", activeSheetKeydownHandler);

  requestAnimationFrame(() => {
    activeOverlay?.classList.add("open");
    activeSheet?.classList.add("open");

    if (activeSheet) {
      focusInto(activeSheet);
    }
  });

  return activeSheet;
}

export function hideBottomSheet() {
  if (!activeOverlay && !activeSheet) return;

  const overlay = activeOverlay;
  const sheet = activeSheet;
  const keydownHandler = activeSheetKeydownHandler;
  const currentToken = ++sheetCloseToken;

  activeOverlay = null;
  activeSheet = null;
  activeSheetKeydownHandler = null;

  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
  }

  overlay?.classList.remove("open");
  sheet?.classList.remove("open");

  window.setTimeout(() => {
    overlay?.remove();
    sheet?.remove();

    if (currentToken === sheetCloseToken && !activeOverlay && !activeSheet && !activeDialog) {
      restoreFocus();
    }
  }, CLOSE_ANIMATION_DELAY);
}

export function showConfirm(message) {
  return new Promise((resolve) => {
    const { card, actions } = createDialog(message, resolve, false, {
      title: "要确认一下嘛",
      icon: "heart"
    });

    const cancelButton = createElement("button", "btn-ghost", "先不要");
    const confirmButton = createElement("button", "btn-primary", "好呀");

    cancelButton.type = "button";
    confirmButton.type = "button";

    cancelButton.addEventListener("click", () => clearActiveDialog(false));
    confirmButton.addEventListener("click", () => clearActiveDialog(true));

    actions.append(cancelButton, confirmButton);
    confirmButton.focus({ preventScroll: true });

    if (document.activeElement !== confirmButton) {
      focusInto(card);
    }
  });
}

export function showAlert(message) {
  return new Promise((resolve) => {
    const { card, actions } = createDialog(message, resolve, undefined, {
      title: "收到啦",
      icon: "star"
    });

    const confirmButton = createElement("button", "btn-primary", "知道啦");
    confirmButton.type = "button";

    confirmButton.addEventListener("click", () => clearActiveDialog(undefined));

    actions.append(confirmButton);
    focusInto(card);
  });
}

export function createIcon(name, size = 24) {
  const iconName = Object.prototype.hasOwnProperty.call(ICON_PATHS, name) ? name : "more";
  const svg = createSvgElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false"
  });

  ICON_PATHS[iconName].forEach(([tagName, attributes]) => {
    svg.appendChild(createSvgElement(tagName, attributes));
  });

  return svg;
}

ensureCoreUiStyle();

window.showToast = showToast;

/* 依赖：无import；挂载 window.showToast；动态注入 core-ui-style；新增 forward 图标 */
