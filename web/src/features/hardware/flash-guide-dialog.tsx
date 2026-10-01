"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const TEMPERATURE_WIRING = [
  ["control", "Ambient air, outside the bag", "GPIO 5 (D5)"],
  ["surface", "Top 2-3 cm of substrate", "GPIO 4 (D4)"],
  ["roots", "Root zone, mid-bag", "GPIO 16 (D16)"],
  ["bottom", "Bottom of the bag", "GPIO 17 (D17)"],
  ["water", "Irrigation water tank (optional)", "GPIO 14 (D14)"],
]

const RAIN_WIRING = [
  ["S (signal)", "GPIO 34"],
  ["+", "3V3"],
  ["-", "GND"],
]

function Step({
  children,
  number,
  title,
}: {
  children: React.ReactNode
  number: number
  title: string
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground">
      <span
        aria-hidden="true"
        className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
      >
        {number}
      </span>
      <h3 className="font-medium">
        <span className="sr-only">Step {number}: </span>
        {title}
      </h3>
      <div className="flex min-w-0 flex-col gap-2 text-muted-foreground">{children}</div>
    </li>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-2 font-mono text-xs text-foreground">
      {children}
    </pre>
  )
}

export function FlashGuideDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect your own sensors</DialogTitle>
          <DialogDescription>
            Build a Fresco sensor kit, flash it from this page, and watch its
            readings on the dashboard. Everything is optional. The dashboard
            runs on simulated data by default.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-3 text-sm">
          <Step number={1} title="Get the parts">
            <p>
              An ESP32 dev board (NodeMCU-32S or any ESP32-WROOM board), a
              USB cable that carries data (not a charge-only cable), and
              either DS18B20 waterproof temperature probes with a 4.7 kΩ
              pull-up resistor per data line, or a tipping-bucket rain gauge
              with an HW-477 hall-effect module.
            </p>
          </Step>

          <Step number={2} title="Wire it">
            <p>Temperature kit: every DS18B20 shares 3V3 and GND; each data wire goes to its own pin.</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Placement</TableHead>
                  <TableHead>ESP32 pin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TEMPERATURE_WIRING.map(([channel, placement, pin]) => (
                  <TableRow key={channel}>
                    <TableCell className="font-mono">{channel}</TableCell>
                    <TableCell>{placement}</TableCell>
                    <TableCell>{pin}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p>Rain gauge kit: GPIO 34 is input-only and relies on the HW-477 module&apos;s onboard pull-up.</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HW-477 pin</TableHead>
                  <TableHead>ESP32 pin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RAIN_WIRING.map(([from, to]) => (
                  <TableRow key={from}>
                    <TableCell>{from}</TableCell>
                    <TableCell>{to}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Step>

          <Step number={3} title="Pick firmware">
            <p>
              <strong className="text-foreground">Easiest:</strong> choose
              &quot;Prebuilt Fresco kit&quot; in the Flash tab. It is compiled
              by GitHub Actions from this repository and contains no Wi-Fi or
              database credentials.
            </p>
            <p>
              <strong className="text-foreground">Your own build:</strong>{" "}
              install PlatformIO (VS Code extension or{" "}
              <code>pip install platformio</code>), clone the repo, then
              compile a kit environment:
            </p>
            <Code>{`pio run -e temperature-kit     # or: pio run -e rain-gauge-kit`}</Code>
            <p>
              The files land in <code>.pio/build/temperature-kit/</code>:{" "}
              <code>bootloader.bin</code>, <code>partitions.bin</code> and{" "}
              <code>firmware.bin</code>. <code>boot_app0.bin</code> is in{" "}
              <code>~/.platformio/packages/framework-arduinoespressif32/tools/partitions/</code>.
              Choose &quot;My own .bin files&quot; and add all four. The
              offsets are detected from the file names.
            </p>
          </Step>

          <Step number={4} title="Flash from the browser">
            <p>
              Use Chrome or Edge on a desktop. Plug the board in, click{" "}
              <em>Flash board</em>, and pick the port (usually &quot;CP210x&quot;
              or &quot;USB-SERIAL CH340&quot;). If no port appears, install the
              CP210x or CH340 USB driver. If it hangs at &quot;Connecting&quot;,
              hold the <strong className="text-foreground">BOOT</strong> button
              until writing starts.
            </p>
          </Step>

          <Step number={5} title="Configure and stream">
            <p>
              Open the <em>USB</em> tab and click <em>Connect over USB</em>.
              Readings stream straight into the dashboard with no internet or
              database needed. To log around the clock, enter your Wi-Fi and
              Supabase details and click <em>Save to board</em>. The kit
              then uploads a row every minute, and the <em>My Supabase</em> tab
              points this dashboard at your project.
            </p>
            <p>
              The rain gauge also hosts its own Wi-Fi access point at{" "}
              <code>http://192.168.4.1</code>. The Access Point source only
              works when this dashboard runs on your own computer (
              <code>npm run dev</code>), because a website on the internet
              cannot reach your local network. Use USB instead on the hosted
              site.
            </p>
          </Step>
        </ol>
      </DialogContent>
    </Dialog>
  )
}
