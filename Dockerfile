FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_ENABLE_BACKEND=true
ENV VITE_ENABLE_BACKEND=$VITE_ENABLE_BACKEND
COPY package.json package-lock.json ./
COPY examples/package.json examples/package.json
RUN npm ci
COPY . .
RUN npm run build && npm run build:example
RUN npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ARG VITE_ENABLE_BACKEND=true
ENV VITE_ENABLE_BACKEND=$VITE_ENABLE_BACKEND
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/examples/package.json ./examples/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/examples/dist ./examples/dist
COPY --from=build /app/examples/production_http_server.ts ./examples/production_http_server.ts
CMD ["node", "examples/production_http_server.ts"]
