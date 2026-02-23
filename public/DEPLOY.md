# Trevdor Deployment Guide

Target: Ubuntu server with Apache2 + HTTPS (Let's Encrypt) already configured.
Domain: charlization.com
Game URL: https://charlization.com/trevdor/

---

## Step 1: Enable Apache proxy modules (one-time, skip if already done for PTF)

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel
```

## Step 2: Add Trevdor proxy rules to Apache

Edit your HTTPS virtual host config:
```bash
sudo nano /etc/apache2/sites-available/YOUR-SSL-CONFIG.conf
```

Add these lines INSIDE the `<VirtualHost *:443>` block, before `</VirtualHost>`:
```apache
    # ── Trevdor Game (port 8787) ──
    # WebSocket proxy (MUST come before the HTTP proxy)
    ProxyPass /trevdor/ws ws://127.0.0.1:8787/ws
    ProxyPassReverse /trevdor/ws ws://127.0.0.1:8787/ws

    # HTTP proxy for static files
    ProxyPass /trevdor/ http://127.0.0.1:8787/
    ProxyPassReverse /trevdor/ http://127.0.0.1:8787/
```

Test config and restart:
```bash
sudo apache2ctl configtest
sudo systemctl restart apache2
```

## Step 3: Clone and set up Trevdor

```bash
cd /opt
sudo mkdir -p trevdor
sudo chown $USER:$USER trevdor
git clone https://github.com/kruegsw/trevdor.git trevdor
cd trevdor
npm install
```

## Step 4: Start the server with pm2

```bash
pm2 start server/server.js --name trevdor
pm2 save
```

If pm2 startup hasn't been configured yet (skip if already done for PTF):
```bash
pm2 startup
# follow the command pm2 prints — copy/paste the sudo line it gives you
```

## Step 5: Test it

Open https://charlization.com/trevdor/ in your browser.
You should see the game lobby. Open a second tab to test multiplayer.

---

## Useful pm2 commands

```bash
pm2 status          # Check if running
pm2 logs trevdor    # See server logs (Ctrl+C to exit)
pm2 restart trevdor # Restart after code changes
pm2 stop trevdor    # Stop the server
```

## Updating after code changes

```bash
cd /opt/trevdor
git pull
npm install          # In case dependencies changed
pm2 restart trevdor  # Restart server
```

---

## Subpath notes

When served behind Apache at `/trevdor/`, a few things need to be true in the client code:

1. **WebSocket URL** (`public/trevdor.js`): The client detects whether it's behind
   the proxy (no port in the URL) and adds `/trevdor` as a prefix to the WS path.
   Locally (with a port like `8787`), no prefix is added. The WS URL always ends
   with `/ws` to match the Apache `ProxyPass` rule.

2. **Engine imports**: The `engine/` folder lives outside `public/`, but the server
   maps `/engine/*` requests to the `engine/` directory at the project root. Client
   code imports engine modules via relative paths that resolve to `/engine/...`
   (e.g. `../engine/actions.js` from `public/ui/intent.js`). This works because the
   server serves both `/public` and `/engine` as separate roots. No copies needed.

3. **All other imports** in `public/` use relative paths (`./`, `../`) which resolve
   correctly in both environments.
