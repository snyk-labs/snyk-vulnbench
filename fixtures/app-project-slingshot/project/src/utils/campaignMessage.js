export function getCampaignMessage() {
  const params = new URLSearchParams(window.location.search);
  return params.get('campaign');
}
