export function getReferralSource() {
  const params = new URLSearchParams(window.location.search);
  return document.referrer || params.get('referrer');
}
