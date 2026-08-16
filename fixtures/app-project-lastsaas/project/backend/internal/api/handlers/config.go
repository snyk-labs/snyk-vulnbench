package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"lastsaas/internal/configstore"
	"lastsaas/internal/db"
	"lastsaas/internal/models"
	"lastsaas/internal/syslog"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/gorilla/mux"
)

type ConfigHandler struct {
	db     *db.MongoDB
	store  *configstore.Store
	syslog *syslog.Logger
}

func NewConfigHandler(database *db.MongoDB, store *configstore.Store, sysLogger *syslog.Logger) *ConfigHandler {
	return &ConfigHandler{
		db:     database,
		store:  store,
		syslog: sysLogger,
	}
}

// ListConfig returns all config variables from the cache.
func (h *ConfigHandler) ListConfig(w http.ResponseWriter, r *http.Request) {
	vars := h.store.GetAll()
	respondWithJSON(w, http.StatusOK, map[string]interface{}{"configs": vars})
}

// GetConfig returns a single config variable by name.
func (h *ConfigHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	v, ok := h.store.GetVar(name)
	if !ok {
		respondWithError(w, http.StatusNotFound, "Config variable not found")
		return
	}
	respondWithJSON(w, http.StatusOK, v)
}

// UpdateConfig updates the value of an existing config variable.
func (h *ConfigHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	v, ok := h.store.GetVar(name)
	if !ok {
		respondWithError(w, http.StatusNotFound, "Config variable not found")
		return
	}

	var req struct {
		Value       string  `json:"value"`
		Description *string `json:"description,omitempty"`
		Options     *string `json:"options,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// For non-system vars, allow updating options before validating value against them
	effectiveOptions := v.Options
	if !v.IsSystem && req.Options != nil && v.Type == models.ConfigTypeEnum {
		effectiveOptions = *req.Options
	}

	if err := configstore.ValidateValue(v.Type, req.Value, effectiveOptions); err != nil {
		respondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Build update document
	updateFields := bson.M{
		"value":     req.Value,
		"updatedAt": time.Now(),
	}
	if !v.IsSystem && req.Description != nil {
		updateFields["description"] = *req.Description
	}
	if !v.IsSystem && req.Options != nil && v.Type == models.ConfigTypeEnum {
		updateFields["options"] = *req.Options
	}

	_, err := h.db.ConfigVars().UpdateOne(r.Context(), bson.M{"name": name}, bson.M{"$set": updateFields})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to update config variable")
		return
	}

	if err := h.store.Reload(r.Context(), name); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Updated but failed to reload cache")
		return
	}

	h.syslog.Critical(r.Context(), fmt.Sprintf("Config variable '%s' updated", name))

	updated, _ := h.store.GetVar(name)
	respondWithJSON(w, http.StatusOK, updated)
}

// CreateConfig creates a new custom config variable.
func (h *ConfigHandler) CreateConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string              `json:"name"`
		Description string              `json:"description"`
		Type        models.ConfigVarType `json:"type"`
		Value       string              `json:"value"`
		Options     string              `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Name == "" {
		respondWithError(w, http.StatusBadRequest, "Name is required")
		return
	}
	if !models.ValidConfigVarType(req.Type) {
		respondWithError(w, http.StatusBadRequest, "Invalid type. Must be: string, numeric, enum, or template")
		return
	}

	if err := configstore.ValidateValue(req.Type, req.Value, req.Options); err != nil {
		respondWithError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Check for duplicate name
	if _, exists := h.store.GetVar(req.Name); exists {
		respondWithError(w, http.StatusConflict, "A config variable with this name already exists")
		return
	}

	now := time.Now()
	v := models.ConfigVar{
		ID:          primitive.NewObjectID(),
		Name:        req.Name,
		Description: req.Description,
		Type:        req.Type,
		Value:       req.Value,
		Options:     req.Options,
		IsSystem:    false,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if _, err := h.db.ConfigVars().InsertOne(r.Context(), v); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to create config variable")
		return
	}

	if err := h.store.Reload(r.Context(), req.Name); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Created but failed to reload cache")
		return
	}

	h.syslog.Critical(r.Context(), fmt.Sprintf("Config variable '%s' created", req.Name))

	respondWithJSON(w, http.StatusCreated, v)
}

// DeleteConfig deletes a custom config variable. System variables cannot be deleted.
func (h *ConfigHandler) DeleteConfig(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	v, ok := h.store.GetVar(name)
	if !ok {
		respondWithError(w, http.StatusNotFound, "Config variable not found")
		return
	}

	if v.IsSystem {
		respondWithError(w, http.StatusForbidden, "System variables cannot be deleted")
		return
	}

	if _, err := h.db.ConfigVars().DeleteOne(r.Context(), bson.M{"name": name}); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to delete config variable")
		return
	}

	// Reload the full cache to remove the deleted variable
	if err := h.store.Load(r.Context()); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Deleted but failed to reload cache")
		return
	}

	h.syslog.Critical(r.Context(), fmt.Sprintf("Config variable '%s' deleted", name))

	respondWithJSON(w, http.StatusOK, map[string]string{"message": "Config variable deleted"})
}
