const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const figlet = require("figlet");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Jakarta");
const { bold, red, yellow, blue, magenta, cyan, green } = require("kleur/colors");

const args = process.argv.slice(2);
const isDebug = args.includes("--debug");
const SCAN_ONLY = !!process.env.SCAN_ONLY;
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
  
  // Override message jika ada CUSTOM_MESSAGE dari workflow input
  let messageToSend = CONFIG.message;
  if (process.env.CUSTOM_MESSAGE && process.env.CUSTOM_MESSAGE.trim()) {
    messageToSend = process.env.CUSTOM_MESSAGE.trim();
    console.log(blue("[+] Message: CUSTOM (dari Telegram bot)"));
  } else if (CONFIG.useQuotesAPi) {
    console.log(blue("[+] Message: Random quote (dummyjson.com)"));
  } else {
    console.log(blue("[+] Message:", CONFIG.message));
  }
  console.log(yellow(`[+] Mode: ${isDebug ? "Debug" : "Normal"} ${SCAN_ONLY ? "(Scan Only)" : ""}\n`));

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
      const html = await page.content();
      const match = html.match(/<iframe[^>]+src="([^"]*\/messages[^"]*)"/i);
      const dump = `debug-main.html`;
      fs.writeFileSync(dump, html);
      if (match) {
        throw new Error(`iframe ditemukan via regex src="${match[1]}" tapi query selector tidak ketemu. HTML disimpan: ${dump}. Coba ganti selector iframe di index.js baris 97.`);
      }
      throw new Error(`iframe messages tidak ditemukan. HTML disimpan: ${dump}. Cek apakah TikTok memblokir halaman messages di headless mode.`);
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

    // Scan semua conversation: tandai mana yang sudah punya streak (api 🔥)
    // ponytail: deteksi via teks/emoji "🔥"/"streak" di item. Upgrade: dump HTML sekali -> pakai selector asli (class/icon) kalau emoji tidak muncul di DOM.
    let targets = [];
    
    if (CONFIG.targetUsernames && CONFIG.targetUsernames.length > 0) {
      console.log(cyan(`\n[+] Mode manual: hanya kirim ke ${CONFIG.targetUsernames.length} user spesifik.`));
      for (let i = 0; i < CONFIG.totalUsers; i++) {
        try {
          const sel = `div[data-index="${i}"] [data-e2e="dm-new-conversation-item"]`;
          await frame.waitForSelector(sel, { timeout: 5000 });
          const info = await frame.evaluate((s) => {
            const el = document.querySelector(s);
            if (!el) return null;
            const nick = document.querySelector(`div[data-index="${el.closest("[data-index]")?.dataset.index}"] [data-e2e="dm-new-conversation-nickname"]`)?.textContent || "";
            return { nick };
          }, sel);
          if (!info) continue;
          
          if (CONFIG.targetUsernames.some(name => info.nick.includes(name))) {
            targets.push({ i, nick: info.nick, hasStreak: true }); // Force true karena manual list
            console.log(green(`  ~ Found target: ${info.nick}`));
          }
        } catch {}
      }
      if (targets.length === 0) {
        console.log(red("[!] Tidak ada user dari list manual yang ditemukan di chat. Cek nama/pengejaan."));
        const dump = `debug-conversations.html`;
        fs.writeFileSync(dump, await frame.content());
        console.log(yellow(`HTML disimpan: ${dump}`));
        await browser.close();
        return;
      }
    } else {
      // Auto mode (scan streak)
      for (let i = 0; i < CONFIG.totalUsers; i++) {
        try {
          const sel = `div[data-index="${i}"] [data-e2e="dm-new-conversation-item"]`;
          await frame.waitForSelector(sel, { timeout: 5000 });
          const info = await frame.evaluate((s) => {
            const el = document.querySelector(s);
            if (!el) return null;
            const html = (el.closest("[data-index]")?.innerHTML) || el.innerHTML;
            const nick = document.querySelector(`div[data-index="${el.closest("[data-index]")?.dataset.index}"] [data-e2e="dm-new-conversation-nickname"]`)?.textContent || "";
            return { html, nick };
          }, sel);
          if (!info) continue;
          const hasStreak = /\ud83d\udd25|streak/i.test(info.html);
          targets.push({ i, nick: info.nick, hasStreak });
          if (isDebug) console.log(yellow(`  [~] #${i} ${info.nick}: ${hasStreak ? "STREAK ada" : "tanpa streak"}`));
          if (!fs.existsSync("debug-conversations.html")) fs.writeFileSync("debug-conversations.html", await frame.content());
        } catch {}
        await sleep(CONFIG.actionDelayMs);
      }
      if (CONFIG.onlyWithStreak) targets = targets.filter(t => t.hasStreak);
      console.log(blue(`\n[+] Target setelah filter: ${targets.length}/${CONFIG.totalUsers}`));
    }
    
    if (CONFIG.dryRun) {
      console.log(cyan("\n[DRY RUN] Mode test — tidak ada pesan terkirim.\n"));
      targets.forEach((t, idx) => console.log(green(`  ${idx + 1}. ${t.nick}`)));
      console.log(yellow("\nUbah dryRun: false di config.json untuk kirim pesan.\n"));
      await browser.close();
      return;
    }
    if (targets.length === 0) {
      console.log(yellow("[!] Tidak ada chat target. Cek debug-conversations.html."));
      await browser.close();
      return;
    }

    let success = 0, failed = 0;
    for (let t = 0; t < targets.length; t++) {
      const i = targets[t].i;
      try {
        const userSelector = `div[data-index="${i}"] [data-e2e="dm-new-conversation-item"]`;
        await frame.waitForSelector(userSelector, { timeout: 5000 });
        
        // Klik 1: via nickname (lebih reliable daripada whole item)
        const nicknameSelector = `div[data-index="${i}"] [data-e2e="dm-new-conversation-nickname"]`;
        const username = await frame.evaluate((sel) => {
          const el = document.querySelector(sel);
          return el ? el.textContent : '';
        }, nicknameSelector);
        console.log(yellow(`\n[${t + 1}/${targets.length}] -> ${username || 'unknown'}`));
        
        // Klik nickname langsung
        try {
          await frame.click(nicknameSelector);
        } catch {
          await frame.click(userSelector);
        }
        
        // Tunggu chatbox muncul isi: polling max 15 detik
        let chatReady = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          chatReady = await frame.evaluate(() => {
            const cb = document.querySelector('[data-e2e="dm-new-chatbox"]');
            if (!cb || cb.children.length === 0) return false;
            const hasEditor = cb.querySelector('[contenteditable="true"]') ||
                              cb.querySelector('textarea') ||
                              cb.querySelector('[data-e2e="message-input"]') ||
                              cb.querySelector('[role="textbox"]');
            return !!hasEditor;
          });
          if (chatReady) break;
          await sleep(500);
        }
        
        if (!chatReady) {
          // Debug: dump chatbox isi
          const chatboxInfo = await frame.evaluate(() => {
            const cb = document.querySelector('[data-e2e="dm-new-chatbox"]');
            return cb ? { childCount: cb.children.length, innerHTML: cb.innerHTML.substring(0, 2000) } : { childCount: -1, innerHTML: 'chatbox not found' };
          });
          console.log(red(`  [x] Chatbox childCount: ${chatboxInfo.childCount}`));
          if (isDebug) console.log(red(`  [!] chatbox HTML: ${chatboxInfo.innerHTML.substring(0, 500)}`));
          failed++;
          continue;
        }
        
        if (isDebug) console.log(green("  [~] Chatbox ready, editor ditemukan!"));

        if (SCAN_ONLY) {
          // Ambil last message dan timestamp
          const chatInfo = await frame.evaluate(() => {
            const cb = document.querySelector('[data-e2e="dm-new-chatbox"]');
            if (!cb) return { last_msg: "", time: "" };
            // Ambil last message dari chat bubbles
            const msgs = cb.querySelectorAll('[data-e2e="message-text"], [class*="message"], [class*="bubble"]');
            let last_msg = "";
            if (msgs.length > 0) {
              last_msg = msgs[msgs.length - 1].textContent.trim();
            }
            // Timestamp dari element waktu
            const timeEl = cb.querySelector('[data-e2e="message-time"], [class*="time"], time');
            const time = timeEl ? timeEl.textContent.trim() : new Date().toLocaleTimeString();
            return { last_msg: last_msg.substring(0, 100), time };
          });
          console.log(JSON.stringify({
            user: username || `unknown_${i}`,
            last_msg: chatInfo.last_msg,
            time: chatInfo.time
          }));
          success++;
          continue; // Skip send
        }

        // Klik editor
        await frame.evaluate(() => {
          const cb = document.querySelector('[data-e2e="dm-new-chatbox"]');
          const ed = cb.querySelector('[contenteditable="true"]') ||
                     cb.querySelector('textarea') ||
                     cb.querySelector('[role="textbox"]');
          if (ed) ed.click();
        });
        await sleep(CONFIG.afterClickDelayMs);

        let message = messageToSend;
        if (process.env.CUSTOM_MESSAGE && process.env.CUSTOM_MESSAGE.trim()) {
          message = process.env.CUSTOM_MESSAGE.trim();
        } else if (CONFIG.useQuotesAPi) {
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
      }
      if (t < targets.length - 1) await sleep(CONFIG.actionDelayMs);
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