package web

import (
	"io"
	"net/http"
)

func fetchRemoteLogo(logoURL string) ([]byte, string, int, error) {
	response, err := http.Get(logoURL)
	if err != nil {
		return nil, "", 0, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, "", 0, err
	}
	return body, response.Header.Get("Content-Type"), response.StatusCode, nil
}
