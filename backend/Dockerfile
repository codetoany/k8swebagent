FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN corepack enable \
    && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm build

FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN corepack enable \
    && pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/app.js"]
