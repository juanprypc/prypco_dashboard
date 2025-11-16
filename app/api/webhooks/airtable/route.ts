import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type AirtableWebhookPayload = {
  recordId: string;
  fields: {
    Catalogue?: string | string[];
    unit_type?: string;
    max_stock?: number;
    Points?: number;
    price_aed?: number;
    property_price?: number;
    Picture?: Array<{ url: string; thumbnails?: { large?: { url?: string }; small?: { url?: string } } }>;
    damacIslandcode?: string;
    'BR Type'?: string;
    remaining_stock?: number;
    'Plot Area (sqft)'?: number;
    'Saleable Area (sqft)'?: number;
    released_status?: 'Available' | 'Not Released' | string;
  };
};

/**
 * Webhook endpoint for Airtable to sync unit_allocation records to Supabase
 * Handles both creation and updates with a single automation trigger
 *
 * Expected payload from Airtable automation:
 * {
 *   recordId: "recXXXXXXXXXXXX",
 *   fields: { ... all fields from loyalty_unit_allocation table }
 * }
 *
 * The upsert logic automatically handles:
 * - INSERT if recordId doesn't exist in Supabase
 * - UPDATE if recordId already exists
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret to prevent unauthorized access
    const webhookSecret = process.env.AIRTABLE_WEBHOOK_SECRET;
    const authHeader = req.headers.get('authorization');

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const payload = (await req.json()) as AirtableWebhookPayload;

    if (!payload.recordId) {
      return NextResponse.json(
        { error: 'Missing recordId' },
        { status: 400 }
      );
    }

    const { recordId, fields } = payload;

    // Extract Catalogue ID (first one if array)
    const catalogueIds = Array.isArray(fields.Catalogue)
      ? fields.Catalogue
      : typeof fields.Catalogue === 'string'
      ? [fields.Catalogue]
      : [];
    const catalogueId = catalogueIds[0] || null;

    // Extract picture URL
    const pictureAttachment =
      Array.isArray(fields.Picture) && fields.Picture.length > 0
        ? fields.Picture[0]
        : null;
    const pictureUrl =
      pictureAttachment?.thumbnails?.large?.url ||
      pictureAttachment?.url ||
      null;

    // Build Supabase payload
    const supabasePayload = {
      id: recordId,
      catalogue_id: catalogueId,
      unit_type: fields.unit_type || null,
      max_stock: typeof fields.max_stock === 'number' ? fields.max_stock : null,
      points: typeof fields.Points === 'number' ? fields.Points : null,
      picture_url: pictureUrl,
      price_aed: typeof fields.price_aed === 'number' ? fields.price_aed : null,
      property_price: typeof fields.property_price === 'number' ? fields.property_price : null,
      damac_island_code: fields.damacIslandcode || null,
      br_type: fields['BR Type'] || null,
      remaining_stock: typeof fields.remaining_stock === 'number' ? fields.remaining_stock : null,
      plot_area_sqft: typeof fields['Plot Area (sqft)'] === 'number' ? fields['Plot Area (sqft)'] : null,
      saleable_area_sqft: typeof fields['Saleable Area (sqft)'] === 'number' ? fields['Saleable Area (sqft)'] : null,
      released_status: fields.released_status || null,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Upsert to Supabase
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('unit_allocations' as never)
      .upsert(supabasePayload as never, {
        onConflict: 'id',
      })
      .select();

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json(
        { error: 'Failed to sync to Supabase', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      recordId,
      upserted: data?.length || 0,
      data: data?.[0] || null,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
