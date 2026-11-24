# Companion Live Phenomenon relay

The relay reads the Phenomenon channel from Discord API v10 with the Companion Live bot. It accepts embeds from the configured Alphapedia bot ID and serves normalized reports at `GET /v1/phenomena`. The optional server ID supplies Discord message links. The application’s Alpha and Swarm connections continue to use Alphapedia ntfy. [Discord message API](https://docs.discord.com/developers/resources/message#get-channel-messages)

## Private local test

1. Check out the prepared `develop` commit. Use Python 3.10 or later. Open a private Bash terminal from the repository root and enter the token at the hidden prompt. Shell history records the commands and excludes the value you enter. The optional guild ID is the Discord **server** ID, which you can copy with Discord Developer Mode. It is separate from the application and channel IDs.
   ```bash
   (
     read -rs -p 'Companion Live bot token: ' COMPANION_LIVE_DISCORD_TOKEN
     printf '\n'
     read -r -p 'Discord server ID (optional): ' COMPANION_LIVE_DISCORD_GUILD_ID
     export COMPANION_LIVE_DISCORD_TOKEN COMPANION_LIVE_DISCORD_GUILD_ID
     exec python3 -m relay.phenomena
   )
   ```
2. From another terminal, check the relay status and report count locally.
   ```bash
   curl -fsS http://127.0.0.1:8767/v1/phenomena | python3 -c 'import json, sys; d=json.load(sys.stdin); print(d["source"], len(d["reports"]))'
   ```
3. Run `python3 -m companion --browser --data-dir "$(mktemp -d)"` from the checkout, or use a local standalone build with a fresh data directory. Under **Settings → Advanced**, set **Phenomenon relay override** to `http://127.0.0.1:8767/v1/phenomena`. Enable **Phenomenon reports** in **Settings → Live sources & news**, then open **Live → Phenomena**. Compare the original report times, notes, HMs and screenshot with Discord. Try **Recent reports**, **Report history** and **Pop out**.
4. In **Settings → Notifications**, enable the Phenomenon route before the next new report. The initial batch and reconnect catch-up are silent. Check that a new report delivers once and an edit updates it without another alert. Stop the relay with Ctrl+C. Within the next poll the client shows the feed as offline and keeps its local history. Restart the relay and check recovery.

For token-free testing, install the development test dependencies and run `python3 -m pytest -q tests/test_phenomena.py tests/ui/test_ui_phenomena.py`. The browser test uses Playwright Chromium. Both use reconstructed fixtures with placeholder image paths and synthetic pixels. [Fixture provenance](../tests/fixtures/phenomena.json)

The first relay poll reads up to 100 Discord messages. Later polls re-read the same depth to catch edits and retain up to 200 normalized reports in memory. When Discord fails, the feed retains its last valid snapshot and exposes the last successful refresh time with the source status. Rate-limit headers and response bodies can extend the 60-second poll interval. A relay restart rebuilds the snapshot from Discord. Clients retain their saved history in SQLite and display the latest 300 reports. Edits to messages outside Discord’s 100-message window will not be observed. Unsupported title patterns are skipped. The 60-minute Home and Live window is based on report age. [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits)

The app fetches original PNG, JPEG or WebP bytes on demand from direct HTTPS URLs at `i.imgur.com`. It verifies TLS, excludes non-public addresses and redirects, and displays a fallback when the image cannot be fetched. The local web view may cache the bytes for five minutes. The relay stores only the image URL and dimensions.

## Deployment after owner approval

1. Verify effective permissions in Discord for the actual bot member, including server roles and channel overrides. The bot needs **View Channel**, **Read Message History** and Message Content Intent for the Phenomenon channel. Remove broader access and write permissions. Confirm it cannot post or read other private channels. Verify the live embed fields and image URLs with a local run. [Discord permissions](https://docs.discord.com/developers/topics/permissions)
2. Obtain authorization for sharing normalized Alphapedia reports and the referenced screenshots with the intended audience. Confirm that each image host is approved and decide whether access must stay within a testers-only network.
3. A low-maintenance option is an existing owner-approved Linux VPS with one `systemd` service and Caddy. Copy only `relay/__init__.py`, `relay/phenomena.py`, `companion/__init__.py` and `companion/phenomenon_protocol.py`, keeping the directory structure. Use a dedicated service user and a private `EnvironmentFile` readable only by root. Start `/usr/bin/python3 -m relay.phenomena` from that directory, with `Restart=on-failure`. Keep port 8767 on loopback. [Caddy reverse proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
4. Use Caddy to serve only `GET` and `HEAD` for `/v1/phenomena` over HTTPS. For a friends-only deployment, limit network access to approved testers, for example via an owner-managed private network. Verify denial from outside that network, then configure the client default. The Discord token remains on the relay host. Confirm access and revocation before expanding the audience.


## Client default

Set `PHENOMENA_RELAY_URL` in `companion/config.py` to the approved HTTPS `/v1/phenomena` URL before building the client. Keep the hostname stable across relay moves so installed clients can retain the same address. The constant is currently empty. A fresh profile only connects when the user enables Phenomenon reports. The Advanced override takes priority, and an existing profile with a saved relay continues to use it. Turning the source off keeps the saved override. Discord credentials stay in the relay environment.

## Free hosted option

For the fastest closed-alpha setup, reuse the Python relay on an existing always-on Linux machine with HTTPS in front. This has no incremental hosting bill if that machine and its network are already available. Its uptime depends on the machine, network and HTTPS setup.

If the owner needs a managed service with no always-on machine, **Cloudflare Workers Free with a Cron Trigger and D1** fits a small alpha on paper. Keep the current feed contract and validation fixtures. A small Worker implementation would poll once per minute, store a bounded normalized snapshot and its refresh status in one D1 row, and serve that snapshot on GET and HEAD. Persist the next allowed fetch time so scheduled runs respect Discord’s rate-limit responses. Set the bot token through Workers Secrets. The Worker would serve JSON only. Companion continues to fetch the original images. This option needs implementation and a private pilot after approval. [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) · [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

One write per minute is about 1,440 rows a day, within D1 Free’s 100,000 daily row writes. The same write pattern exceeds KV Free’s 1,000 daily writes. Workers Free allows 100,000 daily requests. With a 60-second client interval, 50 continuously connected testers use about 72,000 requests a day before scheduled work and other traffic. Leave headroom, use the Free plan, and watch request counts, CPU limits and last-success timestamps during the pilot. Free quotas bound capacity, and the feed can become unavailable if the service or quota fails. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [KV limits](https://developers.cloudflare.com/kv/platform/limits/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

Apply the same Discord permission, content authorization and audience checks as for the Python deployment. A hard-coded endpoint is an address, so a friends-only feed needs access restricted outside the app, such as a private network or an owner-approved access layer. Verify that restriction before setting the default.
