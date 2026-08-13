export function useCampaignMessage() {
  if (!import.meta.client) {
    return ''
  }

  const params = new URLSearchParams(window.location.search)
  return params.get('campaign') || ''
}

export function renderCampaignMessage() {
  const params = new URLSearchParams(window.location.search)
  const campaignMessage = params.get('campaign')
  const campaignElement = document.getElementById('campaign-message')

  if (campaignElement && campaignMessage) {
    campaignElement.innerHTML = campaignMessage
  }
}
