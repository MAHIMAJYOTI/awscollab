FROM node:18-alpine

WORKDIR /app

# Python for local JDoodle fallback in container
RUN apk add --no-cache python3

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "index.js"]
