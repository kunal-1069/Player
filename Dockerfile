# Production-ready Dockerfile for Web Music Player
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install app dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy all app source code
COPY . .

# Optional frontend minify/build step (uncomment if needed)
# RUN npm run build

# Use non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "server.js"]
