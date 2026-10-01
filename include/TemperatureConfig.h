#pragma once

#ifndef TEMPERATURE_BAUD_RATE
#define TEMPERATURE_BAUD_RATE 115200
#endif

#ifndef TEMPERATURE_SAMPLE_INTERVAL_MS
#define TEMPERATURE_SAMPLE_INTERVAL_MS 1000UL
#endif

#ifndef TEMPERATURE_RESOLUTION_BITS
#define TEMPERATURE_RESOLUTION_BITS 12
#endif

#ifndef TEMPERATURE_CONVERSION_DELAY_MS
#define TEMPERATURE_CONVERSION_DELAY_MS 750UL
#endif

// Credentials live in include/secrets.h, which is gitignored. Copy
// include/secrets.example.h to include/secrets.h and fill it in. Without it the
// firmware still builds, but it skips Wi-Fi and uploads (placeholders below).
// Kit builds (-DFRESCO_KIT=1) ignore these and are configured over USB.
#if defined(__has_include)
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#endif

// Wi-Fi network (must have internet access) the device joins to reach Supabase.
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

// Supabase project REST configuration.
//   SUPABASE_URL      -> e.g. "https://abcdefgh.supabase.co" (no trailing slash)
//   SUPABASE_ANON_KEY -> the project's publishable (sb_publishable_...) or
//                        legacy anon key. Never the secret/service_role key.
//   SUPABASE_TABLE    -> table that receives the rows
#ifndef SUPABASE_URL
#define SUPABASE_URL ""
#endif

#ifndef SUPABASE_ANON_KEY
#define SUPABASE_ANON_KEY ""
#endif

#ifndef SUPABASE_TABLE
#define SUPABASE_TABLE "temperature_readings"
#endif

// How often to upload the latest reading to Supabase (ms). Sampling still
// happens every TEMPERATURE_SAMPLE_INTERVAL_MS; this only throttles uploads.
#ifndef SUPABASE_POST_INTERVAL_MS
#define SUPABASE_POST_INTERVAL_MS 60000UL
#endif
