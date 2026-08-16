package apicounter

import "sync/atomic"

// Global atomic counters for integration API call tracking.
// These are incremented by the respective services and
// snapshot/reset by the health collector every 60 seconds.

var (
	StripeAPICalls  atomic.Int64
	ResendEmails    atomic.Int64
	DataDogAPICalls atomic.Int64
)
