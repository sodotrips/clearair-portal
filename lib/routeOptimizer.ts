// Route Optimization for Tech Portal
// Uses nearest-neighbor algorithm to find efficient route

export interface Location {
  id: string;
  address: string;
  city: string;
  zip?: string;
  lat?: number;
  lng?: number;
}

export interface OptimizedRoute {
  orderedLocations: Location[];
  totalDistanceMiles: number;
  estimatedMinutes: number;
  googleMapsUrl: string;
}

// Calculate distance between two coordinates (Haversine formula)
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Nearest neighbor algorithm for route optimization
export function optimizeRoute(locations: Location[], startLat?: number, startLng?: number): OptimizedRoute {
  if (locations.length === 0) {
    return {
      orderedLocations: [],
      totalDistanceMiles: 0,
      estimatedMinutes: 0,
      googleMapsUrl: '',
    };
  }

  // Filter locations that have coordinates
  const validLocations = locations.filter(loc => loc.lat && loc.lng);

  if (validLocations.length === 0) {
    // No geocoded locations, return original order
    return {
      orderedLocations: locations,
      totalDistanceMiles: 0,
      estimatedMinutes: 0,
      googleMapsUrl: generateGoogleMapsUrl(locations),
    };
  }

  const ordered: Location[] = [];
  const remaining = [...validLocations];
  let totalDistance = 0;

  // Start from provided coordinates or first location
  let currentLat = startLat ?? validLocations[0].lat!;
  let currentLng = startLng ?? validLocations[0].lng!;

  // If we have a start point different from first job, don't add it to ordered
  if (!startLat || !startLng) {
    ordered.push(remaining.shift()!);
    if (ordered[0].lat && ordered[0].lng) {
      currentLat = ordered[0].lat;
      currentLng = ordered[0].lng;
    }
  }

  // Nearest neighbor: always go to closest unvisited location
  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const loc = remaining[i];
      if (loc.lat && loc.lng) {
        const distance = getDistanceMiles(currentLat, currentLng, loc.lat, loc.lng);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }
    }

    const nearest = remaining.splice(nearestIndex, 1)[0];
    ordered.push(nearest);
    totalDistance += nearestDistance;

    if (nearest.lat && nearest.lng) {
      currentLat = nearest.lat;
      currentLng = nearest.lng;
    }
  }

  // Estimate time: average 25 mph in Houston traffic + 5 min per stop
  const driveTimeMinutes = (totalDistance / 25) * 60;
  const stopTimeMinutes = ordered.length * 5;
  const estimatedMinutes = Math.round(driveTimeMinutes + stopTimeMinutes);

  return {
    orderedLocations: ordered,
    totalDistanceMiles: Math.round(totalDistance * 10) / 10,
    estimatedMinutes,
    googleMapsUrl: generateGoogleMapsUrl(ordered),
  };
}

// Generate Google Maps directions URL with all waypoints
export function generateGoogleMapsUrl(locations: Location[]): string {
  if (locations.length === 0) return '';

  if (locations.length === 1) {
    const loc = locations[0];
    const address = encodeURIComponent(`${loc.address}, ${loc.city}, TX ${loc.zip || ''}`);
    return `https://www.google.com/maps/dir/?api=1&destination=${address}`;
  }

  // First location is origin, last is destination, middle are waypoints
  const addresses = locations.map(loc =>
    encodeURIComponent(`${loc.address}, ${loc.city}, TX ${loc.zip || ''}`)
  );

  const origin = addresses[0];
  const destination = addresses[addresses.length - 1];
  const waypoints = addresses.slice(1, -1).join('|');

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;

  if (waypoints) {
    url += `&waypoints=${waypoints}`;
  }

  return url;
}

// Format duration for display
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
