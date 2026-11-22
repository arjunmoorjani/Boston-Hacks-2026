import { deleteUnfinishedActivity, resolvePlaceIds } from './activity-stops.mjs'

export async function saveOuting(name, googlePlaceIds) {
  const outingName = name.trim()
  const orderedIds = googlePlaceIds.map((id) => id.trim())

  if (!outingName) throw new Error('Enter an outing name.')
  if (!orderedIds.length) throw new Error('Add at least one stop.')
  if (orderedIds.some((id) => !id)) {
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

  const placeIds = await resolvePlaceIds(supabase, orderedIds)
  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .insert({ name: outingName })
    .select('id')
    .single()

  if (activityError?.code === '23505'
    && activityError.message?.includes('unique constraint "activities_user_name_unique"')) {
    throw new Error('You already have an outing with that name.')
  }
  if (activityError) throw activityError

  try {
    const { error: stopsError } = await supabase.from('activity_stops').insert(
      orderedIds.map((id, index) => ({
        activity_id: activity.id,
        place_id: placeIds.get(id),
        position: index + 1,
      })),
    )
    if (stopsError) throw stopsError
  } catch (stopsError) {
    await deleteUnfinishedActivity(supabase, activity.id)
    throw stopsError
  }

  return activity.id
}
