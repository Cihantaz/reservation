import openpyxl

# Test Rooms Excel
rooms_wb = openpyxl.Workbook()
rooms_ws = rooms_wb.active
rooms_ws.title = "Sınıflar"

# Header
rooms_ws['A1'] = "Bina"
rooms_ws['B1'] = "Derslik Numarası"
rooms_ws['C1'] = "Özellik"
rooms_ws['D1'] = "Kapasite"

# Data (Bina-DerslikNumarası = room_code)
rooms_data = [
    ("DMF", "101", "Normal Sınıf", 60),
    ("DMF", "102", "Bilgisayar Lab", 40),
    ("DMF", "201", "Konferans Salonu", 100),
    ("A", "203", "Normal Sınıf", 50),
    ("A", "204", "Normal Sınıf", 50),
    ("B", "301", "Amfi", 200),
    ("B", "302", "Normal Sınıf", 45),
]

for idx, (bina, derslik, ozellük, kapasite) in enumerate(rooms_data, start=2):
    rooms_ws[f'A{idx}'] = bina
    rooms_ws[f'B{idx}'] = derslik
    rooms_ws[f'C{idx}'] = ozellük
    rooms_ws[f'D{idx}'] = kapasite

rooms_wb.save("test_rooms.xlsx")
print("✓ test_rooms.xlsx oluşturuldu (7 sınıf)")

# Test Schedule Excel
sched_wb = openpyxl.Workbook()
sched_ws = sched_wb.active
sched_ws.title = "Ders Programı"

# Header
sched_ws['A1'] = "E-Posta"
sched_ws['B1'] = "Ders Kodu"
sched_ws['C1'] = "Sınıf(lar)"
sched_ws['D1'] = "Ders Saati"

# Data: Room'ların bina-derslik formatında yazılması lazım(DMF-101, A-203, vs)
schedule_data = [
    ("prof@uni.edu", "MAT101", "DMF-101", "M1, M2"),
    ("prof@uni.edu", "PHY101", "DMF-102", "T1, T2"),
    ("prof@uni.edu", "BIO101", "A-203", "W1"),
    ("doc@uni.edu", "ENG102", "A-204, B-301", "TH2"),
    ("doc@uni.edu", "HIS101", "B-302", "F3, F4"),
]

for idx, (email, code, rooms, times) in enumerate(schedule_data, start=2):
    sched_ws[f'A{idx}'] = email
    sched_ws[f'B{idx}'] = code
    sched_ws[f'C{idx}'] = rooms
    sched_ws[f'D{idx}'] = times

sched_wb.save("test_schedule.xlsx")
print("✓ test_schedule.xlsx oluşturuldu (5 ders)")

print("\nOrnekler:")
print("Rooms: DMF-101, DMF-102, DMF-201, A-203, A-204, B-301, B-302")
print("Schedule: MAT101 (DMF-101, M1-M2), PHY101 (DMF-102, T1-T2), ...")
