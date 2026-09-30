const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const figlet = require("figlet");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Jakarta");
const { bold, red, yellow, blue, magenta, cyan, green } = require("kleur/colors");

const args = process.argv.slice(2);
const isDebug = args.includes("--debug");
const CREDENTIALS_FILE = path.join(__dirname, "cookies.json");
const CONFIG_FILE = path.join(__dirname, "config.json");

const loadConfig = () => {
  if (!fs.existsSync(CONFIG_FILE)) throw new Error("config.json tidak ditemukan");
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    throw new Error("Invalid config.json");
  }
};
const CONFIG = loadConfig();

const EDITOR_SELECTOR = [
  'div.public-DraftEditor-content[contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"]',
  'textarea[data-e2e="message-input"]',
  '[data-e2e="message-input"]'
].join(", ");

const fetchQuote = async () => {
  try {
    const res = await fetch("https://dummyjson.com/quotes/random");
    const data = await res.json();
    return `"${data.quote}" — ${data.author}`;
  } catch {
    return null;
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const banner = figlet.textSync("TikTok Streak", { font: CONFIG.bannerFont, horizontalLayout: "default", verticalLayout: "default" });
  console.log(bold(cyan(banner)));
  console.log(yellow("\n[+] Made with 🚬 and ☕ by Saturia."));
  if (CONFIG.useQuotesAPi) console.log(blue("[+] Message: Random quote (dummyjson.com)"));
  else console.log(blue("[+] Message:", CONFIG.message));
  console.log(yellow(`[+] Mode: ${isDebug ? "Debug" : "Normal"}\n`));

  let credentials;
  if (process.env.COOKIES_JSON) {
    try {
      const data = JSON.parse(process.env.COOKIES_JSON);
      credentials = Array.isArray(data) ? data : [data];
      console.log(green(`[+] Cookies loaded from env (${credentials.length} cookies)`));
    } catch (e) {
      throw new Error("Invalid COOKIES_JSON: " + e.message);
    }
  } else if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
      credentials = Array.isArray(data) ? data : [data];
      console.log(yellow(`[+] Cookies loaded from cookies.json (${credentials.length} cookies)`));
    } catch (e) {
      throw new Error("Invalid cookies.json: " + e.message);
    }
  } else {
    throw new Error("Session not found. Set COOKIES_JSON or create cookies.json");
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800"
      ],
      defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    );
    await page.setCookie(...credentials);

    if (isDebug) console.log(yellow("[+] Membuka halaman TikTok messages..."));
    await page.goto(CONFIG.targetUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(CONFIG.pageLoadDelayMs);
    if (isDebug) console.log(yellow("[+] Halaman loaded."));

    const iframeEl = await page.$("iframe[src*='/messages']");
    if (!iframeEl) {
      const dump = `debug-main.html`;
      fs.writeFileSync(dump, await page.content());
      throw new Error(`iframe messages tidak ditemukan. HTML disimpan: ${dump}`);
    }
    const frame = await iframeEl.contentFrame();
    if (!frame) throw new Error("contentFrame() null");

    try {
      await frame.waitForSelector("._TUXModal-wrapper", { visible: true, timeout: 3000 });
      await frame.evaluate(() => {
        const m = document.querySelector("._TUXModal-wrapper");
        if (!m) return;
        const r = m.getBoundingClientRect();
        document.elementFromPoint(Math.max(1, r.left - 10), Math.max(1, r.top - 10))?.click();
      });
    } catch {}

    let success = 0, failed = 0, editorFound = false;
    for (let i = 0; i < CONFIG.totalUsers; i++) {
      try {
        const userSelector = `div[data-index="${i}"] [data-e2e="dm-new-conversation-item"]`;
        await frame.waitForSelector(userSelector, { timeout: 5000 });
        await frame.click(userSelector);
        const username = await frame
          .evaluate((sel) => document.querySelector(sel)?.textContent || `user${i}`,
            `div[data-index="${i}"] [data-e2e="dm-new-conversation-nickname"]`);
        console.log(yellow(`\n[${i + 1}/${CONFIG.totalUsers}] -> ${username}`));

        await frame.waitForSelector(EDITOR_SELECTOR, { visible: true, timeout: 15000 });
        editorFound = true;
        await frame.click(EDITOR_SELECTOR);
        await sleep(CONFIG.afterClickDelayMs);

        let message = CONFIG.message;
        if (CONFIG.useQuotesAPi) {
          const quote = await fetchQuote();
          if (!quote) throw new Error("Gagal fetch quote");
          message = quote;
          if (isDebug) console.log(cyan(`  [~] ${quote}`));
        }
        await page.keyboard.type(message, { delay: CONFIG.typeDelayMs });
        await sleep(CONFIG.afterSendDelayMs);
        await page.keyboard.down("Control");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Control");
        await sleep(CONFIG.afterSendDelayMs);
        console.log(green("  [v] Terkirim!"));
        success++;
      } catch (e) {
        failed++;
        console.log(red(`  [x] ${e.message.split("\n")[0]}`));
        if (!editorFound) {
          const dump = `debug-frame-${i}.html`;
          try {
            fs.writeFileSync(dump, await frame.content());
            console.log(red(`  [!] editor tidak ketemu. HTML frame -> ${dump}`));
          } catch {}
          break;
        }
      }
      if (i < CONFIG.totalUsers - 1) await sleep(CONFIG.actionDelayMs);
    }

    console.log(green("\n[+] SELESAI!"));
    console.log(blue(`[+] Success: ${success}`));
    console.log(red(`[+] Failed: ${failed}\n`));
    await sleep(CONFIG.finishDelayMs);
    if (failed > 0) process.exitCode = 1;
  } catch (e) {
    console.error(red("[!] Fatal error: " + e.message));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
};

main();
