import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const port = 4173;
const base = `http://127.0.0.1:${port}/`;
const outDir = "/opt/cursor/artifacts";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, label, tries = 40) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await wait(250);
    }
  }
  throw new Error(`${label}: ${last?.message || last}`);
}

const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: "ignore",
});

const chrome = spawn("google-chrome", [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--remote-debugging-port=9222",
  "--user-data-dir=/tmp/chrome-teamhub",
  "about:blank",
], { stdio: "ignore" });

function connect() {
  return waitFor(async () => {
    const res = await fetch("http://127.0.0.1:9222/json/version");
    if (!res.ok) throw new Error(String(res.status));
    const info = await res.json();
    const ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    return ws;
  }, "chrome");
}

let id = 0;
const pending = new Map();
const errors = [];

function cdp(ws, method, params = {}) {
  const messageId = ++id;
  ws.send(JSON.stringify({ id: messageId, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(messageId, { resolve, reject });
  });
}

function listen(ws) {
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
      return;
    }
    if (data.method === "Runtime.exceptionThrown") {
      errors.push(data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text || "exception");
    }
    if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
      errors.push(data.params.args.map((arg) => arg.value || arg.description).join(" "));
    }
  });
}

async function evalJson(ws, expression) {
  const result = await cdp(ws, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "evaluate failed");
  }
  return result.result.value;
}

async function shot(ws, name) {
  const { data } = await cdp(ws, "Page.captureScreenshot", { format: "png" });
  await writeFile(`${outDir}/${name}.png`, Buffer.from(data, "base64"));
}

async function setViewport(ws, width, height, mobile) {
  await cdp(ws, "Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

try {
  await mkdir(outDir, { recursive: true });
  await waitFor(async () => {
    const res = await fetch(base);
    if (!res.ok) throw new Error(String(res.status));
  }, "server");
  const browserWs = await connect();
  listen(browserWs);
  const { targetId } = await cdp(browserWs, "Target.createTarget", { url: "about:blank" });
  const { webSocketDebuggerUrl } = await (await fetch("http://127.0.0.1:9222/json/list")).json().then((list) => {
    const found = list.find((item) => item.id === targetId);
    if (!found) throw new Error("target missing");
    return found;
  });
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  listen(ws);
  await cdp(ws, "Page.enable");
  await cdp(ws, "Runtime.enable");
  await cdp(ws, "Page.navigate", { url: `${base}?page=home` });
  await waitFor(async () => {
    const ready = await evalJson(ws, "document.getElementById('app') && !document.getElementById('app').hidden && document.body.dataset.mode === 'demo'");
    if (!ready) throw new Error("app not ready");
  }, "app");

  const homeText = await evalJson(ws, "document.body.innerText");
  if (!homeText.includes("南恩團隊")) throw new Error("沒有團隊名稱");
  if (!homeText.includes("示範資料")) throw new Error("沒有示範資料標示");
  if (!homeText.includes("近7日新增名單") || !homeText.includes("粉絲成長")) throw new Error("總覽缺統計或排行");
  if (homeText.includes("問卷")) throw new Error("不該出現問卷積分");
  await evalJson(ws, "document.getElementById('menuBtn').click()");
  await waitFor(async () => {
    const open = await evalJson(ws, "document.getElementById('drawer').classList.contains('open')");
    if (!open) throw new Error("選單沒打開");
    return open;
  }, "menu");
  await evalJson(ws, "document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}))");
  await waitFor(async () => {
    const open = await evalJson(ws, "document.getElementById('drawer').classList.contains('open')");
    if (open) throw new Error("Esc 沒關上選單");
    return true;
  }, "esc");

  await setViewport(ws, 390, 844, true);
  await wait(200);
  await shot(ws, "mobile_home");

  await evalJson(ws, "document.querySelector('[data-nav=clients]').click()");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('page-clients').classList.contains('active') ? document.getElementById('clientList').innerText : ''");
    if (!text.includes("王先生")) throw new Error("客戶列表還沒出現");
    return text;
  }, "clients");
  await shot(ws, "mobile_clients");

  await evalJson(ws, "document.querySelector('[data-action=open-client]').click()");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('coverageBoard') ? document.getElementById('coverageBoard').innerText : ''");
    if (!text.includes("保障")) throw new Error("保障檢視沒打開");
    return text;
  }, "client detail");
  await evalJson(ws, "document.querySelector('[data-tab=policies]').click()");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('clientDetail').innerText");
    if (!text.includes("末四碼")) throw new Error("保單摘要沒有末四碼");
    return text;
  }, "policy pane");

  await evalJson(ws, "document.querySelector('[data-nav=social]').click()");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('page-social').classList.contains('active') ? document.getElementById('socialRank').innerText : ''");
    if (!text.includes("林子安") || !text.includes("需重新授權")) throw new Error(`社群排行不完整: ${text.slice(0, 180)}`);
    return text;
  }, "social");
  await shot(ws, "mobile_social");

  const badUrl = await evalJson(ws, `
    document.querySelector('#postForm [name=permalink]').value = 'http://example.com/nope';
    document.getElementById('postForm').requestSubmit();
    document.getElementById('toast').textContent
  `);
  await wait(100);
  const toast1 = await evalJson(ws, "document.getElementById('toast').textContent");
  if (!toast1.includes("https")) throw new Error(`網址驗證失敗: ${badUrl} / ${toast1}`);

  await evalJson(ws, `
    document.querySelector('#postForm [name=permalink]').value = 'https://www.instagram.com/p/demo-new/';
    document.getElementById('postForm').requestSubmit();
    true
  `);
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('postList').innerText");
    if (!text.includes("開啟")) throw new Error("新貼文沒出現");
    return text;
  }, "post");

  await evalJson(ws, `
    document.querySelector('#storyForm [name=story_count]').value = '4';
    document.getElementById('storyForm').requestSubmit();
    true
  `);
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('toast').textContent");
    if (!text.includes("限動")) throw new Error("限動沒儲存");
    return text;
  }, "story");

  await evalJson(ws, "document.getElementById('previewRole').value = 'member'; document.getElementById('previewRole').dispatchEvent(new Event('change'))");
  await waitFor(async () => {
    const role = await evalJson(ws, "document.body.dataset.role");
    if (role !== "member") throw new Error(role);
    return role;
  }, "member role");
  await evalJson(ws, "document.querySelector('[data-nav=clients]').click()");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('clientList').innerText");
    if (!text.includes("王先生") || text.includes("陳媽媽")) throw new Error(`夥伴看到不該看的客戶: ${text}`);
    return text;
  }, "member clients");
  await evalJson(ws, "document.querySelector('[data-nav=social]').click()");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('socialRank').innerText");
    if (text.includes("黃詩涵") || text.includes("張柏宇")) throw new Error(`夥伴看到別人的社群: ${text}`);
    if (!text.includes("林子安")) throw new Error(text);
    return text;
  }, "member social");

  await evalJson(ws, "document.getElementById('previewRole').value = 'admin'; document.getElementById('previewRole').dispatchEvent(new Event('change'))");
  await evalJson(ws, "document.querySelector('[data-nav=ai]').click()");
  await waitFor(async () => {
    const ok = await evalJson(ws, "document.getElementById('page-ai').classList.contains('active') && !!document.querySelector('[data-action=open-tool]')");
    if (!ok) throw new Error("工具箱沒出現");
    return ok;
  }, "tools");
  await evalJson(ws, "document.querySelector('[data-action=open-tool]').click()");
  await waitFor(async () => {
    const open = await evalJson(ws, "document.getElementById('modal').classList.contains('show')");
    if (!open) throw new Error("指令視窗沒打開");
    return open;
  }, "modal");

  await evalJson(ws, "document.querySelector('[data-nav=tasks]').click()");
  await evalJson(ws, `
    document.getElementById('taskTitle').value = '瀏覽器測試任務';
    document.getElementById('taskForm').requestSubmit();
    true
  `);
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('taskList').innerText");
    if (!text.includes("瀏覽器測試任務")) throw new Error("任務沒新增");
    return text;
  }, "task");

  await evalJson(ws, "document.getElementById('modalClose').click(); document.getElementById('resetDemo').click();");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('toast').textContent");
    if (!text.includes("示範資料")) throw new Error(text);
    return text;
  }, "reset");
  await evalJson(ws, "document.getElementById('toast').classList.remove('show'); window.scrollTo(0,0);");
  await wait(300);

  await setViewport(ws, 390, 844, true);
  await evalJson(ws, "document.querySelector('[data-nav=home]').click()");
  await wait(300);
  await evalJson(ws, "window.scrollTo(0,0)");
  await shot(ws, "mobile_overview");
  await evalJson(ws, "document.querySelector('[data-nav=ai]').click()");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('page-ai').classList.contains('active') ? document.getElementById('toolList').innerText : ''");
    if (!text.includes("客戶關心訊息")) throw new Error(text.slice(0, 80));
    return text;
  }, "tools shot");
  await evalJson(ws, "window.scrollTo(0,0)");
  await shot(ws, "mobile_tools");
  await evalJson(ws, "document.querySelector('[data-nav=clients]').click()");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('clientList').innerText");
    if (!text.includes("王先生")) throw new Error(text);
    return text;
  }, "clients again");
  await evalJson(ws, "window.scrollTo(0,0)");
  await shot(ws, "mobile_clients");
  await evalJson(ws, "document.querySelector('[data-action=open-client]').click()");
  await waitFor(async () => {
    const text = await evalJson(ws, "document.getElementById('coverageBoard') ? document.getElementById('coverageBoard').innerText : ''");
    if (!text.includes("保障") || !text.includes("缺口")) throw new Error(text.slice(0, 120));
    return text;
  }, "coverage");
  await evalJson(ws, "const board = document.getElementById('coverageBoard'); window.scrollTo(0, board.getBoundingClientRect().top + window.scrollY - 64);");
  await wait(200);
  await shot(ws, "mobile_coverage");
  const covered = await evalJson(ws, "document.getElementById('coverageBoard').innerText");
  if (!covered.includes("已涵蓋") || !covered.includes("實支實付")) throw new Error(covered.slice(0, 180));

  await setViewport(ws, 1280, 800, false);
  await evalJson(ws, "document.querySelector('[data-nav=home]').click()");
  await wait(300);
  const drawerVisible = await evalJson(ws, "getComputedStyle(document.getElementById('drawer')).transform === 'none'");
  if (!drawerVisible) throw new Error("桌機側欄沒有固定顯示");
  await shot(ws, "desktop_overview");

  if (errors.length) {
    throw new Error(`主控台錯誤：\n${errors.join("\n")}`);
  }
  console.log("browser checks passed");
} finally {
  server.kill("SIGTERM");
  chrome.kill("SIGTERM");
}
