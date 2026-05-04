# MovieNight (SvelteKit rewrite)

Single-room streaming chat. SvelteKit + adapter-node. SSE for chat, HLS for video.
mediamtx handles RTMP ingest + HLS muxing (run as a separate service).

## Architecture

- **SvelteKit (adapter-node)** — chat UI + chat API + mediamtx publish-auth webhook.
- **mediamtx** — separate process. Receives RTMP from OBS, outputs HLS-LL on its own port.
- **nginx** — reverse-proxies the app, proxies `/hls/*` straight to mediamtx, terminates TLS.

The Go server is gone. mediamtx is no longer supervised by the app — run it via
`rc.d`, systemd, or whatever your host uses.

## Endpoints

| Method | Path                  | Purpose                                  |
| ------ | --------------------- | ---------------------------------------- |
| GET    | `/`                   | Chat UI                                  |
| POST   | `/api/join`           | `{name, color}` → set session, join room |
| GET    | `/api/events`         | SSE stream of chat + events              |
| POST   | `/api/msg`            | `{text}` → send chat message             |
| POST   | `/api/leave`          | Leave room                               |
| POST   | `/api/auth/mediamtx`  | mediamtx publish-auth webhook            |

## Env vars

| Var            | Default                   | Purpose                                       |
| -------------- | ------------------------- | --------------------------------------------- |
| `STREAM_KEY`   | _(required)_              | Key OBS uses to publish via RTMP              |
| `PUBLISH_PATH` | `live`                    | mediamtx publish path prefix (`<path>/<key>`) |
| `PAGE_TITLE`   | `Movie Night`             | Browser title prefix                          |
| `PORT`         | `3000`                    | adapter-node listen port                      |
| `HOST`         | `0.0.0.0`                 | adapter-node bind addr                        |

## Develop

```sh
npm install
STREAM_KEY=devkey npm run dev
```

## Build + run

```sh
npm run build
STREAM_KEY=hunter2 PORT=8089 node build
```

## mediamtx config

Configure mediamtx with HTTP publish-auth pointing at this app:

```yaml
authMethod: http
authHTTPAddress: http://127.0.0.1:8089/api/auth/mediamtx
authHTTPExclude:
  - action: read
  - action: api
  - action: metrics
  - action: pprof

paths:
  all:
    source: publisher
```

Run mediamtx separately. It listens on `:1935` for RTMP and `:8888` for HLS-LL by default.

## nginx

Front the app and proxy HLS straight to mediamtx (skip the app for media):

```nginx
upstream movienight_app { server 127.0.0.1:8089; }
upstream movienight_hls { server 127.0.0.1:8888; }

server {
    server_name movienight.example.com;
    listen 443 ssl http2;

    location / {
        proxy_pass http://movienight_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # SSE: turn off buffering so events flush immediately.
    location /api/events {
        proxy_pass http://movienight_app;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }

    # HLS goes straight to mediamtx; rewrite "/hls/" -> "/<PUBLISH_PATH>/<STREAM_KEY>/"
    location ~ ^/hls/(.*)$ {
        proxy_pass http://movienight_hls/live/CHANGE_ME_STREAM_KEY/$1;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

(The stream key never reaches the browser — it's baked into nginx config and the
mediamtx publish path. Rotate by updating both nginx + the app's `STREAM_KEY` env.)

## OBS

- Stream URL: `rtmp://your.host:1935/live`
- Stream Key: value of `STREAM_KEY`
- Codec: H.264 video, AAC audio (broadest browser support)

## Chat features

- Join with name + color (random fallback)
- `/me <action>`, `/playing <title> [link]`, `/count`, `/users`, `/reloadplayer`
- Emote autocomplete (`:emote:` or bare word)
- Mentions (`@name` highlights for the mentioned user)
- Spoilers (`||hidden text||`)
- Auto-reconnect on SSE drop (browser-native)

No bans. No mods. No rate limits. No room PIN. By design — keep it simple.
