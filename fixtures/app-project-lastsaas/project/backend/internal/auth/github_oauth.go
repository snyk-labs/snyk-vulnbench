package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

type GitHubOAuthService struct {
	config *oauth2.Config
}

type GitHubUserInfo struct {
	ID    int    `json:"id"`
	Login string `json:"login"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type GitHubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

func NewGitHubOAuthService(clientID, clientSecret, redirectURL string) *GitHubOAuthService {
	config := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Scopes:       []string{"user:email", "read:user"},
		Endpoint:     github.Endpoint,
	}
	return &GitHubOAuthService{config: config}
}

func (s *GitHubOAuthService) GetAuthURL(state string) string {
	return s.config.AuthCodeURL(state, oauth2.AccessTypeOffline)
}

func (s *GitHubOAuthService) ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error) {
	token, err := s.config.Exchange(ctx, code)
	if err != nil {
		return nil, ErrOAuthCodeExchange
	}
	return token, nil
}

func (s *GitHubOAuthService) GetUserInfo(ctx context.Context, token *oauth2.Token) (*GitHubUserInfo, error) {
	client := s.config.Client(ctx, token)

	resp, err := client.Get("https://api.github.com/user")
	if err != nil {
		return nil, ErrOAuthUserInfo
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MB limit
	if err != nil {
		return nil, ErrOAuthUserInfo
	}

	var userInfo GitHubUserInfo
	if err := json.Unmarshal(data, &userInfo); err != nil {
		return nil, ErrOAuthUserInfo
	}

	// If email is not public, fetch from emails endpoint
	if userInfo.Email == "" {
		email, err := s.getPrimaryEmail(client)
		if err == nil {
			userInfo.Email = email
		}
	}

	if userInfo.Email == "" {
		return nil, fmt.Errorf("could not retrieve email from GitHub")
	}

	return &userInfo, nil
}

func (s *GitHubOAuthService) getPrimaryEmail(client *http.Client) (string, error) {
	resp, err := client.Get("https://api.github.com/user/emails")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MB limit
	if err != nil {
		return "", err
	}

	var emails []GitHubEmail
	if err := json.Unmarshal(data, &emails); err != nil {
		return "", err
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	// Fallback to first verified email
	for _, e := range emails {
		if e.Verified {
			return e.Email, nil
		}
	}
	return "", fmt.Errorf("no verified email found")
}
