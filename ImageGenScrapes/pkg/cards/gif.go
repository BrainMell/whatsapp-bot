package cards

import (
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"image-service/pkg/utils"

	"github.com/fogleman/gg"
	"github.com/gin-gonic/gin"
)

type GifRequest struct {
	Images []string `json:"images"`
	Title  string   `json:"title"`
}

func isAnimated(url string) bool {
	lower := strings.ToLower(url)
	return strings.HasSuffix(lower, ".webm") || strings.HasSuffix(lower, ".gif") || strings.HasSuffix(lower, ".webp")
}

func GenerateCardGif(c *gin.Context) {
	var req GifRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if len(req.Images) == 0 {
		c.JSON(400, gin.H{"error": "No images provided"})
		return
	}

	maxImages := 15
	if len(req.Images) > maxImages {
	        req.Images = req.Images[:maxImages]
	}
	tempDir, err := os.MkdirTemp("", "cardvid_*")
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create temp directory"})
		return
	}
	defer os.RemoveAll(tempDir)

	bgPath := filepath.Join(tempDir, "bg.png")
	if err := generateRandomGradient(bgPath, 800, 800); err != nil {
		fmt.Printf("[Cards] BG Gen failed: %v\n", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	
	type CardInput struct {
		Path       string
		IsAnimated bool
	}
	var localInputs []CardInput

	for i, url := range req.Images {
		filePath := filepath.Join(tempDir, fmt.Sprintf("card_%d", i))
		if err := downloadFile(client, url, filePath); err == nil {
			localInputs = append(localInputs, CardInput{
				Path:       filePath,
				IsAnimated: isAnimated(url),
			})
		} else {
			fmt.Printf("[Cards] Failed to download %s: %v\n", url, err)
		}
	}

	if len(localInputs) == 0 {
		c.JSON(500, gin.H{"error": "All image downloads failed"})
		return
	}

	outputPath := filepath.Join(tempDir, "output.mp4")

	// Build FFmpeg command
	var args []string
	// Input 0: Background
	args = append(args, "-loop", "1", "-t", fmt.Sprintf("%f", float64(len(localInputs))*2.0), "-i", bgPath)
	
	// Card Inputs
	for _, input := range localInputs {
		if input.IsAnimated {
			// Loop animated cards for the duration of the slide
			args = append(args, "-stream_loop", "-1", "-t", "2.0", "-i", input.Path)
		} else {
			args = append(args, "-loop", "1", "-t", "2.0", "-i", input.Path)
		}
	}

	filterParts := []string{}
	// Prepare background
	filterParts = append(filterParts, "[0:v]scale=800:800,format=yuv420p[bg]")

	// Process each card input
	for i := 1; i <= len(localInputs); i++ {
		// Scale and pad card, then overlay on BG
		// We use format=yuv420p here to ensure compatibility for xfade
		cardRef := fmt.Sprintf("[%d:v]", i)
		preparedCard := fmt.Sprintf("[c%d]", i)
		slide := fmt.Sprintf("[s%d]", i)
		
		filterParts = append(filterParts, fmt.Sprintf("%sscale=740:740:force_original_aspect_ratio=decrease,pad=740:740:(740-iw)/2:(740-ih)/2:color=black@0%s", cardRef, preparedCard))
		filterParts = append(filterParts, fmt.Sprintf("[bg]%soverlay=30:30:shortest=1,format=yuv420p%s", preparedCard, slide))
	}

	// Apply transitions
	lastStream := "[s1]"
	if len(localInputs) > 1 {
		for i := 2; i <= len(localInputs); i++ {
			outStream := fmt.Sprintf("[v%d]", i)
			offset := float64(i-1) * 1.5 // 1.5s offset for a 2s slide gives 0.5s overlap
			filterParts = append(filterParts, fmt.Sprintf("%s[s%d]xfade=transition=slideright:duration=0.5:offset=%f%s", lastStream, i, offset, outStream))
			lastStream = outStream
		}
	}

	args = append(args, "-filter_complex", strings.Join(filterParts, ";")+"; "+lastStream+"scale=800:800,format=yuv420p[out]", "-map", "[out]")
	args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-preset", "ultrafast", "-movflags", "+faststart", "-y", outputPath)

	cmd := exec.Command("ffmpeg", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		fmt.Printf("[Cards] FFmpeg error: %v\nOutput: %s\n", err, string(output))
		c.JSON(500, gin.H{"error": "Video processing failed"})
		return
	}

	vidData, err := os.ReadFile(outputPath)
	if err != nil {
		c.JSON(500, gin.H{"error": "Read failed"})
		return
	}

	c.Data(200, "video/mp4", vidData)
}

func generateRandomGradient(path string, w, h int) error {
	dc := gg.NewContext(w, h)
	r1, g1, b1 := rand.Float64(), rand.Float64(), rand.Float64()
	r2, g2, b2 := rand.Float64(), rand.Float64(), rand.Float64()
	grad := gg.NewLinearGradient(0, 0, float64(w), float64(h))
	grad.AddColorStop(0, utils.ParseHexColor(fmt.Sprintf("#%02x%02x%02x", int(r1*255), int(g1*255), int(b1*255))))
	grad.AddColorStop(1, utils.ParseHexColor(fmt.Sprintf("#%02x%02x%02x", int(r2*255), int(g2*255), int(b2*255))))
	dc.SetFillStyle(grad)
	dc.DrawRectangle(0, 0, float64(w), float64(h))
	dc.Fill()
	return dc.SavePNG(path)
}

