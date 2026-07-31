import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
    }

    let lat: number | null = null;
    let lng: number | null = null;

    // Try Nominatim first
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: { 'User-Agent': 'ClearAirDispatcher/1.0' }
        }
      );
      const data = await response.json();
      if (data && data.length > 0) {
        lat = parseFloat(data[0].lat);
        lng = parseFloat(data[0].lon);
      }
    } catch (err) {
      console.warn('Nominatim failed for:', address);
    }

    // Fallback: US Census Bureau geocoder
    if (lat === null || lng === null) {
      try {
        const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
        const censusResponse = await fetch(censusUrl);
        const censusData = await censusResponse.json();
        const matches = censusData?.result?.addressMatches;
        if (matches && matches.length > 0) {
          lat = matches[0].coordinates.y;
          lng = matches[0].coordinates.x;
        }
      } catch (err) {
        console.warn('Census geocoder failed for:', address);
      }
    }

    // Final fallback: ZIP-centroid via Zippopotam (free, reliable, no rate limit).
    // Ensures any address with a valid US ZIP resolves to at least an approximate
    // point, so jobs are never dropped from the map when the street isn't found.
    let approximate = false;
    if (lat === null || lng === null) {
      // Use the LAST 5-digit group — the trailing ZIP, not the house number.
      const zips = String(address).match(/\b\d{5}\b/g);
      const zip = zips ? zips[zips.length - 1] : null;
      if (zip) {
        try {
          const zipResponse = await fetch(`https://api.zippopotam.us/us/${zip}`);
          if (zipResponse.ok) {
            const zipData = await zipResponse.json();
            const place = zipData?.places?.[0];
            if (place) {
              lat = parseFloat(place.latitude);
              lng = parseFloat(place.longitude);
              approximate = true;
            }
          }
        } catch (err) {
          console.warn('ZIP-centroid geocoder failed for:', address);
        }
      }
    }

    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      return NextResponse.json({ success: true, lat, lng, approximate });
    }

    return NextResponse.json({ success: false, error: 'Address not found' });
  } catch (error: any) {
    console.error('Geocode error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
