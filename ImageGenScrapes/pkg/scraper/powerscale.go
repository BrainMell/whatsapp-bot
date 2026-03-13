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

type VSBatleDetail struct {
	Name          string            `json:"name"`
	ImageURL      string            `json:"imageUrl"`
	Summary       string            `json:"summary"`
	Stats         map[string]string `json:"stats"`
	PageURL       string            `json:"pageUrl"`
}

// ScrapePowerscale handles the character stat extraction from VS Battles Wiki
func ScrapePowerscale(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		c.JSON(400, gin.H{"error": "Character name required"})
		return
	}

	var result *VSBatleDetail

	err := WithPage(func(page *rod.Page) error {
		// 1. Search Phase
		searchUrl := fmt.Sprintf("https://vsbattles.fandom.com/wiki/Special:Search?query=%s", url.QueryEscape(query))
		fmt.Printf("[Powerscale] Searching: %s\n", searchUrl)
		
		page.MustNavigate(searchUrl).MustWaitLoad()
		
		// Extract search result links
		links, err := page.Elements(".unified-search__result a")
		if err != nil || len(links) == 0 {
			return fmt.Errorf("no search results found")
		}

		searchURLs := []string{}
		for _, link := range links {
			href, _ := link.Attribute("href")
			if href != nil && strings.Contains(*href, "/wiki/") && 
			   !strings.Contains(*href, "Special:") && !strings.Contains(*href, "Category:") {
				searchURLs = append(searchURLs, *href)
			}
			if len(searchURLs) >= 3 { break } // Only try top 3
		}

		// 2. Iteration Phase
		for _, pageURL := range searchURLs {
			fmt.Printf("[Powerscale] Trying URL: %s\n", pageURL)
			
			// Navigate and wait for network idle to ensure images load
			page.MustNavigate(pageURL).MustWaitLoad()
			
			// Scroll to trigger lazy loading
			page.MustEval(`() => window.scrollTo(0, document.body.scrollHeight / 2)`)
			time.Sleep(2 * time.Second)

			// 3. Extraction Phase
			detail := extractVSBData(page)
			detail.PageURL = pageURL

			// Validation: Must have at least a Name and either an Image or some Stats
			if detail.Name != "" && (detail.ImageURL != "" || len(detail.Stats) > 0) {
				result = detail
				return nil // Success!
			}
			fmt.Printf("[Powerscale] Page skipped (insufficient data): %s\n", pageURL)
		}

		return fmt.Errorf("could not find valid character data after trying %d results", len(searchURLs))
	})

	if err != nil {
		c.JSON(404, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, result)
}

func extractVSBData(page *rod.Page) *VSBatleDetail {
	detail := &VSBatleDetail{
		Stats: make(map[string]string),
	}

	// Extract Name
	if nameEl, err := page.Element(".page-header__title"); err == nil {
		detail.Name = strings.TrimSpace(nameEl.MustText())
	}

	// Extract Image (Multi-Strategy)
	// Strategy 1: Infobox Thumbnail
	if img, err := page.Element(".pi-image-thumbnail"); err == nil {
		detail.ImageURL = cleanImageURL(img.MustAttribute("src"))
	}
	// Strategy 2: Any Wikia Image if Strategy 1 failed
	if detail.ImageURL == "" {
		imgs, _ := page.Elements("img")
		for _, img := range imgs {
			src, _ := img.Attribute("src")
			if src != nil && strings.Contains(*src, "static.wikia.nocookie.net") && !strings.Contains(*src, "Wikia-Visualization") {
				detail.ImageURL = cleanImageURL(src)
				break
			}
		}
	}

	// Extract Summary
	// Find first meaningful paragraph
	paras, _ := page.Elements("#mw-content-text p")
	for _, p := range paras {
		txt := strings.TrimSpace(p.MustText())
		if len(txt) > 50 {
			detail.Summary = cleanStatText(txt)
			break
		}
	}

	// Extract Stats (Regex on full text)
	fullText := page.MustElement("#mw-content-text").MustText()
	statFields := []string{"Tier", "Attack Potency", "Speed", "Durability", "Stamina", "Range", "Lifting Strength"}
	
	for _, field := range statFields {
		re := regexp.MustCompile("(?i)" + field + `\s*:\s*(.+)`)
		match := re.FindStringSubmatch(fullText)
		if len(match) > 1 {
			detail.Stats[field] = cleanStatText(match[1])
		}
	}

	return detail
}

func cleanImageURL(src *string) string {
	if src == nil { return "" }
	url := *src
	if strings.Contains(url, "/revision/") {
		return strings.Split(url, "/revision/")[0]
	}
	return url
}

func cleanStatText(text string) string {
	// 1. Peak Logic: Take last segment after '|'
	if strings.Contains(text, "|") {
		parts := strings.Split(text, "|")
		text = parts[len(parts)-1]
	}

	// 2. Remove Reference Brackets [1], [2] etc.
	reBrackets := regexp.MustCompile(`\[[^\]]+\]`)
	text = reBrackets.ReplaceAllString(text, "")

	// 3. Remove Parentheses (notes)
	reParens := regexp.MustCompile(`\([^)]+\)`)
	text = reParens.ReplaceAllString(text, "")

	return strings.TrimSpace(text)
}
