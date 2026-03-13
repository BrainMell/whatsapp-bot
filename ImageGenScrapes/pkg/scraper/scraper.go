package scraper

import (
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/gin-gonic/gin"
)

// =============================================================================
// CONFIGURATION
// =============================================================================

var (
	klipyAPIKey       string
	rapidAPIKey       string
	scrapeCreatorsKey string
	httpClient        *http.Client
	useScrapeCreators bool
	requestCount      int
	counterMutex      sync.Mutex
	userAgents        = []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
	}
)

func init() {
	klipyAPIKey = os.Getenv("KLIPY_API_KEY")
	rapidAPIKey = os.Getenv("RAPIDAPI_KEY")
	scrapeCreatorsKey = os.Getenv("SCRAPE_CREATORS_KEY")
	httpClient = &http.Client{Timeout: 30 * time.Second}
}

func incrementRequest() {
	counterMutex.Lock()
	defer counterMutex.Unlock()
	requestCount++
	if requestCount > 100 {
		useScrapeCreators = true
	}
}

func setFallbackMode(enabled bool) {
	counterMutex.Lock()
	defer counterMutex.Unlock()
	useScrapeCreators = enabled
}

func isFallbackMode() bool {
	counterMutex.Lock()
	defer counterMutex.Unlock()
	return useScrapeCreators
}

// =============================================================================
// IMAGE SEARCH - Pinterest (RapidAPI -> ScrapeCreators -> DDG)
// =============================================================================

func SearchPinterest(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		c.JSON(400, gin.H{"error": "Query required"})
		return
	}

	maxResults := 10
	if max := c.Query("maxResults"); max != "" {
		fmt.Sscanf(max, "%d", &maxResults)
	}

	incrementRequest()

	// 1. Try RapidAPI (Primary)
	if !isFallbackMode() && rapidAPIKey != "" {
		images, err := searchPinterestRapidAPI(query, maxResults)
		if err == nil && len(images) > 0 {
			c.JSON(200, gin.H{"images": images, "count": len(images), "source": "rapidapi"})
			return
		}
		fmt.Printf("[Pinterest] RapidAPI failed: %v\n", err)
	}

	// 2. Try ScrapeCreators (Fallback 1)
	if scrapeCreatorsKey != "" {
		images, err := searchPinterestScrapeCreators(query, maxResults)
		if err == nil && len(images) > 0 {
			c.JSON(200, gin.H{"images": images, "count": len(images), "source": "scrapecreators"})
			return
		}
		fmt.Printf("[Pinterest] ScrapeCreators failed: %v\n", err)
	}

	// 3. Final Fallback: DuckDuckGo
	images := searchImagesGeneric(query, maxResults)
	c.JSON(200, gin.H{"images": images, "count": len(images), "source": "ddg_robust"})
}

func searchPinterestRapidAPI(query string, limit int) ([]string, error) {
	// pinterest-search.p.rapidapi.com is a common provider
	apiURL := fmt.Sprintf("https://pinterest-search.p.rapidapi.com/search?query=%s", url.QueryEscape(query))
	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("X-RapidAPI-Key", rapidAPIKey)
	req.Header.Set("X-RapidAPI-Host", "pinterest-search.p.rapidapi.com")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		setFallbackMode(true)
		return nil, fmt.Errorf("rate limit exceeded")
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	
	// Try the most likely format: Array of image URLs
	var arrResult []string
	if err := json.Unmarshal(bodyBytes, &arrResult); err == nil && len(arrResult) > 0 {
		return limitResults(arrResult, limit), nil
	}

	// Try format: {"data": [...]}
	var dataResult struct {
		Data interface{} `json:"data"`
	}
	if err := json.Unmarshal(bodyBytes, &dataResult); err == nil {
		switch v := dataResult.Data.(type) {
		case []interface{}:
			urls := []string{}
			for _, item := range v {
				if s, ok := item.(string); ok {
					urls = append(urls, s)
				}
			}
			if len(urls) > 0 {
				return limitResults(urls, limit), nil
			}
		}
	}

	// Try standard Pinterest API structure
	var complexResult struct {
		Data []struct {
			Media struct {
				Images struct {
					Original struct {
						URL string `json:"url"`
					} `json:"original"`
				} `json:"images"`
			} `json:"media"`
		} `json:"data"`
	}
	if err := json.Unmarshal(bodyBytes, &complexResult); err == nil && len(complexResult.Data) > 0 {
		urls := []string{}
		for _, item := range complexResult.Data {
			if item.Media.Images.Original.URL != "" {
				urls = append(urls, item.Media.Images.Original.URL)
			}
		}
		return limitResults(urls, limit), nil
	}

	return nil, fmt.Errorf("could not parse pinterest response")
}

func searchPinterestScrapeCreators(query string, limit int) ([]string, error) {
	apiURL := fmt.Sprintf("https://app.scrapecreators.com/api/pinterest?query=%s&key=%s", url.QueryEscape(query), scrapeCreatorsKey)
	resp, err := httpClient.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Pins []struct {
			URL string `json:"url"`
		} `json:"pins"`
		Images []string `json:"images"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	urls := result.Images
	for _, pin := range result.Pins {
		if pin.URL != "" {
			urls = append(urls, pin.URL)
		}
	}

	return limitResults(deduplicateStrings(urls), limit), nil
}

func searchImagesGeneric(query string, limit int) []string {
	// DuckDuckGo search for images via HTML proxy
	searchURL := "https://html.duckduckgo.com/html/"
	formData := url.Values{}
	formData.Set("q", query+" photo")

	req, _ := http.NewRequest("POST", searchURL, strings.NewReader(formData.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", getRandomUA())

	resp, err := httpClient.Do(req)
	if err != nil {
		return []string{}
	}
	defer resp.Body.Close()

	return parseDDGHTML(resp.Body, limit)
}

func parseDDGHTML(body io.Reader, limit int) []string {
	doc, err := goquery.NewDocumentFromReader(body)
	if err != nil {
		return []string{}
	}

	var urls []string
	seen := make(map[string]bool)

	doc.Find("a.result__a").Each(func(i int, s *goquery.Selection) {
		if len(urls) >= limit {
			return
		}
		href, exists := s.Attr("href")
		if !exists {
			return
		}

		actual := ""
		if strings.Contains(href, "uddg=") {
			parts := strings.Split(href, "uddg=")
			if len(parts) > 1 {
				decoded, _ := url.QueryUnescape(parts[1])
				actual = strings.Split(decoded, "&")[0]
			}
		} else if strings.HasPrefix(href, "http") {
			actual = href
		}

		if actual != "" && isImageURL(actual) && !seen[actual] && !strings.Contains(actual, "duckduckgo.com") {
			seen[actual] = true
			urls = append(urls, actual)
		}
	})

	return urls
}

func isImageURL(url string) bool {
	l := strings.ToLower(url)
	return strings.HasSuffix(l, ".jpg") || strings.HasSuffix(l, ".jpeg") ||
		strings.HasSuffix(l, ".png") || strings.HasSuffix(l, ".gif") ||
		strings.HasSuffix(l, ".webp")
}

// =============================================================================
// STICKERS - (RapidAPI -> ScrapeCreators -> Klipy)
// =============================================================================

func SearchStickers(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		c.JSON(400, gin.H{"error": "Query required"})
		return
	}

	incrementRequest()

	// 1. Try RapidAPI (Primary)
	if !isFallbackMode() && rapidAPIKey != "" {
		stickers, err := searchStickersRapidAPI(query)
		if err == nil && len(stickers) > 0 {
			c.JSON(200, gin.H{"stickers": stickers, "count": len(stickers), "source": "rapidapi"})
			return
		}
	}

	// 2. Try ScrapeCreators (Fallback 1)
	if scrapeCreatorsKey != "" {
		stickers, err := searchStickersScrapeCreators(query)
		if err == nil && len(stickers) > 0 {
			c.JSON(200, gin.H{"stickers": stickers, "count": len(stickers), "source": "scrapecreators"})
			return
		}
	}

	// 3. Final Fallback: Klipy (Official V1)
	if klipyAPIKey == "" {
		c.JSON(404, gin.H{"error": "Sticker search unavailable (KLIPY_API_KEY not set)"})
		return
	}
	
	apiURL := "https://api.klipy.com/api/v1/stickers/search?q=" + url.QueryEscape(query) + "&per_page=10"
	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("x-api-key", klipyAPIKey)
	req.Header.Set("User-Agent", getRandomUA())

	resp, err := httpClient.Do(req)
	if err != nil {
		c.JSON(500, gin.H{"error": "Klipy API request failed"})
		return
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			Images struct {
				Original struct {
					URL string `json:"url"`
				} `json:"original"`
			} `json:"images"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err == nil && len(result.Data) > 0 {
		stickers := []string{}
		for _, item := range result.Data {
			if item.Images.Original.URL != "" {
				stickers = append(stickers, item.Images.Original.URL)
			}
		}
		c.JSON(200, gin.H{"stickers": stickers, "count": len(stickers), "source": "klipy"})
		return
	}

	c.JSON(404, gin.H{"error": "No stickers found"})
}

func searchStickersRapidAPI(query string) ([]string, error) {
	apiURL := fmt.Sprintf("https://giphy.p.rapidapi.com/v1/stickers/search?q=%s&limit=10", url.QueryEscape(query))
	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("X-RapidAPI-Key", rapidAPIKey)
	req.Header.Set("X-RapidAPI-Host", "giphy.p.rapidapi.com")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		setFallbackMode(true)
		return nil, fmt.Errorf("rate limit exceeded")
	}

	var result struct {
		Data []struct {
			Images struct {
				Original struct {
					URL string `json:"url"`
				} `json:"original"`
			} `json:"images"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	stickers := []string{}
	for _, item := range result.Data {
		if item.Images.Original.URL != "" {
			stickers = append(stickers, item.Images.Original.URL)
		}
	}
	return stickers, nil
}

func searchStickersScrapeCreators(query string) ([]string, error) {
	apiURL := fmt.Sprintf("https://app.scrapecreators.com/api/stickers?query=%s&key=%s", url.QueryEscape(query), scrapeCreatorsKey)
	resp, err := httpClient.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Stickers []string `json:"stickers"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Stickers, nil
}

// =============================================================================
// VS BATTLES - Official MediaWiki API
// =============================================================================

func SearchVSBattles(c *gin.Context) {
	query := c.Query("query")
	apiURL := fmt.Sprintf("https://vsbattles.fandom.com/api.php?action=query&list=search&srsearch=%s&format=json&srlimit=5", url.QueryEscape(query))
	
	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("User-Agent", getRandomUA())
	
	resp, err := httpClient.Do(req)
	if err != nil {
		c.JSON(500, gin.H{"error": "Search failed"})
		return
	}
	defer resp.Body.Close()

	var result struct {
		Query struct {
			Search []struct {
				Title string `json:"title"`
			} `json:"search"`
		} `json:"query"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		c.JSON(500, gin.H{"error": "Failed to parse search results"})
		return
	}

	characters := []gin.H{}
	for _, s := range result.Query.Search {
		pageURL := "https://vsbattles.fandom.com/wiki/" + url.PathEscape(strings.ReplaceAll(s.Title, " ", "_"))
		characters = append(characters, gin.H{"name": s.Title, "url": pageURL})
	}

	c.JSON(200, gin.H{"characters": characters})
}

func GetVSBattlesDetail(c *gin.Context) {
	pageURL := c.Query("url")
	
	parts := strings.Split(pageURL, "/wiki/")
	if len(parts) < 2 {
		c.JSON(400, gin.H{"error": "Invalid URL"})
		return
	}
	title := parts[1]

	apiURL := fmt.Sprintf("https://vsbattles.fandom.com/api.php?action=parse&page=%s&prop=text|images&format=json&redirects=true", title)
	
	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("User-Agent", getRandomUA())
	
	resp, err := httpClient.Do(req)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch character detail"})
		return
	}
	defer resp.Body.Close()

	var result struct {
		Parse struct {
			Text struct {
				Content string `json:"*"`
			} `json:"text"`
		} `json:"parse"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		c.JSON(500, gin.H{"error": "Failed to parse character data"})
		return
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(result.Parse.Text.Content))
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to process character HTML"})
		return
	}

	detail := gin.H{
		"tier":          "Unknown",
		"attackPotency": "N/A",
		"speed":         "N/A",
		"durability":    "N/A",
		"stamina":       "N/A",
		"range":         "N/A",
		"summary":       "",
		"imageUrl":      "",
	}

	// Official Fandom Infobox Parsing
	doc.Find(".pi-item").Each(func(i int, s *goquery.Selection) {
		label := strings.TrimSpace(s.Find(".pi-data-label").Text())
		value := strings.TrimSpace(s.Find(".pi-data-value").Text())

		value = regexp.MustCompile(`\[.*?\]`).ReplaceAllString(value, "")
		value = strings.Split(value, "(")[0]
		value = strings.TrimSpace(value)

		switch {
		case strings.Contains(label, "Tier"): detail["tier"] = value
		case strings.Contains(label, "Attack Potency"): detail["attackPotency"] = value
		case strings.Contains(label, "Speed"): detail["speed"] = value
		case strings.Contains(label, "Durability"): detail["durability"] = value
		case strings.Contains(label, "Stamina"): detail["stamina"] = value
		case strings.Contains(label, "Range"): detail["range"] = value
		}
	})

	// Accurate Image Selection
	img, _ := doc.Find("img.pi-image-thumbnail").Attr("src")
	if img == "" {
		img, _ = doc.Find(".thumbimage").Attr("src")
	}
	if img != "" {
		detail["imageUrl"] = strings.Split(img, "/revision/")[0]
	}

	// First meaningful paragraph
	doc.Find("p").EachWithBreak(func(i int, s *goquery.Selection) bool {
		txt := strings.TrimSpace(s.Text())
		if len(txt) > 60 {
			detail["summary"] = strings.Split(txt, ".")[0] + "."
			return false
		}
		return true
	})

	c.JSON(200, detail)
}

// =============================================================================
// NSFW SEARCH - Gelbooru (Official DAPI)
// =============================================================================

func SearchRule34(c *gin.Context) {
	query := c.Query("query")
	
	// Gelbooru DAPI Documentation: https://gelbooru.com/index.php?page=help&topic=dapi
	apiURL := fmt.Sprintf("https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=10&tags=%s", url.QueryEscape(query))

	userID := os.Getenv("GELBOORU_USER_ID")
	apiKey := os.Getenv("GELBOORU_API_KEY")
	if userID != "" && apiKey != "" {
		apiURL += fmt.Sprintf("&user_id=%s&api_key=%s", userID, apiKey)
	}

	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("User-Agent", getRandomUA())

	resp, err := httpClient.Do(req)
	images := []string{}

	if err == nil {
		defer resp.Body.Close()
		bodyBytes, _ := io.ReadAll(resp.Body)
		
		// Handle Gelbooru JSON object format: {"post": [...]}
		var objResult struct {
			Post []struct {
				FileURL string `json:"file_url"`
			} `json:"post"`
		}
		if err := json.Unmarshal(bodyBytes, &objResult); err == nil && len(objResult.Post) > 0 {
			for _, p := range objResult.Post {
				if p.FileURL != "" {
					images = append(images, p.FileURL)
				}
			}
		} else {
			// Handle direct array format
			var arrResult []struct {
				FileURL string `json:"file_url"`
			}
			if err := json.Unmarshal(bodyBytes, &arrResult); err == nil {
				for _, p := range arrResult {
					if p.FileURL != "" {
						images = append(images, p.FileURL)
					}
				}
			}
		}
	}

	if len(images) == 0 {
		images = scrapeGelbooruWeb(query, 10)
	}

	c.JSON(200, gin.H{"images": images, "count": len(images), "source": "gelbooru"})
}

func scrapeGelbooruWeb(query string, limit int) []string {
	tag := strings.ReplaceAll(query, " ", "_")
	searchURL := fmt.Sprintf("https://gelbooru.com/index.php?page=post&s=list&tags=%s", url.QueryEscape(tag))
	req, _ := http.NewRequest("GET", searchURL, nil)
	req.Header.Set("User-Agent", getRandomUA())
	resp, err := httpClient.Do(req)
	if err != nil {
		return []string{}
	}
	defer resp.Body.Close()

	doc, _ := goquery.NewDocumentFromReader(resp.Body)
	images := []string{}
	doc.Find("article.thumbnail-preview").Each(func(i int, s *goquery.Selection) {
		if len(images) < limit {
			link, exists := s.Find("a").Attr("href")
			if exists {
				img := getGelbooruImageDirect(link)
				if img != "" {
					images = append(images, img)
				}
			}
		}
	})
	return images
}

func getGelbooruImageDirect(postURL string) string {
	if !strings.HasPrefix(postURL, "http") {
		postURL = "https://gelbooru.com/" + strings.TrimPrefix(postURL, "/")
	}

	req, _ := http.NewRequest("GET", postURL, nil)
	req.Header.Set("User-Agent", getRandomUA())
	resp, err := httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	doc, _ := goquery.NewDocumentFromReader(resp.Body)
	src, _ := doc.Find("#image").Attr("src")
	if src == "" {
		src, _ = doc.Find("meta[property='og:image']").Attr("content")
	}
	return src
}

func getRandomUA() string {
	return userAgents[rand.Intn(len(userAgents))]
}

func deduplicateStrings(input []string) []string {
	seen := make(map[string]bool)
	result := []string{}
	for _, str := range input {
		if !seen[str] && str != "" {
			seen[str] = true
			result = append(result, str)
		}
	}
	return result
}

func limitResults(res []string, limit int) []string {
	if len(res) > limit {
		return res[:limit]
	}
	return res
}
