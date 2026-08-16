package apicounter

import (
	"sync"
	"testing"
)

func TestStripeAPICallsIncrement(t *testing.T) {
	StripeAPICalls.Store(0)
	StripeAPICalls.Add(1)
	StripeAPICalls.Add(1)
	StripeAPICalls.Add(1)
	if got := StripeAPICalls.Load(); got != 3 {
		t.Errorf("expected 3, got %d", got)
	}
}

func TestResendEmailsIncrement(t *testing.T) {
	ResendEmails.Store(0)
	ResendEmails.Add(1)
	ResendEmails.Add(1)
	if got := ResendEmails.Load(); got != 2 {
		t.Errorf("expected 2, got %d", got)
	}
}

func TestSwapResets(t *testing.T) {
	StripeAPICalls.Store(0)
	StripeAPICalls.Add(5)
	val := StripeAPICalls.Swap(0)
	if val != 5 {
		t.Errorf("expected swap to return 5, got %d", val)
	}
	if got := StripeAPICalls.Load(); got != 0 {
		t.Errorf("expected 0 after swap, got %d", got)
	}
}

func TestConcurrentIncrements(t *testing.T) {
	StripeAPICalls.Store(0)
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			StripeAPICalls.Add(1)
		}()
	}
	wg.Wait()
	if got := StripeAPICalls.Load(); got != 100 {
		t.Errorf("expected 100, got %d", got)
	}
}
