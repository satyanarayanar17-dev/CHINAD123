FROM node:18-alpine AS builder
WORKDIR /app
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# Copy built static files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config that:
# 1. Serves React SPA with try_files for client-side routing
# 2. Proxies /api/v1/* to backend Express container (rewritten to /api/*)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
