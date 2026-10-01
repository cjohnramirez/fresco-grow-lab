# Hardware

## Wiring

**Temperature kit:** DS18B20 probes share 3V3 and GND, with a 4.7 kΩ pull-up on each data line.

| Channel | Placement | GPIO |
| --- | --- | --- |
| `control` | Ambient air | 5 |
| `surface` | Top of the medium | 4 |
| `roots` | Root zone | 16 |
| `bottom` | Bottom of the bag | 17 |
| `water` | Irrigation water (optional) | 14 |

**Rain gauge:** HW-477 hall sensor `S` → GPIO 34, `+` → 3V3, `-` → GND (the module supplies the pull-up).

## Firmware

| Env | Use | Credentials |
| --- | --- | --- |
| `nodemcu-32s` | Original temperature board | `include/secrets.h` (copy `secrets.example.h`) |
| `rain-gauge` | Original rain gauge (own AP) | none |
| `temperature-kit`, `rain-gauge-kit` | Browser-flashable builds | set over USB, stored on the board |

```bash
pio run -e nodemcu-32s -t upload        # flash over USB
pio device monitor -e nodemcu-32s       # serial log
```

Kit builds also print each reading as a JSON line on USB and accept
`{"cmd":"info"}` / `{"cmd":"config",...}` from the dashboard.

## Flash from the browser

Use Chrome or Edge on desktop: **Connect Hardware → Flash**.

1. Pick **Prebuilt Fresco kit**, or add your own files from
   `.pio/build/<env>/`: `bootloader.bin` 0x1000, `partitions.bin` 0x8000,
   `boot_app0.bin` 0xe000 (from PlatformIO's Arduino package), `firmware.bin` 0x10000.
2. Click **Flash board**. If it hangs on "Connecting", hold **BOOT**. No port
   listed? Install the CP210x/CH340 driver and use a data cable.
3. **USB tab:** connect to stream readings live, and optionally save Wi-Fi +
   Supabase so the board uploads by itself.

Prebuilt images come from `.github/workflows/firmware.yml`. To build them
locally: `pio run -e temperature-kit -e rain-gauge-kit && python scripts/package_firmware.py`.

## Rain gauge access point

Join Wi-Fi `FrescoRainGauge` (password `raingauge`); the board is at
`http://192.168.4.1` (`/api/status`, `/api/readings`, `/events`,
`POST /api/reset`). The dashboard's **Access Point** source only works when the
app runs locally.
