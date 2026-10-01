#include <Arduino.h>
#include <DallasTemperature.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <math.h>
#include <string.h>

#include "TemperatureConfig.h"

#if FRESCO_KIT
#include "FrescoKit.h"
#endif

// Connection settings: compile-time constants for the classic build, values
// provisioned over USB and stored in NVS for kit builds (see FrescoKit.h).
#if FRESCO_KIT
static const char* KIT_FIRMWARE = "fresco-temperature-kit";
static const char* wifiSsid() { return fresco_kit::config.wifiSsid.c_str(); }
static const char* wifiPassword() { return fresco_kit::config.wifiPassword.c_str(); }
static String supabaseUrl() { return fresco_kit::config.supabaseUrl; }
static const char* supabaseKey() { return fresco_kit::config.supabaseKey.c_str(); }
#else
static const char* wifiSsid() { return WIFI_SSID; }
static const char* wifiPassword() { return WIFI_PASSWORD; }
static String supabaseUrl() { return String(SUPABASE_URL); }
static const char* supabaseKey() { return SUPABASE_ANON_KEY; }
#endif

struct TemperatureBus {
  const char* id;
  uint8_t pin;
  OneWire oneWire;
  DallasTemperature thermometer;

  TemperatureBus(const char* sensorId, uint8_t dataPin)
      : id(sensorId), pin(dataPin), oneWire(dataPin), thermometer(&oneWire) {}
};

struct TemperatureReading {
  const char* status;
  float celsius;
  int deviceCount;
};

TemperatureBus buses[] = {
    {"control", 5},
    {"surface", 4},
    {"roots", 16},
    {"bottom", 17},
    // Irrigation-water probe. Sampled continuously like the grow-bag probes, but
    // the dashboard only reads it once per watering to stamp water_temp_c.
    {"water", 14},
};

constexpr size_t TEMPERATURE_BUS_COUNT = sizeof(buses) / sizeof(buses[0]);

// Latest sample, rebuilt each interval and uploaded to Supabase.
String latestSample = "{}";

unsigned long lastSampleMs = 0;
unsigned long lastPostMs = 0;
unsigned long sequenceNumber = 0;

// Total sensors detected in the latest sample. Uploads are skipped when this is
// zero so a board with no probes attached never writes null-only rows.
int latestSensorCount = 0;

void appendNullableFloat(String& out, float value, unsigned int decimals = 2) {
  if (isnan(value)) {
    out += "null";
    return;
  }

  out += String(value, decimals);
}

const char* overallStatus(const TemperatureReading readings[]) {
  size_t bootCount = 0;
  size_t okCount = 0;
  size_t missingCount = 0;

  for (size_t i = 0; i < TEMPERATURE_BUS_COUNT; i++) {
    if (strcmp(readings[i].status, "boot") == 0) {
      bootCount++;
    } else if (strcmp(readings[i].status, "ok") == 0) {
      okCount++;
    } else if (strcmp(readings[i].status, "no_sensor") == 0) {
      missingCount++;
    }
  }

  if (bootCount == TEMPERATURE_BUS_COUNT) {
    return "boot";
  }

  if (okCount == TEMPERATURE_BUS_COUNT) {
    return "ok";
  }

  if (okCount > 0) {
    return "partial";
  }

  if (missingCount == TEMPERATURE_BUS_COUNT) {
    return "no_sensor";
  }

  return "read_failed";
}

int totalDeviceCount(const TemperatureReading readings[]) {
  int total = 0;

  for (size_t i = 0; i < TEMPERATURE_BUS_COUNT; i++) {
    total += readings[i].deviceCount > 0 ? readings[i].deviceCount : 0;
  }

  return total;
}

String buildSampleJson(const TemperatureReading readings[]) {
  const char* status = overallStatus(readings);

  String out;
  out.reserve(512);

  out += "{\"type\":\"temperature\",\"seq\":";
  out += sequenceNumber++;
  out += ",\"ms\":";
  out += millis();
  out += ",\"sensors\":";
  out += totalDeviceCount(readings);
  out += ",\"ts\":\"";
  out += status;
  out += "\",\"channels\":[";

  for (size_t i = 0; i < TEMPERATURE_BUS_COUNT; i++) {
    const float celsius = readings[i].celsius;
    const float fahrenheit = isnan(celsius) ? NAN : DallasTemperature::toFahrenheit(celsius);

    if (i > 0) {
      out += ',';
    }

    out += "{\"id\":\"";
    out += buses[i].id;
    out += "\",\"pin\":";
    out += (int)buses[i].pin;
    out += ",\"devices\":";
    out += readings[i].deviceCount;
    out += ",\"ts\":\"";
    out += readings[i].status;
    out += "\",\"tc\":";
    appendNullableFloat(out, celsius);
    out += ",\"tf\":";
    appendNullableFloat(out, fahrenheit);
    out += '}';
  }

  out += "]}";
  return out;
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  if (strlen(wifiSsid()) == 0) {
    // Kit boards stream over USB until Wi-Fi is provisioned.
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid(), wifiPassword());

  Serial.print("Connecting to Wi-Fi \"");
  Serial.print(wifiSsid());
  Serial.print("\"");

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000UL) {
    delay(500);
    Serial.print('.');
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(" connected, IP ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" failed (will retry on next upload).");
  }
}

// POSTs the latest sample to Supabase as a single jsonb "payload" column.
void uploadSample() {
  if (latestSensorCount <= 0) {
    Serial.println("Skipping upload: no sensors detected.");
    return;
  }

  if (supabaseUrl().length() == 0 || strlen(supabaseKey()) == 0) {
    // Kit boards without a database only stream over USB.
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping upload: Wi-Fi not connected.");
    return;
  }

  WiFiClientSecure client;
  // Skips TLS certificate validation. Simple and fine for a prototype; pin the
  // Supabase root CA here instead if you need verified connections.
  client.setInsecure();

  HTTPClient http;
  const String url = supabaseUrl() + "/rest/v1/" + SUPABASE_TABLE;

  if (!http.begin(client, url)) {
    Serial.println("Upload failed: http.begin() returned false.");
    return;
  }

  http.addHeader("apikey", supabaseKey());
  // Legacy anon keys are JWTs and also go in Authorization. New
  // sb_publishable_ keys are not JWTs and must only be sent as `apikey`.
  if (strncmp(supabaseKey(), "sb_", 3) != 0) {
    http.addHeader("Authorization", String("Bearer ") + supabaseKey());
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

#if FRESCO_KIT
  const String body = String("{\"device_id\":\"") + fresco_kit::config.deviceId +
                      "\",\"payload\":" + latestSample + "}";
#else
  const String body = String("{\"payload\":") + latestSample + "}";
#endif
  const int code = http.POST(body);

  if (code > 0) {
    Serial.print("Supabase POST -> ");
    Serial.println(code);
    if (code >= 400) {
      Serial.println(http.getString());
    }
  } else {
    Serial.print("Supabase POST failed: ");
    Serial.println(http.errorToString(code));
  }

  http.end();
}

void sampleSensors() {
  TemperatureReading readings[TEMPERATURE_BUS_COUNT];
  bool requestedAnyConversion = false;

  for (size_t i = 0; i < TEMPERATURE_BUS_COUNT; i++) {
    int deviceCount = buses[i].thermometer.getDeviceCount();
    if (deviceCount <= 0) {
      buses[i].thermometer.begin();
      deviceCount = buses[i].thermometer.getDeviceCount();
    }

    readings[i] = {deviceCount <= 0 ? "no_sensor" : "waiting", NAN, deviceCount};

    if (deviceCount > 0) {
      buses[i].thermometer.requestTemperatures();
      requestedAnyConversion = true;
    }
  }

  if (requestedAnyConversion) {
    delay(TEMPERATURE_CONVERSION_DELAY_MS);
  }

  for (size_t i = 0; i < TEMPERATURE_BUS_COUNT; i++) {
    if (readings[i].deviceCount <= 0) {
      continue;
    }

    const float celsius = buses[i].thermometer.getTempCByIndex(0);

    if (celsius == DEVICE_DISCONNECTED_C || celsius < -100.0f || celsius > 125.0f) {
      readings[i].status = "read_failed";
      readings[i].celsius = NAN;
      continue;
    }

    readings[i].status = "ok";
    readings[i].celsius = celsius;
  }

  latestSensorCount = totalDeviceCount(readings);
  latestSample = buildSampleJson(readings);
}

void setup() {
#if FRESCO_KIT
  // Config lines can exceed the default 256-byte RX buffer while the loop is
  // busy waiting on a DS18B20 conversion.
  Serial.setRxBufferSize(1024);
#endif
  Serial.begin(TEMPERATURE_BAUD_RATE);
  delay(250);

#if FRESCO_KIT
  fresco_kit::load();
  fresco_kit::sendInfo(KIT_FIRMWARE);
#endif

  for (size_t i = 0; i < TEMPERATURE_BUS_COUNT; i++) {
    pinMode(buses[i].pin, INPUT_PULLUP);
    buses[i].thermometer.begin();
    buses[i].thermometer.setResolution(TEMPERATURE_RESOLUTION_BITS);
    buses[i].thermometer.setWaitForConversion(false);
  }

  TemperatureReading readings[TEMPERATURE_BUS_COUNT];
  for (size_t i = 0; i < TEMPERATURE_BUS_COUNT; i++) {
    readings[i] = {"boot", NAN, buses[i].thermometer.getDeviceCount()};
  }
  latestSample = buildSampleJson(readings);

  connectWiFi();
}

void loop() {
  const unsigned long now = millis();

#if FRESCO_KIT
  fresco_kit::poll(KIT_FIRMWARE);
  if (fresco_kit::configChanged) {
    // New Wi-Fi/Supabase settings: drop the old link and upload on the next pass.
    fresco_kit::configChanged = false;
    WiFi.disconnect(true);
    lastPostMs = now - SUPABASE_POST_INTERVAL_MS;
  }
#endif

  if (now - lastSampleMs >= TEMPERATURE_SAMPLE_INTERVAL_MS) {
    lastSampleMs = now;
    sampleSensors();
#if FRESCO_KIT
    // One telemetry packet per line for the dashboard's Web Serial reader.
    Serial.println(latestSample);
#endif
  }

  if (now - lastPostMs >= SUPABASE_POST_INTERVAL_MS) {
    lastPostMs = now;
    connectWiFi();
    uploadSample();
  }
}
