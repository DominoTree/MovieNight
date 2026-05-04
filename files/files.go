package files

import (
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// FS returns a filesystem rooted at the given directory. If dir is empty, it
// defaults to the directory containing the running binary.
//
// The returned FS is a plain os.DirFS — there is no embedded fallback. Static
// assets, templates, etc. must exist on disk under this directory.
func FS(dir string) (fs.FS, error) {
	if dir == "" {
		dir = runPath()
	}
	info, err := os.Stat(dir)
	if err != nil {
		return nil, fmt.Errorf("static dir %q not accessible: %w", dir, err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("static dir %q is not a directory", dir)
	}
	return os.DirFS(dir), nil
}

func JoinRunPath(name string) string {
	return path.Join(runPath(), name)
}

// runPath returns the absolute directory containing the MovieNight binary.
func runPath() string {
	ex, err := os.Executable()
	if err != nil {
		panic(err)
	}
	dir := filepath.ToSlash(filepath.Dir(ex))
	return strings.TrimPrefix(dir, filepath.VolumeName(dir))
}
