FROM node:18-alpine

# Устанавливаем полный ffmpeg с поддержкой OPUS
RUN apk add --no-cache ffmpeg ffmpeg-opus

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
