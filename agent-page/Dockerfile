# ---------- Build stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (cache-friendly)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# CRA bakes REACT_APP_* into the bundle at build time.
# Empty default => bundle uses same-origin requests, nginx proxies /api, /assets, /health to backend.
ARG REACT_APP_API_URL=""
ENV REACT_APP_API_URL=$REACT_APP_API_URL

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine AS runtime

# Replace default site
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static bundle
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
