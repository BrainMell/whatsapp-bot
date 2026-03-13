package scraper

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

type YoutubeVideo struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Thumbnail string `json:"thumbnail"`
	URL       string `json:"url"`
	Duration  string `json:"duration"`
}

func SearchYoutube(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		c.JSON(400, gin.H{"error": "Query required"})
		return
	}

	// Use yt-dlp to search
	cmd := exec.Command("yt-dlp",
		"ytsearch5:"+query,
		"--dump-json",
		"--flat-playlist",
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(500, gin.H{"error": "Search failed", "details": string(output)})
		return
	}

	lines := strings.Split(string(output), "\n")
	var videos []YoutubeVideo

	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}

		var entry struct {
			ID        string  `json:"id"`
			Title     string  `json:"title"`
			Thumbnail string  `json:"thumbnail"`
			Duration  float64 `json:"duration"`
		}

		if err := json.Unmarshal([]byte(line), &entry); err == nil {
			videos = append(videos, YoutubeVideo{
				ID:        entry.ID,
				Title:     entry.Title,
				Thumbnail: entry.Thumbnail,
				URL:       "https://www.youtube.com/watch?v=" + entry.ID,
				Duration:  fmt.Sprintf("%.0fs", entry.Duration),
			})
		}
	}

	c.JSON(200, gin.H{"videos": videos})
}

func DownloadYoutubeAudio(c *gin.Context) {
	videoURL := c.Query("url")
	if videoURL == "" {
		c.JSON(400, gin.H{"error": "URL required"})
		return
	}

	tempDir, err := os.MkdirTemp("", "ytdl_*")
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create temp directory"})
		return
	}
	defer os.RemoveAll(tempDir)

	outputPath := filepath.Join(tempDir, "audio.mp3")

	// Use yt-dlp to download and convert to mp3
	cmd := exec.Command("yt-dlp",
		"-x",
		"--audio-format", "mp3",
		"--audio-quality", "128K",
		"-o", outputPath,
		videoURL,
	)

	if err := cmd.Run(); err != nil {
		fmt.Printf("[YouTube] yt-dlp error: %v\n", err)
		c.JSON(500, gin.H{"error": "Failed to download audio. YouTube might be blocking the request or the URL is invalid."})
		return
	}

	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		c.JSON(500, gin.H{"error": "Audio file not generated"})
		return
	}

	audioData, err := os.ReadFile(outputPath)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to read audio file"})
		return
	}

	c.Data(200, "audio/mpeg", audioData)
}
