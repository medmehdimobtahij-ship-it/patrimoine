# Patrimoine

[![Tests](https://github.com/medmehdimobtahij-ship-it/patrimoine/actions/workflows/demo.yml/badge.svg)](https://github.com/medmehdimobtahij-ship-it/patrimoine/actions/workflows/demo.yml)

My bank app only shows one bank. My savings and my crypto don't show up anywhere.
I wanted a single view of everything I own and of where my money goes each month, without handing my data to yet another app. So I made one.

I use it every day on my phone.

**[Try the demo](https://medmehdimobtahij-ship-it.github.io/patrimoine/)**, nothing to install, fake data, nothing is saved.

## Demo vs the real thing

The online demo only shows the app with 14 months of made-up transactions. **You can't connect a bank account or a Binance account in the demo**: there is no server behind it, so no bank sync, no crypto sync and no live sync between devices.

To use it with your own accounts, you deploy your own copy on Cloudflare (free tier), with your own API keys stored on your server. That's the version I run every day.

![Net worth and accounts](docs/patrimoine.png)

| Monthly summary | Spending analysis |
|---|---|
| ![Summary](docs/bilan.png) | ![Analysis](docs/analyse.png) |

## What it does

- net worth over time, and a click on the chart explains what changed
- income, spending and savings rate per month, by category
- budgets, and a financial health score with concrete suggestions
- bank statement import (Revolut, BNP…) with duplicate detection and automatic categories
- bank sync through open banking, crypto through Binance (read-only)
- live sync between my phone and my computer
- works offline, installable like an app

## How it's built

Plain JavaScript on the front, no framework.
A small Cloudflare Worker sits in the middle, so API keys never reach the browser. It also keeps my devices in sync over WebSocket.

```
Phone / PC (PWA)  ──HTTPS + WebSocket──►  Cloudflare Worker  ──►  Durable Object (state, live sync)
                                              ├──► Binance (signed requests, read-only)
                                              └──► Enable Banking (open banking)
```

## Try it locally

With Node.js 18+:

```bash
./demo.sh        # or demo.bat on Windows
```

Then open http://localhost:8787/?demo. The demo loads 14 months of fake transactions.

Same as the online demo: fake data, no account connection.

## Install your own copy

```bash
npm install
npx wrangler login
npx wrangler kv namespace create DATA   # put the id in wrangler.toml
npm run deploy                          # gives you https://patrimoine.<account>.workers.dev
npx wrangler secret put APP_TOKEN       # the app password (long, made up)
npx wrangler secret put BINANCE_KEY     # optional: read-only Binance API key
npx wrangler secret put BINANCE_SECRET
npx wrangler secret put EB_APP_ID       # optional: Enable Banking app (open banking)
npx wrangler secret put EB_PRIVATE_KEY  # content of the .pem file
```

Open the address in Chrome, "Install app", enter your `APP_TOKEN`, then connect your banks and Binance from the settings.

Tests: `npm test`

The interface is in French.

MIT licence. Made by Mehdi Mobtahij.
