from datetime import datetime, time, timezone


def intervals_overlap(start_a: time, end_a: time, start_b: time, end_b: time) -> bool:
    """
    Siki cakisma kurali:
      Max(Start_A, Start_B) < Min(End_A, End_B)
    """
    a0 = _time_to_minutes(start_a)
    a1 = _time_to_minutes(end_a)
    b0 = _time_to_minutes(start_b)
    b1 = _time_to_minutes(end_b)
    return max(a0, b0) < min(a1, b1)


def _time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
