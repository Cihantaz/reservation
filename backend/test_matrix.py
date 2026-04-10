import urllib.request
import json

token = "test-dev-token-123456789"
url = "http://127.0.0.1:3001/api/matrix?date_str=2026-04-09"

headers = {"Authorization": f"Bearer {token}"}
req = urllib.request.Request(url, headers=headers)

try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print("✓ Matrix endpoint başarılı!")
        print(f"Day: {data['day']}")
        print(f"Rooms: {len(data['rooms'])}")
        print(f"Slots: {len(data['slots'])}")
        print(f"Cells: {len(data['cells'])}")
        # Örnek cell
        if data['cells']:
            print(f"Example cell: {data['cells'][0]}")
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
