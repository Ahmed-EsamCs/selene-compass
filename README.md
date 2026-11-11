# Selene Compass
### Lunar South Pole Landing Safety & Decision Support System

Selene Compass is an interactive decision-support platform designed to help scientists, mission planners, and space engineers identify and evaluate potential lunar landing sites, with a particular focus on the Moon's South Pole.

Developed for the **NASA Space Apps Challenge**, the platform combines lunar terrain data, solar illumination analysis, and safety indicators into an interactive 3D mapping experience.

---

## 1. The Problem

Landing safely near the lunar South Pole is one of the major challenges facing future lunar exploration missions.

The region presents several critical hazards:

- **Rugged Terrain:** Craters, steep slopes, and sharp elevation changes increase the risk of landing failure or spacecraft instability.
- **Permanent Shadowed Regions:** Some areas receive little or no direct sunlight, making solar-powered operations difficult.
- **Unpredictable Illumination:** Solar visibility varies significantly across the terrain, affecting energy availability and mission planning.
- **Communication Limitations:** The lunar South Pole's geography can create communication challenges between landing sites and Earth.

Traditional site evaluation often requires analyzing multiple scientific datasets and tools separately, making comparisons time-consuming and complex.

## 2. Our Solution

Selene Compass provides a unified visual platform that transforms complex lunar data into understandable and actionable information.

Instead of manually comparing different datasets, users can explore candidate landing locations through an interactive 3D lunar map and evaluate their suitability using multiple safety indicators.

The platform aims to simplify the decision-making process and help identify safer, more suitable landing zones.

## 3. Key Features

### Interactive 3D Lunar Map
- Explore the lunar South Pole through an interactive terrain visualization.
- Navigate and inspect potential landing locations.
- Visualize terrain characteristics and geographic features.

### Terrain Analysis
- Evaluate surface slopes and elevation variations.
- Identify potentially hazardous terrain.
- Explore crater structures and surrounding topography.

### Solar Illumination Analysis
- Examine solar illumination conditions.
- Identify areas with favorable sunlight exposure.
- Understand how illumination affects potential mission operations.

### Earth Communication Indicators
- Evaluate communication visibility considerations.
- Identify potential limitations caused by lunar geography.

### Landing Safety Classification
- Classify terrain according to its potential landing suitability.
- Distinguish between safer and hazardous regions.
- Provide visual indicators to support site evaluation.

### Overall Safety Score
- Combine multiple environmental indicators into an overall safety assessment.
- Help users compare different candidate landing locations.
- Support more informed landing-site selection.

## 4. Data Sources

The platform is designed around scientific lunar datasets, including:

| Data Source | Purpose |
|---|---|
| NASA LOLA | Lunar elevation and terrain analysis |
| JPL Horizons | Solar and celestial position information |

These datasets help provide the scientific foundation for terrain evaluation and environmental analysis.

## 5. Technology Stack

The project is built using modern web technologies:

- **React** – User interface development.
- **TypeScript** – Type-safe application development.
- **Vite** – Development server and build tooling.
- **TanStack Router** – Application routing.
- **Tailwind CSS** – Styling and responsive layouts.
- **Lucide React** – Interface icons.

## 6. Getting Started

### Prerequisites

- Node.js
- Bun package manager

### Installation

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
cd lunar-south-pole-compass
```

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Open the local URL displayed in your terminal to access the application.

### Production Build

Build the application:

```bash
bun run build
```

Run the production preview if supported by the project scripts:

```bash
bun run preview
```

## 7. Project Structure

```text
src/
├── components/
│   ├── compass/
│   └── ui/
├── hooks/
├── lib/
├── routes/
├── server/
├── store/
├── test/
├── types/
├── router.tsx
├── routeTree.gen.ts
├── server.ts
└── styles.css

public/
scripts/
```

## 8. Project Goal

Selene Compass aims to make lunar landing-site evaluation more accessible, visual, and data-driven.

By bringing terrain analysis, illumination conditions, communication considerations, and safety indicators into one platform, the project supports the planning of safer and more efficient future lunar exploration missions.

## 9. NASA Space Apps Challenge

**Challenge:** NASA Space Apps Challenge

**Project:** Selene Compass – Lunar South Pole Landing Safety and Decision Support System

**Focus Area:** Lunar Exploration, Space Science, Data Visualization, and Mission Planning.

---

*Explore the Moon. Evaluate the terrain. Make safer landing decisions.*