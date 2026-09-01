# Stubs

Shared tracker for credit-card rewards, deployed as a Cloudflare Worker with
static assets and persistent KV storage.

## Development

```sh
bun install
bun run dev
```

## Deployment

Cloudflare Workers Builds deploys the project with:

```sh
bun run deploy
```

The `STUBS_DATA` KV namespace is provisioned from `wrangler.jsonc` on the first
deployment. The app starts with an empty data set.
