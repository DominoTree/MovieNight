package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"text/template"
	"time"

	"github.com/zorchenhimer/MovieNight/common"
)

//go:embed mediamtx_config.yml.tmpl
var mediamtxTmplFS embed.FS

type mediamtxProc struct {
	cmd     *exec.Cmd
	cancel  context.CancelFunc
	mu      sync.Mutex
	running atomic.Bool
}

var mediamtx = &mediamtxProc{}

type mediamtxTmplData struct {
	ApiAddress        string
	RtmpAddress       string
	HlsAddress        string
	MovieNightAuthURL string
}

// start writes the mediamtx config and spawns the subprocess. It blocks until
// the mediamtx control API is reachable (or a short timeout elapses).
func (m *mediamtxProc) start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, err := exec.LookPath(settings.MediamtxBinary); err != nil {
		return fmt.Errorf("mediamtx binary %q not found: %w", settings.MediamtxBinary, err)
	}

	cfgPath := settings.MediamtxConfigPath
	if cfgPath == "" {
		cfgPath = filepath.Join(os.TempDir(), "movienight-mediamtx.yml")
	}
	if err := writeMediamtxConfig(cfgPath); err != nil {
		return fmt.Errorf("write mediamtx config: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.cmd = exec.CommandContext(ctx, settings.MediamtxBinary, cfgPath)
	m.cmd.Stdout = os.Stdout
	m.cmd.Stderr = os.Stderr

	if err := m.cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("mediamtx start: %w", err)
	}
	m.running.Store(true)
	common.LogInfof("mediamtx started, pid=%d, config=%s\n", m.cmd.Process.Pid, cfgPath)

	go func() {
		err := m.cmd.Wait()
		m.running.Store(false)
		if err != nil {
			common.LogErrorf("mediamtx exited: %v\n", err)
		} else {
			common.LogInfoln("mediamtx exited")
		}
	}()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if pingMediamtxAPI() {
			common.LogInfoln("mediamtx API ready")
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("mediamtx API did not become ready within timeout")
}

// stop gracefully signals the subprocess and force-kills if it does not exit.
func (m *mediamtxProc) stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.cmd == nil || m.cmd.Process == nil {
		return
	}
	if !m.running.Load() {
		return
	}

	if err := m.cmd.Process.Signal(os.Interrupt); err != nil {
		common.LogErrorf("mediamtx interrupt: %v\n", err)
	}
	done := make(chan struct{})
	go func() {
		_, _ = m.cmd.Process.Wait()
		close(done)
	}()
	select {
	case <-done:
		common.LogInfoln("mediamtx shut down cleanly")
	case <-time.After(3 * time.Second):
		common.LogInfoln("mediamtx did not exit, killing")
		_ = m.cmd.Process.Kill()
	}
	if m.cancel != nil {
		m.cancel()
	}
}

func writeMediamtxConfig(path string) error {
	tmplBytes, err := mediamtxTmplFS.ReadFile("mediamtx_config.yml.tmpl")
	if err != nil {
		return err
	}
	tmpl, err := template.New("mediamtx").Parse(string(tmplBytes))
	if err != nil {
		return err
	}

	authURL, err := mediamtxAuthCallbackURL(settings.ListenAddress)
	if err != nil {
		return fmt.Errorf("compute auth callback URL: %w", err)
	}

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	return tmpl.Execute(f, mediamtxTmplData{
		ApiAddress:        settings.MediamtxApiAddress,
		RtmpAddress:       settings.RtmpListenAddress,
		HlsAddress:        settings.MediamtxHlsAddress,
		MovieNightAuthURL: authURL,
	})
}

// mediamtxAuthCallbackURL returns the host:port mediamtx should call to reach
// MovieNight's /auth/mediamtx endpoint. It always uses 127.0.0.1 since the
// mediamtx subprocess runs on the same host.
func mediamtxAuthCallbackURL(listenAddr string) (string, error) {
	_, port, err := net.SplitHostPort(listenAddr)
	if err != nil {
		return "", fmt.Errorf("invalid ListenAddress %q: %w", listenAddr, err)
	}
	return net.JoinHostPort("127.0.0.1", port), nil
}

func pingMediamtxAPI() bool {
	url := "http://" + settings.MediamtxApiAddress + "/v3/config/global/get"
	client := &http.Client{Timeout: 500 * time.Millisecond}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// --- Active publishing path discovery ---

type pathListResponse struct {
	Items []struct {
		Name   string `json:"name"`
		Source *struct {
			Type string `json:"type"`
			ID   string `json:"id"`
		} `json:"source"`
		Ready bool `json:"ready"`
	} `json:"items"`
}

type activePathCache struct {
	mu      sync.Mutex
	path    string
	expires time.Time
}

var activePath = &activePathCache{}

// get returns the currently publishing path name (e.g. "live/<key>"), or "" if
// no publisher is active. Result is cached for a short interval.
func (c *activePathCache) get() string {
	c.mu.Lock()
	defer c.mu.Unlock()

	if time.Now().Before(c.expires) {
		return c.path
	}

	p := queryActivePath()
	c.path = p
	c.expires = time.Now().Add(2 * time.Second)
	return p
}

// invalidate clears the cached path so the next call re-queries mediamtx.
func (c *activePathCache) invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.expires = time.Time{}
}

func queryActivePath() string {
	url := "http://" + settings.MediamtxApiAddress + "/v3/paths/list"
	client := &http.Client{Timeout: 1 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}

	var data pathListResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return ""
	}
	for _, item := range data.Items {
		if item.Ready && item.Source != nil && item.Source.Type != "" {
			return item.Name
		}
	}
	return ""
}
