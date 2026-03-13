package scraper

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-rod/rod"
)

// ScrapePinterest handles image searching and HD URL rewriting
func ScrapePinterest(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		c.JSON(400, gin.H{"error": "Search query required"})
		return
	}

	maxResults := 10
	if max := c.Query("count"); max != "" {
		fmt.Sscanf(max, "%d", &maxResults)
	}

	var imageUrls []string

	err := WithPage(func(page *rod.Page) error {
		searchURL := fmt.Sprintf("https://www.pinterest.com/search/pins/?q=%s", url.QueryEscape(query))
		fmt.Printf("[Pinterest] Searching: %s\n", searchURL)

		page.MustNavigate(searchURL).MustWaitLoad()

		// 1. Scroll Loop to trigger lazy loading
		scrolls := maxResults / 10
		if scrolls < 2 { scrolls = 2 }
		if scrolls > 5 { scrolls = 5 }

		for i := 0; i < scrolls; i++ {
			page.MustEval(`() => window.scrollBy(0, 1000)`)
			time.Sleep(1 * time.Second)
		}

		// 2. Extract and Transform
		imgElements, _ := page.Elements(`div[data-test-id="pinWrapper"] img`)
		
		seen := make(map[string]bool)
		for _, img := range imgElements {
			src, _ := img.Attribute("src")
			if src != nil && strings.Contains(*src, "pinimg.com") {
				// HD Transformation: Replace 236x or 474x with 736x
				re := regexp.MustCompile(`(236x|474x)`)
				hdURL := re.ReplaceAllString(*src, "736x")
				
				if !seen[hdURL] {
					seen[hdURL] = true
					imageUrls = append(imageUrls, hdURL)
				}
			}
			if len(imageUrls) >= maxResults {
				break
			}
		}

		return nil
	})

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{
		"images": imageUrls,
		"count":  len(imageUrls),
	})
}
