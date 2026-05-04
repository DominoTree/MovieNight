# If a different version of Go is installed (via `go get`) set the GO_VERSION
# environment variable to that version.  For example, setting it to "1.13.7"
# will run `go1.13.7 build [...]` instead of `go build [...]`.
#
# For info on installing extra versions, see this page:
# https://golang.org/doc/install#extra_versions

# goosList = "android darwin dragonfly freebsd linux nacl netbsd openbsd plan9 solaris windows"
# goarchList = "386 amd64 amd64p32 arm arm64 ppc64 ppc64le mips mipsle mips64 mips64le mips64p32 mips64p32leppc s390 s390x sparc sparc64"

# Windows needs the .exe extension.
ifeq ($(OS),Windows_NT) 
EXT=.exe  
endif 

TAGS= 

MEDIAMTX_VERSION ?= 1.9.3
MEDIAMTX_OS := $(shell uname -s | tr '[:upper:]' '[:lower:]')
MEDIAMTX_ARCH_RAW := $(shell uname -m)
MEDIAMTX_ARCH := $(if $(filter x86_64,$(MEDIAMTX_ARCH_RAW)),amd64,$(if $(filter aarch64 arm64,$(MEDIAMTX_ARCH_RAW)),arm64v8,$(MEDIAMTX_ARCH_RAW)))

.PHONY: fmt vet get clean dev setdev test ServerMovieNight download-mediamtx download-hls

all: fmt vet test MovieNight settings.json

server: ServerMovieNight 

ServerMovieNight: *.go common/*.go 
	GOOS=${TARGET} GOARCH=${ARCH} go$(GO_VERSION) build -o MovieNight $(TAGS) 

setdev: 
	$(eval export TAGS=-tags "dev") 

dev: setdev all 

MovieNight: *.go common/*.go 
	GOOS=${TARGET} GOARCH=${ARCH} go$(GO_VERSION) build -o MovieNight${EXT} $(TAGS) 

clean: 
	-rm MovieNight${EXT} 

fmt: 
	gofmt -w . 

vet: 
	go$(GO_VERSION) vet $(TAGS) ./... 

test:
	go$(GO_VERSION) test $(TAGS) ./...

# Download mediamtx binary into ./bin (used as RTMP ingest + HLS muxer).
# Override version with MEDIAMTX_VERSION=x.y.z.
download-mediamtx:
	@mkdir -p bin
	@echo "Fetching mediamtx v$(MEDIAMTX_VERSION) for $(MEDIAMTX_OS)/$(MEDIAMTX_ARCH)..."
	@curl -fSL "https://github.com/bluenviron/mediamtx/releases/download/v$(MEDIAMTX_VERSION)/mediamtx_v$(MEDIAMTX_VERSION)_$(MEDIAMTX_OS)_$(MEDIAMTX_ARCH).tar.gz" \
		| tar -xz -C bin mediamtx
	@chmod +x bin/mediamtx
	@echo "mediamtx installed to ./bin/mediamtx"
	@echo "Set MediamtxBinary in settings.json to \"./bin/mediamtx\" or copy to a directory on PATH."

# Download hls.js (player library, served to browser clients).
# The version must match the HlsJsVersion constant in main.go.
HLS_JS_VERSION ?= 1.5.17
download-hls:
	@echo "Fetching hls.js v$(HLS_JS_VERSION)..."
	@curl -fSL -o static/js/hls.min.$(HLS_JS_VERSION).js "https://cdn.jsdelivr.net/npm/hls.js@$(HLS_JS_VERSION)/dist/hls.min.js"
	@echo "hls.js installed to static/js/hls.min.$(HLS_JS_VERSION).js"
	@echo "Ensure HlsJsVersion in main.go matches $(HLS_JS_VERSION)."

# Do not put settings_example.json here as a prereq to avoid overwriting
# the settings if the example is updated.
settings.json:
	cp settings_example.json settings.json
