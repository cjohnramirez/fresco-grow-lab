# Experiments

## Grow-bag temperature

Can cheap probes tell when a bag needs water (*kailangan ba tubigan?*)?
Temperature is supporting evidence; water volume and bag weight are the
reference measurements.

**Routine:** water one bag with 2 L before 6 PM Manila, then weigh it every 10
minutes until 6 PM. Telemetry runs continuously. The `water` probe is read once
per watering to pre-fill *Water Temp* and is excluded from grow-bag statistics.

| Metric | Meaning |
| --- | --- |
| Checkpoint loss | First minus latest logged weight that day |
| Baseline drift | Trend of final weight across days; flat if below 0.05 kg/day |
| Recovery window | Root-zone change in the 2 h after watering |
| Root swing | Daily max minus min at the roots |
| Heatmap / profile | Hour-by-day pattern; how depth damps the daily swing |

| If… | Then likely… |
| --- | --- |
| Final weight is flat | Water amount is right |
| Final weight drifts down | Plant needs more water |
| Final weight drifts up | Bag is over-watered |
| Root swing grows | Bag is drying faster or heat-stressed |

## Rain gauge

Each tip registers two hall-sensor edges, so `tips = edges / 2`, and
`rainfall = tips × 2.3695 ml` (the mean from 42 calibration trials). Depth in
mm needs the funnel's catchment area. An odd edge count shows as a
*pending half tip*.

| View | Meaning |
| --- | --- |
| Rain events | Showers separated by 30 dry minutes |
| Intensity | Light < 2.5, moderate 2.5–7.5, heavy 7.5–15, intense 15–30, torrential > 30 mm/h (10-minute windows) |
| Time between tips | Short gaps mean heavy rain |
| Calibration | Imported trial CSV: mean, CV, bucket bias, uniformity |

## Simulation

The default data is deterministic, so every visitor sees the same history:

- **Air:** 24–33 °C. Deeper probes lag and swing less, and each 07:00 watering cools the bag briefly.
- **Bag weight:** loses mass to drainage, then evapotranspiration.
- **Rain:** afternoon convective showers.
