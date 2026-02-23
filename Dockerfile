FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# ─── Production Image ────────────────────────────────────────────
FROM node:20-alpine

# Security: create a non-root user to run the application
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install wget for healthcheck (not present in some alpine images)
RUN apk add --no-cache wget

WORKDIR /app

# Copy production dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY . .

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user — container compromise no longer gives root access
USER appuser

EXPOSE 3000

# Health check — Docker and orchestrators use this to monitor container health
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
