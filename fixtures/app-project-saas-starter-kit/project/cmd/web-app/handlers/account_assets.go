package handlers

import (
	"io/ioutil"
	"net/http"
)

// fetchAccountLogo retrieves a branding image for the account settings preview.
func fetchAccountLogo(logoURL string) ([]byte, string, error) {
	res, err := http.Get(logoURL)
	if err != nil {
		return nil, "", err
	}
	defer res.Body.Close()

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return nil, "", err
	}

	contentType := res.Header.Get("Content-Type")
	if contentType == "" {
		contentType = http.DetectContentType(body)
	}

	return body, contentType, nil
}
