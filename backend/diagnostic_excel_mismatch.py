"""
DIAGNOSTIC TOOL: Excel files mismatch detection
Shows which rooms are used in Schedule but missing from Rooms list
"""
import pandas as pd
from pathlib import Path

print("\n" + "=" * 70)
print("EXCEL DOSYA KARŞILAŞTIRMA - EKSIK SINIFLAR")
print("=" * 70)

# Find Excel files in backend directory
excel_files = list(Path(".").glob("*.xlsx"))

if not excel_files:
    print("\n❌ Hiç Excel dosyası bulunamadı!")
    print("Lütfen Rooms (.xlsx) ve Schedule (.xlsx) dosyalarını backend klasörüne kopyalayın.")
    exit(1)

print(f"\nBulunan Excel dosyaları ({len(excel_files)}):")
for f in sorted(excel_files):
    print(f"  - {f.name}")

# Try to find and load Rooms Excel
rooms_df = None
schedule_df = None

for f in excel_files:
    try:
        df = pd.read_excel(f)
        # Check if it's Rooms file (has Bina column)
        if "Bina" in df.columns:
            rooms_df = df
            rooms_file = f.name
            print(f"\n✓ Rooms file bulundu: {rooms_file} ({len(df)} satır)")
        # Check if it's Schedule file (has Sınıf(lar) column)
        elif "Sınıf(lar)" in df.columns or "Sinif(lar)" in df.columns or "S\u0131n\u0131f(lar)" in df.columns:
            schedule_df = df
            schedule_file = f.name
            print(f"✓ Schedule file bulundu: {schedule_file} ({len(df)} satır)")
    except Exception as e:
        print(f"⚠️  {f.name}: {str(e)[:50]}")

# If only one file found, try to guess
if rooms_df is None and schedule_df is not None:
    print("\n⚠️  Rooms file bulunamadı! Schedule file var ama karşılığı yok.")
    print("Rooms Excel'de 'Bina' kolonu olmalı.")

if schedule_df is None and rooms_df is not None:
    print("\n⚠️  Schedule file bulunamadı! Rooms file var ama karşılığı yok.")
    print("Schedule Excel'de 'Sınıf(lar)' kolonu olmalı.")

if rooms_df is None or schedule_df is None:
    print("=" * 70)
    exit(1)

# =========================================================================
# ANALYSIS: Extract room codes from Rooms file
# =========================================================================
print("\n" + "-" * 70)
print("ROOMS FILE ANALIZI")
print("-" * 70)

col_building = None
col_number = None

for col in rooms_df.columns:
    col_lower = str(col).lower()
    if "bina" in col_lower:
        col_building = col
    elif "derslik" in col_lower or "dersl" in col_lower:
        col_number = col

if col_building and col_number:
    # Build room codes from Rooms file
    rooms_set = set()
    for idx, row in rooms_df.iterrows():
        bina = str(row.get(col_building, "")).strip().upper()
        num = str(row.get(col_number, "")).strip()
        if bina and num:
            room_code = f"{bina}-{num}"
            rooms_set.add(room_code)
    
    print(f"✓ Toplam sınıf: {len(rooms_set)}")
    # Show first 10
    for room in sorted(list(rooms_set))[:10]:
        print(f"  - {room}")
    if len(rooms_set) > 10:
        print(f"  ... ve {len(rooms_set) - 10} daha")
else:
    print("❌ Rooms file'de 'Bina' ve 'Derslik' kolonları bulunamadı!")
    rooms_set = set()

# =========================================================================
# ANALYSIS: Extract rooms used in Schedule file
# =========================================================================
print("\n" + "-" * 70)
print("SCHEDULE FILE ANALIZI")
print("-" * 70)

col_sinif = None
for col in schedule_df.columns:
    col_lower = str(col).lower().replace("ı", "i").replace("ü", "u").replace("ö", "o").replace("ş", "s").replace("ğ", "g").replace("ç", "c")
    if "sinif" in col_lower:
        col_sinif = col
        break

if col_sinif:
    # Extract all room references from Schedule
    schedule_rooms = set()
    
    for idx, row in schedule_df.iterrows():
        cells = str(row.get(col_sinif, "")).strip()
        if not cells or cells.lower() == "nan":
            continue
        
        # Split by comma
        for cell in cells.split(","):
            cell = cell.strip().upper()
            # Try to normalize: A203 → A-203
            import re
            m = re.match(r"^([A-ZÇĞİÖŞÜ]+)\s*-?\s*(\d+)$", cell.replace(" ", ""))
            if m:
                normalized = f"{m.group(1)}-{m.group(2)}"
            else:
                normalized = cell
            
            schedule_rooms.add((idx + 2, normalized))  # idx+2 because Excel row numbers start at 1 and header
    
    print(f"✓ Schedule'da kullanılan sınıflar: {len(set(r[1] for r in schedule_rooms))}")
    used_rooms_only = set(r[1] for r in schedule_rooms)
    for room in sorted(list(used_rooms_only))[:10]:
        print(f"  - {room}")
    if len(used_rooms_only) > 10:
        print(f"  ... ve {len(used_rooms_only) - 10} daha")
    
    # =========================================================================
    # FIND MISMATCHES
    # =========================================================================
    print("\n" + "-" * 70)
    print("EKSIK SINIFLAR (Schedule'da var, Rooms'da yok)")
    print("-" * 70)
    
    missing_rooms = sorted(list(used_rooms_only - rooms_set))
    
    if missing_rooms:
        print(f"⚠️  TOPLAM EKSIK SINIF: {len(missing_rooms)}\n")
        
        for missing in missing_rooms:
            # Find which Excel rows use this room
            rows_using = [r for r in schedule_rooms if r[1] == missing]
            row_nums = sorted(list(set(r[0] for r in rows_using)))[:10]  # Show first 10 rows
            
            print(f"❌ {missing}")
            print(f"   Kullanıldığı satırlar: {', '.join(str(r) for r in row_nums)}", end="")
            if len(row_nums) < len(set(r[0] for r in rows_using)):
                print(f" ... ve {len(set(r[0] for r in rows_using)) - len(row_nums)} daha", end="")
            print()
    else:
        print("✅ Harika! Schedule'daki tüm sınıflar Rooms'da var.")
    
    # =========================================================================
    # FIND UNUSED ROOMS
    # =========================================================================
    print("\n" + "-" * 70)
    print("KULLANILAMAYANLAR (Rooms'da var, Schedule'da yok)")
    print("-" * 70)
    
    unused_rooms = sorted(list(rooms_set - used_rooms_only))
    
    if unused_rooms:
        print(f"ℹ️  {len(unused_rooms)} sınıf Schedule'da kullanılmıyor (bu sorun değil, boş sınıf demektir):\n")
        for room in unused_rooms[:10]:
            print(f"  - {room}")
        if len(unused_rooms) > 10:
            print(f"  ... ve {len(unused_rooms) - 10} daha")
    else:
        print("✅ Tüm Rooms sınıfları Schedule'da kullanılıyor.")

else:
    print("❌ Schedule file'de 'Sınıf(lar)' kolonu bulunamadı!")

print("\n" + "=" * 70)
print("ÇÖZÜM:")
print("=" * 70)
print("""
Eksik sınıflar varsa, iki seçeneğiniz var:

1️⃣  Rooms Excel'i güncelle:
   - Eksik sınıfları Rooms Excel'e ekle
   - Format: Bina | Derslik Numarası | Özellik | Kapasite
   - Örn: LMF | 319 | Normal Sınıf | 50

2️⃣  Schedule Excel'i güncelle:
   - Schedule'dan eksik sınıf referanslarını kaldır ve
   - Mevcut sınıflar kullan

Ardından:
1. Rooms Excel'i yükle (Upload Derslik Listesi)
2. Schedule Excel'i yükle (Upload Ders Programı)
3. Preview'da kontrol et (error yoksa tamam)
4. Save butonuna bas
""")
print("=" * 70 + "\n")
