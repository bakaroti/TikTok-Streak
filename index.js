const { chromium } = require("playwright");
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
  if (!fs.existsSync(CONFIG_FILE))
    throw new Error("config.json tidak ditemukan");
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    throw new Error("Invalid config.json");
  }
};
const CONFIG = loadConfig();

const fetchQuote = async () => {
  try {
    const res = await fetch("https://dummyjson.com/quotes/random");
    const data = await res.json();
    return `"${data.quote}" — ${data.author}`;
  } catch {
    return null;
  }
};


const main = async () => {
  const banner = figlet.textSync("TikTok Streak", { font: CONFIG.bannerFont, horizontalLayout: "default", verticalLayout: "default" });
  console.clear();
  console.log(bold(cyan(banner)));
  console.log(yellow("\n[+] Made with 🚬 and ☕ by Saturia."));
  if (CONFIG.useQuotesAPi) console.log(blue("[+] Message: Random quote (dummyjson.com)"));
  else console.log(blue("[+] Message:", CONFIG.message));
  console.log(magenta("[+] Delay:", `${CONFIG.actionDelayMs} ms\n`));
  console.log(yellow(`[+] Mode: ${isDebug ? "Debug" : "Normal"}\n`));


  let credentials;
  if (process.env.COOKIES_JSON) {
    try {
      const data = JSON.parse(process.env.COOKIES_JSON);
      credentials = Array.isArray(data) ? { cookies: data } : { cookies: [data] };
      console.log(green("[+] Cookies loaded from COOKIES_JSON env var"));
    } catch {
      throw new Error("Invalid COOKIES_JSON environment variable");
    }
  } else if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
      credentials = Array.isArray(data) ? { cookies: data } : { cookies: [data] };
      console.log(yellow("[+] Cookies loaded from cookies.json (local only)"));
    } catch {
      throw new Error("Invalid session file");
    }
  } else {
    throw new Error("Session not found. Set COOKIES_JSON env var or create cookies.json");
  }


  let browser;
  try {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: CONFIG.headless,
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await context.addCookies(credentials.cookies);
    const page = await context.newPage();
    if (isDebug) console.log(yellow("[+] Membuka halaman TikTok messages..."));
    await page.goto(CONFIG.targetUrl, { waitUntil: "networkidle", timeout: 60000 });
    if (isDebug) console.log(yellow("[+] Halaman loaded, tunggu UI siap..."));
    await page.waitForTimeout(CONFIG.pageLoadDelayMs);


    let success = 0,
    failed = 0;
    const iframe = page.frameLocator("iframe[src*='/messages?allow_label=true&lang=en&scene=business']");
    try {
      await iframe.locator("._TUXModal-wrapper").waitFor({ state: "visible", timeout: 3000 });
      await iframe.locator("._TUXModal-wrapper").click({ position: { x: 1, y: 1 } });
    } catch (e) {
    }


    for (let i = 0; i < CONFIG.totalUsers; i++) {
      try {
        const userSelector = `div[data-index="${i}"] [data-e2e="dm-new-conversation-item"]`;
        await iframe.locator(userSelector).waitFor({ timeout: 3000 });
        await iframe.locator(userSelector).click();
        const nicknameSelector = `div[data-index="${i}"] [data-e2e="dm-new-conversation-nickname"]`;
        const username = await iframe.locator(nicknameSelector).textContent();
        console.log(yellow(`\n[${i + 1}/${CONFIG.totalUsers}] Mengirim pesan ke: ${username}`));
        await page.waitForTimeout(500);
        if (isDebug) console.log(yellow("  [~] Mencari editor..."));
        await iframe.locator('[contenteditable="true"], div.notranslate.public-DraftEditor-content').waitFor({ timeout: 3000 });
        await iframe.locator('[contenteditable="true"], div.notranslate.public-DraftEditor-content').click();
        await page.waitForTimeout(CONFIG.afterClickDelayMs);
        let message = CONFIG.message;
        if (CONFIG.useQuotesAPi) {
          const quote = await fetchQuote();
          if (!quote) throw new Error("Gagal fetch quote");
          message = quote;
          if (isDebug) console.log(cyan(`  [~] Quote: ${quote}`));
        }
        await page.keyboard.type(message, { delay: CONFIG.typeDelayMs });
        await page.waitForTimeout(CONFIG.afterSendDelayMs);
        if (isDebug) console.log(blue("  [~] Mengirim dengan Ctrl+Enter..."));
        await page.keyboard.down("Control");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Control");
        await page.waitForTimeout(CONFIG.afterSendDelayMs);
        console.log(green(`  [✓] Terkirim!`));
        success++;
      } catch (e) {
        if (isDebug) console.log(red(`  [✗] Error: ${e.message}`));
        failed++;
      }


      if (i < CONFIG.totalUsers - 1) {
        if (isDebug) console.log(yellow(`  [~] Tunggu ${CONFIG.actionDelayMs} ms...`));
        await page.waitForTimeout(CONFIG.actionDelayMs);
      }
    }


    console.log(green(`\n[+] SELESAI!`));
    console.log(blue(`[+] Success: ${success}`));
    console.log(red(`[+] Failed: ${failed}\n`));
    await page.waitForTimeout(CONFIG.finishDelayMs);
  } catch (e) {
    if (isDebug) console.error(red("[!] Fatal error:", e.message));
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
};


main();