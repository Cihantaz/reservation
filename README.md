# Classroom & Exam Reservation System (Demo)

Bu repo, üniversite için **Sınıf & Sınav Rezervasyon Sistemi** demo uygulamasıdır.

## Proje Yapısı

- `backend/`: FastAPI + SQLite (SQLAlchemy) API
- `frontend/`: React (Vite) + TailwindCSS + Lucide UI

## Hızlı Başlangıç (Backend)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend ilk çalışmada SQLite veritabanını oluşturur ve **dummy verileri** seed eder.

## Hızlı Başlangıç (Frontend)

Frontend Node.js gerektirir (npm/pnpm/yarn).

```bash
cd frontend
npm install
npm run dev
```

Varsayılan API adresi: `http://localhost:8000`

