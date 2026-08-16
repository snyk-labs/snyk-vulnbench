package configstore

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"text/template"

	"lastsaas/internal/models"
)

// injectionPatterns matches common injection vectors in template content.
var injectionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)<script[\s>]`),
	regexp.MustCompile(`(?i)javascript:`),
	regexp.MustCompile(`(?i)on(load|error|click|mouseover)\s*=`),
	regexp.MustCompile(`(?i)<iframe[\s>]`),
	regexp.MustCompile(`(?i)<object[\s>]`),
	regexp.MustCompile(`(?i)<embed[\s>]`),
	regexp.MustCompile(`(?i)<svg[\s/].*on\w+\s*=`),
}

// ValidateValue checks that value is valid for the given config variable type.
func ValidateValue(varType models.ConfigVarType, value, options string) error {
	switch varType {
	case models.ConfigTypeString:
		return nil
	case models.ConfigTypeNumeric:
		if _, err := strconv.ParseFloat(value, 64); err != nil {
			return fmt.Errorf("invalid numeric value: %w", err)
		}
		return nil
	case models.ConfigTypeEnum:
		return ValidateEnumValue(value, options)
	case models.ConfigTypeTemplate:
		return validateTemplate(value)
	default:
		return fmt.Errorf("unknown config variable type: %s", varType)
	}
}

// enumOption represents a label/value pair for enum options.
type enumOption struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// ValidateEnumValue checks that value is one of the allowed options.
// Supports both label/value format [{"label":"X","value":"x"}] and legacy string array ["x","y"].
func ValidateEnumValue(value, optionsJSON string) error {
	if optionsJSON == "" {
		return fmt.Errorf("enum type requires options")
	}

	// Try label/value format first
	var lvOpts []enumOption
	if err := json.Unmarshal([]byte(optionsJSON), &lvOpts); err == nil && len(lvOpts) > 0 && lvOpts[0].Value != "" {
		for _, o := range lvOpts {
			if o.Value == value {
				return nil
			}
		}
		values := make([]string, len(lvOpts))
		for i, o := range lvOpts {
			values[i] = o.Value
		}
		return fmt.Errorf("value %q is not one of the allowed options: %v", value, values)
	}

	// Fall back to string array format
	var strOpts []string
	if err := json.Unmarshal([]byte(optionsJSON), &strOpts); err != nil {
		return fmt.Errorf("invalid options JSON: %w", err)
	}
	for _, o := range strOpts {
		if o == value {
			return nil
		}
	}
	return fmt.Errorf("value %q is not one of the allowed options: %v", value, strOpts)
}

// validateTemplate parses the value as a Go text/template and checks for injection patterns.
func validateTemplate(value string) error {
	if _, err := template.New("check").Parse(value); err != nil {
		return fmt.Errorf("invalid template syntax: %w", err)
	}
	for _, pat := range injectionPatterns {
		if pat.MatchString(value) {
			return fmt.Errorf("template contains disallowed pattern: %s", pat.String())
		}
	}
	return nil
}
