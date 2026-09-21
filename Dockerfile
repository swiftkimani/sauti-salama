FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Only what the build needs: never the working tree (.env, data/, .git). See also .dockerignore.
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY public ./public
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3000
# /api/health checks the database too; it reports only { ok }.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
