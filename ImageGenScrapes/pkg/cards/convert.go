package cards

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

type ConvertRequest struct {
	ImageUrl string `json:"imageUrl"`
}

func ConvertCard(c *gin.Context) {
	var req ConvertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	tempDir, err := os.MkdirTemp("", "cardconv_*")
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create temp directory"})
		return
	}
	defer os.RemoveAll(tempDir)

	client := &http.Client{Timeout: 30 * time.Second}
	inputPath := filepath.Join(tempDir, "input")
	if err := downloadFile(client, req.ImageUrl, inputPath); err != nil {
		c.JSON(500, gin.H{"error": "Failed to download image"})
		return
	}

	outputPath := filepath.Join(tempDir, "output.mp4")

	// FFmpeg: Scale to 800x800 square with padding to match .j coll behavior
	// This ensures the card shows up "large" in WhatsApp
	cmd := exec.Command("ffmpeg",
		"-i", inputPath,
		"-vf", "scale=800:800:force_original_aspect_ratio=decrease,pad=800:800:(ow-iw)/2:(oh-ih)/2:color=black",
		"-c:v", "libx264",
		"-pix_fmt", "yuv420p",
		"-preset", "ultrafast",
		"-crf", "23",
		"-movflags", "+faststart",
		"-y", outputPath)

	if output, err := cmd.CombinedOutput(); err != nil {
		fmt.Printf("[Convert] FFmpeg error: %v\nOutput: %s\n", err, string(output))
		c.JSON(500, gin.H{"error": "Conversion failed"})
		return
	}

	data, err := os.ReadFile(outputPath)
	if err != nil {
		c.JSON(500, gin.H{"error": "Read failed"})
		return
	}

	c.Data(200, "video/mp4", data)
}

