package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/alexflint/go-arg"
	"github.com/gorilla/sessions"
	"github.com/zorchenhimer/MovieNight/common"
	"github.com/zorchenhimer/MovieNight/files"
)

// HlsJsVersion is the version of hls.js shipped under static/js/.
// Bumping this requires updating the Makefile HLS_JS_VERSION default and
// running `make download-hls` to fetch the new file.
const HlsJsVersion = "1.5.17"

var stats = newStreamStats()

func setupSettings(adminPass string, confFile string) error {
	if confFile == "" {
		confFile = files.JoinRunPath("settings.json")
	}

	var err error
	settings, err = LoadSettings(confFile)
	if err != nil {
		return fmt.Errorf("unable to load settings: %w", err)
	}
	if len(settings.StreamKey) == 0 {
		return fmt.Errorf("missing stream key is settings.json")
	}

	if adminPass != "" {
		fmt.Println("Password provided at runtime; ignoring password in set in settings.")
		settings.AdminPassword = adminPass
	}

	sstore = sessions.NewCookieStore([]byte(settings.SessionKey))
	sstore.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   60 * 60 * 24, // one day
		SameSite: http.SameSiteStrictMode,
	}

	return nil
}

type args struct {
	Addr       string `arg:"-l,--addr" help:"host:port of the HTTP server"`
	RtmpAddr   string `arg:"-r,--rtmp" help:"host:port of the RTMP server (passed to mediamtx)"`
	StreamKey  string `arg:"-k,--key" help:"Stream key, to protect your stream"`
	AdminPass  string `arg:"-a,--admin" help:"Set admin password. Overrides configuration in settings.json. This will not write the password to settings.json."`
	ConfigFile string `arg:"-f,--config" help:"URI of the conf file"`
	StaticDir  string `arg:"-s,--static" help:"Directory containing the 'static/' tree of HTML/CSS/JS/img assets. Defaults to the binary's directory."`
	EmotesDir  string `arg:"-e,--emotes" help:"Directory to read emotes. By default it uses the executable directory"`
}

func main() {
	var args args
	arg.MustParse(&args)
	run(args)
}

func run(args args) {
	var err error
	start := time.Now()

	emotesDir = args.EmotesDir
	if emotesDir == "" {
		emotesDir = files.JoinRunPath("emotes")
	}

	staticFsys, err := files.FS(args.StaticDir)
	if err != nil {
		log.Fatalf("Error creating static FS: %v\n", err)
	}

	if err := setupSettings(args.AdminPass, args.ConfigFile); err != nil {
		log.Fatalf("Error loading settings: %v\n", err)
	}

	if err := common.InitTemplates(staticFsys); err != nil {
		common.LogErrorln(err)
		os.Exit(1)
	}

	exit := make(chan bool)
	go handleInterrupt(exit)

	// Load emotes before starting server.
	chat, err = newChatRoom()
	if err != nil {
		common.LogErrorln(err)
		os.Exit(1)
	}

	if args.Addr == "" {
		args.Addr = settings.ListenAddress
	} else {
		// Apply CLI override into settings so mediamtx auth callback URL is correct.
		settings.ListenAddress = args.Addr
	}

	if args.RtmpAddr == "" {
		args.RtmpAddr = settings.RtmpListenAddress
	} else {
		settings.RtmpListenAddress = args.RtmpAddr
	}

	// A stream key was passed on the command line.  Use it, but don't save
	// it over the stream key in the settings.json file.
	if args.StreamKey != "" {
		settings.SetTempKey(args.StreamKey)
	}

	common.LogInfoln("Stream key: ", settings.GetStreamKey())
	common.LogInfoln("Admin password: ", settings.AdminPassword)
	common.LogInfoln("HTTP server listening on: ", args.Addr)
	common.LogInfoln("RTMP server listening on: ", settings.RtmpListenAddress)
	common.LogInfoln("RoomAccess: ", settings.RoomAccess)
	common.LogInfoln("RoomAccessPin: ", settings.RoomAccessPin)

	if err := initProxies(); err != nil {
		log.Fatalf("Error initializing proxies: %v\n", err)
	}

	if err := mediamtx.start(); err != nil {
		log.Fatalf("Error starting mediamtx: %v\n", err)
	}

	router := http.NewServeMux()

	router.Handle("/static/", http.FileServer(http.FS(staticFsys)))
	router.HandleFunc("/emotes/", wsEmotes)

	router.HandleFunc("/ws", wrapAuth(wsHandler)) // Chat websocket
	router.HandleFunc("/chat", wrapAuth(handleIndexTemplate))
	router.HandleFunc("/video", wrapAuth(handleIndexTemplate))
	router.HandleFunc("/help", wrapAuth(handleHelpTemplate))
	router.HandleFunc("/emotes", wrapAuth(handleEmoteTemplate))

	router.HandleFunc("/auth/mediamtx", handleMediamtxAuth)
	router.HandleFunc("/hls/", wrapAuth(handleHLS))
	router.HandleFunc("/hls", wrapAuth(handleHLS))

	router.HandleFunc("/", wrapAuth(handleDefault))

	httpServer := &http.Server{
		Addr:    args.Addr,
		Handler: router,
	}

	// HTTP Server
	go func() {
		err := httpServer.ListenAndServe()
		if err != nil && err != http.ErrServerClosed {
			// If the server cannot start, don't pretend we can continue.
			panic("Error trying to start chat/http server: " + err.Error())
		}
	}()

	common.LogInfof("Startup took %v\n", time.Since(start))

	<-exit

	mediamtx.stop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic("Gracefull HTTP server shutdown failed: " + err.Error())
	}
}

func handleInterrupt(exit chan bool) {
	ch := make(chan os.Signal, 5)
	signal.Notify(ch, os.Interrupt)
	<-ch
	common.LogInfoln("Closing server")
	if settings.StreamStats {
		stats.Print()
	}
	exit <- true
}
