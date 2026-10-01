#!/usr/bin/env python3
"""Merge PlatformIO kit builds into single flash images for web flashing.

Run after `pio run -e temperature-kit -e rain-gauge-kit`. For each kit env it
merges bootloader (0x1000), partition table (0x8000), boot_app0 (0xe000) and
the app (0x10000) into one image at offset 0x0, writes it to
web/public/firmware/<env>.bin, and refreshes web/public/firmware/manifest.json,
which the dashboard's Flash tab reads.

Usage:
    python scripts/package_firmware.py [--version 1.2.0] [--commit <sha>]

Requires esptool (`pip install esptool`); PlatformIO installs it as well.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "web" / "public" / "firmware"

KITS = [
    {
        "id": "temperature-kit",
        "env": "temperature-kit",
        "name": "Grow-bag temperature kit",
        "description": "Five DS18B20 channels (GPIO 5, 4, 16, 17, 14).",
    },
    {
        "id": "rain-gauge-kit",
        "env": "rain-gauge-kit",
        "name": "Rain gauge kit",
        "description": "HW-477 tipping bucket on GPIO 34, plus its own Wi-Fi access point.",
    },
]


def boot_app0_path() -> Path:
    core = os.environ.get("PLATFORMIO_CORE_DIR", str(Path.home() / ".platformio"))
    path = Path(core) / "packages" / "framework-arduinoespressif32" / "tools" / "partitions" / "boot_app0.bin"
    if not path.exists():
        sys.exit(f"boot_app0.bin not found at {path}. Build a kit env with PlatformIO first.")
    return path


def esptool_command() -> list[str]:
    """`python -m esptool` if installed, else the copy PlatformIO ships."""
    import importlib.util

    if importlib.util.find_spec("esptool") is not None:
        return [sys.executable, "-m", "esptool"]
    core = os.environ.get("PLATFORMIO_CORE_DIR", str(Path.home() / ".platformio"))
    bundled = Path(core) / "packages" / "tool-esptoolpy" / "esptool.py"
    if bundled.exists():
        return [sys.executable, str(bundled)]
    sys.exit("esptool not found. Run `pip install esptool`.")


def merge(env: str, output: Path) -> None:
    build = ROOT / ".pio" / "build" / env
    parts = {
        "0x1000": build / "bootloader.bin",
        "0x8000": build / "partitions.bin",
        "0xe000": boot_app0_path(),
        "0x10000": build / "firmware.bin",
    }
    for offset, path in parts.items():
        if not path.exists():
            sys.exit(f"Missing {path} for {env} at {offset}. Run `pio run -e {env}` first.")

    args = [
        *esptool_command(),
        "--chip",
        "esp32",
        "merge_bin",
        "-o",
        str(output),
        "--flash_mode",
        "dio",
        "--flash_size",
        "4MB",
    ]
    for offset, path in parts.items():
        args += [offset, str(path)]
    subprocess.run(args, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default="1.0.0")
    parser.add_argument("--commit", default=os.environ.get("GITHUB_SHA", ""))
    options = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    builds = []
    for kit in KITS:
        output = OUT_DIR / f"{kit['id']}.bin"
        merge(kit["env"], output)
        builds.append(
            {
                **kit,
                "chip": "ESP32",
                "parts": [{"path": output.name, "offset": 0}],
            }
        )
        print(f"wrote {output.relative_to(ROOT)} ({output.stat().st_size // 1024} KB)")

    manifest = {
        "version": options.version,
        "builtAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "commit": options.commit,
        "builds": builds,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {(OUT_DIR / 'manifest.json').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
