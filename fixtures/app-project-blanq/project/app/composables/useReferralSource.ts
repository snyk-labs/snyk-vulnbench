export function useReferralSource() {
  if (!import.meta.client) {
    return ''
  }

  const params = new URLSearchParams(window.location.search)
  return document.referrer || params.get('referrer') || ''
}

export function renderReferralSource() {
  const params = new URLSearchParams(window.location.search)
  const referralSource = document.referrer || params.get('referrer')
  const referralElement = document.getElementById('referral-source')

  if (referralElement && referralSource) {
    referralElement.innerHTML = `Referral source: ${referralSource}`
  }
}
