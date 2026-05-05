#!/usr/bin/env python3
import subprocess
import time
import requests
import sys
import os

# Backend'i başlat
print("🚀 Backend başlatılıyor...")
backend_dir = r"c:\Users\cihan.tazeoz\Desktop\Uygulamalar\reservation\backend"
os.chdir(backend_dir)

# Backend process başlat
backend_proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

print("⏳ Backend başlaması için 10 saniye bekleniyor...")
time.sleep(10)

# Health check yap
print("\n🔍 Health check yapılıyor: http://127.0.0.1:8000/health")
try:
    response = requests.get("http://127.0.0.1:8000/health", timeout=5)
    print(f"✅ Status: {response.status_code}")
    print(f"✅ Response: {response.json()}")
except requests.exceptions.ConnectionError:
    print("❌ Backend'e ulaşılamadı!")
except Exception as e:
    print(f"❌ Hata: {e}")

# Root endpoint'i test et
print("\n🔍 Root endpoint test: http://127.0.0.1:8000/")
try:
    response = requests.get("http://127.0.0.1:8000/", timeout=5)
    print(f"✅ Status: {response.status_code}")
    print(f"✅ Response: {response.json()}")
except Exception as e:
    print(f"❌ Hata: {e}")

# CORS header check
print("\n🔍 CORS headers check:")
try:
    response = requests.get(
        "http://127.0.0.1:8000/health",
        headers={"Origin": "http://127.0.0.1:5173"}
    )
    print(f"Access-Control-Allow-Origin: {response.headers.get('access-control-allow-origin', 'YOK')}")
    print(f"Access-Control-Allow-Credentials: {response.headers.get('access-control-allow-credentials', 'YOK')}")
except Exception as e:
    print(f"❌ Hata: {e}")

print("\n✅ Testler tamamlandı. Backend port 8000'de çalışıyor.")
print("Frontend'i başlatmak için:")
print("  cd c:\\Users\\cihan.tazeoz\\Desktop\\Uygulamalar\\reservation\\frontend")
print("  npm run dev")
