"""
DEBUG TOOL: Check what's in the database and Excel files
"""
import pandas as pd
from pathlib import Path
import sqlite3
from datetime import datetime

print("\n" + "=" * 70)
print("DATABASE & EXCEL INSPECTION")
print("=" * 70)

# =============================================================================
# 1. Check Database
# =============================================================================
print("\n[1/3] VERİTABANI İNCELEMESİ")
print("-" * 70)

db_path = Path("reservation.db")
if not db_path.exists():
    print("❌ Database bulunamadı (reservation.db)")
    print("   Backend'i çalıştırın, otomatik oluşturulacak.")
else:
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get rooms
        cursor.execute("SELECT COUNT(*) as total FROM room")
        total_rooms = cursor.fetchone()[0]
        print(f"✓ Toplam Room sayısı: {total_rooms}")
        
        cursor.execute("SELECT name FROM room ORDER BY name LIMIT 20")
        rooms = cursor.fetchall()
        print(f"  İlk 20 room:")
        for room in rooms:
            print(f"    - {room[0]}")
        
        if total_rooms > 20:
            print(f"  ... ve {total_rooms - 20} daha")
        
        # Look for DMF-002, DMF-003, DMF-004
        print(f"\n✓ DMF sınıflarını arama:")
        cursor.execute("SELECT name FROM room WHERE name LIKE 'DMF-%' ORDER BY name")
        dmf_rooms = cursor.fetchall()
        if dmf_rooms:
            for room in dmf_rooms:
                print(f"    ✓ {room[0]}")
        else:
            print(f"    ❌ Hiç DMF sınıfı bulunamadı!")
        
        conn.close()
    except Exception as e:
        print(f"❌ Database hata: {str(e)}")

# =============================================================================
# 2. Find Excel Files
# =============================================================================
print("\n[2/3] EXCEL DOSYA TARAMASI")
print("-" * 70)

excel_files = sorted(list(Path(".").glob("*.xlsx")))

if not excel_files:
    print("❌ Hiç Excel dosyası bulunamadı!")
    print("\n   ÇÖZÜM:")
    print("   1. Rooms Excel dosyasını kopyalayın: backend klasörü")
    print("      C:\\...\\reservation\\backend\\")
    print("   2. Schedule Excel dosyasını kopyalayın: aynı yere")
    print("   3. Sonra bu scripti çalıştırın")
else:
    print(f"✓ Bulunan {len(excel_files)} Excel dosyası:")
    for f in excel_files:
        try:
            df = pd.read_excel(f)
            print(f"  - {f.name} ({len(df)} satır, {len(df.columns)} kolon)")
            print(f"    Kolonlar: {', '.join(df.columns[:3])}...")
        except Exception as e:
            print(f"  - {f.name} (❌ Parse hatası: {str(e)[:50]})")

# =============================================================================
# 3. Rooms File Analysis
# =============================================================================
print("\n[3/3] ROOMS EXCEL DETAYLI ANALİZİ")
print("-" * 70)

# Find Rooms file
rooms_file = None
for f in excel_files:
    try:
        df = pd.read_excel(f)
        if "Bina" in df.columns:
            rooms_file = f
            break
    except:
        pass

if rooms_file:
    try:
        df = pd.read_excel(rooms_file)
        
        # Find column names
        col_bina = None
        col_num = None
        for col in df.columns:
            if "bina" in str(col).lower():
                col_bina = col
            elif "derslik" in str(col).lower() or "dersl" in str(col).lower():
                col_num = col
        
        if col_bina and col_num:
            print(f"✓ Rooms file: {rooms_file.name}")
            print(f"  Bina kolonu: {col_bina}")
            print(f"  Derslik kolonu: {col_num}")
            print(f"\n  Sınıflar (room_code = Bina-DerslikNum):")
            
            room_list = []
            for idx, row in df.iterrows():
                bina = str(row.get(col_bina, "")).strip().upper()
                num = str(row.get(col_num, "")).strip()
                if bina and num:
                    room_code = f"{bina}-{num}"
                    room_list.append(room_code)
            
            # Show DMF rooms specifically
            dmf_rooms = [r for r in room_list if r.startswith("DMF")]
            print(f"\n  DMF Sınıfları ({len(dmf_rooms)} adet):")
            for room in sorted(dmf_rooms)[:20]:
                print(f"    - {room}")
            if len(dmf_rooms) > 20:
                print(f"    ... ve {len(dmf_rooms) - 20} daha")
            
            # Check for DMF-002, DMF-003, DMF-004
            print(f"\n  🔍 Aranan sınıflar:")
            for target in ["DMF-002", "DMF-003", "DMF-004"]:
                if target in room_list:
                    print(f"    ✓ {target} BULUNDU ✓")
                else:
                    print(f"    ❌ {target} bulunamadı")
            
            print(f"\n  Toplam: {len(room_list)} sınıf")
        else:
            print("❌ Bina veya Derslik kolonu bulunamadı")
    except Exception as e:
        print(f"❌ Rooms file parse hatası: {str(e)}")
else:
    print("❌ Rooms file bulunamadı (Bina kolonu arıyoruz)")

print("\n" + "=" * 70)
print("SONRAKI ADIM:")
print("=" * 70)
print("""
1️⃣  Excel dosyalarınızı backend klasörüne kopyalayın:
   C:\\Users\\Cihan...\\Masaüstü\\Uygulamalar\\reservation\\backend\\

2️⃣  Bu scripti tekrar çalıştırın:
   python diagnostic_excel_mismatch.py
   
3️⃣  Çıktıda eksik sınıfları göreceksiniz (EKSIK SINIFLAR bölümü)

4️⃣  Eksik sınıfları eklemek için:
   - Rooms Excel'i düzenleyin veya
   - Schedule Excel'den kaldırın
""")
print("=" * 70 + "\n")
