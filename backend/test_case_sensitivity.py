import requests

token = "test-dev-token-123456789"
headers = {"Authorization": f"Bearer {token}"}

print("=" * 60)
print("[TEST] Case Sensitivity (dmf-102 vs DMF-101 vs a-203)")
print("=" * 60)

with open("test_case_sensitivity.xlsx", "rb") as f:
    files = {"file": ("test_case_sensitivity.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    resp = requests.post(
        "http://127.0.0.1:3001/api/admin/upload-schedule-preview",
        headers=headers,
        files=files
    )

print(f"Status: {resp.status_code}")
preview = resp.json()
print(f"\nOK: {preview.get('ok')}")
print(f"Items: {preview.get('total_items')}")
print(f"Errors: {len(preview.get('errors', []))}")

if preview.get('errors'):
    print("\n[ERRORS/MESSAGES]:")
    for e in preview.get('errors', []):
        msg = e.get('message', '')
        if '❌' in msg or '⚠️' in msg:
            print(f"  Row {e.get('row')}: {msg}")

if preview.get("items"):
    print("\n[VALID ITEMS]:")
    for item in preview.get('items', []):
        original = item.get('room_name')
        print(f"  - {item.get('course_code')} @ {original}")
else:
    print("\n[VALID ITEMS]: None")
