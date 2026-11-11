# Runs Brand Island on any host that can run a container (Render, Railway,
# Fly.io, Koyeb, a VPS with Docker ...). The site listens on $PORT (3000 if
# unset) and keeps its database in $DATA_DIR (/app/data if unset).

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY shared ./shared
COPY server ./server
COPY public ./public

EXPOSE 3000

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
