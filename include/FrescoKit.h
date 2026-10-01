#pragma once

// Runtime configuration and USB serial protocol for the "kit" firmware builds
// (`pio run -e temperature-kit` / `-e rain-gauge-kit`, compiled with
// -DFRESCO_KIT=1). Kit builds are what the web dashboard flashes from the
// browser, so they carry NO compiled-in credentials: Wi-Fi and Supabase
// settings arrive over USB from the dashboard and are stored in NVS flash.
//
// Protocol (newline-delimited JSON at the firmware baud rate):
//   browser -> board  {"cmd":"info"}
//                     {"cmd":"config","deviceId":"...","wifiSsid":"...",
//                      "wifiPassword":"...","supabaseUrl":"...","supabaseKey":"..."}
//   board -> browser  {"type":"info",...} and {"type":"config_ack","ok":true,...}
// Telemetry packets are printed as one JSON object per line alongside them.
// See web/src/lib/hardware/serial-protocol.ts for the browser side.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>
#include <string.h>

#ifndef FRESCO_KIT_VERSION
#define FRESCO_KIT_VERSION "1.0.0"
#endif

namespace fresco_kit {

struct Config {
  String deviceId;
  String wifiSsid;
  String wifiPassword;
  String supabaseUrl;
  String supabaseKey;
};

static Config config;
// Set when new settings arrive so the firmware can reconnect.
static bool configChanged = false;

static const char* kNamespace = "fresco";

static String defaultDeviceId() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char id[16];
  snprintf(id, sizeof(id), "esp32-%02x%02x%02x", mac[3], mac[4], mac[5]);
  return String(id);
}

static void load() {
  Preferences prefs;
  prefs.begin(kNamespace, true);
  config.deviceId = prefs.getString("device", "");
  config.wifiSsid = prefs.getString("ssid", "");
  config.wifiPassword = prefs.getString("pass", "");
  config.supabaseUrl = prefs.getString("sbUrl", "");
  config.supabaseKey = prefs.getString("sbKey", "");
  prefs.end();

  if (config.deviceId.length() == 0) {
    config.deviceId = defaultDeviceId();
  }
}

static void save() {
  Preferences prefs;
  prefs.begin(kNamespace, false);
  prefs.putString("device", config.deviceId);
  prefs.putString("ssid", config.wifiSsid);
  prefs.putString("pass", config.wifiPassword);
  prefs.putString("sbUrl", config.supabaseUrl);
  prefs.putString("sbKey", config.supabaseKey);
  prefs.end();
}

static bool supabaseConfigured() {
  return config.supabaseUrl.length() > 0 && config.supabaseKey.length() > 0;
}

static void sendInfo(const char* firmware) {
  JsonDocument doc;
  doc["type"] = "info";
  doc["firmware"] = firmware;
  doc["version"] = FRESCO_KIT_VERSION;
  doc["deviceId"] = config.deviceId;
  doc["wifiSsid"] = config.wifiSsid;
  doc["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  doc["supabaseConfigured"] = supabaseConfigured();
  doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("");
  serializeJson(doc, Serial);
  Serial.println();
}

static void sendAck(bool ok, const char* message) {
  JsonDocument doc;
  doc["type"] = "config_ack";
  doc["ok"] = ok;
  doc["message"] = message;
  serializeJson(doc, Serial);
  Serial.println();
}

static bool fits(const char* value, size_t maxLength) {
  return strlen(value) <= maxLength;
}

static void handleLine(const String& line, const char* firmware) {
  if (!line.startsWith("{")) {
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, line)) {
    sendAck(false, "invalid JSON");
    return;
  }

  const char* cmd = doc["cmd"] | "";
  if (strcmp(cmd, "info") == 0) {
    sendInfo(firmware);
    return;
  }
  if (strcmp(cmd, "config") != 0) {
    return;
  }

  const char* deviceId = doc["deviceId"] | "";
  const char* ssid = doc["wifiSsid"] | "";
  const char* password = doc["wifiPassword"] | "";
  const char* url = doc["supabaseUrl"] | "";
  const char* key = doc["supabaseKey"] | "";

  if (!fits(deviceId, 32) || !fits(ssid, 32) || !fits(password, 63) ||
      !fits(url, 120) || !fits(key, 400)) {
    sendAck(false, "value too long");
    return;
  }
  if (strlen(url) > 0 && strncmp(url, "https://", 8) != 0) {
    sendAck(false, "supabaseUrl must start with https://");
    return;
  }

  config.deviceId = strlen(deviceId) > 0 ? String(deviceId) : defaultDeviceId();
  config.wifiSsid = ssid;
  config.wifiPassword = password;
  config.supabaseUrl = url;
  config.supabaseKey = key;
  save();
  configChanged = true;

  sendAck(true, "saved");
  sendInfo(firmware);
}

// Call from loop(): reads complete lines from USB serial without blocking.
static void poll(const char* firmware) {
  static String buffer;
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n') {
      buffer.trim();
      if (buffer.length() > 0) {
        handleLine(buffer, firmware);
      }
      buffer = "";
    } else if (c != '\r' && buffer.length() < 1024) {
      buffer += c;
    }
  }
}

}  // namespace fresco_kit
