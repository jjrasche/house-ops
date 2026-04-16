FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY apps/expo/ apps/expo/

ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY

# Swap file: links to npm registry versions for CI builds.
# Local dev uses file: links to workspace/factored-ui/ for instant iteration.
RUN sed -i 's|"file:[^"]*adapter-supabase"|"^0.5.0"|; s|"file:[^"]*core"|"^0.5.0"|; s|"file:[^"]*react-native"|"^0.5.0"|; s|"file:[^"]*react"|"^0.5.0"|' apps/expo/package.json
RUN rm -f package-lock.json && npm install --legacy-peer-deps --workspace=@house-ops/core --workspace=@house-ops/mobile --include-workspace-root
RUN cd apps/expo && npx expo export --platform web

FROM caddy:2-alpine
COPY --from=build /app/apps/expo/dist /srv
COPY apps/expo/Caddyfile /etc/caddy/Caddyfile
