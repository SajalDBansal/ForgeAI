package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", jsonRoute(map[string]string{
		"name":    "go-api-starter",
		"message": "Your Go API is running.",
	}))
	mux.HandleFunc("/healthz", jsonRoute(map[string]bool{"ok": true}))

	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func jsonRoute(payload any) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(payload)
	}
}
