# ---------- 1) Ön yüzü derle (React + Vite)
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
# Canlıda ön yüz sunucuya bağlanır; yerel demo ayarları ve şifreler pakete girmez
ENV VITE_API_MODE=server \
    VITE_SEED_ADMIN_EMAIL= \
    VITE_SEED_ADMIN_PASSWORD= \
    VITE_FORM_BASE_URL=
RUN npx vite build

# ---------- 2) Sunucu
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# Kök package.json sadece src/lib dosyalarının ES modülü olarak okunması için
COPY package.json ./package.json
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund
COPY server/src ./server/src
COPY src/lib ./src/lib
COPY --from=web /app/dist ./dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
ENV PORT=3000 \
    DATA_DIR=/data \
    STATIC_DIR=/app/dist
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/src/index.js"]
