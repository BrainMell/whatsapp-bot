package scraper

import (
	"fmt"
	"sync"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
)

var (
	browser     *rod.Browser
	browserOnce sync.Once
	pagePool    chan *rod.Page
)

// InitBrowser initializes the global Rod browser instance.
// It uses a persistent connection to a single browser process.
func InitBrowser() {
	browserOnce.Do(func() {
		fmt.Println("🚀 Initializing Rod Browser Engine...")

		// Launch a new browser with default options (headless)
		u := launcher.New().
			Headless(true).
			NoSandbox(true). // Critical for container/server environments
			MustLaunch()

		browser = rod.New().
			ControlURL(u).
			MustConnect()

		// Initialize a page pool to limit concurrency (max 3 tabs)
		pagePool = make(chan *rod.Page, 3)

		fmt.Println("✅ Rod Browser Engine Ready!")
	})
}

// WithPage safely acquires a page from the browser, runs the given function,
// and ensures the page is closed/cleaned up afterwards.
func WithPage(action func(*rod.Page) error) error {
	// Ensure browser is running
	if browser == nil {
		InitBrowser()
	}

	// Acquire slot
	pagePool <- nil
	defer func() { <-pagePool }() // Release slot

	// Create new incognito page
	page, err := browser.MustIncognito().Page(proto.TargetCreateTarget{URL: "about:blank"})
	if err != nil {
		return fmt.Errorf("failed to create page: %v", err)
	}
	defer page.MustClose() // Always close the page when done

	// Run the scraper logic
	return action(page)
}

// CloseBrowser shuts down the browser process.
func CloseBrowser() {
	if browser != nil {
		browser.MustClose()
	}
}
