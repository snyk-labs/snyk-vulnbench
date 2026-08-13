export function getSharedPreferences() {
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section') || 'dashboard';
  const key = params.get('key') || 'layout';
  const value = params.get('value') || '';
  const preferences = {
    dashboard: {},
    calculator: {}
  };
  const sectionPreferences = preferences[section] || (preferences[section] = {});

  sectionPreferences[key] = value;
  return {
    preferences
  };
}

export function getDisplayPreferences() {
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section') || 'dashboard';
  const value = params.get('value') || '';
  const displayPreferences = {
    dashboard: {},
    calculator: {}
  };
  const displaySection = displayPreferences[section] || (displayPreferences[section] = {});

  displaySection.display = value;
  return { preferences: displayPreferences };
}
