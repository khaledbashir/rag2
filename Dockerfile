FROM node:22-bullseye-slim AS build

WORKDIR /app
COPY package* .
RUN npm install --production=false --prefer-offline --no-audit --no-fund --legacy-peer-deps
COPY . .
RUN npx prisma generate
RUN npm run build


FROM node:22-bullseye-slim AS production

# Install Python3 + pip for the PDF triage service, plus ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    python3-pip \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

WORKDIR /app

COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/test-fixtures ./test-fixtures
COPY --from=build --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh

# Copy PDF triage Python service
COPY --from=build --chown=nextjs:nodejs /app/pdf-triage-service ./pdf-triage-service

# Install Python dependencies for the triage service
RUN pip3 install --no-cache-dir -r pdf-triage-service/requirements.txt

RUN chmod +x docker-entrypoint.sh

# Create persistent data directory for RFP PDFs (mount as Docker volume in EasyPanel)
RUN mkdir -p /data/rfp-uploads && chown nextjs:nodejs /data/rfp-uploads

USER nextjs

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]

# Build trigger: 1740228000
