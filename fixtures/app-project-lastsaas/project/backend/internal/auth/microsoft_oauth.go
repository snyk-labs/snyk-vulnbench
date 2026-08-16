package auth

import (
	"context"
	"encoding/json"
	"io"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/microsoft"
)

type MicrosoftOAuthService struct {
	config *oauth2.Config
}

type MicrosoftUserInfo struct {
	ID                string `json:"id"`
	DisplayName       string `json:"displayName"`
	GivenName         string `json:"givenName"`
	Mail              string `json:"mail"`
	UserPrincipalName string `json:"userPrincipalName"`
}

func (u *MicrosoftUserInfo) GetEmail() string {
	if u.Mail != "" {
		return u.Mail
	}
	return u.UserPrincipalName
}

func NewMicrosoftOAuthService(clientID, clientSecret, redirectURL string) *MicrosoftOAuthService {
	config := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Scopes:       []string{"openid", "profile", "email", "User.Read"},
		Endpoint:     microsoft.AzureADEndpoint("common"),
	}
	return &MicrosoftOAuthService{config: config}
}

func (s *MicrosoftOAuthService) GetAuthURL(state string) string {
	return s.config.AuthCodeURL(state, oauth2.AccessTypeOffline)
}

func (s *MicrosoftOAuthService) ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error) {
	token, err := s.config.Exchange(ctx, code)
	if err != nil {
		return nil, ErrOAuthCodeExchange
	}
	return token, nil
}

func (s *MicrosoftOAuthService) GetUserInfo(ctx context.Context, token *oauth2.Token) (*MicrosoftUserInfo, error) {
	client := s.config.Client(ctx, token)
	resp, err := client.Get("https://graph.microsoft.com/v1.0/me")
	if err != nil {
		return nil, ErrOAuthUserInfo
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MB limit
	if err != nil {
		return nil, ErrOAuthUserInfo
	}

	var userInfo MicrosoftUserInfo
	if err := json.Unmarshal(data, &userInfo); err != nil {
		return nil, ErrOAuthUserInfo
	}
	return &userInfo, nil
}
