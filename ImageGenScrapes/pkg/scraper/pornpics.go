package scraper

import (
	"fmt"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-rod/rod"
)

type ImageCandidate struct {
	URL   string `json:"url"`
	Score int    `json:"score"`
}

// ScrapePornPics handles image searching with quality-score-based filtering
func ScrapePornPics(c *gin.Context) {
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
		searchURL := fmt.Sprintf("https://www.pornpics.com/?q=%s", url.QueryEscape(query))
		fmt.Printf("[PornPics] Searching: %s\n", searchURL)

		page.MustNavigate(searchURL).MustWaitLoad()

		// 1. Scroll Loop to trigger lazy-loaded images (ll-loaded)
		scrolls := maxResults / 5
		if scrolls < 2 { scrolls = 2 }
		if scrolls > 5 { scrolls = 5 }

		for i := 0; i < scrolls; i++ {
			page.MustEval(`() => window.scrollBy(0, Math.round(window.innerHeight * 1.2))`)
			time.Sleep(1 * time.Second)
		}

		// 2. Extract with Quality Score (Inject JS to calculate dimensions)
		result, err := page.Eval(`() => {
			const candidates = [];
			const selectors = ['img.ll-loaded', 'img[data-src]', 'article img', 'div.thumb img', 'img'];
			const seen = new Set();

			for (const sel of selectors) {
				const nodes = document.querySelectorAll(sel);
				for (const img of nodes) {
					let url = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
					if (!url || !url.startsWith('http') || seen.has(url)) continue;
					seen.add(url);

					// Quality Score: Width * Height
					const score = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
					candidates.push({ url, score });
				}
			}
			// Sort by best quality first
			return candidates.sort((a,b) => b.score - a.score);
		}`)

		if err != nil {
			return fmt.Errorf("failed to evaluate page script: %v", err)
		}

		// Parse candidates correctly from proto.RuntimeRemoteObject
		var candidates []ImageCandidate
		result.Value.Unmarshal(&candidates)

		// 3. Filter and Skip Logic
		filteredCount := 0
		for i, cand := range candidates {
			if i == 0 { continue } // SKIP FIRST WEIRD FILE
			if cand.Score > 40000 {
				imageUrls = append(imageUrls, cand.URL)
				filteredCount++
			}
			if filteredCount >= maxResults {
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
