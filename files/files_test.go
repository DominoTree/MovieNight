package files_test

import (
	"testing"

	"github.com/zorchenhimer/MovieNight/files"
)

func TestFSMissingDir(t *testing.T) {
	_, err := files.FS("/this/path/should/not/exist")
	if err == nil {
		t.Error("no error returned for nonexistent static dir")
	}
}
