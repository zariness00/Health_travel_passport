package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

type AuthMiddleware struct {
	jwksURL     string
	issuer      string
	jwksCache   jwk.Set
	lastRefresh time.Time
}

func NewAuthMiddleware(supabaseURL string) *AuthMiddleware {
	jwksURL := fmt.Sprintf("%s/auth/v1/.well-known/jwks.json", supabaseURL)
	issuer := fmt.Sprintf("%s/auth/v1", supabaseURL)
	return &AuthMiddleware{
		jwksURL: jwksURL,
		issuer:  issuer,
	}
}

func (m *AuthMiddleware) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing token"})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == authHeader {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token format"})
			return
		}

		ctx := c.Request.Context()
		
		// Lazy load/refresh JWKS
		if m.jwksCache == nil || time.Since(m.lastRefresh) > 1*time.Hour {
			set, err := jwk.Fetch(ctx, m.jwksURL)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch JWKS"})
				return
			}
			m.jwksCache = set
			m.lastRefresh = time.Now()
		}

		token, err := jwt.Parse([]byte(tokenStr), jwt.WithKeySet(m.jwksCache), jwt.WithIssuer(m.issuer), jwt.WithAudience("authenticated"))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token", "details": err.Error()})
			return
		}

		// Set user info in context
		userID := token.Subject()
		email, _ := token.Get("email")

		c.Set("user_id", userID)
		c.Set("user_email", fmt.Sprintf("%v", email))

		c.Next()
	}
}

func GetUserID(c *gin.Context) string {
	val, exists := c.Get("user_id")
	if !exists {
		return ""
	}
	return val.(string)
}

func GetUserEmail(c *gin.Context) string {
	val, exists := c.Get("user_email")
	if !exists {
		return ""
	}
	return val.(string)
}
