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
