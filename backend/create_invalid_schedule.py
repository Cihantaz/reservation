import pandas as pd

# Create a schedule Excel with DMF-002 that doesn't exist in rooms
schedule_data = {
    "E-Posta": ["prof@uni.edu", "prof@uni.edu"],
    "Ders Kodu": ["MATH101", "PHYSICS101"],
    "Sınıf(lar)": ["DMF-002", "DMF-101"],  # DMF-002 doesn't exist in rooms!
    "Ders Saati": ["M1, M2", "T1"]
}

df = pd.DataFrame(schedule_data)
df.to_excel("test_schedule_with_invalid_room.xlsx", index=False)
print("✓ test_schedule_with_invalid_room.xlsx created")
print("\nContent:")
print(df)
