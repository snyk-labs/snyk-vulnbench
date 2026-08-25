package userapp

import (
	"io"
	"net/http"
)

func fetchWebhookProbe(target string) (int, string, error) {
	resp, err := http.Get(target)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if err != nil {
		return resp.StatusCode, "", err
	}

	return resp.StatusCode, string(body), nil
}
