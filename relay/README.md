# Companion Live Phenomenon relay

The Python relay is retained for internal development. The app presents Phenomena as an offline reference, and current callouts and location pictures are available in `#phenomenon-callouts`. Companion leaves stored Phenomenon endpoints, preferences and history in the profile. The normal app lifecycle leaves its relay worker dormant. [PokeMMO Companion Discord](https://discord.gg/5Wbh28M3gu)

The relay reads one Phenomenon channel through Discord API v10, accepts embeds from the configured Alphapedia bot ID and serves normalized reports at `GET /v1/phenomena`. The optional server ID supplies Discord message links. Alpha and Swarm continue to use Alphapedia’s separate ntfy topics. [Discord message API](https://docs.discord.com/developers/resources/message#get-channel-messages)

## Maintainer smoke test

Use Python 3.10 or later from the repository root. Enter the bot token at the hidden prompt and keep it in the relay process environment. The optional guild ID is the Discord server ID.

```bash
(
  read -rs -p 'Companion Live bot token: ' COMPANION_LIVE_DISCORD_TOKEN
  printf '\n'
  read -r -p 'Discord server ID (optional): ' COMPANION_LIVE_DISCORD_GUILD_ID
  export COMPANION_LIVE_DISCORD_TOKEN COMPANION_LIVE_DISCORD_GUILD_ID
  exec python3 -m relay.phenomena
)
```

In another terminal, check the status and report count over loopback.

```bash
curl -fsS http://127.0.0.1:8767/v1/phenomena | python3 -c 'import json, sys; d=json.load(sys.stdin); print(d["source"], len(d["reports"]))'
```

For token-free coverage of normalization, cached history, rate limits and public-address validation, run `python3 -m pytest -q tests/test_phenomena.py`. [Fixture provenance](../tests/fixtures/phenomena.json)

## Shared community test service

Use the separate `relay.community` service for the Batch 03 prototype. It listens on IPv4 loopback and stores a versioned feed in its own SQLite file. Run the service and both source-checkout clients on one machine.

1. Create a temporary directory outside the repository. In it, create `credentials.json` containing a `read_token` and a `writers` object mapping synthetic contributor names such as `alice` and `bob` to distinct write tokens. Generate each token with `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
2. From the checkout root, run `python -m relay.community --db /path/to/temp/community.sqlite3 --credentials /path/to/temp/credentials.json`. The default address is `http://127.0.0.1:8766`. Reuse the database file to test a service restart.
3. For each client process, set `COMPANION_COMMUNITY_URL` and `COMPANION_COMMUNITY_READ_TOKEN` to the service address and read token. For a writer, also set `COMPANION_COMMUNITY_CONTRIBUTOR` and `COMPANION_COMMUNITY_WRITE_TOKEN` for that identity. Launch `python -m companion --browser --no-open --data-dir /path/to/temp/alice` with a different temporary data directory per client.
4. Under **Settings → Sources**, enable Companion Community and receiving from the test service. For a writer, also enable explicit sharing. Open **Live → Reports**, create a synthetic report, and select the share checkbox. The report should appear in the other client's feed. Use the writer's report detail to correct or withdraw it.

Run the automated two-profile scenario with `python -m pytest -q -s tests/test_shared_community.py`. The tests use only temporary profiles and synthetic data.
