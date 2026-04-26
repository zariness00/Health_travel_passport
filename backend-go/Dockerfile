# Use the official Golang image to build the binary
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/api/main.go

# Use a small alpine image for the final container
FROM alpine:latest
RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the binary from the builder
COPY --from=builder /app/main .
COPY --from=builder /app/migrations ./migrations

# Expose port 8080
EXPOSE 8080

# Command to run the executable
CMD ["./main"]
