FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.server.json ./
RUN npm ci
COPY server ./server
COPY db ./db
COPY contracts ./contracts
COPY tests/server ./tests/server
COPY src/live/stage-refinement.js src/live/stage-refinement.d.ts ./src/live/
RUN npm run api:build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build/server ./build/server
COPY --from=build /app/build/db ./build/db
COPY --from=build /app/build/contracts ./build/contracts
COPY db/migrations ./build/db/migrations
COPY db/seed ./build/db/seed
# Resolve the API and worker module trees in the final image before shipping it.
# This catches emitted imports omitted from the runtime stage without starting services.
RUN node --input-type=module -e "await Promise.all([import('./build/server/app.js'), import('./build/server/agent-runs/worker.js')])"
USER node
EXPOSE 3001
CMD ["node", "build/server/main.js"]
