FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ENV NEXT_OUTPUT=standalone
RUN npm run build


FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# 성적서 OCR: PDF 첫 페이지 렌더링(pdftoppm)
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
ENV PORT=3000

# Next.js standalone 서버
COPY --from=builder /app/.next/standalone ./

# 정적 파일
COPY --from=builder /app/.next/static ./.next/static

# public 정적 파일(아이콘 등). PDF·업로드·JSON 은 compose 볼륨으로 호스트 경로 마운트.
COPY --from=builder /app/public ./public

# 성적서 OCR 언어 데이터(kor, eng)
COPY --from=builder /app/tessdata ./tessdata

RUN mkdir -p /app/public/storage /app/public/uploads /app/data

EXPOSE 3000

CMD ["node", "server.js"]