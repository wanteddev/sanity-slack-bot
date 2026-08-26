FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY e2e/ ./e2e/
COPY playwright.sanity.config.ts ./

RUN npm run build

# 루트 실행 회피 — Playwright 이미지가 제공하는 비루트 계정 사용
RUN chown -R pwuser:pwuser /app
USER pwuser

CMD ["node", "dist/server.js"]
