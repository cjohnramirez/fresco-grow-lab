// Tipping-bucket rain gauge access-point firmware for the NodeMCU-32S.
//
// The board hosts its own Wi-Fi network (SoftAP) and a small HTTP server at
// http://192.168.4.1. A HW-477 hall-effect sensor on GPIO 34 pulses LOW while
// the magnet on the tipping arm is in front of it and HIGH when it leaves. Both
// edges are counted on CHANGE (with a debounce window), so one physical tip = two
// counted edges and physical tips = edges / 2. The ISR only touches volatile
// counters -- all rainfall/rate math and publishing happen in loop().
//
// Endpoints (see docs/hardware.md and docs/data.md):
//   GET  /             -> plain reference UI (placeholder for the frontend team)
//   GET  /api/status   -> device + calibration info
//   GET  /api/readings -> latest tip/rainfall/rate snapshot
//   GET  /events       -> Server-Sent Events stream of readings
//   POST /api/reset    -> zero the session counters
//
// Wiring (HW-477 -> ESP32): S -> GPIO 34, + -> 3V3, - -> GND.
// GPIO 34 is input-only with no internal pull-up; the module's onboard pull-up
// holds the line HIGH between tips.

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include <WiFi.h>
#include <math.h>

#include "RainGaugeConfig.h"

#if FRESCO_KIT
// Kit build: also streams every reading as a JSON line over USB and answers
// the dashboard's info/config commands (see FrescoKit.h).
#include "FrescoKit.h"
static const char* KIT_FIRMWARE = "fresco-rain-gauge-kit";
#endif

// --- Edge counting (shared with the ISR) -------------------------------------

// Guards the volatile edge state against concurrent ISR / web-handler access.
static portMUX_TYPE edgeMux = portMUX_INITIALIZER_UNLOCKED;

// The HW-477 pulses LOW while the magnet is in front of it and HIGH when it
// leaves, so one physical bucket tip produces two transitions. We count BOTH
// the magnet-in and magnet-out edges; two counted edges therefore equal one tip.
static volatile unsigned long edgeCount = 0;           // transitions since last reset
static volatile unsigned long lastEdgeMs = 0;          // millis() of last counted edge (0 = none)
static volatile unsigned long lastEdgeAcceptedMs = 0;  // debounce reference
static volatile int lastLevel = HIGH;                  // last accepted pin level

// Fires on both edges (CHANGE). An edge is counted only when the pin level
// actually differs from the last accepted level (rejects spurious same-level
// interrupts) and lies outside the debounce window (rejects hall/electrical
// bounce). The ISR only touches volatile counters; math happens in loop().
void IRAM_ATTR onSensorEdge() {
  const unsigned long now = millis();
  portENTER_CRITICAL_ISR(&edgeMux);
  const int level = digitalRead(RAIN_GAUGE_TIP_PIN);
  if (level != lastLevel && now - lastEdgeAcceptedMs >= RAIN_GAUGE_DEBOUNCE_MS) {
    lastLevel = level;
    lastEdgeAcceptedMs = now;
    edgeCount++;
    lastEdgeMs = now;
  }
  portEXIT_CRITICAL_ISR(&edgeMux);
}

static void snapshotEdges(unsigned long& edges, unsigned long& lastEdge) {
  portENTER_CRITICAL(&edgeMux);
  edges = edgeCount;
  lastEdge = lastEdgeMs;
  portEXIT_CRITICAL(&edgeMux);
}

// --- Derived rainfall / rate math --------------------------------------------

// Millilitres of water represented by one tip (fixed calibration constant).
static inline float mlPerTip() { return RAIN_GAUGE_ML_PER_TIP; }

// Depth of rainfall per tip, only meaningful once a catchment area is set:
//   mm_per_tip = (ml_per_tip / catchment_area_cm2) * 10
// Returns NAN when the area is unconfigured (reported as JSON null).
static inline float mmPerTip() {
  if (RAIN_GAUGE_CATCHMENT_AREA_CM2 <= 0.0f) {
    return NAN;
  }
  return (RAIN_GAUGE_ML_PER_TIP / RAIN_GAUGE_CATCHMENT_AREA_CM2) * 10.0f;
}

struct RainReading {
  unsigned long seq;
  unsigned long ms;
  unsigned long edges;       // raw transitions counted (magnet-in + magnet-out)
  unsigned long tips;        // physical tips = edges / 2
  unsigned long lastEdgeMs;  // 0 when no edge has been seen this session
  float rainfallMl;
  float rainfallMm;          // NAN when catchment area is unconfigured
  float rateMlPerMin;
  float rateMmPerHr;         // NAN when catchment area is unconfigured
};

// --- Rate estimation (loop-only state) ---------------------------------------
//
// Rain rate is derived in loop() by comparing the cumulative physical-tip count
// now against a snapshot taken RAIN_GAUGE_RATE_WINDOW_MS ago. Samples are
// recorded once per publish tick, so the ISR stays a pure edge counter.

struct CountSample {
  unsigned long ms;
  unsigned long count;
};

static constexpr size_t RATE_SAMPLE_COUNT =
    (RAIN_GAUGE_RATE_WINDOW_MS / RAIN_GAUGE_PUBLISH_INTERVAL_MS) + 4;
static CountSample rateSamples[RATE_SAMPLE_COUNT];
static size_t rateHead = 0;    // next write slot
static size_t rateFilled = 0;  // valid samples in the ring

static void resetRateWindow() {
  rateHead = 0;
  rateFilled = 0;
}

// Records the latest cumulative physical-tip count and returns the ml/min rate
// over the configured window (0 until two samples span a positive interval).
static float updateRate(unsigned long now, unsigned long tips) {
  rateSamples[rateHead] = {now, tips};
  rateHead = (rateHead + 1) % RATE_SAMPLE_COUNT;
  if (rateFilled < RATE_SAMPLE_COUNT) {
    rateFilled++;
  }

  // Find the oldest sample still inside the window.
  CountSample oldest = {now, tips};
  for (size_t i = 0; i < rateFilled; i++) {
    const size_t idx = (rateHead + RATE_SAMPLE_COUNT - 1 - i) % RATE_SAMPLE_COUNT;
    if (now - rateSamples[idx].ms <= RAIN_GAUGE_RATE_WINDOW_MS) {
      oldest = rateSamples[idx];
    } else {
      break;
    }
  }

  const unsigned long deltaMs = now - oldest.ms;
  if (deltaMs == 0 || tips < oldest.count) {
    return 0.0f;
  }
  const float deltaMl = (tips - oldest.count) * mlPerTip();
  return deltaMl / (deltaMs / 60000.0f);
}

// --- Web server + published snapshot -----------------------------------------

static AsyncWebServer server(RAIN_GAUGE_HTTP_PORT);
static AsyncEventSource events("/events");

static unsigned long publishSeq = 0;
static float latestRateMlPerMin = 0.0f;
static String latestReadingJson = "{}";
static unsigned long sessionStartMs = 0;
static unsigned long lastPublishMs = 0;
static unsigned long lastPublishedEdges = 0;

static void appendNullableFloat(String& out, float value, unsigned int decimals = 3) {
  if (isnan(value)) {
    out += "null";
    return;
  }
  out += String(value, decimals);
}

// Builds the current reading from snapshotted counters + the latest rate.
static RainReading computeReading(unsigned long seq) {
  unsigned long edges = 0;
  unsigned long lastEdge = 0;
  snapshotEdges(edges, lastEdge);

  // Both magnet-in and magnet-out are counted, so two edges make one tip.
  const unsigned long tips = edges / 2;

  RainReading r;
  r.seq = seq;
  r.ms = millis();
  r.edges = edges;
  r.tips = tips;
  r.lastEdgeMs = lastEdge;
  r.rainfallMl = tips * mlPerTip();

  const float mmTip = mmPerTip();
  r.rainfallMm = isnan(mmTip) ? NAN : tips * mmTip;
  r.rateMlPerMin = latestRateMlPerMin;
  // mm/hr = (ml/min / catchment_cm2) * 10 * 60
  r.rateMmPerHr = (RAIN_GAUGE_CATCHMENT_AREA_CM2 <= 0.0f)
                      ? NAN
                      : (latestRateMlPerMin / RAIN_GAUGE_CATCHMENT_AREA_CM2) * 600.0f;
  return r;
}

static String buildReadingJson(const RainReading& r) {
  String out;
  out.reserve(256);
  out += "{\"type\":\"rain_gauge\",\"seq\":";
  out += r.seq;
  out += ",\"ms\":";
  out += r.ms;
  out += ",\"edges\":";
  out += r.edges;
  out += ",\"tips\":";
  out += r.tips;
  out += ",\"lastEdgeMs\":";
  out += r.lastEdgeMs;  // 0 means "no edge yet"
  out += ",\"rainfallMl\":";
  appendNullableFloat(out, r.rainfallMl);
  out += ",\"rainfallMm\":";
  appendNullableFloat(out, r.rainfallMm);
  out += ",\"rateMlPerMin\":";
  appendNullableFloat(out, r.rateMlPerMin);
  out += ",\"rateMmPerHr\":";
  appendNullableFloat(out, r.rateMmPerHr);
  out += "}";
  return out;
}

static String buildStatusJson() {
  unsigned long edges = 0;
  unsigned long lastEdge = 0;
  snapshotEdges(edges, lastEdge);

  String out;
  out.reserve(384);
  out += "{\"type\":\"rain_gauge\",\"device\":\"nodemcu-32s\",\"uptimeMs\":";
  out += millis();
  out += ",\"sessionStartMs\":";
  out += sessionStartMs;
  out += ",\"ssid\":\"";
  out += RAIN_GAUGE_AP_SSID;
  out += "\",\"ip\":\"";
  out += WiFi.softAPIP().toString();
  out += "\",\"clients\":";
  out += WiFi.softAPgetStationNum();
  out += ",\"sseClients\":";
  out += events.count();
  out += ",\"tipPin\":";
  out += (int)RAIN_GAUGE_TIP_PIN;
  out += ",\"debounceMs\":";
  out += (unsigned long)RAIN_GAUGE_DEBOUNCE_MS;
  out += ",\"countsBothEdges\":true";
  out += ",\"mlPerTip\":";
  appendNullableFloat(out, mlPerTip(), 4);
  out += ",\"catchmentAreaCm2\":";
  appendNullableFloat(out, RAIN_GAUGE_CATCHMENT_AREA_CM2, 2);
  out += ",\"mmPerTip\":";
  appendNullableFloat(out, mmPerTip(), 4);
  out += ",\"edges\":";
  out += edges;
  out += ",\"tips\":";
  out += edges / 2;
  out += "}";
  return out;
}

// --- Reference UI ------------------------------------------------------------
//
// Deliberately plain HTML/CSS. It exists so the AP is testable in a browser and
// so the frontend team has a working reference for the endpoints and the SSE
// event shape. The production dashboard lives in web/ and replaces this page.

static const char INDEX_HTML[] PROGMEM = R"RAINHTML(<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Rain Gauge (AP)</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    margin: 0; padding: 24px; line-height: 1.4;
    max-width: 640px; margin-inline: auto;
  }
  header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  h1 { font-size: 1.25rem; margin: 0; }
  .sub { color: #6b7280; font-size: 0.85rem; margin: 0 0 20px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #9ca3af; }
  .dot.live { background: #16a34a; }
  .dot.down { background: #dc2626; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 14px 16px; }
  .card .label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
  .card .value { font-size: 1.7rem; font-weight: 650; font-variant-numeric: tabular-nums; }
  .card .unit { font-size: 0.85rem; color: #6b7280; font-weight: 400; }
  .row { display: flex; align-items: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
  button {
    font: inherit; padding: 8px 14px; border-radius: 8px; cursor: pointer;
    border: 1px solid #d1d5db; background: #f9fafb;
  }
  button:hover { background: #f3f4f6; }
  .meta { color: #6b7280; font-size: 0.8rem; }
  code { background: rgba(127,127,127,.15); padding: 1px 5px; border-radius: 4px; }
  footer { margin-top: 28px; font-size: 0.78rem; color: #6b7280; }
  footer a { color: inherit; }
</style>
</head>
<body>
  <header>
    <span id="dot" class="dot"></span>
    <h1>Rain Gauge</h1>
  </header>
  <p class="sub" id="status">Connecting to device&hellip;</p>

  <div class="grid">
    <div class="card">
      <div class="label">Tips</div>
      <div class="value"><span id="tips">--</span> <span class="unit">= edges / 2</span></div>
    </div>
    <div class="card">
      <div class="label">Edges (in + out)</div>
      <div class="value"><span id="edges">--</span></div>
    </div>
    <div class="card">
      <div class="label">Rainfall</div>
      <div class="value"><span id="rainfall">--</span> <span class="unit" id="rainfallUnit">ml</span></div>
    </div>
    <div class="card">
      <div class="label">Rate</div>
      <div class="value"><span id="rate">--</span> <span class="unit">ml/min</span></div>
    </div>
  </div>

  <div class="row">
    <button id="reset">Reset session</button>
    <span class="meta" id="seq"></span>
  </div>

  <footer>
    Reference UI served by the ESP32 access point. Endpoints:
    <code>/api/status</code>, <code>/api/readings</code>,
    <code>/events</code> (SSE), <code>POST /api/reset</code>.
  </footer>

<script>
  var $ = function (id) { return document.getElementById(id); };

  function fmt(n, digits) {
    if (n === null || n === undefined) return "--";
    return Number(n).toFixed(digits === undefined ? 2 : digits);
  }

  function render(r) {
    $("tips").textContent = r.tips;
    $("edges").textContent = r.edges;
    if (r.rainfallMm !== null && r.rainfallMm !== undefined) {
      $("rainfall").textContent = fmt(r.rainfallMm);
      $("rainfallUnit").textContent = "mm";
    } else {
      $("rainfall").textContent = fmt(r.rainfallMl);
      $("rainfallUnit").textContent = "ml";
    }
    $("rate").textContent = fmt(r.rateMlPerMin);
    $("seq").textContent = "seq " + r.seq;
  }

  fetch("/api/status").then(function (res) { return res.json(); }).then(function (s) {
    $("status").innerHTML = "AP <code>" + s.ssid + "</code> at <code>" + s.ip +
      "</code> &middot; " + s.mlPerTip + " ml/tip &middot; pin " + s.tipPin;
  }).catch(function () {});

  var dot = $("dot");
  var es = new EventSource("/events");
  es.addEventListener("open", function () {
    dot.className = "dot live";
  });
  es.addEventListener("reading", function (e) {
    dot.className = "dot live";
    try { render(JSON.parse(e.data)); } catch (err) {}
  });
  es.addEventListener("error", function () {
    dot.className = "dot down";
  });

  $("reset").addEventListener("click", function () {
    $("reset").disabled = true;
    fetch("/api/reset", { method: "POST" })
      .catch(function () {})
      .then(function () { $("reset").disabled = false; });
  });
</script>
</body>
</html>)RAINHTML";

// --- HTTP handlers -----------------------------------------------------------

static void handleRoot(AsyncWebServerRequest* request) {
  // ESP32 flash is memory-mapped, so the PROGMEM page can be sent directly
  // (send_P is deprecated in ESPAsyncWebServer 3.x).
  request->send(200, "text/html; charset=utf-8", INDEX_HTML);
}

static void handleStatus(AsyncWebServerRequest* request) {
  request->send(200, "application/json", buildStatusJson());
}

static void handleReadings(AsyncWebServerRequest* request) {
  const RainReading r = computeReading(publishSeq);
  request->send(200, "application/json", buildReadingJson(r));
}

static void handleReset(AsyncWebServerRequest* request) {
  portENTER_CRITICAL(&edgeMux);
  edgeCount = 0;
  lastEdgeMs = 0;
  lastEdgeAcceptedMs = 0;
  lastLevel = digitalRead(RAIN_GAUGE_TIP_PIN);
  portEXIT_CRITICAL(&edgeMux);

  resetRateWindow();
  latestRateMlPerMin = 0.0f;
  lastPublishedEdges = 0;
  sessionStartMs = millis();

  // Push a fresh zeroed reading so every client updates immediately.
  const RainReading r = computeReading(++publishSeq);
  latestReadingJson = buildReadingJson(r);
  events.send(latestReadingJson.c_str(), "reading", millis());

  request->send(200, "application/json",
                String("{\"ok\":true,\"sessionStartMs\":") + sessionStartMs + "}");
}

static void handleNotFound(AsyncWebServerRequest* request) {
  request->send(404, "application/json", "{\"error\":\"not_found\"}");
}

// --- Arduino entry points ----------------------------------------------------

void setup() {
#if FRESCO_KIT
  Serial.setRxBufferSize(1024);
#endif
  Serial.begin(RAIN_GAUGE_BAUD_RATE);
  delay(250);
#if FRESCO_KIT
  fresco_kit::load();
#endif

  // GPIO 34 is input-only; INPUT_PULLUP has no effect here, the HW-477 module's
  // onboard pull-up holds the idle-HIGH level.
  pinMode(RAIN_GAUGE_TIP_PIN, INPUT);
  lastLevel = digitalRead(RAIN_GAUGE_TIP_PIN);
  // CHANGE fires on both edges so the magnet arriving (LOW) and leaving (HIGH)
  // are each counted; two counted edges make one physical tip.
  attachInterrupt(digitalPinToInterrupt(RAIN_GAUGE_TIP_PIN), onSensorEdge, CHANGE);

  WiFi.mode(WIFI_AP);
  const bool apOk = WiFi.softAP(RAIN_GAUGE_AP_SSID, RAIN_GAUGE_AP_PASSWORD);
  Serial.println();
  Serial.println("Rain Gauge Access Point");
  Serial.println("=======================");
  Serial.print("SoftAP \"");
  Serial.print(RAIN_GAUGE_AP_SSID);
  Serial.println(apOk ? "\" started" : "\" FAILED to start");
  Serial.print("URL: http://");
  Serial.println(WiFi.softAPIP());

  sessionStartMs = millis();

  // Send the last known reading to newly-connected SSE clients so the UI paints
  // immediately instead of waiting for the next tick.
  events.onConnect([](AsyncEventSourceClient* client) {
    client->send(latestReadingJson.c_str(), "reading", millis());
  });
  server.addHandler(&events);

  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/readings", HTTP_GET, handleReadings);
  server.on("/api/reset", HTTP_POST, handleReset);
  server.onNotFound(handleNotFound);
  server.begin();

  latestReadingJson = buildReadingJson(computeReading(publishSeq));
  Serial.println("HTTP server + SSE ready. Monitoring for tips...");
#if FRESCO_KIT
  fresco_kit::sendInfo(KIT_FIRMWARE);
#endif
}

void loop() {
  const unsigned long now = millis();
#if FRESCO_KIT
  // The rain gauge hosts its own AP, so only the device ID from a config
  // command matters here; Wi-Fi/Supabase fields are stored but unused.
  fresco_kit::poll(KIT_FIRMWARE);
  fresco_kit::configChanged = false;
#endif
  if (now - lastPublishMs < RAIN_GAUGE_PUBLISH_INTERVAL_MS) {
    return;
  }
  lastPublishMs = now;

  unsigned long edges = 0;
  unsigned long lastEdge = 0;
  snapshotEdges(edges, lastEdge);
  latestRateMlPerMin = updateRate(now, edges / 2);  // rate tracks physical tips

  const RainReading r = computeReading(++publishSeq);
  latestReadingJson = buildReadingJson(r);

  // Only stream when there are listeners; always keep latestReadingJson fresh
  // for /api/readings and new SSE connections.
  if (events.count() > 0) {
    events.send(latestReadingJson.c_str(), "reading", now);
  }

#if FRESCO_KIT
  Serial.println(latestReadingJson);
#endif

  if (edges != lastPublishedEdges) {
    Serial.print("Edges: ");
    Serial.print(edges);
    Serial.print("  tips: ");
    Serial.print(r.tips);
    Serial.print("  rainfall: ");
    Serial.print(r.rainfallMl, 2);
    Serial.print(" ml  rate: ");
    Serial.print(r.rateMlPerMin, 2);
    Serial.println(" ml/min");
    lastPublishedEdges = edges;
  }
}
