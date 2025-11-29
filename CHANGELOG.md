# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - Custom Fork

This fork adds significant enhancements for offline operation and international waters navigation.

### Added

#### Offline Harmonic Prediction
- **Full offline mode** using NOAA harmonic constituents for accurate tide predictions without internet
- **Automatic harmonics cache** downloads stations within 500nm radius on startup and quarterly
- **Smart radius expansion** up to 1000nm if fewer than 2 stations found
- **Bundled harmonics data** for Fiji region (customizable with extraction tool)
- **Automatic fallback** to offline mode when online providers fail
- **MSL to MLLW datum conversion** using official NOAA datum offsets

#### Tidal Datum Support
- **Standardized on MLLW/CD datum** across all sources for marine navigation
- All tide heights now positive values (suitable for chart datum navigation)
- Automatic datum conversion where needed:
  - **NOAA**: Native MLLW datum (US standard)
  - **WorldTides**: Chart Datum (CD), equivalent to LAT
  - **StormGlass**: Requests MLLW datum from API
  - **Offline**: MSL with automatic MLLW conversion using NOAA datum offsets

#### Station Management
- **Smart station selection** prevents frequent switching between nearby tide stations
- **Configurable distance threshold** (default: 10km) for station switching
- **Position caching** maintains predictions when navigation.position temporarily unavailable

### Changed

- **Simplified configuration** - removed datum selection option (all sources now provide MLLW/CD)
- **Enhanced StormGlass integration** - requests MLLW datum, logs offset for debugging
- **Improved WorldTides** - handles missing station names gracefully

### Fixed

- **StormGlass datum parameter** - properly requests MLLW datum from API
- **WorldTides station names** - handles undefined station field (shows atlas name instead)
- **TypeScript errors** - fixed type definitions for StormGlass metadata (datum, offset fields)

### Documentation

- Added comprehensive datum explanation for all sources
- Added data quality warning for StormGlass UHSLC stations in Pacific
- Documented offline mode features and harmonics cache behavior
- Added recommendations for international waters (WorldTides or Offline)

### Technical Improvements

- Created `datum.ts` module for datum conversion utilities
- Created `harmonics-cache.ts` for automatic NOAA harmonics downloads
- Enhanced type safety with proper datum metadata in forecast results
- Removed unnecessary datum conversion code (all sources now MLLW/CD)

---

## [1.4.0] - 2025-09-15 (Upstream)

Based on [bkeepers/signalk-tides](https://github.com/bkeepers/signalk-tides)

### Features from Upstream
- NOAA tide predictions (US waters)
- WorldTides API support (global, requires API key)
- StormGlass.io API support (global, requires API key)
- REST API resource for tide predictions
- SignalK delta updates for tide data
- Configurable update frequency
- Position caching for offline resilience

---

## Fork Information

This is a custom fork of [signalk-tides](https://github.com/bkeepers/signalk-tides) v1.4.0, which itself is a fork of the unmaintained [signalk-tides-api](https://github.com/joabakk/signalk-tides-api).

**Primary enhancements:**
1. Full offline capability with NOAA harmonic predictions
2. Automatic harmonics cache management
3. Standardized MLLW/Chart Datum across all sources
4. Enhanced data quality awareness and debugging

**Credits:**
- Original: @joabakk and @sbender9
- Upstream fork: @bkeepers
- Offline & datum enhancements: Custom fork
