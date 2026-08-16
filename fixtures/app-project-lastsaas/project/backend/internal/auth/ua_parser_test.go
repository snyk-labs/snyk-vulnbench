package auth

import "testing"

func TestParseUserAgentEmpty(t *testing.T) {
	result := ParseUserAgent("")
	if result != "Unknown device" {
		t.Errorf("expected 'Unknown device', got %q", result)
	}
}

func TestParseUserAgentChrome(t *testing.T) {
	ua := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	result := ParseUserAgent(ua)
	if result != "Chrome on Windows" {
		t.Errorf("expected 'Chrome on Windows', got %q", result)
	}
}

func TestParseUserAgentFirefox(t *testing.T) {
	ua := "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0"
	result := ParseUserAgent(ua)
	if result != "Firefox on Linux" {
		t.Errorf("expected 'Firefox on Linux', got %q", result)
	}
}

func TestParseUserAgentSafari(t *testing.T) {
	ua := "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
	result := ParseUserAgent(ua)
	if result != "Safari on macOS" {
		t.Errorf("expected 'Safari on macOS', got %q", result)
	}
}

func TestParseUserAgentEdge(t *testing.T) {
	ua := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
	result := ParseUserAgent(ua)
	if result != "Edge on Windows" {
		t.Errorf("expected 'Edge on Windows', got %q", result)
	}
}

func TestParseUserAgentOpera(t *testing.T) {
	ua := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/105.0.0.0"
	result := ParseUserAgent(ua)
	if result != "Opera on Windows" {
		t.Errorf("expected 'Opera on Windows', got %q", result)
	}
}

func TestParseUserAgentIPhone(t *testing.T) {
	// iPhone UAs contain "iPhone" but also "Mac OS" — parser checks iPhone first
	ua := "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
	result := ParseUserAgent(ua)
	if result != "Safari on iPhone" {
		t.Errorf("expected 'Safari on iPhone', got %q", result)
	}
}

func TestParseUserAgentIPad(t *testing.T) {
	ua := "Mozilla/5.0 (iPad; CPU OS 17_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
	result := ParseUserAgent(ua)
	if result != "Safari on iPad" {
		t.Errorf("expected 'Safari on iPad', got %q", result)
	}
}

func TestParseUserAgentAndroid(t *testing.T) {
	ua := "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36"
	result := ParseUserAgent(ua)
	if result != "Chrome on Android" {
		t.Errorf("expected 'Chrome on Android', got %q", result)
	}
}

func TestParseUserAgentChromeOS(t *testing.T) {
	// Parser looks for "chromeos" (lowercase), CrOS UAs use "CrOS" which matches via ToLower
	ua := "Mozilla/5.0 (X11; ChromeOS x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
	result := ParseUserAgent(ua)
	if result != "Chrome on ChromeOS" {
		t.Errorf("expected 'Chrome on ChromeOS', got %q", result)
	}
}

func TestParseUserAgentUnknownBrowser(t *testing.T) {
	ua := "curl/8.4.0"
	result := ParseUserAgent(ua)
	// No browser or OS detected, returns raw UA
	if result != "curl/8.4.0" {
		t.Errorf("expected 'curl/8.4.0', got %q", result)
	}
}

func TestParseUserAgentLongTruncated(t *testing.T) {
	ua := "A very long user agent string that exceeds fifty characters and should be truncated by the parser"
	result := ParseUserAgent(ua)
	if len(result) > 53 { // 50 chars + "..."
		t.Errorf("expected truncated result, got %d chars: %q", len(result), result)
	}
}

func TestParseUserAgentBrowserOnly(t *testing.T) {
	ua := "SomeApp Chrome/120.0.0.0"
	result := ParseUserAgent(ua)
	if result != "Chrome" {
		t.Errorf("expected 'Chrome', got %q", result)
	}
}
