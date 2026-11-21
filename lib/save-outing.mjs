async function findPlace(supabase, googlePlaceId) {
  return supabase
    .from('places')
    .select('id')
    .eq('google_place_id', googlePlaceId)
    .maybeSingle()
}

async function findOrInsertPlace(supabase, googlePlaceId) {
  const { data: existing, error: lookupError } = await findPlace(supabase, googlePlaceId)
  if (lookupError) throw lookupError
  if (existing) return existing.id

  const { data: inserted, error: insertError } = await supabase
    .from('places')
    .insert({ google_place_id: googlePlaceId })
    .select('id')
    .single()

  if (!insertError) return inserted.id
  if (insertError.code !== '23505') throw insertError

  // Another save may have inserted this Google Place ID after our lookup.
  const { data: concurrent, error: retryError } = await findPlace(supabase, googlePlaceId)
  if (retryError) throw retryError
  if (!concurrent) throw insertError
  return concurrent.id
}

export async function saveOuting(name, googlePlaceIds) {
  const outingName = name.trim()
  const orderedIds = googlePlaceIds.map((id) => id.trim())

  if (!outingName) throw new Error('Enter an outing name.')
  if (!orderedIds.length || orderedIds.some((id) => !id)) {
    throw new Error('Enter a Google Place ID for each stop.')
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('Use a different Google Place ID for each stop.')
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Configure the Supabase URL and publishable key in .env.local before saving.')
  }

  const { supabase } = await import('./supabase.mjs')
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!session) {
    const { error: signInError } = await supabase.auth.signInAnonymously()
    if (signInError) throw signInError
  }

  const placeIds = await Promise.all(orderedIds.map((id) => findOrInsertPlace(supabase, id)))
  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .insert({ name: outingName })
    .select('id')
    .single()

  if (activityError?.code === '23505') {
    throw new Error('You already have an outing with that name.')
  }
  if (activityError) throw activityError

  const { error: stopsError } = await supabase.from('activity_stops').insert(
    placeIds.map((placeId, index) => ({
      activity_id: activity.id,
      place_id: placeId,
      position: index + 1,
    })),
  )

  if (stopsError) {
    const { data: deleted, error: cleanupError } = await supabase
      .from('activities')
      .delete()
      .eq('id', activity.id)
      .select('id')

    if (cleanupError || !deleted?.length) {
      throw new Error('Could not confirm cleanup after saving the stops failed. The outing may still exist.')
    }
    throw stopsError
  }

  return activity.id
}
