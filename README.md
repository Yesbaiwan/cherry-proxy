## cherry-studio-qwen2api

OpenAI-compatible Flask proxy for Cherry Studio `chat/completions`, with minimal request/response rewriting.

### Features

- `POST /v1/chat/completions`
- `GET /v1/models`
- `GET /health`
- `GET /`
- Optional Bearer auth via `.env`(unset `OPENAI_API_KEY` = no auth)
- Cherry HMAC signature headers
- JSON and SSE streaming support
- Chat payloads and upstream responses are passed through as much as possible

### Quick start

1. Copy `.env.example` to `.env`
2. Install dependencies
3. Run `python main.py`

**Alternative deploys:** scripts in `edge/` for Cloudflare Workers and Deno Deploy. The only configurable env var is `OPENAI_API_KEY`.
