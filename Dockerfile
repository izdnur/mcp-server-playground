# Minimal Node image
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY app/server.js ./
COPY manifests/ ./manifests/
# Keep container running for docker exec connections
CMD ["tail", "-f", "/dev/null"]
