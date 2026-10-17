"""Start MCP against local TrailVerse without changing deployment defaults."""
import os
import runpy
import sys
from pathlib import Path

if __name__ == "__main__":
    os.environ["TRAILVERSE_API_BASE"] = "http://127.0.0.1:5001"
    os.environ.setdefault("PLAN_TRIP_TIMEOUT", "180")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    runpy.run_module("server.main", run_name="__main__")
