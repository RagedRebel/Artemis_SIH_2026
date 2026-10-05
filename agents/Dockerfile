# ARTEMIS agent workers (campaign-handler, blue-team, cve-intel supervisor)
FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY agents/package.json ./agents/
COPY admin-panel/package.json ./admin-panel/

RUN npm ci

COPY agents ./agents

RUN npm run build --workspace=@artemis/agents

WORKDIR /app/agents
CMD ["node", "dist/main.js"]
