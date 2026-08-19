package workspace

import (
	"io"
	"net/http"
)

func fetchBrandingPreview(logoURL string) ([]byte, string, error) {
	response, err := http.Get(logoURL)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, "", err
	}

	contentType := response.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return body, contentType, nil
}
