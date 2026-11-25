"""Quick local desktop resource smoke check (developer-only, optional psutil).

Start a fresh-profile native Companion and identify its main Python/executable PID.
Run: python tools/performance_smoke.py PID --output /tmp/companion-perf.json
Keep the app open until all samples finish. No processes are killed or modified.
RSS is summed across the process tree, so shared pages can be counted twice.
"""
from __future__ import annotations

import argparse
import json
import platform
import statistics
import time
from pathlib import Path

import psutil


def process_tree(root):
    return [root, *root.children(recursive=True)]


def sample(root, seconds=3.0):
    """Sample actual process-tree CPU deltas and RSS over a short interval."""
    before = {}
    started = time.monotonic()
    for proc in process_tree(root):
        try:
            cpu = proc.cpu_times()
            before[(proc.pid, proc.create_time())] = cpu.user + cpu.system
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    readings = []
    while True:
        time.sleep(min(0.5, seconds))
        elapsed = time.monotonic() - started
        if not root.is_running():
            raise RuntimeError("Companion exited during measurement")
        rss = 0
        cpu_delta = 0.0
        count = 0
        unreadable = 0
        for proc in process_tree(root):
            try:
                mem = proc.memory_info().rss
                cpu = proc.cpu_times()
                key = (proc.pid, proc.create_time())
                # Newly started children contribute their lifetime CPU.
                total = cpu.user + cpu.system
                cpu_delta += max(0.0, total - before.get(key, 0.0))
                rss += mem
                count += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                unreadable += 1
        readings.append({"rss_mib": round(rss / 1048576, 1), "processes": count,
                         "cpu_percent": round(100 * cpu_delta / elapsed, 1),
                         "unreadable_processes": unreadable})
        if elapsed >= seconds:
            break
    return {"duration_seconds": round(elapsed, 2),
            "rss_mib_median": round(statistics.median(r["rss_mib"] for r in readings), 1),
            "rss_mib_peak": max(r["rss_mib"] for r in readings),
            "cpu_percent_end": readings[-1]["cpu_percent"],
            "processes_peak": max(r["processes"] for r in readings),
            "unreadable_processes_peak": max(r["unreadable_processes"] for r in readings)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pid", type=int, help="Native Companion main process ID (not the game or a renderer)")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seconds", type=float, default=3.0)
    args = parser.parse_args()
    if not 0.5 <= args.seconds <= 30:
        parser.error("--seconds must be between 0.5 and 30")
    root = psutil.Process(args.pid)
    report = {"platform": platform.platform(), "logical_cpus": psutil.cpu_count(),
              "system_ram_mib": round(psutil.virtual_memory().total / 1048576),
              "metric_note": "Summed RSS (shared pages may be double counted); CPU % relative to one logical core. Short-lived processes can be missed.",
              "samples": {}}
    for name, instruction in [
        ("idle", "Open Home and leave Companion idle."),
        ("navigation", "Open Pokédex and navigate or scroll during the sample."),
        ("popouts", "Open a few popouts and enable animated sprites where appropriate."),
        ("recovery", "Close those popouts, return to Home and leave it idle."),
    ]:
        input(f"{instruction} Press Enter when ready: ")
        result = sample(root, args.seconds)
        report["samples"][name] = result
        print(json.dumps(result, ensure_ascii=False))
        # Keep completed evidence even if a later stage fails.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {args.output}. Also record cold startup/relaunch time and whether quitting removes the process tree; assess material issues, not arbitrary thresholds.")


if __name__ == "__main__":
    main()
