FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY relay-server.ts ./

RUN npm run build

# Remove dev dependencies for smaller image
RUN npm prune --production

EXPOSE 8765

CMD ["node", "dist/relay-server.js"]
