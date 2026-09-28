# Teng Games multiplayer relay

Arcane Arena and Hammerguy's Party are peer-to-peer: the host's browser runs the match, and other players connect straight to it over WebRTC. On some networks a direct connection can't be made. Examples are mobile data, "carrier-grade" NAT, and school or office wifi. When that happens, players connect through this relay instead.

The relay is a small Cloudflare Worker with one Durable Object per game code. It passes messages between the host and its players over WebSockets on port 443, which works anywhere the website itself loads. It never reads the messages. The protocol is described at the top of `src/index.js`.

Cloudflare's free plan is enough. This site is static GitHub Pages, so it can't run the relay itself.

The full multiplayer design lives in each game repo, in [docs/multiplayer.md](https://github.com/JTstacky/Arcane-Arena/blob/main/docs/multiplayer.md). It covers direct connections, this relay, snapshot compression, prediction and every setting, plus how to add a new game.

## How the games find it

The games read `/relay.json` from the site, which looks like `{"url":"wss://…"}`. Without that file, they use direct connections only, as before.

For testing, the page URL can also include:
- `?relay=wss://…` to use a different relay;
- `?relay=off` to turn the relay off;
- `?net=relay` to skip the direct attempt and always use the relay.

## One-time setup

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up.
2. Open **Workers & Pages** once, so Cloudflare sets up your `*.workers.dev` subdomain.
3. Copy the **Account ID** from that page.
4. Create an API token at https://dash.cloudflare.com/profile/api-tokens with **Create Token → "Edit Cloudflare Workers"** template → *Continue* → *Create*.
5. In this GitHub repo, go to **Settings → Secrets and variables → Actions** and add two secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
6. Go to **Actions → Deploy multiplayer relay → Run workflow**.

The workflow does three things:
- deploys the Worker;
- checks that the Worker answers;
- writes `public/relay.json` and redeploys the site.

It also re-runs whenever `relay/` changes.

## Local development

```bash
cd relay
npm install
npx wrangler dev --port 8787 --var ALLOWED_ORIGINS:'*'
# then open a game with ?relay=ws://127.0.0.1:8787
```

`ALLOWED_ORIGINS` in `wrangler.toml` lists the sites whose pages may use the relay.
