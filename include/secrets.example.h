#pragma once

// Copy this file to include/secrets.h (gitignored) and fill in your values.
// Used only by the classic `nodemcu-32s` temperature build; kit builds are
// configured over USB from the web dashboard instead.

// Wi-Fi network with internet access.
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Supabase project URL (no trailing slash) and its PUBLISHABLE key
// (sb_publishable_...) or legacy anon key. Never put the secret key here:
// anything in firmware can be read back off the chip.
#define SUPABASE_URL "https://your-project-ref.supabase.co"
#define SUPABASE_ANON_KEY "sb_publishable_..."
