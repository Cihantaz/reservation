import json
import urllib.request
import urllib.error
from pathlib import Path

# Test dosyasını upload et
token = "test-dev-token-123456789"

print("Upload başlanıyor...")
try:
    # MultiPart form data
    file_path = Path("test_schedule.xlsx")
    file_data = file_path.read_bytes()
    
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="test_schedule.xlsx"\r\n'
        f'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n'
        f'\r\n'
    ).encode() + file_data + f'\r\n--{boundary}--\r\n'.encode()
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}"
    }
    
    url = "http://127.0.0.1:3001/api/admin/upload-schedule-preview"
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    
    with urllib.request.urlopen(req, timeout=10) as response:
        status = response.status
        resp_data = json.loads(response.read().decode())
        print(f"✓ Status: {status}")
        print(f"Response:\n{json.dumps(resp_data, indent=2, ensure_ascii=False)}")
        
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.reason}")
    try:
        error_data = json.loads(e.read().decode())
        print(f"Response:\n{json.dumps(error_data, indent=2, ensure_ascii=False)}")
    except:
        print(e.read().decode())
except Exception as e:
    print(f"✗ ERROR: {e}")
    import traceback
    traceback.print_exc()
