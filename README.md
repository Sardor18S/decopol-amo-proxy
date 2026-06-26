# Decopol amoCRM Proxy — Render.com'ga joylashtirish

Bu server eski `amo_proxy.php` (PHP, ahost.uz hosting) o'rnini bosadi, chunki
hosting amoCRM bilan ishonchli ulanish o'rnata olmay qoldi.

## 1-qadam: GitHub'ga yuklash

1. github.com'da yangi repository yarating: `decopol-amo-proxy`
2. `index.js` va `package.json` fayllarini yuklang ("uploading an existing file")

## 2-qadam: Render.com'da Web Service yaratish

1. Render dashboard'da "New +" → "Web Service"
2. `decopol-amo-proxy` repository'ni tanlang
3. Sozlamalar:
   - **Name**: decopol-amo-proxy
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

## 3-qadam: Environment Variables

| Key | Value |
|---|---|
| `AMO_TOKEN` | (amoCRM uzoq muddatli token — eski amo_proxy.php faylidan oling) |
| `AMO_SUBDOMAIN` | decopoluzz |

## 4-qadam: Deploy va URL olish

"Create Web Service" tugmasini bosing, kutib turing. Tugagandan keyin URL
beriladi, masalan: `https://decopol-amo-proxy.onrender.com`

## 5-qadam: Sinab ko'rish

Brauzerda ochib ko'ring:
```
https://decopol-amo-proxy.onrender.com/ping
```
`{"ok":true,"account":"DECOPOL [TASHKENT]"}` chiqishi kerak.

## 6-qadam: Dashboard kodini yangilash

Dashboard HTML faylida, barcha `/amo_proxy.php?action=XXX` so'rovlari
`https://decopol-amo-proxy.onrender.com/XXX` ga almashtirilishi kerak.

Masalan:
- Eski: `/amo_proxy.php?action=cc_visit_count&from=...&to=...`
- Yangi: `https://decopol-amo-proxy.onrender.com/cc_visit_count?from=...&to=...`

(Bu o'zgarish Claude tomonidan dashboard faylida avtomatik amalga oshiriladi)
