package handlers

import (
	"net/http"

	"lastsaas/internal/db"
	"lastsaas/internal/middleware"
	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/gorilla/mux"
)

type MessageHandler struct {
	db *db.MongoDB
}

func NewMessageHandler(database *db.MongoDB) *MessageHandler {
	return &MessageHandler{db: database}
}

func (h *MessageHandler) ListMessages(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondWithError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetLimit(100)

	cursor, err := h.db.Messages().Find(r.Context(),
		bson.M{"userId": user.ID}, opts)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to fetch messages")
		return
	}
	defer cursor.Close(r.Context())

	var messages []models.Message
	if err := cursor.All(r.Context(), &messages); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to decode messages")
		return
	}

	if messages == nil {
		messages = []models.Message{}
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{"messages": messages})
}

func (h *MessageHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondWithError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	count, err := h.db.Messages().CountDocuments(r.Context(),
		bson.M{"userId": user.ID, "read": false})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to count messages")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{"count": count})
}

func (h *MessageHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondWithError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	msgIDStr := mux.Vars(r)["messageId"]
	msgID, err := primitive.ObjectIDFromHex(msgIDStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid message ID")
		return
	}

	result, err := h.db.Messages().UpdateOne(r.Context(),
		bson.M{"_id": msgID, "userId": user.ID},
		bson.M{"$set": bson.M{"read": true}})
	if err != nil || result.MatchedCount == 0 {
		respondWithError(w, http.StatusNotFound, "Message not found")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"message": "Marked as read"})
}
