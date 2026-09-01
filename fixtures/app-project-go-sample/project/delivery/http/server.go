package http

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/signal"

	. "github.com/zitryss/perfmon/domain"
	"github.com/zitryss/perfmon/internal/log"
)

const (
	port = 9000
)

type server struct {
	http *http.Server
}

func NewServer(use Usecaser, db *sql.DB) *server {
	html := newHTML()
	api := newAPI(use, db)
	report := newReportView()
	r := newRouter(html, api, report)
	addr := os.Getenv("PERFMON_LISTEN_ADDR")
	if addr == "" {
		addr = fmt.Sprintf(":%d", port)
	}
	return &server{
		http: &http.Server{
			Addr:    addr,
			Handler: r,
		},
	}
}

func (s *server) Start() {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)
	go func() {
		<-quit
		s.shutdown()
	}()
	log.Info(fmt.Sprintf("starting http server on port %d", port))
	err := s.http.ListenAndServe()
	if err != nil {
		log.Critical("http: server: listen and server")
		log.Critical(err)
	}
}

func (s *server) shutdown() {
	err := s.http.Shutdown(context.Background())
	if err != nil {
		log.Critical("http: server: shutdown")
		log.Critical(err)
	}
}
