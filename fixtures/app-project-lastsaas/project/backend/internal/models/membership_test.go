package models

import "testing"

func TestRoleHasPermission(t *testing.T) {
	tests := []struct {
		name     string
		user     MemberRole
		required MemberRole
		expected bool
	}{
		{"owner >= owner", RoleOwner, RoleOwner, true},
		{"owner >= admin", RoleOwner, RoleAdmin, true},
		{"owner >= user", RoleOwner, RoleUser, true},
		{"admin >= admin", RoleAdmin, RoleAdmin, true},
		{"admin >= user", RoleAdmin, RoleUser, true},
		{"admin < owner", RoleAdmin, RoleOwner, false},
		{"user >= user", RoleUser, RoleUser, true},
		{"user < admin", RoleUser, RoleAdmin, false},
		{"user < owner", RoleUser, RoleOwner, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := RoleHasPermission(tt.user, tt.required)
			if got != tt.expected {
				t.Errorf("RoleHasPermission(%s, %s) = %v, want %v", tt.user, tt.required, got, tt.expected)
			}
		})
	}
}

func TestValidRole(t *testing.T) {
	if !ValidRole(RoleOwner) {
		t.Error("owner should be valid")
	}
	if !ValidRole(RoleAdmin) {
		t.Error("admin should be valid")
	}
	if !ValidRole(RoleUser) {
		t.Error("user should be valid")
	}
	if ValidRole("superadmin") {
		t.Error("superadmin should not be valid")
	}
	if ValidRole("") {
		t.Error("empty string should not be valid")
	}
}
