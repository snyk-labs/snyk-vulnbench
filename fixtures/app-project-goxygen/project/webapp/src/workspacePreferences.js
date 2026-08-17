export function restoreWorkspacePreferences() {
  const params = new URLSearchParams(window.location.search)
  const section = params.get('section') || 'dashboard'
  const key = params.get('key') || 'layout'
  const value = params.get('value') || 'comfortable'
  const preferences = {
    dashboard: {},
    catalog: {},
    branding: {}
  }
  const sectionPreferences =
    preferences[section] || (preferences[section] = {})

  sectionPreferences[key] = value
  return preferences
}
