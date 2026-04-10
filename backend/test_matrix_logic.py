from app.db import SessionLocal
from app.seed import seed_if_empty
from app.models import Room
from sqlalchemy import select
from datetime import datetime

# Initialize database
db = SessionLocal()
seed_if_empty(db)

# Test matrix logic
target_date = datetime.strptime("2026-04-09", "%Y-%m-%d").date()
weekday_map = {0: "M", 1: "T", 2: "W", 3: "TH", 4: "F", 5: "SA", 6: "SU"}
target_weekday = weekday_map[target_date.weekday()]

print(f"Target date: {target_date}")
print(f"Target weekday: {target_weekday}")

# Load rooms
rooms = db.scalars(select(Room)).all()
print(f"Rooms: {len(rooms)}")

print("✓ Matrix logic başarılı")
db.close()
