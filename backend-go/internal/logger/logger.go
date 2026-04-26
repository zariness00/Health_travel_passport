package logger

import (
	"log/slog"
	"os"
	"time"

	"github.com/lmittmann/tint"
	"github.com/mattn/go-isatty"
)

// Logger defines the interface for logging in our application (SOLID)
type Logger interface {
	Debug(msg string, args ...any)
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
	Error(msg string, args ...any)
	With(args ...any) Logger
}

type SlogLogger struct {
	handler *slog.Logger
}

func NewLogger(level string) *SlogLogger {
	var slogLevel slog.Level
	switch level {
	case "debug":
		slogLevel = slog.LevelDebug
	case "warn":
		slogLevel = slog.LevelWarn
	case "error":
		slogLevel = slog.LevelError
	default:
		slogLevel = slog.LevelInfo
	}

	w := os.Stdout
	logger := slog.New(tint.NewHandler(w, &tint.Options{
		Level:      slogLevel,
		TimeFormat: time.RFC3339,
		NoColor:    !isatty.IsTerminal(w.Fd()),
	}))

	return &SlogLogger{handler: logger}
}

func (l *SlogLogger) Debug(msg string, args ...any) { l.handler.Debug(msg, args...) }
func (l *SlogLogger) Info(msg string, args ...any)  { l.handler.Info(msg, args...) }
func (l *SlogLogger) Warn(msg string, args ...any)  { l.handler.Warn(msg, args...) }
func (l *SlogLogger) Error(msg string, args ...any) { l.handler.Error(msg, args...) }

func (l *SlogLogger) With(args ...any) Logger {
	return &SlogLogger{handler: l.handler.With(args...)}
}

// GetSlog returns the underlying slog logger if needed for specific integrations
func (l *SlogLogger) GetSlog() *slog.Logger {
	return l.handler
}
