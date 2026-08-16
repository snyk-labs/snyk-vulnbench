package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"golang.org/x/term"
)

// jsonOutput is set to true when --json is passed globally.
var jsonOutput bool

// parseGlobalFlags scans os.Args for --json and removes it so subcommand parsers don't choke.
func parseGlobalFlags() {
	filtered := make([]string, 0, len(os.Args))
	for _, arg := range os.Args {
		if arg == "--json" {
			jsonOutput = true
		} else {
			filtered = append(filtered, arg)
		}
	}
	os.Args = filtered
}

func isTTY() bool {
	return term.IsTerminal(int(os.Stdout.Fd()))
}

// ANSI color codes
const (
	cReset  = "\033[0m"
	cBold   = "\033[1m"
	cRed    = "\033[31m"
	cGreen  = "\033[32m"
	cYellow = "\033[33m"
	cBlue   = "\033[34m"
	cPurple = "\033[35m"
	cCyan   = "\033[36m"
	cGray   = "\033[90m"
)

func clr(code, text string) string {
	if !isTTY() || jsonOutput {
		return text
	}
	return code + text + cReset
}

func bold(text string) string { return clr(cBold, text) }

func severityClr(sev string) string {
	switch sev {
	case "critical":
		return clr(cRed+cBold, "CRIT")
	case "high":
		return clr(cYellow, "HIGH")
	case "medium":
		return clr(cYellow, "MED ")
	case "low":
		return clr(cBlue, "LOW ")
	case "debug":
		return clr(cGray, "DBG ")
	default:
		return sev
	}
}

func statusClr(ok bool) string {
	if ok {
		return clr(cGreen, "OK")
	}
	return clr(cRed, "FAIL")
}

func warnClr(text string) string { return clr(cYellow, text) }

func printJSON(v interface{}) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(v)
}

func formatCents(cents int64, currency string) string {
	if currency == "" {
		currency = "usd"
	}
	sign := ""
	if cents < 0 {
		sign = "-"
		cents = -cents
	}
	sym := strings.ToUpper(currency)
	if currency == "usd" {
		sym = "$"
	} else if currency == "eur" {
		sym = "EUR "
	} else if currency == "gbp" {
		sym = "GBP "
	}
	return fmt.Sprintf("%s%s%d.%02d", sign, sym, cents/100, cents%100)
}

func formatBytes(b int64) string {
	const (
		kb = 1024
		mb = kb * 1024
		gb = mb * 1024
	)
	switch {
	case b >= gb:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(gb))
	case b >= mb:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(mb))
	case b >= kb:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(kb))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

func timeAgo(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		days := int(d.Hours() / 24)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
