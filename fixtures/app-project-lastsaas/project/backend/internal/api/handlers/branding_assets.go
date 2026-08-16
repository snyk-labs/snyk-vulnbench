package handlers

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

type remoteBrandAsset struct {
	ContentType string `json:"contentType"`
	Data        string `json:"data"`
	Size        int    `json:"size"`
}

func fetchRemoteBrandAsset(rawURL string) (remoteBrandAsset, error) {
	resp, err := http.Get(rawURL)
	if err != nil {
		return remoteBrandAsset{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return remoteBrandAsset{}, fmt.Errorf("remote asset returned status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return remoteBrandAsset{}, err
	}

	return remoteBrandAsset{
		ContentType: resp.Header.Get("Content-Type"),
		Data:        base64.StdEncoding.EncodeToString(data),
		Size:        len(data),
	}, nil
}

func readBrandingMediaFile(name string) ([]byte, error) {
	mediaPath := filepath.Join("static", "branding", name)
	return os.ReadFile(mediaPath)
}
