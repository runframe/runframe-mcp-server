FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src/ ./src/
RUN npm ci && npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/ ./dist/
EXPOSE 3100
ENTRYPOINT ["node", "dist/index.js", "--transport", "http", "--host", "0.0.0.0"]
