# AetherAI backend production image for Google Cloud Run.
# Runtime: node LTS (glibc/debian, bcrypt ships linux-x64 prebuilds; build
# tools kept as a fallback for compiling if a prebuild is unavailable).
FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /usr/src/app

# Install dependencies first (better layer caching). npm ci requires the
# committed package-lock.json. NODE_ENV=production makes npm omit devDeps.
COPY package.json package-lock.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/* /root/.npm

# Application source. Local node_modules must NEVER be copied in (it contains
# Windows-specific binaries) -- .dockerignore handles that.
COPY --chown=node:node . .

USER node

# Cloud Run injects $PORT at runtime; server.js binds process.env.PORT.
# 8080 is the conventional Cloud Run container port.
EXPOSE 8080

CMD ["node", "src/server.js"]