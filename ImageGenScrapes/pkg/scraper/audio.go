package scraper

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	"github.com/gin-gonic/gin"
)

type AudioMetadata struct {
	Title     string `json:"title"`
	Author    string `json:"author"`
	Thumbnail string `json:"thumbnail"`
	Duration  string `json:"duration"`
	URL       string `json:"url"`
}

// ScrapeAudio handles YouTube searching and audio extraction via yt-dlp
func ScrapeAudio(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		c.JSON(400, gin.H{"error": "Search query required"})
		return
	}

	fmt.Printf("[Audio] Processing query: %s\n", query)

	// 1. Search for the video using yt-dlp (get metadata)
	// We use "ytsearch1:" to find the first result
	cmd := exec.Command("yt-dlp", 
		"--dump-json", 
		"--no-playlist", 
		"--flat-playlist", 
		"ytsearch1:"+query)
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("[Audio] yt-dlp search error: %v, output: %s\n", err, string(output))
		c.JSON(500, gin.H{"error": "Failed to find video"})
		return
	}

	var metadata map[string]interface{}
	if err := json.Unmarshal(output, &metadata); err != nil {
		c.JSON(500, gin.H{"error": "Failed to parse video metadata"})
		return
	}

	videoURL := fmt.Sprintf("%v", metadata["webpage_url"])
	title := fmt.Sprintf("%v", metadata["title"])
	author := fmt.Sprintf("%v", metadata["uploader"])
	thumb := fmt.Sprintf("%v", metadata["thumbnail"])
	duration := fmt.Sprintf("%v", metadata["duration_string"])

	// 2. Return metadata to the client
	// The actual download will be handled as a separate request or 
	// we can provide the direct audio link if yt-dlp can get it fast.
	
	// Getting direct audio URL
	cmdURL := exec.Command("yt-dlp", "-f", "bestaudio", "--get-url", videoURL)
	directURLBytes, _ := cmdURL.CombinedOutput()
	directURL := strings.TrimSpace(string(directURLBytes))

	c.JSON(200, gin.H{
		"metadata": AudioMetadata{
			Title:     title,
			Author:    author,
			Thumbnail: thumb,
			Duration:  duration,
			URL:       videoURL,
		},
		"audioURL": directURL,
	})
}
