FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY e2e/ ./e2e/
COPY playwright.sanity.config.ts ./

RUN npm run build

CMD ["node", "dist/server.js"]
