# Hướng dẫn cài đặt và triển khai hệ thống YHCT

## Yêu cầu
- Node.js 18+ (tải tại https://nodejs.org)
- Tài khoản Supabase (miễn phí tại https://supabase.com)
- OpenAI API key (tại https://platform.openai.com)
- Tài khoản GitHub + Vercel (để deploy)

---

## Bước 1: Cài đặt Supabase

1. Đăng nhập vào https://supabase.com → **New Project**
2. Vào **SQL Editor** → dán toàn bộ nội dung file `schema.sql` → **Run**
3. Vào **Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`

---

## Bước 2: Lấy OpenAI API Key

1. Vào https://platform.openai.com/api-keys → **Create new secret key**
2. Copy key (dạng `sk-proj-...`) → `OPENAI_API_KEY`

---

## Bước 3: Chạy trên máy cục bộ

```bash
# 1. Di chuyển vào thư mục dự án
cd yhct-diagnosis

# 2. Cài đặt thư viện
npm install

# 3. Tạo file biến môi trường
cp .env.local.example .env.local
# Mở .env.local và điền các key đã lấy ở bước 1 & 2

# 4. Chạy server phát triển
npm run dev

# 5. Mở trình duyệt: http://localhost:3000
```

---

## Bước 4: Deploy lên Vercel (public URL)

### Cách 1: Qua GitHub (khuyên dùng)
1. Push code lên GitHub: `git init → git add . → git commit → git push`
2. Vào https://vercel.com → **Add New Project** → chọn repo
3. Trong **Environment Variables**, thêm 3 biến:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
4. Click **Deploy** → có URL dạng `https://yhct-diagnosis.vercel.app`

### Cách 2: Qua Vercel CLI
```bash
npm install -g vercel
vercel --prod
# Làm theo hướng dẫn và nhập environment variables
```

---

## Bước 5: Nhập dữ liệu tri thức thực

File `schema.sql` có sẵn ~30 hàng dữ liệu mẫu minh họa.

Để nhập dữ liệu thực từ tài liệu nghiên cứu của bạn:

### Cách A: Nhập qua Supabase Dashboard
- Vào **Table Editor → knowledge_base** → **Insert rows**

### Cách B: Import từ Excel/CSV
1. Chuẩn bị file CSV với các cột: `symptom, synonym, feature, mechanism, syndrome, category`
2. Vào Supabase → **Table Editor → Import data from CSV**

### Cách C: SQL bulk insert
```sql
INSERT INTO knowledge_base (symptom, synonym, feature, mechanism, syndrome, category)
VALUES
  ('tên triệu chứng', 'tên đồng nghĩa 1; tên đồng nghĩa 2', 'đặc điểm 1; đặc điểm 2', 'cơ chế bệnh sinh', 'Tên hội chứng', 'tạng_phủ'),
  -- thêm các hàng tiếp theo...
;
```

### Định dạng cột `synonym` và `feature`
- Nhiều giá trị phân cách bằng dấu `;`
- Ví dụ: `synonym = "mất ngủ; khó ngủ; không ngủ được"`
- Ví dụ: `feature = "khó đi vào giấc ngủ; thức giấc nhiều lần; mơ nhiều"`

---

## Cấu trúc thư mục

```
yhct-diagnosis/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── extract/route.ts    ← Trích xuất triệu chứng (LLM)
│   │   │   ├── reason/route.ts     ← Suy luận hội chứng (Reasoning Engine)
│   │   │   └── finalize/route.ts   ← Kết quả cuối sau disambiguation
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── DiagnosisApp.tsx        ← Toàn bộ giao diện (wizard 4 bước)
│   ├── lib/
│   │   ├── supabase.ts             ← Kết nối database
│   │   ├── openai.ts               ← Giao tiếp LLM
│   │   └── reasoning.ts            ← Thuật toán 8 bước (core XAI)
│   └── types/
│       └── index.ts                ← TypeScript types
├── schema.sql                      ← Chạy trên Supabase
├── .env.local.example              ← Template biến môi trường
└── HUONG_DAN_CAI_DAT.md           ← File này
```

---

## Luồng hoạt động hệ thống

```
Bác sĩ nhập văn bản
        ↓
[API /extract] → LLM trích xuất + chuẩn hóa triệu chứng
                 → Tạo câu hỏi đặc điểm Level 1
        ↓
Bác sĩ trả lời câu hỏi Level 1
        ↓
[API /reason] → Reasoning Engine:
                Bước 3: Tính fit score từng hàng KB
                Bước 4: Tính điểm từng hội chứng
                Bước 5: Greedy set cover → tập tối ưu
                Bước 6: Phát hiện chồng lấp + triệu chứng phân biệt
              → LLM tạo câu hỏi Level 2 (nếu cần)
        ↓
[Nếu có chồng lấp] Bác sĩ trả lời Level 2
        ↓
[API /finalize] → Bước 7: Cập nhật + suy luận lại
                → Bước 8: Kết quả cuối + giải thích tự nhiên
        ↓
Bác sĩ xem kết quả + chọn hội chứng phù hợp
```

---

## Xử lý sự cố thường gặp

**Lỗi "Cannot connect to Supabase"**
- Kiểm tra `NEXT_PUBLIC_SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong `.env.local`
- Đảm bảo đã chạy `schema.sql` trong Supabase

**Lỗi "OpenAI API error"**
- Kiểm tra `OPENAI_API_KEY` còn hạn và đủ credit
- Model `gpt-4o` cần tài khoản có billing

**Triệu chứng không tìm thấy trong KB**
- Hệ thống sẽ đánh dấu ⚠ các triệu chứng chưa có trong KB
- Cần bổ sung dữ liệu vào bảng `knowledge_base`

---

*Luận văn thạc sĩ - BS. Nguyễn Thị Nguyệt Phụng - Đại học Y Dược TP.HCM - 2026*
