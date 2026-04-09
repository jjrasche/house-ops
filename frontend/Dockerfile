FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY frontend/vendor/ frontend/vendor/
COPY packages/core/package.json packages/core/package.json
RUN npm install --legacy-peer-deps
COPY frontend/ frontend/
COPY packages/core/ packages/core/
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_DEEPGRAM_API_KEY
RUN npm run --workspace=frontend build

FROM caddy:2-alpine
COPY --from=build /app/frontend/dist /srv
COPY frontend/Caddyfile.frontend /etc/caddy/Caddyfile
EXPOSE 80
