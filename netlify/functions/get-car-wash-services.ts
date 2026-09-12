import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    // No edge cache: admin updates to Catalogo Lavaggio (images, prices,
    // descriptions) must be visible on the next website refresh, not after
    // a 60-second TTL.
    'Cache-Control': 'no-store, must-revalidate',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const { data, error } = await supabase
      .from('car_wash_services')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) throw error

    // Map DB fields to website interface format
    const services = (data || []).map(s => ({
      id: s.id,
      name: s.name,
      nameEn: s.name_en || s.name,
      price: s.price,
      duration: s.duration || '-',
      description: s.description || '',
      descriptionEn: s.description_en || '',
      features: s.features || [],
      featuresEn: s.features_en || [],
      image: s.image_url || undefined,
      priceUnit: s.price_unit || undefined,
      priceOptions: s.price_options || undefined,
      // Pastiglia del catalogo (es. "CLASSICO"). Colonna aggiunta il
      // 12/09/2026: su un database senza la colonna resta semplicemente vuota,
      // perche' la select e' `*`.
      badge: s.badge || undefined,
      category: s.category,
      mainTab: s.main_tab,
    }))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ services }),
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
