import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient, SPREADSHEET_ID, DATA_RANGE, SHEET_NAME } from '@/lib/google-sheets';
import { getHoustonDate } from '@/app/lib/document-numbering';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('leadId');

    if (!leadId) {
      return NextResponse.json({ success: false, error: 'leadId is required' }, { status: 400 });
    }

    // Fetch lead data
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: DATA_RANGE,
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: 'No data found' }, { status: 404 });
    }

    const headers = rows[0];
    const leads = rows.slice(1).map((row: string[], index: number) => {
      const lead: Record<string, string> = { rowIndex: String(index + 2) };
      headers.forEach((header: string, i: number) => {
        lead[header] = row[i] || '';
      });
      return lead;
    });

    const lead = leads.find((l: Record<string, string>) => l['Lead ID'] === leadId);
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    const totalAmount = parseFloat(lead['Amount Paid'] || lead['Quote Amount'] || '0');
    const isPaid = !!(lead['Amount Paid'] && parseFloat(lead['Amount Paid']) > 0 && lead['Payment Method']);

    // Return data for client-side PDF generation
    return NextResponse.json({
      success: true,
      invoiceData: {
        invoiceNumber: lead['Invoice Number'] || 'DRAFT',
        date: lead['Payment Date'] || getHoustonDate(),
        dueDate: isPaid ? 'Paid' : 'Due on Receipt',
        leadId,
        customer: {
          name: lead['Customer Name'] || '',
          address: lead['Address'] || '',
          city: lead['City'] || '',
          zip: lead['Zip Code'] || '',
          phone: lead['Phone Number'] || '',
          email: lead['Email'] || '',
        },
        lineItems: [{
          service: lead['Service Requested'] || 'Air Duct Cleaning',
          description: '',
          qty: 1,
          price: totalAmount,
        }],
        totals: {
          subtotal: totalAmount,
          discount: 0,
          taxRate: 0,
          tax: 0,
          total: totalAmount,
        },
        isPaid,
        amountPaid: lead['Amount Paid'] || '',
        paymentMethod: lead['Payment Method'] || '',
        paymentDate: lead['Payment Date'] || '',
      },
    });
  } catch (error: any) {
    console.error('Preview invoice error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
