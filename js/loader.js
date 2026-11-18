// 全畫面與列表用的品牌載入狀態。動畫只寫在 CSS。

export const LOADER_MIN_MS = 400;
export const LOADER_MAX_MS = 8000;
export const LOADER_TEXT = "載入中…";

export function remainingMinMs(shownAt, now = Date.now(), min = LOADER_MIN_MS) {
  if (shownAt == null) return 0;
  return Math.max(0, min - (now - shownAt));
}

export function loaderLogoSrc(doc = document) {
  const node = doc.querySelector(".brand-loader-logo");
  return node?.getAttribute("src") || "./assets/logo-daxin.png";
}

export function inlineLoaderHtml(src, esc = (value) => String(value ?? "")) {
  const logo = esc(src || "./assets/logo-daxin.png");
  return `<div class="brand-loader-inline" role="status" aria-live="polite">
    <span class="brand-loader-mark compact" aria-hidden="true">
      <span class="brand-loader-ring"></span>
      <img class="hub-logo brand-loader-logo" src="${logo}" width="48" height="48" alt="">
    </span>
    <span class="brand-loader-text">${LOADER_TEXT}</span>
  </div>`;
}

export function createLoaderController({
  getEl,
  now = () => Date.now(),
  timer = setTimeout,
  clear = clearTimeout,
  min = LOADER_MIN_MS,
  max = LOADER_MAX_MS,
} = {}) {
  let shownAt = 0;
  let holds = 0;
  let maxId = 0;

  function paint(visible) {
    const el = getEl?.();
    if (!el) return;
    el.hidden = !visible;
    el.classList.toggle("show", visible);
    el.setAttribute("aria-busy", visible ? "true" : "false");
  }

  function show() {
    holds += 1;
    if (holds === 1 || (getEl?.() && getEl().hidden)) {
      shownAt = now();
      paint(true);
      clear(maxId);
      maxId = timer(() => {
        holds = 0;
        shownAt = 0;
        paint(false);
      }, max);
    }
  }

  async function hide(force = false) {
    if (!force) {
      holds = Math.max(0, holds - 1);
      if (holds > 0) return;
    } else {
      holds = 0;
    }
    const wait = force ? 0 : remainingMinMs(shownAt, now(), min);
    if (wait > 0) await new Promise((resolve) => timer(resolve, wait));
    if (holds > 0 && !force) return;
    clear(maxId);
    shownAt = 0;
    paint(false);
  }

  return { show, hide };
}
