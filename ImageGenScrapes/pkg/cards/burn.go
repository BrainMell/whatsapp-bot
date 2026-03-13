package cards

import (
        "fmt"
        "io"
        "net/http"
        "os"
        "os/exec"
        "path/filepath"
        "time"

        "github.com/gin-gonic/gin"
)

type BurnRequest struct {
        ImageUrl string `json:"imageUrl"`
}

const FireGifUrl = "https://raw.githubusercontent.com/BrainMell/whatsapp-bot/main/core/rpgasset/ui/fire_overlay.gif"
const FallbackFireUrl = "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHIzN3JyeXBrOHRyeXBrOHRyeXBrOHRyeXBrOHRyeXBrJnBlPXM/3o72FfM5HJydzaMpfO/giphy.gif"

func GenerateBurnGif(c *gin.Context) {
        var req BurnRequest
        if err := c.ShouldBindJSON(&req); err != nil {
                c.JSON(400, gin.H{"error": err.Error()})
                return
        }

        tempDir, err := os.MkdirTemp("", "cardburn_*")
        if err != nil {
                c.JSON(500, gin.H{"error": "Failed to create temp directory"})
                return
        }
        defer os.RemoveAll(tempDir)

        client := &http.Client{Timeout: 15 * time.Second}

        // 1. Download Card Image
        cardPath := filepath.Join(tempDir, "card.png")
        if err := downloadFile(client, req.ImageUrl, cardPath); err != nil {
                c.JSON(500, gin.H{"error": "Failed to download card image"})
                return
        }

        // 2. Download Fire Overlay
        firePath := filepath.Join(tempDir, "fire.gif")
        if err := downloadFile(client, FireGifUrl, firePath); err != nil {
                if err := downloadFile(client, FallbackFireUrl, firePath); err != nil {
                        c.JSON(500, gin.H{"error": "Failed to download fire overlay"})
                        return
                }
        }

        outputPath := filepath.Join(tempDir, "burn.mp4")

        // 3. FFmpeg Magic
        filterComplex := "[1:v]scale=500:500:force_original_aspect_ratio=increase,crop=500:500[card]; " +
                "[0:v][card]overlay=(W-w)/2:(H-h)/2[base]; " +
                "[2:v]scale=800:800,format=yuva420p,colorchannelmixer=aa=0.7[fire]; " +
                "[base][fire]overlay=0:0:shortest=1[out]"

        cmd := exec.Command("ffmpeg",
                "-f", "lavfi", "-i", "color=c=black:s=800x800:d=3", 
                "-i", cardPath,
                "-ignore_loop", "0", "-i", firePath,
                "-filter_complex", filterComplex,
                "-map", "[out]",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-y", outputPath)

        if output, err := cmd.CombinedOutput(); err != nil {
                fmt.Printf("[Burn] FFmpeg error: %v\nOutput: %s\n", err, string(output))
                c.JSON(500, gin.H{"error": "FFmpeg failed"})
                return
        }

        data, err := os.ReadFile(outputPath)
        if err != nil {
                c.JSON(500, gin.H{"error": "Failed to read output"})
                return
        }

        c.Data(200, "video/mp4", data)
}

func downloadFile(client *http.Client, url string, dest string) error {
        req, _ := http.NewRequest("GET", url, nil)
        req.Header.Set("User-Agent", "Mozilla/5.0")
        resp, err := client.Do(req)
        if err != nil {
                return err
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusOK {
                return fmt.Errorf("bad status: %s", resp.Status)
        }

        out, err := os.Create(dest)
        if err != nil {
                return err
        }
        defer out.Close()

        _, err = io.Copy(out, resp.Body)
        return err
}
