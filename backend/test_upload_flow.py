import requests
import json
from pathlib import Path

# Dev token
token = "test-dev-token-123456789"
headers = {"Authorization": f"Bearer {token}"}

print("=" * 60)
print("[TEST] Rooms Upload Preview")
print("=" * 60)

# Upload rooms preview
with open("test_rooms.xlsx", "rb") as f:
    files = {"file": ("test_rooms.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    resp = requests.post(
        "http://127.0.0.1:3001/api/admin/upload-rooms-preview",
        headers=headers,
        files=files
    )

print(f"Status: {resp.status_code}")
preview = resp.json()
print(f"OK: {preview.get('ok')}")
print(f"Items: {preview.get('total_items')}")
print(f"Errors: {len(preview.get('errors', []))}")
if preview.get('errors'):
    for e in preview.get('errors', []):
        print(f"  - Row {e.get('row')}: {e.get('message')}")
print()

# Save rooms
print("=" * 60)
print("[TEST] Rooms Save")
print("=" * 60)
save_resp = requests.post(
    "http://127.0.0.1:3001/api/admin/upload-rooms-save",
    headers=headers,
    json={"items": preview.get('items', [])}
)
print(f"Status: {save_resp.status_code}")
print(f"Response: {save_resp.json()}")
print()

# Check rooms in DB
print("=" * 60)
print("[TEST] Rooms in DB")
print("=" * 60)
db_resp = requests.get("http://127.0.0.1:3001/rooms", headers=headers)
rooms = db_resp.json()
print(f"Total rooms: {len(rooms)}")
for room in rooms:
    print(f"  - {room.get('name')} ({room.get('building')}-{room.get('room_number')})")
print()

print("=" * 60)
print("[TEST] Schedule Upload Preview")
print("=" * 60)

# Upload schedule preview
with open("test_schedule.xlsx", "rb") as f:
    files = {"file": ("test_schedule.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    resp = requests.post(
        "http://127.0.0.1:3001/api/admin/upload-schedule-preview",
        headers=headers,
        files=files
    )

print(f"Status: {resp.status_code}")
preview = resp.json()
print(f"OK: {preview.get('ok')}")
print(f"Items: {preview.get('total_items')}")
print(f"Errors: {len(preview.get('errors', []))}")
if preview.get('errors'):
    for e in preview.get('errors', []):
        print(f"  - Row {e.get('row')}: {e.get('message')}")
print()

if preview.get("items"):
    print("[ITEMS]")
    for item in preview.get('items', [])[:3]:
        print(f"  - {item.get('course_code')} @ {item.get('room_name')} ({item.get('weekday')}{item.get('slot')})")
