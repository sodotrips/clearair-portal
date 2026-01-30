import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, SHEET_NAME, columnIndexToLetter as colIndexToLetter } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    // Google Sheets setup (supports both env var and keyFile auth)
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all leads
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:DZ`,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: 'No data found' });
    }

    const headers = rows[0];

    // Find or note missing columns
    let latColIndex = headers.indexOf('Latitude');
    let lngColIndex = headers.indexOf('Longitude');
    const addressColIndex = headers.indexOf('Address');
    const cityColIndex = headers.indexOf('City');
    const zipColIndex = headers.indexOf('Zip Code');

    if (addressColIndex === -1 || cityColIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Address or City column not found in sheet'
      });
    }

    if (latColIndex === -1 || lngColIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Please add "Latitude" and "Longitude" columns to your sheet first, then run this again.'
      });
    }

    // Find leads that need geocoding
    const leadsToGeocode: { rowIndex: number; address: string; city: string; zip: string }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const lat = row[latColIndex];
      const lng = row[lngColIndex];
      const address = row[addressColIndex];
      const city = row[cityColIndex];
      const zip = row[zipColIndex] || '';

      // Skip if already has coordinates or no address
      if ((lat && lng) || !address || !city) continue;

      leadsToGeocode.push({
        rowIndex: i + 1, // 1-indexed for sheets
        address,
        city,
        zip
      });
    }

    if (leadsToGeocode.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All leads already have coordinates!',
        geocoded: 0
      });
    }

    // Geocode each address
    const results: { rowIndex: number; lat: number; lng: number; address: string }[] = [];
    const errors: { rowIndex: number; address: string; error: string }[] = [];

    for (let i = 0; i < leadsToGeocode.length; i++) {
      const lead = leadsToGeocode[i];
      const fullAddress = `${lead.address}, ${lead.city}, TX ${lead.zip}`;

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`,
          {
            headers: {
              'User-Agent': 'ClearAirDispatcher/1.0'
            }
          }
        );

        const data = await response.json();

        if (data && data.length > 0) {
          results.push({
            rowIndex: lead.rowIndex,
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            address: fullAddress
          });
        } else {
          // Try city-level fallback
          const cityResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(lead.city + ', TX')}&limit=1`,
            {
              headers: {
                'User-Agent': 'ClearAirDispatcher/1.0'
              }
            }
          );
          const cityData = await cityResponse.json();

          if (cityData && cityData.length > 0) {
            results.push({
              rowIndex: lead.rowIndex,
              lat: parseFloat(cityData[0].lat),
              lng: parseFloat(cityData[0].lon),
              address: fullAddress + ' (city-level)'
            });
          } else {
            errors.push({ rowIndex: lead.rowIndex, address: fullAddress, error: 'Not found' });
          }
        }

        // Rate limiting for Nominatim
        if (i < leadsToGeocode.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        errors.push({ rowIndex: lead.rowIndex, address: fullAddress, error: err.message });
      }
    }

    // Update sheet with coordinates
    const latCol = colIndexToLetter(latColIndex);
    const lngCol = colIndexToLetter(lngColIndex);

    for (const result of results) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!${latCol}${result.rowIndex}:${lngCol}${result.rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[result.lat, result.lng]],
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Geocoded ${results.length} addresses`,
      geocoded: results.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('Geocode error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
