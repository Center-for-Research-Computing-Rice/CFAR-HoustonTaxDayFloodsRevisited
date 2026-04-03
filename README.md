# Houston Flood Visualization Application

A web-based application for visualizing flood information in Houston, Texas using Leaflet.js and free, open-source tile providers.

## Overview

This application provides an interactive map interface centered on Houston, Texas, using Leaflet.js mapping library with multiple free basemap options. It displays historic and transported flood data from ArcGIS tile services without requiring API keys.

## Features

- **Interactive Map**: Full-featured map centered on Houston, Texas at zoom level 12
- **Multiple Basemaps**: Choose from 5 free basemap options via dropdown selector in the top-right panel:
  - **CartoDB Positron** (default) - Clean, light vector basemap
  - **CartoDB Voyager** - Detailed vector tiles with more information
  - **OpenStreetMap** - Classic community-driven map data
  - **ESRI Satellite** - High-resolution aerial imagery
  - **USGS Topographic** - Terrain-focused map with contour lines
- **Flood Data Layers**: Toggle between two visualization layers:
  - **Historic Flood Data** - Historical flood patterns and coverage
  - **Transported Flood Data** - Modeled flood if the Tax Day storm were centered on this area
- **Interactive Legend**: Displays 6 flood intensity levels with water depth indicators (0-10+ feet)
- **Address Search**: Search for locations by address and automatically center the map
- **Home Button**: Quick return button (🏠) to restore original Houston view
- **Responsive Design**: Works on desktop and mobile devices
- **Collapsible Controls**: Settings panel toggles to reduce visual clutter

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, or Edge)
- Internet connection (to load tile providers and basemaps)

### Usage

1. Open `index.html` in a web browser
2. The map will load automatically centered on Houston (zoom level 12) with CartoDB Positron basemap
3. Use your mouse to pan and zoom the map
4. **Basemap Toggle**: Click the dropdown in the top-right panel to switch between 5 different basemaps
5. **Flood Layer Toggle**: Use the raster selector in the same panel to switch between Historic and Transported flood data
6. **Search Location**: Type an address in the search bar and press Enter to zoom to that location
7. **Return Home**: Click the 🏠 button above the zoom controls to return to the original Houston view
8. **Hide Controls**: Click the ⚙️ toggle to collapse the settings panel

### Files

- **index.html**: Main HTML file with map container and UI controls
- **app.js**: JavaScript file containing map initialization, basemap switching, flood layer management, and address search logic
- **styles.css**: CSS styling for responsive layout, controls panel, legend, and all UI elements

## Customization

### Change the Default Basemap

In `app.js`, modify line 69 to specify which basemap loads by default:

```javascript
// Current default: CartoDB Positron
basemaps['cartodb-positron'].addTo(map);

// To use a different default, change to:
basemaps.osm.addTo(map);                    // OpenStreetMap
basemaps['cartodb-voyager'].addTo(map);     // CartoDB Voyager
basemaps['esri-satellite'].addTo(map);      // ESRI Satellite
basemaps['usgs-topo'].addTo(map);           // USGS Topographic
```

### Add or Modify Basemaps

Basemaps are defined in the `basemaps` object around line 10-25 in `app.js`. Each basemap uses Leaflet's TileLayer:

```javascript
const basemaps = {
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }),
    // Add new basemap:
    'stamen-toner': L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png', {
        attribution: '© Stadia Maps © Stamen Design',
        maxZoom: 20
    })
};
```

### Change Map Center and Default Zoom

In `app.js`, modify the home position and zoom constants (around line 2-3):

```javascript
const homePosition = [29.6014573, -95.1410888];  // [latitude, longitude]
const homeZoom = 12;                             // Default zoom level
```

### Adjust Flood Data Layer Opacity

In `app.js`, find the flood layer definitions and modify the `opacity` parameter:

```javascript
overlayLayers['historic'] = L.tileLayer(
    'https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_historic_HC_CC_Clip2/MapServer/tile/{z}/{y}/{x}',
    { opacity: 0.7 }  // Change 0.7 to desired opacity (0=transparent, 1=opaque)
);
```

### Modify Flood Intensity Legend

The legend is displayed in `index.html` within the legend section. Each intensity level includes a color swatch and depth range. To update colors or labels, modify the HTML legend items.

## Technology Stack

- **Leaflet.js v1.9.4**: Open-source JavaScript library for interactive maps
- **Tile Providers**: OpenStreetMap, CartoDB, ESRI, USGS (all free, no API keys required)
- **Geocoding**: Nominatim (OpenStreetMap's free geocoding service)
- **Flood Data**: ArcGIS tile services (public, no authentication required)

## Adding New Features

### Add a New Basemap

To add another basemap option, add it to the `basemaps` object and to the dropdown in `index.html`:

1. Define in `app.js`:
```javascript
'new-basemap': L.tileLayer('https://tile-url/{z}/{x}/{y}.png', {
    attribution: 'Attribution text',
    maxZoom: 19
})
```

2. Add option to dropdown in `index.html`:
```html
<option value="new-basemap">New Basemap Name</option>
```

### Add a New Flood Data Layer

1. Create a new tile layer in `app.js`:
```javascript
overlayLayers['new-layer'] = L.tileLayer('https://arcgis-url/tile/{z}/{y}/{x}', {
    opacity: 0.7
});
```

2. Add toggle option in `index.html` raster selector
3. Update the event listener in `app.js` to handle the new layer

## Flood Data Layers

### Historic Flood Data
- Source: CFAR ArcGIS Server
- URL: `https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_historic_HC_CC_Clip2/MapServer`
- Description: Historical flood patterns and affected areas in Houston
- Displayed at 70% opacity to blend with basemaps

### Transported Flood Data
- Source: CFAR ArcGIS Server
- URL: `https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_transposed_HC_CC_Clip/MapServer`
- Description: Modeled flood depths if the 2016 Tax Day storm were centered on Clear Creek (the hosted MapServer path on ArcGIS is unchanged)
- Displayed at 70% opacity to blend with basemaps

## Resources

- [Leaflet.js Documentation](https://leafletjs.com/)
- [Leaflet API Reference](https://leafletjs.com/reference.html)
- [OpenStreetMap Tile Providers](https://wiki.openstreetmap.org/)
- [CartoDB Tile Services](https://carto.com/)
- [Nominatim Geocoding](https://nominatim.org/)
- [GeoCoordinates Reference](https://en.wikipedia.org/wiki/Geographic_coordinate_system)

## Basemap Toggle Information

The basemap toggle selector in the top-right control panel allows you to switch between five different map backgrounds:

1. **CartoDB Positron** - Clean vector basemap with minimal styling (default)
2. **CartoDB Voyager** - Detailed vector map with more cartographic features
3. **OpenStreetMap** - Community-driven map data with comprehensive coverage
4. **ESRI Satellite** - High-resolution aerial imagery for detailed spatial context
5. **USGS Topographic** - Topographic map focusing on terrain and elevation

All basemap options are free and require no API authentication keys. The flood data layers render on top of whichever basemap you select, maintaining consistent layer ordering.

## License

This project is part of the CFAR Houston Tax Day Floods Revisited initiative.
