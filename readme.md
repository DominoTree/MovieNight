<!-- markdown-toc start - Don't edit this section. Run M-x markdown-toc-refresh-toc -->
**Table of Contents**
- [MovieNight stream server](#movienight-stream-server)
    - [Build requirements](#build-requirements)
        - [Older Go Versions](#older-go-versions)
        - [Compile and install](#compile-and-install)
        - [Install mediamtx](#install-mediamtx)
        - [Install hls.js](#install-hlsjs)
        - [FreeNAS / TrueNAS / FreeBSD build and run](#freenas-freebsd-build-and-run)
    - [Usage](#usage)
    - [Reverse proxy](#reverse-proxy)
    - [Configuration](#configuration)

<!-- markdown-toc end -->
# MovieNight stream server
[![Build status](https://api.travis-ci.org/zorchenhimer/MovieNight.svg?branch=master)](https://travis-ci.org/zorchenhimer/MovieNight)

This is a single-instance streaming server with chat. Originally written to
replace Rabbit as the platform for watching movies with a group of people
online.

Streaming pipeline: OBS → RTMP ingest (`mediamtx`) → HLS Low-Latency → browser
(`hls.js`, or native HLS on Safari/iOS).

## Build requirements
- Go 1.18 or newer
- GNU Make
- `mediamtx` binary (handles RTMP ingest + HLS muxing). See [Install mediamtx](#install-mediamtx) below.
- `hls.js` (browser-side player). See [Install hls.js](#install-hlsjs) below.

### Older Go Versions
You can install a newer version of Go alongside your OS's distribution by
following the guide here: [https://golang.org/doc/manage-install](https://golang.org/doc/manage-install)

Once you have that setup add an environment variable named `GO_VERSION` and
set it to the version you installed (eg, `1.18.10`). The Makefile will now use
the newer version.

### Compile and install
```shell
git clone https://github.com/zorchenhimer/MovieNight
cd MovieNight
make download-mediamtx
make download-hls
make
./MovieNight
```

For cross-compilation:
- Choose your `TARGET` (one of: `android darwin dragonfly freebsd linux nacl netbsd openbsd plan9 solaris windows`)
- Choose your `ARCH` (one of: `386 amd64 arm arm64 ppc64 ppc64le mips mipsle mips64 mips64le s390x sparc sparc64`)
- Build: `make TARGET=windows ARCH=386` (on BSD systems use `gmake`)

### Install mediamtx
`mediamtx` is a separate process that MovieNight spawns and supervises. It
accepts RTMP from OBS and outputs HLS-LL.

Use the Makefile target (downloads to `./bin/mediamtx`):
```shell
make download-mediamtx
```

Or download manually from https://github.com/bluenviron/mediamtx/releases and
place the binary somewhere on your `PATH`. Override the version:
```shell
make download-mediamtx MEDIAMTX_VERSION=1.9.3
```

If `mediamtx` is not on your `PATH`, set `MediamtxBinary` in `settings.json` to
the absolute path (e.g., `./bin/mediamtx`).

### Install hls.js
The browser-side player library is downloaded into `static/js/`:
```shell
make download-hls
```
Override the version with `HLS_JS_VERSION=1.5.17`.

### FreeNAS-FreeBSD build and run
A [FreeNAS & TrueNAS plugin](https://github.com/zorglube/iocage-plugin-movienight) had been released. You should find MovieNight into the plugin section of you management GUI. However you still can make an manual plugin deployment, documentation [here](https://github.com/freenas/iocage-ix-plugins).

If you prefer to make a Jail without using the plugin management, a script which sets up an Jail and builds and runs MovieNight into that Jail has been written: [freenas-iocage-movienight](https://github.com/zorglube/freenas-iocage-movienight).

## Usage
Configure OBS to push a stream to:
```text
rtmp://your.domain.host:1935/live
```
with **Stream Key** set to the value of `StreamKey` in `settings.json`.
Internally, mediamtx receives the publish at the path `live/<StreamKey>`. The
auth webhook validates the key.

View the stream at:
```text
http://your.domain.host:8089/
```

Video-only and chat-only views:
```text
http://your.domain.host:8089/video
http://your.domain.host:8089/chat
```

The HLS playlist is served at `/hls/index.m3u8` (proxied through MovieNight so
the stream key is not exposed).

CLI flags:
```text
Usage of ./MovieNight:
  -k string     Stream key, to protect your stream
  -l string     host:port of the HTTP server (default :8089)
  -r string     host:port of the RTMP server (passed to mediamtx, default :1935)
  -f string     the settings file you want to use (default ./settings.json)
  -a string     admin password override
  -s string     directory containing the static/ tree (default: binary's directory)
  --emotes string   directory to read emotes from
```

### Static assets layout

MovieNight reads HTML templates and static assets (JS, CSS, images) from
disk only — there is no embedded fallback. The `static/` tree must exist
alongside the binary (or wherever `--static` points). A typical layout:

```
/opt/movienight/
├── MovieNight
├── settings.json
├── emotes/
└── static/
    ├── base.html
    ├── main.html
    ├── ...
    ├── css/
    ├── img/
    └── js/
        ├── hls.min.1.5.17.js
        ├── video.js
        └── ...
```

### Codec requirements
mediamtx HLS-LL output uses the codecs the publisher provides. For maximum
browser compatibility, configure OBS to use:
- Video: H.264 (x264)
- Audio: AAC

HEVC, AV1, or Opus may not play in all browsers.

## Reverse proxy
Behind nginx, disable buffering on HLS:
```nginx
location / {
    proxy_pass http://127.0.0.1:8089;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location /hls/ {
    proxy_pass http://127.0.0.1:8089;
    proxy_buffering off;
    proxy_cache off;
}
```

You only need to expose ports `8089` (HTTP) and `1935` (RTMP) to the public
internet. The mediamtx HLS port (default `127.0.0.1:8888`) and API port
(default `127.0.0.1:9997`) bind to loopback.

## Configuration
MovieNight's configuration is controlled by `settings.json`:

- `AdminPassword`: users can enter `/auth <value>` into chat to grant themselves
  admin privileges. This value is automatically regenerated unless
  `RegenAdminPass` is false.
- `Bans`: list of banned users.
- `LetThemLurk`: if false, announces when a user enters and leaves chat.
- `ListenAddress`: the port that MovieNight listens on, formatted as `:8089`.
- `LogFile`: the path of the MovieNight logfile, relative to the executable.
- `LogLevel`: the log level, defaults to `debug`.
- `MaxMessageCount`: the number of messages displayed in the chat window.
- `NewPin`: if true, regenerates `RoomAccessPin` when the server starts.
- `PageTitle`: the base string used in the `<title>` element of the page. When
  the stream title is set with `/playing`, it is appended; e.g.,
  `Movie Night | The Man Who Killed Hitler and Then the Bigfoot`.
- `RegenAdminPass`: if true, regenerates `AdminPassword` when the server starts.
- `RoomAccess`: the access policy of the chat room; this is managed by the
  application and should not be edited manually.
- `RoomAccessPin`: if set, serves as the password required to enter the chatroom.
- `RtmpListenAddress`: host:port that mediamtx accepts RTMP on (default `:1935`).
- `SessionKey`: key used for storing session data (cookies etc.).
- `StreamKey`: the key that OBS will use to connect to MovieNight.
- `StreamStats`: if true, prints statistics for the stream on server shutdown.
- `TitleLength`: the maximum allowed length for the stream title (set with `/playing`).
- `WrappedEmotesOnly`: if true, requires that emote codes be wrapped in colons
  or brackets; e.g., `:PogChamp:`.
- `RateLimitChat`: the number of seconds between each message a non-privileged
  user can post in chat.
- `RateLimitNick`: the number of seconds before a user can change their nick again.
- `RateLimitColor`: the number of seconds before a user can change their color again.
- `RateLimitAuth`: the number of seconds between each allowed auth attempt.
- `RateLimitDuplicate`: the number of seconds before a user can post a
  duplicate message.
- `NoCache`: if true, set `Cache-Control: no-cache, must-revalidate` in the HTTP
  header, to prevent caching responses.
- `MediamtxBinary`: path to the mediamtx binary (default `mediamtx`, looked up
  on `PATH`).
- `MediamtxHlsAddress`: host:port for mediamtx's internal HLS server (default
  `127.0.0.1:8888`). MovieNight reverse-proxies this.
- `MediamtxApiAddress`: host:port for mediamtx's control API (default
  `127.0.0.1:9997`). MovieNight queries this to discover the active stream.
- `MediamtxConfigPath`: path where MovieNight writes the generated mediamtx
  config (default in `os.TempDir()`).

## License
`hls.js` is licensed under the Apache 2.0 license. `mediamtx` is licensed
under the MIT license. This project is licensed under the MIT license.
