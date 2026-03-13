package scraper

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-rod/rod"
)

// ScrapeAnikai handles resolving the best match watch link on anikai.to
func ScrapeAnikai(c *gin.Context) {
	title := c.Query("title")
	if title == "" {
		c.JSON(400, gin.H{"error": "Title required"})
		return
	}

	var watchLink string

	err := WithPage(func(page *rod.Page) error {
		searchURL := fmt.Sprintf("https://anikai.to/browser?keyword=%s", url.QueryEscape(title))
		fmt.Printf("[Anikai] Searching: %s\n", searchURL)

		page.MustNavigate(searchURL).MustWaitLoad()

		// Extract first watch link
		link, err := page.Element(`a[href*="/watch/"]`)
		if err != nil {
			watchLink = searchURL // Fallback to search page
			return nil
		}

		href, _ := link.Attribute("href")
		if href != nil {
			if strings.HasPrefix(*href, "/") {
				watchLink = "https://anikai.to" + *href + "#ep=1"
			} else {
				watchLink = *href + "#ep=1"
			}
		}

		return nil
	})

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"watchLink": watchLink})
}

// ScrapeAnimeNews handles scraping latest news from Anime Corner
func ScrapeAnimeNews(c *gin.Context) {
	var articles []gin.H

	err := WithPage(func(page *rod.Page) error {
		newsURL := "https://animecorner.me/category/anime-news/"
		fmt.Printf("[AnimeNews] Scraping: %s\n", newsURL)

		page.MustNavigate(newsURL).MustWaitLoad()

		// Extract article cards
		cards, _ := page.Elements("article")
		
		limit := 5
		if len(cards) < limit { limit = len(cards) }

		for i := 0; i < limit; i++ {
			card := cards[i]
			titleEl, _ := card.Element("h2, h3")
			linkEl, _ := card.Element("a")
			imgEl, _ := card.Element("img")

			title := ""
			if titleEl != nil { title = strings.TrimSpace(titleEl.MustText()) }

			link := ""
			if linkEl != nil { 
				l, _ := linkEl.Attribute("href")
				if l != nil { link = *l }
			}

			img := ""
			if imgEl != nil {
				src, _ := imgEl.Attribute("data-src")
				if src == nil { src, _ = imgEl.Attribute("src") }
				if src != nil { img = *src }
			}

			if title != "" && link != "" {
				articles = append(articles, gin.H{
					"title": title,
					"link":  link,
					"img":   img,
				})
			}
		}

		return nil
	})

	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"articles": articles})
}
