'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { optimizeRoute, formatDuration, Location, OptimizedRoute } from '@/lib/routeOptimizer';

interface Job {
  [key: string]: string;
}

interface JobMapProps {
  jobs: Job[];
  onRouteOptimized?: (orderedJobs: Job[], routeInfo: OptimizedRoute) => void;
}

interface GeocodedJob {
  job: Job;
  lat: number;
  lng: number;
}

// Custom marker icon with number
const createNumberedIcon = (number: number, isOptimized: boolean = false) => {
  const bgColor = isOptimized ? '#14b8a6' : '#64748b';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${bgColor};
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">${number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Component to fit map bounds to markers
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [map, positions]);

  return null;
}

export default function JobMap({ jobs, onRouteOptimized }: JobMapProps) {
  const [geocodedJobs, setGeocodedJobs] = useState<GeocodedJob[]>([]);
  const [optimizedJobs, setOptimizedJobs] = useState<GeocodedJob[]>([]);
  const [routeInfo, setRouteInfo] = useState<OptimizedRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ current: 0, total: 0 });
  const geocodeCache = useRef<Record<string, { lat: number; lng: number }>>({});

  // Houston center coordinates as default
  const houstonCenter: [number, number] = [29.7604, -95.3698];

  useEffect(() => {
    geocodeAddresses();
  }, [jobs]);

  const geocodeAddresses = async () => {
    setLoading(true);
    const results: GeocodedJob[] = [];
    const needsGeocoding: { job: Job; index: number }[] = [];

    // First pass: use existing coordinates or cache
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const address = `${job['Address']}, ${job['City']}, TX ${job['Zip Code']}`;

      // Check if job already has coordinates from sheet
      if (job['Latitude'] && job['Longitude']) {
        const lat = parseFloat(job['Latitude']);
        const lng = parseFloat(job['Longitude']);
        if (!isNaN(lat) && !isNaN(lng)) {
          results[i] = { job, lat, lng };
          continue;
        }
      }

      // Check cache
      if (geocodeCache.current[address]) {
        results[i] = {
          job,
          lat: geocodeCache.current[address].lat,
          lng: geocodeCache.current[address].lng,
        };
        continue;
      }

      // Mark for geocoding
      needsGeocoding.push({ job, index: i });
    }

    // Geocode any addresses that need it
    if (needsGeocoding.length > 0) {
      setGeocodeProgress({ current: 0, total: needsGeocoding.length });

      for (let i = 0; i < needsGeocoding.length; i++) {
        setGeocodeProgress({ current: i + 1, total: needsGeocoding.length });
        const { job, index } = needsGeocoding[i];
        const address = `${job['Address']}, ${job['City']}, TX ${job['Zip Code']}`;

        try {
          const response = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address }),
          });
          const data = await response.json();

          if (data.success) {
            geocodeCache.current[address] = { lat: data.lat, lng: data.lng };
            results[index] = { job, lat: data.lat, lng: data.lng };
          }
        } catch (err) {
          console.error('[JobMap] Geocoding error for:', address, err);
        }

        // If geocoding failed, try with just city + zip
        if (!results[index]) {
          try {
            const fallbackAddress = `${job['City']}, TX ${job['Zip Code']}`;
            const response = await fetch('/api/geocode', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address: fallbackAddress }),
            });
            const data = await response.json();
            if (data.success) {
              geocodeCache.current[address] = { lat: data.lat, lng: data.lng };
              results[index] = { job, lat: data.lat, lng: data.lng };
              console.warn('[JobMap] Used fallback geocoding for:', job['Lead ID'], address);
            }
          } catch (err) {
            console.error('[JobMap] Fallback geocoding also failed for:', job['Lead ID']);
          }
        }
      }
    }

    // Log any jobs that failed to geocode
    for (let i = 0; i < jobs.length; i++) {
      if (!results[i]) {
        console.error('[JobMap] Failed to geocode job:', jobs[i]['Lead ID'], jobs[i]['Address'], jobs[i]['City']);
      }
    }

    // Filter out any empty slots
    const finalResults = results.filter(Boolean);
    setGeocodedJobs(finalResults);

    // Auto-optimize route after geocoding
    if (finalResults.length > 1) {
      optimizeRouteOrder(finalResults);
    } else {
      setOptimizedJobs(finalResults);
      setLoading(false);
    }
  };

  const parseTimeWindow = (tw: string): number => {
    if (!tw) return 99 * 60;
    const match = tw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return 99 * 60;
    let hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2] || '0', 10);
    const meridiem = (match[3] || '').toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return hour * 60 + minutes;
  };

  const optimizeRouteOrder = (geocoded: GeocodedJob[]) => {
    setOptimizing(true);

    // Sort by scheduled time window instead of geographic optimization
    const reordered = [...geocoded].sort((a, b) =>
      parseTimeWindow(a.job['Time Window']) - parseTimeWindow(b.job['Time Window'])
    );

    setOptimizedJobs(reordered);
    setRouteInfo(null);
    setOptimizing(false);
    setLoading(false);

    // Callback with time-ordered jobs
    if (onRouteOptimized) {
      onRouteOptimized(reordered.map(g => g.job), { orderedLocations: [], totalDistance: 0, totalDuration: 0 } as any);
    }
  };

  const displayJobs = optimizedJobs.length > 0 ? optimizedJobs : geocodedJobs;
  const positions: [number, number][] = displayJobs.map(g => [g.lat, g.lng]);

  if (loading || optimizing) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🗺️</span>
          <h3 className="font-semibold text-[#0a2540]">Today's Route</h3>
        </div>
        <div className="h-64 bg-slate-100 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-3 border-[#14b8a6] border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-slate-500 text-sm">
              {optimizing ? 'Sorting by schedule...' :
               geocodeProgress.total > 0
                 ? `Finding addresses (${geocodeProgress.current}/${geocodeProgress.total})...`
                 : 'Loading map...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (displayJobs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🗺️</span>
          <h3 className="font-semibold text-[#0a2540]">Today's Route</h3>
        </div>
        <div className="h-48 bg-slate-100 rounded-lg flex items-center justify-center">
          <p className="text-slate-500 text-sm">Unable to load map locations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      {/* Header with route info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗺️</span>
          <h3 className="font-semibold text-[#0a2540]">Today's Route</h3>
        </div>
        {routeInfo && routeInfo.totalDistanceMiles > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
              📍 {routeInfo.totalDistanceMiles} mi
            </span>
            <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
              🚗 ~{formatDuration(routeInfo.estimatedMinutes)}
            </span>
          </div>
        )}
      </div>

      {/* Route Legend */}
      <div className="flex flex-col gap-1 mb-3 text-xs">
        {displayJobs.map((g, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-slate-100 px-2 py-1.5 rounded">
            <span className="w-5 h-5 bg-[#14b8a6] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
              {idx + 1}
            </span>
            <span className="text-[#0a2540] font-semibold flex-shrink-0">{g.job['Customer Name']}</span>
            <span className="text-slate-400">—</span>
            <span className="text-slate-600 truncate">{g.job['Address']}, {g.job['City']}, TX {g.job['Zip Code']}</span>
            {g.job['Phone Number'] && (
              <>
                <span className="text-slate-400">—</span>
                <a href={`tel:${g.job['Phone Number'].replace(/\D/g, '')}`} className="text-blue-600 hover:text-blue-800 font-medium flex-shrink-0">{g.job['Phone Number']}</a>
              </>
            )}
            <span className="ml-auto text-[#14b8a6] font-semibold flex-shrink-0">{g.job['Time Window'] || 'No time'}</span>
          </div>
        ))}
      </div>

      {/* Start Route Button */}
      {routeInfo && routeInfo.googleMapsUrl && (
        <a
          href={routeInfo.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mb-3 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-center transition flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Start Optimized Route in Google Maps
        </a>
      )}

      {/* Map */}
      <div className="h-[50vh] rounded-lg overflow-hidden border border-slate-200">
        <MapContainer
          center={positions.length > 0 ? positions[0] : houstonCenter}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Route line connecting all points */}
          {positions.length > 1 && (
            <Polyline
              positions={positions}
              color="#14b8a6"
              weight={4}
              opacity={0.7}
              dashArray="10, 10"
            />
          )}

          {/* Markers */}
          {displayJobs.map((g, idx) => (
            <Marker
              key={idx}
              position={[g.lat, g.lng]}
              icon={createNumberedIcon(idx + 1, true)}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-bold text-[#14b8a6]">Stop #{idx + 1}</p>
                  <p className="font-semibold text-[#0a2540]">{g.job['Customer Name']}</p>
                  <p className="text-slate-600">{g.job['Address']}</p>
                  <p className="text-slate-600">{g.job['City']}, TX {g.job['Zip Code']}</p>
                  <p className="text-[#14b8a6] font-medium mt-1">{g.job['Time Window']}</p>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(g.job['Address'] + ', ' + g.job['City'] + ', TX ' + g.job['Zip Code'])}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 text-xs hover:underline block mt-2"
                  >
                    Navigate to this stop
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}

          <FitBounds positions={positions} />
        </MapContainer>
      </div>

      <p className="text-xs text-slate-400 mt-2 text-center">
        Route optimized for shortest distance. Tap "Start Route" to navigate.
      </p>
    </div>
  );
}
