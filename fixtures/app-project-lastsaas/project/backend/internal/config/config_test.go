package config

import (
	"os"
	"path/filepath"
	"testing"
)

// findConfigDir locates the config directory relative to test execution.
// It looks for a directory containing YAML config files (not the Go source package).
func findConfigDir(t *testing.T) string {
	t.Helper()
	dir, _ := os.Getwd()
	for i := 0; i < 6; i++ {
		for _, candidate := range []string{
			filepath.Join(dir, "config"),
			filepath.Join(dir, "backend", "config"),
		} {
			if hasYAMLFiles(candidate) {
				return candidate
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Fatal("could not find config directory")
	return ""
}

func hasYAMLFiles(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !e.IsDir() && (filepath.Ext(e.Name()) == ".yaml" || filepath.Ext(e.Name()) == ".yml") {
			return true
		}
	}
	return false
}

func setupTestEnv(t *testing.T) {
	t.Helper()
	configDir := findConfigDir(t)
	os.Setenv("LASTSAAS_CONFIG_DIR", configDir)
	os.Setenv("MONGODB_URI", "mongodb://localhost:27017")
	os.Setenv("DATABASE_NAME", "lastsaas-test")
	os.Setenv("JWT_ACCESS_SECRET", "test-access-secret-minimum16chars")
	os.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret-minimum16chars")
}

func TestLoadTestConfig(t *testing.T) {
	setupTestEnv(t)
	cfg, err := Load("test")
	if err != nil {
		t.Fatalf("failed to load test config: %v", err)
	}
	if cfg.Environment != "test" {
		t.Errorf("expected environment 'test', got %q", cfg.Environment)
	}
	if cfg.Database.Name != "lastsaas-test" {
		t.Errorf("expected database name 'lastsaas-test', got %q", cfg.Database.Name)
	}
	if cfg.Server.Port != 3099 {
		t.Errorf("expected port 3099, got %d", cfg.Server.Port)
	}
}

func TestLoadDevConfig(t *testing.T) {
	setupTestEnv(t)

	// dev.yaml is gitignored — skip in CI where it doesn't exist
	configDir := os.Getenv("LASTSAAS_CONFIG_DIR")
	if configDir == "" {
		configDir = filepath.Join("..", "..", "config")
	}
	if _, err := os.Stat(filepath.Join(configDir, "dev.yaml")); os.IsNotExist(err) {
		t.Skip("skipping: dev.yaml not present (gitignored)")
	}

	os.Setenv("SERVER_PORT", "4290")
	os.Setenv("FRONTEND_URL", "http://localhost:4280")
	defer os.Unsetenv("SERVER_PORT")
	defer os.Unsetenv("FRONTEND_URL")

	cfg, err := Load("dev")
	if err != nil {
		t.Fatalf("failed to load dev config: %v", err)
	}
	if cfg.Environment != "dev" {
		t.Errorf("expected environment 'dev', got %q", cfg.Environment)
	}
}

func TestMissingDatabaseURI(t *testing.T) {
	setupTestEnv(t)
	os.Setenv("MONGODB_URI", "")
	defer os.Setenv("MONGODB_URI", "mongodb://localhost:27017")

	_, err := Load("test")
	if err == nil {
		t.Fatal("expected validation error for missing database.uri")
	}
}

func TestMissingDatabaseName(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{URI: "mongodb://localhost", Name: ""},
		JWT:      JWTConfig{AccessSecret: "test-access-secret-minimum16chars", RefreshSecret: "test-refresh-secret-minimum16chars"},
		Server:   ServerConfig{Port: 3099},
		Frontend: FrontendConfig{URL: "http://localhost"},
	}
	err := cfg.validate()
	if err == nil {
		t.Fatal("expected validation error for missing database.name")
	}
}

func TestJWTSecretTooShort(t *testing.T) {
	setupTestEnv(t)
	os.Setenv("JWT_ACCESS_SECRET", "short")
	defer os.Setenv("JWT_ACCESS_SECRET", "test-access-secret-minimum16chars")

	_, err := Load("test")
	if err == nil {
		t.Fatal("expected validation error for short JWT access secret")
	}
}

func TestJWTRefreshSecretTooShort(t *testing.T) {
	setupTestEnv(t)
	os.Setenv("JWT_REFRESH_SECRET", "short")
	defer os.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret-minimum16chars")

	_, err := Load("test")
	if err == nil {
		t.Fatal("expected validation error for short JWT refresh secret")
	}
}

func TestEnvVarExpansion(t *testing.T) {
	os.Setenv("TEST_EXPAND_VAR", "hello")
	defer os.Unsetenv("TEST_EXPAND_VAR")

	result := expandEnvVars("${TEST_EXPAND_VAR}")
	if result != "hello" {
		t.Errorf("expected 'hello', got %q", result)
	}
}

func TestEnvVarExpansionWithDefault(t *testing.T) {
	os.Unsetenv("NONEXISTENT_VAR")
	result := expandEnvVars("${NONEXISTENT_VAR:fallback_value}")
	if result != "fallback_value" {
		t.Errorf("expected 'fallback_value', got %q", result)
	}
}

func TestEnvVarExpansionSetOverridesDefault(t *testing.T) {
	os.Setenv("OVERRIDE_VAR", "actual")
	defer os.Unsetenv("OVERRIDE_VAR")

	result := expandEnvVars("${OVERRIDE_VAR:default}")
	if result != "actual" {
		t.Errorf("expected 'actual', got %q", result)
	}
}

func TestGetEnvDefault(t *testing.T) {
	os.Unsetenv("LASTSAAS_ENV")
	env := GetEnv()
	if env != "dev" {
		t.Errorf("expected 'dev', got %q", env)
	}
}

func TestGetEnvCustom(t *testing.T) {
	os.Setenv("LASTSAAS_ENV", "staging")
	defer os.Unsetenv("LASTSAAS_ENV")

	env := GetEnv()
	if env != "staging" {
		t.Errorf("expected 'staging', got %q", env)
	}
}

func TestNonexistentConfigFile(t *testing.T) {
	setupTestEnv(t)
	_, err := Load("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent config file")
	}
}

func TestValidatePortRange(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{URI: "mongodb://localhost", Name: "test"},
		JWT:      JWTConfig{AccessSecret: "test-access-secret-minimum16chars", RefreshSecret: "test-refresh-secret-minimum16chars"},
		Server:   ServerConfig{Port: 99999},
		Frontend: FrontendConfig{URL: "http://localhost"},
	}
	err := cfg.validate()
	if err == nil {
		t.Fatal("expected validation error for invalid port")
	}
}

func TestValidatePortZero(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{URI: "mongodb://localhost", Name: "test"},
		JWT:      JWTConfig{AccessSecret: "test-access-secret-minimum16chars", RefreshSecret: "test-refresh-secret-minimum16chars"},
		Server:   ServerConfig{Port: 0},
		Frontend: FrontendConfig{URL: "http://localhost"},
	}
	err := cfg.validate()
	if err == nil {
		t.Fatal("expected validation error for port 0")
	}
}

func TestValidateValid(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{URI: "mongodb://localhost", Name: "test"},
		JWT:      JWTConfig{AccessSecret: "test-access-secret-minimum16chars", RefreshSecret: "test-refresh-secret-minimum16chars"},
		Server:   ServerConfig{Port: 8080},
		Frontend: FrontendConfig{URL: "http://localhost:3000"},
	}
	err := cfg.validate()
	if err != nil {
		t.Fatalf("expected no error for valid config, got: %v", err)
	}
}

func TestValidateMissingJWTAccessSecret(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{URI: "mongodb://localhost", Name: "test"},
		JWT:      JWTConfig{AccessSecret: "", RefreshSecret: "test-refresh-secret-minimum16chars"},
		Server:   ServerConfig{Port: 8080},
		Frontend: FrontendConfig{URL: "http://localhost"},
	}
	err := cfg.validate()
	if err == nil {
		t.Fatal("expected validation error for missing JWT access secret")
	}
}

func TestValidateMissingFrontendURL(t *testing.T) {
	cfg := &Config{
		Database: DatabaseConfig{URI: "mongodb://localhost", Name: "test"},
		JWT:      JWTConfig{AccessSecret: "test-access-secret-minimum16chars", RefreshSecret: "test-refresh-secret-minimum16chars"},
		Server:   ServerConfig{Port: 8080},
		Frontend: FrontendConfig{URL: ""},
	}
	err := cfg.validate()
	if err == nil {
		t.Fatal("expected validation error for missing frontend URL")
	}
}

func TestExpandEnvVarsMultiple(t *testing.T) {
	os.Setenv("CONFIG_HOST", "dbhost")
	os.Setenv("CONFIG_PORT", "27017")
	defer os.Unsetenv("CONFIG_HOST")
	defer os.Unsetenv("CONFIG_PORT")

	result := expandEnvVars("mongodb://${CONFIG_HOST}:${CONFIG_PORT}")
	if result != "mongodb://dbhost:27017" {
		t.Errorf("expected 'mongodb://dbhost:27017', got %q", result)
	}
}

func TestExpandEnvVarsNoVars(t *testing.T) {
	result := expandEnvVars("plain-string-no-vars")
	if result != "plain-string-no-vars" {
		t.Errorf("expected unchanged string, got %q", result)
	}
}

func TestLoadEnvFile(t *testing.T) {
	dir := t.TempDir()
	envContent := "TEST_LOADENV_KEY=loadenv_value\n# comment line\n\nTEST_LOADENV_KEY2=value2\n"
	os.WriteFile(filepath.Join(dir, ".env"), []byte(envContent), 0644)

	// Save and restore working directory
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(dir)

	// Clear any existing values
	os.Unsetenv("TEST_LOADENV_KEY")
	os.Unsetenv("TEST_LOADENV_KEY2")

	LoadEnvFile()

	val := os.Getenv("TEST_LOADENV_KEY")
	if val != "loadenv_value" {
		t.Errorf("expected 'loadenv_value', got %q", val)
	}
	val2 := os.Getenv("TEST_LOADENV_KEY2")
	if val2 != "value2" {
		t.Errorf("expected 'value2', got %q", val2)
	}

	// Clean up
	os.Unsetenv("TEST_LOADENV_KEY")
	os.Unsetenv("TEST_LOADENV_KEY2")
}

func TestLoadEnvFileDoesNotOverwrite(t *testing.T) {
	dir := t.TempDir()
	envContent := "TEST_NOOVERWRITE=file_value\n"
	os.WriteFile(filepath.Join(dir, ".env"), []byte(envContent), 0644)

	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(dir)

	// Set existing value
	os.Setenv("TEST_NOOVERWRITE", "existing_value")
	defer os.Unsetenv("TEST_NOOVERWRITE")

	LoadEnvFile()

	val := os.Getenv("TEST_NOOVERWRITE")
	if val != "existing_value" {
		t.Errorf("expected 'existing_value' (not overwritten), got %q", val)
	}
}

func TestLoadEnvFileNoFile(t *testing.T) {
	dir := t.TempDir()
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(dir)

	// Should not panic when no .env file exists
	LoadEnvFile()
}

func TestLoadCustomConfigDir(t *testing.T) {
	dir := t.TempDir()
	configContent := `server:
  port: 9999
database:
  uri: mongodb://localhost
  name: custom-db
jwt:
  access_secret: custom-access-secret-minimum16chars
  refresh_secret: custom-refresh-secret-minimum16chars
frontend:
  url: http://localhost:9000
`
	os.WriteFile(filepath.Join(dir, "custom.yaml"), []byte(configContent), 0644)

	os.Setenv("LASTSAAS_CONFIG_DIR", dir)
	defer os.Unsetenv("LASTSAAS_CONFIG_DIR")

	cfg, err := Load("custom")
	if err != nil {
		t.Fatalf("failed to load custom config: %v", err)
	}
	if cfg.Server.Port != 9999 {
		t.Errorf("expected port 9999, got %d", cfg.Server.Port)
	}
	if cfg.Database.Name != "custom-db" {
		t.Errorf("expected 'custom-db', got %q", cfg.Database.Name)
	}
}
