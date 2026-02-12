# AI Olympics Backend API Server
# Express + Socket.io for real-time competition streaming

FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm install tsx

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Expose port (configurable via PORT env var)
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3003) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start API server using tsx (handles TypeScript + ESM natively)
CMD ["npx", "tsx", "src/api/index.ts"]
