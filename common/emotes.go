package common

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

type EmotesMap map[string]string

var Emotes EmotesMap

var (
	reStripStatic   = regexp.MustCompile(`^(\\|/)?static`)
	reWrappedEmotes = regexp.MustCompile(`[:\[][^\s:\/\\\?=#\]\[]+[:\]]`)
)

func init() {
	Emotes = NewEmotesMap()
}

func NewEmotesMap() EmotesMap {
	return map[string]string{}
}

func (em EmotesMap) Add(fullpath string) EmotesMap {
	fullpath = reStripStatic.ReplaceAllLiteralString(fullpath, "")

	base := filepath.Base(fullpath)
	code := base[0 : len(base)-len(filepath.Ext(base))]

	_, exists := em[code]

	num := 0
	for exists {
		num += 1
		_, exists = em[fmt.Sprintf("%s-%d", code, num)]
	}

	if num > 0 {
		code = fmt.Sprintf("%s-%d", code, num)
	}

	em[code] = fullpath
	return em
}

func EmoteToHtml(file, title string) string {
	return fmt.Sprintf(`<img src="%s" height="36px" title="%s" />`, file, title)
}

// Used with a regexp.ReplaceAllStringFunc() call. Needs to lookup the value as it
// cannot be passed in with the regex function call.
func emoteToHtml2(key string) string {
	inkey := strings.ToLower(strings.Trim(key, ":[]"))
	if val, ok := Emotes[inkey]; ok {
		return fmt.Sprintf(`<img src="%s" height="36px" title="%s" />`, val, inkey)
	}
	return key
}

func ParseEmotesArray(words []string) []string {
	newWords := []string{}
	for _, word := range words {
		word = reWrappedEmotes.ReplaceAllStringFunc(word, emoteToHtml2)
		newWords = append(newWords, word)
	}

	return newWords
}

func ParseEmotes(msg string) string {
	words := ParseEmotesArray(strings.Split(msg, " "))
	return strings.Join(words, " ")
}
