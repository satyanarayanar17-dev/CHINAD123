FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
# Remove devDependencies to keep runtime small
RUN npm prune --omit=dev
EXPOSE 3001
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3001) + '/api/v1/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["npm", "start"]
