FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --quiet
COPY server.js .
COPY SPEC.md .
COPY pages/ ./pages/
RUN mkdir -p /data
ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server.js"]
