package scraper

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-rod/rod"
)

type Rule34PostData struct {
	FileURL string `json:"file_url"`
	ID      string `json:"id"`
}

// ScrapeRule34 handles deep scraping for full-resolution images/videos
func ScrapeRule34(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		c.JSON(400, gin.H{"error": "Search query required"})
		return
	}

	maxResults := 10
	if max := c.Query("count"); max != "" {
		fmt.Sscanf(max, "%d", &maxResults)
	}

	tag := strings.TrimSpace(query)
	tag = strings.ReplaceAll(tag, " ", "_")

	// 1. Try API First (Fast)
	apiURL := fmt.Sprintf("https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=50&tags=%s", url.QueryEscape(tag))
	
	resp, err := http.Get(apiURL)
	var images []string

	if err == nil {
		defer resp.Body.Close()
		var posts []Rule34PostData
		if err := json.NewDecoder(resp.Body).Decode(&posts); err == nil && len(posts) > 0 {
			for _, p := range posts {
				if p.FileURL != "" {
					u := p.FileURL
					if strings.HasPrefix(u, "//") { u = "https:" + u }
					images = append(images, u)
				}
				if len(images) >= maxResults { break }
			}
		}
	}

	// 2. If API fails or is empty, use Deep Browser Scrape
	if len(images) == 0 {
		fmt.Printf("[Rule34] API failed or empty, starting deep browser scrape for: %s\n", tag)
		
		err := WithPage(func(page *rod.Page) error {
			searchURL := fmt.Sprintf("https://rule34.xxx/index.php?page=post&s=list&tags=%s", url.QueryEscape(tag))
			page.MustNavigate(searchURL).MustWaitLoad()

			// Extract post links
			links, _ := page.Elements(".thumb a")
			var postURLs []string
			for _, l := range links {
				href, _ := l.Attribute("href")
				if href != nil {
					postURLs = append(postURLs, "https://rule34.xxx/"+strings.TrimPrefix(*href, "/"))
				}
				if len(postURLs) >= maxResults { break }
			}

			// Visit each post to get full-res
			for _, postURL := range postURLs {
				page.MustNavigate(postURL).MustWaitLoad()
				
				// Deep extraction strategies
				src := ""
				// Strategy 1: Image element
				if img, err := page.Element("#image"); err == nil {
					if attr, _ := img.Attribute("src"); attr != nil {
						src = *attr
					}
				}
				// Strategy 2: Video source
				if src == "" {
					if vid, err := page.Element("video source"); err == nil {
						if attr, _ := vid.Attribute("src"); attr != nil {
							src = *attr
						}
					}
				}
				// Strategy 3: Meta property
				if src == "" {
					if meta, err := page.Element("meta[property='og:image']"); err == nil {
						if attr, _ := meta.Attribute("content"); attr != nil {
							src = *attr
						}
					}
				}

				if src != "" {
					if strings.HasPrefix(src, "//") { src = "https:" + src }
					images = append(images, src)
				}
			}

			return nil
		})

		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(200, gin.H{
		"images": images,
		"count":  len(images),
		"source": "rule34_deep",
	})
}
