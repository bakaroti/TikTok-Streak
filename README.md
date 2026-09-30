# TikTok Streak Bot

<img width="500" height="500" alt="image" src="https://github.com/user-attachments/assets/67aef3dc-6cc5-48d8-8d3c-f8a40d999ac2" />

- Bot otomatis streak TikTok: kirim pesan ke banyak percakapan via Puppeteer
- Dijalankan sepenuhnya di GitHub Actions, tidak perlu PC nyala
- Konfigurasi via `config.json`, cookie via GitHub Secrets, notifikasi Discord
- **Telegram bot**: trigger workflow, scan chat, kelola target dari HP

> [!WARNING]
> **This TikTok Streak Bot is illegal. Use it at your own risk.**
>
> This project is provided for educational and experimental purposes only. By using this bot, you acknowledge that you are responsible for your own actions and any consequences that may result from its use.

## Features

- Login pakai session cookie TikTok (env `COOKIES_JSON` atau `cookies.json` lokal)
- Kirim pesan otomatis ke target list dengan jeda configurable
- Scan 15 chat teratas (username saja, tanpa isi pesan)
- Mode pesan statis, custom message, atau kutipan acak dari `dummyjson.com`
- Cron otomatis **00:00 WIB** setiap hari di GitHub Actions + `workflow_dispatch` manual
- Telegram bot: trigger workflow dari HP, kelola target, scan chat
- Notifikasi status run ke Discord webhook

## Structure of the Repo

| Path | Description |
| :--- | :--- |
| `.github/` | Workflow Actions, CodeQL, Dependabot |
| `config.json` | Semua opsi perilaku bot (pesan, delay, target) |
| `index.js` | Bot Puppeteer: launch, inject cookie, kirim pesan, scan |
| `package.json` | Manifest npm: dependency Puppeteer, figlet, kleur |

---

## Setup

### 1. Fork Repo

Fork repo ini ke akun GitHub kamu.

### 2. Ambil Cookie TikTok

Export cookie TikTok dari browser (extension EditThisCookie) atau dari HP yang sudah root.

Format JSON array:
```json
[
  { "name": "sessionid", "value": "...", "domain": ".tiktok.com", "path": "/", "httpOnly": true, "secure": true, "expirationDate": 1821811978.03 },
  { "name": "ttwid", "value": "...", "domain": ".tiktok.com", "path": "/", "httpOnly": true, "secure": true, "expirationDate": 1822243893.254 }
]
```

### 3. Simpan di GitHub Secrets

Buka repo fork kamu → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
| :--- | :--- |
| `COOKIES_JSON` | Seluruh JSON array cookie di atas |
| `DISCORD_WEBHOOK` | *(opsional)* URL webhook Discord |

### 4. Edit config.json

```json
{
  "message": "api wei\n(send by da0bot)",
  "useQuotesAPi": false,
  "totalUsers": 15,
  "onlyWithStreak": false,
  "dryRun": false,
  "targetUsernames": ["denyi", "*___*", "gldnslw", "apaini", "PRETDUT", "pencuri keperawanan"],
  "actionDelayMs": 200,
  "typeDelayMs": 0,
  "afterSendDelayMs": 500,
  "afterClickDelayMs": 200,
  "pageLoadDelayMs": 3000,
  "finishDelayMs": 3000,
  "headless": true,
  "bannerFont": "DOS Rebel",
  "targetUrl": "https://www.tiktok.com/messages?lang=en"
}
```

| Field | Deskripsi |
| :--- | :--- |
| `message` | Pesan default yang dikirim. `\n` = baris baru |
| `useQuotesAPi` | `true` = kirim kutipan acak. `false` = pakai `message` |
| `targetUsernames` | Daftar target. Kosongkan `[]` = auto scan semua |
| `dryRun` | `true` = test tanpa kirim. `false` = kirim beneran |
| `totalUsers` | Jumlah chat yang discan/dikirim |
| `actionDelayMs` | Jeda antar pengiriman (ms) |
| `headless` | `true` untuk GitHub Actions |

### 5. Jalankan

**Manual:**
Actions → **TikTok Streak** → **Run workflow**

**Otomatis:**
Cron `0 17 * * *` UTC = **00:00 WIB** setiap hari.

---

## Telegram Bot (Opsional)

Bot Telegram untuk kontrol workflow dari HP tanpa buka GitHub.

### 1. Buat Bot

Chat [@BotFather](https://t.me/BotFather) → `/newbot` → ikuti instruksi. Simpan token.

### 2. Buat Secrets File

Buat file `/data/data/com.termux/files/home/tiktok-telegram-secrets.json`:

```json
{
  "telegram_token": "123456789:ABCdefGhIJKlmNoPQRstuVWXyz",
  "github_tokens": [
    "github_pat_XXXX...",
    "ghp_XXXX..."
  ]
}
```

| Field | Deskripsi |
| :--- | :--- |
| `telegram_token` | Token dari BotFather |
| `github_tokens` | Daftar GitHub PAT. Bot pakai pertama yang valid, fallback ke berikutnya |

Buat GitHub token: [Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
- **Classic**: centang scope `repo` + `workflow`
- **Fine-grained**: pilih repo ini, permission `Actions: Write` + `Contents: Write`

Set permissions file:
```bash
chmod 600 /data/data/com.termux/files/home/tiktok-telegram-secrets.json
```

### 3. Install & Jalankan

```bash
pip install python-telegram-bot
/data/data/com.termux/files/usr/bin/python3 /data/data/com.termux/files/home/tiktok-telegram-bot.py
```

### 4. Pakai

Chat bot → `/start` → muncul menu:

```
[Scan]           [Send Default]
[Custom Message] [Add Target]
[Remove Target]  [List Target]
```

| Tombol | Fungsi |
| :--- | :--- |
| **Scan** | Scan 15 chat teratas di DM. Hanya baca, tidak kirim |
| **Send Default** | Trigger workflow kirim `message` dari config.json |
| **Custom Message** | Ketik pesan, kirim ke semua target |
| **Add Target** | Tambah username ke `targetUsernames` |
| **Remove Target** | Hapus username dari `targetUsernames` |
| **List Target** | Lihat daftar target |

Setiap submenu ada tombol **Back** untuk kembali ke menu utama.

---

## Struktur Pesan

Pesan default format:
```
api wei
(send by da0bot)
```

Custom message dari Telegram langsung dikirim apa adanya.

---

## Troubleshooting

| Masalah | Solusi |
| :--- | :--- |
| `iframe messages tidak ditemukan` | Cookie expired. Export ulang |
| `Message is not modified` | Error ditangani otomatis, abaikan |
| `Conflict: terminated by other getUpdates` | Bot lama masih jalan. `pkill -f tiktok-telegram-bot.py` |
| `Log not found` | Workflow belum selesai. Tunggu 60 detik |
| Scan mode tapi mau kirim | Pakai tombol **Send Default** / **Custom Message**, bukan **Scan** |
| Pesan tidak terkirim | Cek `dryRun: false` dan `SCAN_ONLY` kosong di workflow |

---

## Credit

Original: [KurniawanSatria/TikTok-Streak](https://github.com/KurniawanSatria/TikTok-Streak)

Made with 🚬 and ☕ by Saturia.
