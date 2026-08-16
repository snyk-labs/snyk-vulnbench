package version

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadFromVersionFile(t *testing.T) {
	// Create a temp dir with a VERSION file
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "VERSION"), []byte("2.0.0\n"), 0644); err != nil {
		t.Fatal(err)
	}

	// Save and restore working directory
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(dir)

	buildVersion = ""
	result := Load()
	if result != "2.0.0" {
		t.Errorf("expected '2.0.0', got %q", result)
	}
	if Current != "2.0.0" {
		t.Errorf("expected Current='2.0.0', got %q", Current)
	}
}

func TestLoadFromBuildVersion(t *testing.T) {
	buildVersion = "3.1.4"
	defer func() { buildVersion = "" }()

	result := Load()
	if result != "3.1.4" {
		t.Errorf("expected '3.1.4', got %q", result)
	}
}

func TestBuildVersionTakesPrecedence(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "VERSION"), []byte("file-version"), 0644)

	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(dir)

	buildVersion = "build-version"
	defer func() { buildVersion = "" }()

	result := Load()
	if result != "build-version" {
		t.Errorf("expected 'build-version', got %q", result)
	}
}

func TestLoadFallbackToUnknown(t *testing.T) {
	dir := t.TempDir() // empty dir, no VERSION file
	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(dir)

	buildVersion = ""
	result := Load()
	if result != "unknown" {
		t.Errorf("expected 'unknown', got %q", result)
	}
}

func TestLoadTrimsWhitespace(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "VERSION"), []byte("  1.2.3  \n"), 0644)

	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(dir)

	buildVersion = ""
	result := Load()
	if result != "1.2.3" {
		t.Errorf("expected '1.2.3', got %q", result)
	}
}

func TestLoadWalksUpDirectories(t *testing.T) {
	// Create VERSION in parent dir
	parent := t.TempDir()
	child := filepath.Join(parent, "subdir")
	os.Mkdir(child, 0755)
	os.WriteFile(filepath.Join(parent, "VERSION"), []byte("parent-ver"), 0644)

	orig, _ := os.Getwd()
	defer os.Chdir(orig)
	os.Chdir(child)

	buildVersion = ""
	result := Load()
	if result != "parent-ver" {
		t.Errorf("expected 'parent-ver', got %q", result)
	}
}
