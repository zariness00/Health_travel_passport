package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
	"zarina-alima/backend/internal/logger"
)

func LoggerMiddleware(log logger.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		args := []any{
			slog.String("method", c.Request.Method),
			slog.Int("status", status),
			slog.Duration("latency", latency),
			slog.String("ip", c.ClientIP()),
		}

		if query != "" {
			args = append(args, slog.String("query", query))
		}

		if len(c.Errors) > 0 {
			for _, e := range c.Errors {
				log.Error("HTTP Error", slog.String("path", path), slog.String("error", e.Error()))
			}
		} else {
			if status >= 500 {
				log.Error("HTTP Request", append(args, slog.String("path", path))...)
			} else if status >= 400 {
				log.Warn("HTTP Request", append(args, slog.String("path", path))...)
			} else {
				log.Info("HTTP Request", append(args, slog.String("path", path))...)
			}
		}
	}
}
