# Houston Flood Visualization Application

A web-based application for visualizing flood information in Houston, Texas using ESRI ArcGIS JavaScript API.

## Overview

This application provides an interactive map interface centered on Houston, Texas, using the ArcGIS API for JavaScript. It serves as the foundation for displaying and analyzing flood-related geospatial data.

## Features

- **Interactive Map**: Full-featured map centered on Houston, Texas
- **ESRI Basemap**: Street-level basemap (configurable to satellite, hybrid, or topographic)
- **Responsive Design**: Works on desktop and mobile devices
- **Information Panel**: Displays flood visualization information

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, or Edge)
- Internet connection (to load the ArcGIS API)

### Usage

1. Open `index.html` in a web browser
2. The map will load automatically centered on Houston at zoom level 11
3. Use your mouse to pan and zoom the map
4. Scroll to zoom in/out

### Files

- **index.html**: Main HTML file that loads the ArcGIS API and application components
- **app.js**: JavaScript file containing the map initialization logic
- **styles.css**: CSS styling for the application layout and appearance

## Customization

### Change the Basemap

In `app.js`, modify the basemap option in the Map constructor:

```javascript
const map = new Map({
    basemap: "streets-v3" // Options: "satellite", "hybrid", "topo-map", "dark-gray-vector", "light-gray-vector", etc.
});
```

### Adjust Zoom Level

In `app.js`, modify the `zoom` property in the MapView:

```javascript
const view = new MapView({
    container: "viewDiv",
    map: map,
    zoom: 11, // Change this number (higher = closer)
    center: [-95.3698, 29.7604]
});
```

### Change Map Center

Modify the `center` property with new [longitude, latitude] coordinates:

```javascript
center: [-95.3698, 29.7604] // Current: Houston downtown area
```

## Building the Flood Visualization

To add flood data visualization layers:

1. Import additional ArcGIS modules (FeatureLayer, GeoJSONLayer, etc.)
2. Add layers to the map
3. Configure symbology and popups
4. Implement filtering and interaction features

## Resources

- [ArcGIS API for JavaScript Documentation](https://developers.arcgis.com/javascript/latest/)
- [ArcGIS Basemap Gallery](https://livingatlas.arcgis.com/guestapps/home)
- [GeoCoordinates Reference](https://en.wikipedia.org/wiki/Geographic_coordinate_system)

## License

This project is part of the CFAR Houston Tax Day Floods Revisited initiative.
