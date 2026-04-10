import pandas as pd

# Create test data with different case variations
schedule_data = {
    "E-Posta": ["prof@uni.edu", "prof@uni.edu", "prof@uni.edu"],
    "Ders Kodu": ["MATH101", "PHYSICS101", "BIO101"],
    "Sınıf(lar)": ["dmf-102", "DMF-101", "a-203"],  # Different cases
    "Ders Saati": ["M1", "T1", "W1"]
}

df = pd.DataFrame(schedule_data)
df.to_excel("test_case_sensitivity.xlsx", index=False)
print("✓ test_case_sensitivity.xlsx created with mixed-case room names")
print("\nContent:")
print(df)
