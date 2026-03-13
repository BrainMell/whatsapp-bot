package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

	"image-service/pkg/cards"
	"image-service/pkg/chess"
	"image-service/pkg/combat"
	"image-service/pkg/ludo"
	"image-service/pkg/scraper"
	"image-service/pkg/ttt"
)

func main() {
	fmt.Println("🚀 Go Image & Scraper Service")
	fmt.Println("🚀 Chrome-Enhanced, API-driven scraping")

	// Initialize Rod Browser Engine on startup
	scraper.InitBrowser()
	defer scraper.CloseBrowser()

	// Set Gin to release mode for production
	gin.SetMode(gin.ReleaseMode)
	port := os.Getenv("PORT")
	if port == "" {
		port = "7860"
	}
	r := gin.Default()

	// Global Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Next()
	})

	// Root Endpoint
	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "online",
			"service": "Go Image & Scraper Service",
			"version": "3.0.0",
			"features": []string{
				"Browser-based Pinterest & PornPics",
				"Deep Rule34 Scrape",
				"Rod-powered VS Battles Powerscaling",
				"YouTube Audio Search & DL",
				"Anime Corner News & Anikai Resolver",
				"Animated Card GIFs",
			},
		})
	})

	// Health Check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// API Group
	api := r.Group("/api")
	{
		// Combat
		api.POST("/combat", combat.GenerateCombatImage)
		api.POST("/combat/endscreen", combat.GenerateEndScreen)

		// Games
		api.POST("/ludo", ludo.RenderBoard)
		api.POST("/ttt", ttt.RenderBoard)
		api.POST("/ttt/leaderboard", ttt.RenderLeaderboard)
		api.POST("/chess", chess.RenderBoard)

		// Cards
		api.POST("/cards/gif", cards.GenerateCardGif)
		api.POST("/cards/burn", cards.GenerateBurnGif)
		api.POST("/cards/convert", cards.ConvertCard)

		// Scrapers (Chrome-powered endpoints)
		scrape := api.Group("/scrape")
		{
			// Standard Scrapers
			scrape.GET("/pinterest", scraper.ScrapePinterest)
			scrape.GET("/stickers", scraper.SearchStickers)
			scrape.GET("/rule34", scraper.ScrapeRule34)
			
			// New Chrome-powered scrapers
			scrape.GET("/powerscale", scraper.ScrapePowerscale)
			scrape.GET("/pornpics", scraper.ScrapePornPics)
			scrape.GET("/audio", scraper.ScrapeAudio)
			scrape.GET("/anikai", scraper.ScrapeAnikai)
			scrape.GET("/news", scraper.ScrapeAnimeNews)
		}
	}

	log.Printf("🚀 Go Service starting on port %s", port)
	if err := r.Run("0.0.0.0:" + port); err != nil {
		log.Fatal("Failed to start server: ", err)
	}
}
