# ─── Stage 1: Base ────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app

RUN apk add --no-cache dumb-init

# ─── Stage 2: Dependencies ────────────────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts \
    && npm cache clean --force

# ─── Stage 3: Development ─────────────────────────────────────────────────────
FROM base AS development

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts \
    && npm cache clean --force

COPY . .

EXPOSE 5173

# Bind to 0.0.0.0 so Vite is accessible from outside the container
CMD ["dumb-init", "node", "node_modules/.bin/vite", "--host", "0.0.0.0"]

# ─── Stage 4: Build ───────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ─── Stage 5: Production (Nginx) ──────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
