# CMS AI Service

AI Content Generation Service sử dụng Bun.js + Hono.js + OpenAI

## 🚀 Cài đặt

### Yêu cầu
- Bun runtime đã cài đặt: https://bun.sh

### Bước 1: Cài đặt dependencies
```bash
cd ai-service
bun install
```

### Bước 2: Cấu hình
Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```

Cập nhật các biến môi trường:
```env
CMS_AI_API_KEY=sk-your-openai-api-key
PORT=3001
```

### Bước 3: Chạy service
**Development mode (auto-reload):**
```bash
bun run dev
```

**Production mode:**
```bash
bun start
```

Service sẽ chạy tại `http://localhost:3001`

## 📡 API Endpoints

### POST /api/generate-content
Tạo nội dung HTML từ prompt

**Request:**
```json
{
  "prompt": "Viết bài đánh giá ROG Xbox Ally",
  "context": "Optional - context từ các tin nhắn trước",
  "tone": "professional", // optional: professional | casual | formal | friendly
  "length": "medium" // optional: short | medium | long
}
```

**Response:**
```json
{
  "success": true,
  "content": "<p>HTML content here...</p>",
  "html": "<p>HTML content here...</p>"
}
```

### GET /health
Health check endpoint

## 🚢 Deploy lên Railway

1. Push code lên GitHub
2. Tạo project mới trên Railway
3. Connect GitHub repo
4. Cấu hình build command:
   - Build Command: `bun install`
   - Start Command: `bun start`
5. Thêm environment variables:
   - `CMS_AI_API_KEY`: OpenAI API key của bạn

## 🔧 Tích hợp với Frontend

Cập nhật URL API trong frontend (file `ai-chatbot-bubble.tsx`):
```typescript
const response = await fetch("http://localhost:3001/api/generate-content", {
  // ... rest of the code
});
```

Hoặc sử dụng environment variable cho production.
