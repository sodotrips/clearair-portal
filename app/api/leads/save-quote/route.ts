import { NextResponse } from 'next/server';

interface QuoteData {
  leadId: string;
  rowIndex: number;
  lineItems: Array<{
    service: string;
    description: string;
    price: number;
  }>;
  subtotal: number;
  total: number;
  signature: string;
  signatureTimestamp: string;
  paymentMethod: string;
  amountPaid: number;
  customerName: string;
  address: string;
  city: string;
}

export async function POST(request: Request) {
  try {
    const quoteData: QuoteData = await request.json();

    // Validate required fields
    if (!quoteData.leadId || !quoteData.signature || !quoteData.lineItems) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Log the quote for record-keeping
    // In production, this could be stored to:
    // - Google Drive (signature images)
    // - A database
    // - Cloud storage (S3, etc.)
    console.log('=== QUOTE SAVED ===');
    console.log('Lead ID:', quoteData.leadId);
    console.log('Customer:', quoteData.customerName);
    console.log('Address:', `${quoteData.address}, ${quoteData.city}`);
    console.log('Line Items:', quoteData.lineItems.map(i => `${i.service}: $${i.price}`).join(', '));
    console.log('Total:', `$${quoteData.total}`);
    console.log('Payment:', `${quoteData.paymentMethod} - $${quoteData.amountPaid}`);
    console.log('Signed at:', quoteData.signatureTimestamp);
    console.log('Signature length:', quoteData.signature?.length || 0, 'bytes');
    console.log('==================');

    // Generate a simple quote reference number
    const quoteRef = `Q-${quoteData.leadId}-${Date.now().toString(36).toUpperCase()}`;

    return NextResponse.json({
      success: true,
      quoteRef,
      message: 'Quote saved successfully'
    });
  } catch (error) {
    console.error('Error saving quote:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
