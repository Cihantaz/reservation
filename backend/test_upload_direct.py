#!/usr/bin/env python3
"""Test upload-schedule-preview endpoint directly"""

import requests
import json

# Minimal Excel-like test data (use existing test file)
test_files = [
    "sample_schedule.xlsx",
    "sample_rooms.xlsx", 
]

BASE_URL = "http://127.0.0.1:3001"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbkBpc2lrdW4uZWR1LnRyIn0.E"

for test_file in test_files:
    print(f"\n{'='*60}")
    print(f"Testing: {test_file}")
    print('='*60)
    
    try:
        with open(test_file, "rb") as f:
            files = {"file": (test_file, f)}
            headers = {"Authorization": f"Bearer {TOKEN}"}
            
            print(f"Uploading to /api/admin/upload-schedule-preview...")
            resp = requests.post(
                f"{BASE_URL}/api/admin/upload-schedule-preview",
                files=files,
                headers=headers,
                timeout=30
            )
            print(f"Status: {resp.status_code}")
            print(f"Response: {json.dumps(resp.json(), indent=2, ensure_ascii=False)[:500]}")
    except FileNotFoundError:
        print(f"File not found: {test_file}")
    except requests.exceptions.Timeout:
        print(f"TIMEOUT after 30 seconds!")
    except Exception as e:
        print(f"Error: {e}")
