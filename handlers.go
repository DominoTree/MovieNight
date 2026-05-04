package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/zorchenhimer/MovieNight/common"

	"github.com/gorilla/websocket"
)

// global variable for handling all chat traffic
var chat *ChatRoom

// HLS reverse proxy targeting the local mediamtx HLS server.
var hlsProxy *httputil.ReverseProxy

// initProxies must be called after settings are loaded.
func initProxies() error {
	u, err := url.Parse("http://" + settings.MediamtxHlsAddress)
	if err != nil {
		return fmt.Errorf("invalid MediamtxHlsAddress: %w", err)
	}
	hlsProxy = httputil.NewSingleHostReverseProxy(u)

	// mediamtx 302-redirects HLS requests to its canonical path (e.g.
	// "/live/<key>/index.m3u8?cookieCheck=1") with a cookie check. We must
	// rewrite the Location header to keep the "/hls/" prefix so the stream
	// key is not leaked to the browser.
	hlsProxy.ModifyResponse = func(resp *http.Response) error {
		loc := resp.Header.Get("Location")
		if loc == "" {
			return nil
		}
		path := activePath.get()
		if path == "" {
			return nil
		}
		prefix := "/" + path
		if strings.HasPrefix(loc, prefix) {
			resp.Header.Set("Location", "/hls"+strings.TrimPrefix(loc, prefix))
		}
		return nil
	}
	return nil
}

func wsEmotes(w http.ResponseWriter, r *http.Request) {
	file := strings.TrimPrefix(r.URL.Path, "/")

	emoteDirSuffix := filepath.Base(emotesDir)
	if emoteDirSuffix == filepath.SplitList(file)[0] {
		file = strings.TrimPrefix(file, emoteDirSuffix+"/")
	}

	var body []byte
	err := filepath.WalkDir(emotesDir, func(path string, d fs.DirEntry, err error) error {
		if d.IsDir() || err != nil || len(body) > 0 {
			return nil
		}

		if filepath.Base(path) != filepath.Base(file) {
			return nil
		}

		body, err = os.ReadFile(path)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return nil
	})
	if err != nil {
		common.LogErrorf("Emote could not be read %s: %v\n", file, err)
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if len(body) == 0 {
		common.LogErrorf("Found emote file but pulled no data: %v\n", err)
		w.WriteHeader(http.StatusNotFound)
		return
	}

	_, err = w.Write(body)
	if err != nil {
		common.LogErrorf("Could not write emote %s to response: %v\n", file, err)
		w.WriteHeader(http.StatusNotFound)
	}
}

// Handling the websocket
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true }, //not checking origin
}

// this is also the handler for joining to the chat
func wsHandler(w http.ResponseWriter, r *http.Request) {

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		common.LogErrorln("Error upgrading to websocket:", err)
		return
	}

	common.LogDebugln("Connection has been upgraded to websocket")

	chatConn := &chatConnection{
		Conn: conn,
		// If the server is behind a reverse proxy (eg, Nginx), look
		// for this header to get the real IP address of the client.
		forwardedFor: common.ExtractForwarded(r),
	}

	go func() {
		var client *Client

		// Get the client object
		for client == nil {
			var data common.ClientData
			err := chatConn.ReadData(&data)
			if err != nil {
				common.LogInfof("[handler] Client closed connection: %s: %v\n",
					conn.RemoteAddr().String(), err)
				conn.Close()
				return
			}

			if data.Type == common.CdPing {
				continue
			}

			var joinData common.JoinData
			err = json.Unmarshal([]byte(data.Message), &joinData)
			if err != nil {
				common.LogInfof("[handler] Could not unmarshal websocket %d data %#v: %v\n", data.Type, data.Message, err)
				continue
			}

			client, err = chat.Join(chatConn, joinData)
			if err != nil {
				switch err.(type) { //nolint:errorlint
				case UserFormatError, UserTakenError:
					common.LogInfof("[handler|%s] %v\n", errorName(err), err)
				case BannedUserError:
					common.LogInfof("[handler|%s] %v\n", errorName(err), err)
					// close connection since banned users shouldn't be connecting
					conn.Close()
				default:
					// for now all errors not caught need to be warned
					common.LogErrorf("[handler|uncaught] %v\n", err)
					conn.Close()
				}
			}
		}

		// Handle incomming messages
		for {
			var data common.ClientData
			err := conn.ReadJSON(&data)
			if err != nil { //if error then assuming that the connection is closed
				client.Exit()
				return
			}
			client.NewMsg(data)
		}

	}()
}

// returns if it's OK to proceed
func checkRoomAccess(w http.ResponseWriter, r *http.Request) bool {
	session, err := sstore.Get(r, "moviesession")
	if err != nil {
		// Don't return as server error here, just make a new session.
		common.LogErrorf("Unable to get session for client %s: %v\n", r.RemoteAddr, err)
	}

	if settings.RoomAccess == AccessPin {
		pin := session.Values["pin"]
		// No pin found in session
		if pin == nil || len(pin.(string)) == 0 {
			if r.Method == "POST" {
				// Check for correct pin
				err = r.ParseForm()
				if err != nil {
					common.LogErrorf("Error parsing form")
					http.Error(w, "Unable to get session data", http.StatusInternalServerError)
				}

				postPin := strings.TrimSpace(r.Form.Get("txtInput"))
				common.LogDebugf("Received pin: %s\n", postPin)
				if postPin == settings.RoomAccessPin {
					// Pin is correct.  Save it to session and return true.
					session.Values["pin"] = settings.RoomAccessPin
					err = session.Save(r, w)
					if err != nil {
						common.LogErrorf("Could not save pin cookie: %v\n", err)
						return false
					}
					return true
				}
				// Pin is incorrect.
				handlePinTemplate(w, r, "Incorrect PIN")
				return false
			} else {
				qpin := r.URL.Query().Get("pin")
				if qpin != "" && qpin == settings.RoomAccessPin {
					// Pin is correct.  Save it to session and return true.
					session.Values["pin"] = settings.RoomAccessPin
					err = session.Save(r, w)
					if err != nil {
						common.LogErrorf("Could not save pin cookie: %v\n", err)
						return false
					}
					return true
				}
			}
			// nope.  display pin entry and return
			handlePinTemplate(w, r, "")
			return false
		}

		// Pin found in session, but it has changed since last time.
		if pin.(string) != settings.RoomAccessPin {
			// Clear out the old pin.
			session.Values["pin"] = nil
			err = session.Save(r, w)
			if err != nil {
				common.LogErrorf("Could not clear pin cookie: %v\n", err)
			}

			// Prompt for new one.
			handlePinTemplate(w, r, "Pin has changed.  Enter new PIN.")
			return false
		}

		// Correct pin found in session
		return true
	}

	// TODO: this.
	if settings.RoomAccess == AccessRequest {
		http.Error(w, "Requesting access not implemented yet", http.StatusNotImplemented)
		return false
	}

	// Room is open.
	return true
}

func handlePinTemplate(w http.ResponseWriter, r *http.Request, errorMessage string) {
	type Data struct {
		Title      string
		SubmitText string
		Notice     string
	}

	if errorMessage == "" {
		errorMessage = "Please enter the PIN"
	}

	data := Data{
		Title:      "Enter Pin",
		SubmitText: "Submit Pin",
		Notice:     errorMessage,
	}

	err := common.ExecuteServerTemplate(w, "pin", data)
	if err != nil {
		common.LogErrorf("Error executing file, %v", err)
	}
}

func handleHelpTemplate(w http.ResponseWriter, r *http.Request) {
	type Data struct {
		Title         string
		Commands      map[string]string
		ModCommands   map[string]string
		AdminCommands map[string]string
	}

	data := Data{
		Title:    "Help",
		Commands: getHelp(common.CmdlUser),
	}

	if len(r.URL.Query().Get("mod")) > 0 {
		data.ModCommands = getHelp(common.CmdlMod)
	}

	if len(r.URL.Query().Get("admin")) > 0 {
		data.AdminCommands = getHelp(common.CmdlAdmin)
	}

	err := common.ExecuteServerTemplate(w, "help", data)
	if err != nil {
		common.LogErrorf("Error executing file, %v", err)
	}
}

func handleEmoteTemplate(w http.ResponseWriter, r *http.Request) {
	type Data struct {
		Title  string
		Emotes map[string]string
	}

	data := Data{
		Title:  "Available Emotes",
		Emotes: common.Emotes,
	}

	common.LogDebugf("Emotes Data: %s", data)
	err := common.ExecuteServerTemplate(w, "emotes", data)
	if err != nil {
		common.LogErrorf("Error executing file, %v", err)
	}
}

func handleIndexTemplate(w http.ResponseWriter, r *http.Request) {
	type Data struct {
		Video, Chat         bool
		MessageHistoryCount int
		Title               string
		HlsJsFile           string
	}

	data := Data{
		Video:               true,
		Chat:                true,
		MessageHistoryCount: settings.MaxMessageCount,
		Title:               settings.PageTitle,
		HlsJsFile:           fmt.Sprintf("hls.min.%s.js", HlsJsVersion),
	}

	path := strings.Split(strings.TrimLeft(r.URL.Path, "/"), "/")
	if path[0] == "chat" {
		data.Video = false
		data.Title += " - chat"
	} else if path[0] == "video" {
		data.Chat = false
		data.Title += " - video"
	}

	// Force browser to replace cache since file was not changed
	if settings.NoCache {
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
	}

	err := common.ExecuteServerTemplate(w, "main", data)
	if err != nil {
		common.LogErrorf("Error executing file, %v", err)
	}
}

// mediamtxAuthRequest matches the JSON body mediamtx POSTs to the auth webhook.
// See https://github.com/bluenviron/mediamtx#authentication
type mediamtxAuthRequest struct {
	User     string `json:"user"`
	Password string `json:"password"`
	IP       string `json:"ip"`
	Action   string `json:"action"`
	Path     string `json:"path"`
	Protocol string `json:"protocol"`
	ID       string `json:"id"`
	Query    string `json:"query"`
}

// handleMediamtxAuth validates publishers. mediamtx is configured to bypass
// auth for read/api/metrics/pprof, so this handler only sees publish actions.
// On success, writes 200; on failure, 401.
//
// Note: we deliberately do not restrict by source IP. On FreeBSD jails the
// loopback address gets rewritten to the jail's primary IP, so a strict
// loopback check would reject mediamtx's local callback. The actual auth
// boundary is the stream key check below.
func handleMediamtxAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req mediamtxAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	if req.Action != "publish" {
		// Reads should be excluded server-side; allow defensively.
		w.WriteHeader(http.StatusOK)
		return
	}

	// Path format: "live/<streamKey>"
	parts := strings.SplitN(req.Path, "/", 2)
	if len(parts) != 2 || parts[0] != "live" || parts[1] == "" {
		common.LogInfof("[publish] denied: bad path %q from %s\n", req.Path, req.IP)
		http.Error(w, "bad path", http.StatusUnauthorized)
		return
	}
	if parts[1] != settings.GetStreamKey() {
		common.LogInfof("[publish] denied: bad stream key from %s\n", req.IP)
		http.Error(w, "bad key", http.StatusUnauthorized)
		return
	}

	common.LogInfof("[publish] accepted from %s for path %s\n", req.IP, req.Path)
	activePath.invalidate()
	w.WriteHeader(http.StatusOK)
}

// handleHLS reverse-proxies HLS requests to mediamtx. The active publishing
// path is discovered via the mediamtx control API (cached briefly). The
// configured publish path includes the stream key (e.g. "live/<key>"), but we
// expose it externally as a fixed "/hls/..." prefix so the key is not leaked.
func handleHLS(w http.ResponseWriter, r *http.Request) {
	path := activePath.get()
	if path == "" {
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "no active stream", http.StatusNotFound)
		stats.resetViewers()
		return
	}

	suffix := strings.TrimPrefix(r.URL.Path, "/hls")
	if suffix == "" || suffix == "/" {
		suffix = "/index.m3u8"
	}

	// mediamtx serves at /<path>/<file>
	r.URL.Path = "/" + path + suffix
	r.Host = settings.MediamtxHlsAddress

	// Track viewers by session for stats (m3u8 requests only, not segments).
	if strings.HasSuffix(suffix, ".m3u8") {
		session, _ := sstore.Get(r, "moviesession")
		stats.addViewer(session.ID)
	}

	hlsProxy.ServeHTTP(w, r)
}

func handleDefault(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		// not really an error for the server, but for the client.
		common.LogInfoln("[http 404] ", r.URL.Path)
		http.NotFound(w, r)
	} else {
		handleIndexTemplate(w, r)
	}
}

func wrapAuth(next http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if settings.RoomAccess != AccessOpen {
			if !checkRoomAccess(w, r) {
				common.LogDebugln("Denied access")
				return
			}
			common.LogDebugln("Granted access")
		}
		next.ServeHTTP(w, r)
	})
}
