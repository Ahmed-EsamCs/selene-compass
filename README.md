# Lunar South Pole Compass

Build a fully functional web application named Selene Compass for NASA Space Apps.

Use my uploaded dashboard image as the primary visual reference. Recreate its layout and visual identity as closely as possible.

Requirements:

- Dark navy and black space background.

- Interactive 3D Lunar South Pole map in the center.

- Green areas represent safe landing zones.

- Red areas represent hazardous landing zones.

- Cyan navigation and interface elements.

- Left sidebar with working filters and map controls.

- Right sidebar with Safety Score Dashboard.

- Interactive Solar Illumination, Terrain Slope, and Earth Communication Stability indicators.

- Functional zoom, rotation, layer toggles, and navigation.

- Responsive design for mobile and desktop.

Use React, Three.js, and clean modern components.

Make every button functional. Clearly label demonstration data and never present simulated measurements as verified NASA data.

Create a complete working web application, not just a static image or mockup.


**Live app**: https://lunar-south-pole-compass.lovable.app


## NASA data

| Data                                  | Source                                                         | How it gets in                                                                                      |
| ------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| South-pole elevation                  | NASA LRO LOLA polar DEM (`LDEM_80S_80M`, PDS Geosciences Node) | `bun run data:lola` bakes a validated, checksummed 161×161 grid into `public/data/lola-south-pole/` |
| Sun & Earth position in the lunar sky | NASA JPL Horizons API (no key needed)                          | Live, through the `/api/ephemeris` server route (cached, with timeouts/retries)                     |

Slope, illumination, Earth visibility and safety scores are **modelled by this app** from that data. They are estimates, not NASA products. If the LOLA asset is missing, the app falls back to procedural terrain and labels it as demonstration data.

```sh
bun run test        # offline unit tests
bun run test:live   # live tests against NASA (needs internet)
bun run data:lola   # re-bake the LOLA terrain grid
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and the build. The "NASA data" workflow re-bakes the LOLA grid and runs the live tests.

