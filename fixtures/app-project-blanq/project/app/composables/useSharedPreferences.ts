export function useSharedPreferences() {
  if (!import.meta.client) {
    return { preferences: {}, displayPreferences: {} }
  }

  const params = new URLSearchParams(window.location.search)
  const section = params.get('section') || 'landing'
  const key = params.get('key') || 'layout'
  const value = params.get('value') || ''
  const preferences: Record<string, Record<string, string>> = {
    landing: {},
    pricing: {},
  }
  const sectionPreferences = preferences[section] || (preferences[section] = {})

  sectionPreferences[key] = value

  const displayPreferences: Record<string, Record<string, string>> = {
    landing: {},
    pricing: {},
  }
  const displaySection = displayPreferences[section] || (displayPreferences[section] = {})

  displaySection.display = value

  return { preferences, displayPreferences }
}
