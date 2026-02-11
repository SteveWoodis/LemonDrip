FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install deps INSIDE Linux container
RUN npm ci --omit=dev

# Copy app source
COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# 🚨 Explicit shell exec (important)
CMD ["sh", "-c", "node server.js"]
