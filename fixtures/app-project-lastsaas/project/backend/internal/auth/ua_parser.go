package auth

import "strings"

// ParseUserAgent extracts a human-readable device description from a User-Agent string.
func ParseUserAgent(ua string) string {
	if ua == "" {
		return "Unknown device"
	}

	browser := parseBrowser(ua)
	os := parseOS(ua)

	if browser != "" && os != "" {
		return browser + " on " + os
	}
	if browser != "" {
		return browser
	}
	if os != "" {
		return os
	}

	if len(ua) > 50 {
		return ua[:50] + "..."
	}
	return ua
}

func parseBrowser(ua string) string {
	lower := strings.ToLower(ua)
	switch {
	case strings.Contains(lower, "edg/") || strings.Contains(lower, "edge/"):
		return "Edge"
	case strings.Contains(lower, "opr/") || strings.Contains(lower, "opera"):
		return "Opera"
	case strings.Contains(lower, "chrome/") && !strings.Contains(lower, "chromium"):
		return "Chrome"
	case strings.Contains(lower, "firefox/"):
		return "Firefox"
	case strings.Contains(lower, "safari/") && !strings.Contains(lower, "chrome"):
		return "Safari"
	default:
		return ""
	}
}

func parseOS(ua string) string {
	lower := strings.ToLower(ua)
	switch {
	case strings.Contains(lower, "windows"):
		return "Windows"
	case strings.Contains(lower, "macintosh") || strings.Contains(lower, "mac os"):
		return "macOS"
	case strings.Contains(lower, "iphone"):
		return "iPhone"
	case strings.Contains(lower, "ipad"):
		return "iPad"
	case strings.Contains(lower, "android"):
		return "Android"
	case strings.Contains(lower, "linux"):
		return "Linux"
	case strings.Contains(lower, "chromeos"):
		return "ChromeOS"
	default:
		return ""
	}
}
