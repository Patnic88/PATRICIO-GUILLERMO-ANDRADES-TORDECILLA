FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY instrucciones ./instrucciones
COPY conocimiento ./conocimiento
COPY scripts ./scripts
RUN mkdir -p /datos && chown node:node /datos
USER node
ENV HOST=0.0.0.0 DIR_DATOS=/datos PUERTO=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/servidor.js"]
