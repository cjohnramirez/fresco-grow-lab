#pragma once

// Configuration for the tipping-bucket rain gauge access-point firmware
// (src/rain_gauge.cpp). Every value can be overridden from platformio.ini via
// -D build flags, mirroring the temperature firmware's config style.

#ifndef RAIN_GAUGE_BAUD_RATE
#define RAIN_GAUGE_BAUD_RATE 115200
#endif

// HW-477 hall-effect signal pin. GPIO 34 is input-only and relies on the
// module's onboard pull-up (see docs/hardware.md).
#ifndef RAIN_GAUGE_TIP_PIN
#define RAIN_GAUGE_TIP_PIN 34
#endif

// Ignore edges arriving within this window of the previous accepted edge. Both
// the magnet-in and magnet-out edges are counted, so this must stay shorter than
// the time the magnet dwells in front of the sensor during a single tip, or the
// second edge of a fast tip gets swallowed as bounce.
#ifndef RAIN_GAUGE_DEBOUNCE_MS
#define RAIN_GAUGE_DEBOUNCE_MS 50UL
#endif

// How often loop() rebuilds the reading snapshot and pushes it to SSE clients.
#ifndef RAIN_GAUGE_PUBLISH_INTERVAL_MS
#define RAIN_GAUGE_PUBLISH_INTERVAL_MS 1000UL
#endif

// Sliding window used to estimate the current rain rate from recent tips.
#ifndef RAIN_GAUGE_RATE_WINDOW_MS
#define RAIN_GAUGE_RATE_WINDOW_MS 60000UL
#endif

// Calibration: millilitres of water collected per single bucket tip. Default is
// the paired-average mean from the reference calibration CSV (~2.3695 ml). Tune
// per physical gauge; the frontend can override for display via its own config.
#ifndef RAIN_GAUGE_ML_PER_TIP
#define RAIN_GAUGE_ML_PER_TIP 2.3695f
#endif

// Gauge funnel/catchment collection area in cm^2. Leave at 0 when unknown: the
// firmware then reports rainfall in millilitres only and omits mm conversion.
//   mm_per_tip = (ml_per_tip / catchment_area_cm2) * 10
#ifndef RAIN_GAUGE_CATCHMENT_AREA_CM2
#define RAIN_GAUGE_CATCHMENT_AREA_CM2 0.0f
#endif

// SoftAP credentials. Password must be >= 8 chars for WPA2; empty string opens
// the network. Clients reach the device at http://192.168.4.1 by default.
#ifndef RAIN_GAUGE_AP_SSID
#define RAIN_GAUGE_AP_SSID "FrescoRainGauge"
#endif

#ifndef RAIN_GAUGE_AP_PASSWORD
#define RAIN_GAUGE_AP_PASSWORD "raingauge"
#endif

// HTTP port for the AP web server and SSE stream.
#ifndef RAIN_GAUGE_HTTP_PORT
#define RAIN_GAUGE_HTTP_PORT 80
#endif
