import argparse
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from garmin_fit_sdk import Encoder, Profile


def main():
    parser = argparse.ArgumentParser(description="Generate one synthetic running FIT without GPS or device identifiers.")
    china = timezone(timedelta(hours=8))
    parser.add_argument("--date", type=date.fromisoformat, default=datetime.now(china).date())
    parser.add_argument("--out", type=Path, default=Path("database/data/fit/synthetic-demo.fit"))
    args = parser.parse_args()

    start = datetime.combine(args.date, time(7), tzinfo=china).astimezone(timezone.utc)
    duration = 1080
    distance = 3000
    end = start + timedelta(seconds=duration)
    encoder = Encoder()

    def emit(message, **fields):
        encoder.on_mesg(Profile["mesg_num"][message], fields)

    emit("FILE_ID", manufacturer="development", product=1, type="activity", time_created=start)
    for fraction in (0, 0.5, 1):
        emit("RECORD", timestamp=start + timedelta(seconds=duration * fraction),
             distance=distance * fraction, heart_rate=130 + int(10 * fraction))
    emit("LAP", start_time=start, timestamp=end, total_elapsed_time=duration,
         total_timer_time=duration, total_distance=distance)
    emit("SESSION", timestamp=end, start_time=start, sport="running", sub_sport="generic",
         num_laps=1, first_lap_index=0, total_elapsed_time=duration,
         total_timer_time=duration, total_distance=distance)
    emit("ACTIVITY", timestamp=end, total_timer_time=duration, num_sessions=1, type="manual")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(encoder.close())
    print(f"Synthetic demo FIT for {args.date}: {args.out}")


if __name__ == "__main__":
    main()
