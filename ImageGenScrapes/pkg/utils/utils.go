package utils

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"github.com/disintegration/imaging"
	"github.com/fogleman/gg"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
)

// Asset Cache to avoid re-reading from disk
var (
	imageCache = make(map[string]image.Image)
	mutex      sync.RWMutex
)

// LoadImage loads an image from disk or cache
func LoadImage(path string) (image.Image, error) {
	mutex.RLock()
	if img, ok := imageCache[path]; ok {
		mutex.RUnlock()
		return img, nil
	}
	mutex.RUnlock()

	// Check if file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, fmt.Errorf("file not found: %s", path)
	}

	img, err := imaging.Open(path)
	if err != nil {
		return nil, err
	}

	mutex.Lock()
	imageCache[path] = img
	mutex.Unlock()

	return img, nil
}

// DownloadImage fetches an image from a URL
func DownloadImage(url string) (image.Image, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	img, _, err := image.Decode(resp.Body)
	if err != nil {
		return nil, err
	}
	return img, nil
}

// LoadFont loads a TTF font
func LoadFont(path string, size float64) (font.Face, error) {
	fontBytes, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	ft, err := opentype.Parse(fontBytes)
	if err != nil {
		return nil, err
	}

	return opentype.NewFace(ft, &opentype.FaceOptions{
		Size:    size,
		DPI:     72,
		Hinting: font.HintingFull,
	})
}

// ParseHexColor converts hex string to color.RGBA
func ParseHexColor(s string) color.RGBA {
	c := color.RGBA{0, 0, 0, 255}
	switch len(s) {
	case 7:
		fmt.Sscanf(s, "#%02x%02x%02x", &c.R, &c.G, &c.B)
	case 9:
		fmt.Sscanf(s, "#%02x%02x%02x%02x", &c.R, &c.G, &c.B, &c.A)
	}
	return c
}

// DrawShadow draws a radial shadow
func DrawShadow(dc *gg.Context, x, y, radius float64, alpha float64) {
	grad := gg.NewRadialGradient(x, y, 0, x, y, radius)
	grad.AddColorStop(0, color.RGBA{0, 0, 0, uint8(alpha * 255)})
	grad.AddColorStop(1, color.RGBA{0, 0, 0, 0})
	dc.SetFillStyle(grad)
	dc.DrawCircle(x, y, radius)
	dc.Fill()
}

// TintImage adds a red overlay to an image (for dead units)
func TintImage(img image.Image, tint color.RGBA) image.Image {
	bounds := img.Bounds()
	dst := image.NewRGBA(bounds)
	
	// Copy original image
	draw.Draw(dst, bounds, img, bounds.Min, draw.Src)
	
	// Apply tint manually to non-transparent pixels
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			originalColor := dst.At(x, y)
			_, _, _, a := originalColor.RGBA()
			
			if a > 0 {
				// Blend the tint color
				blended := Blend(originalColor, tint)
				dst.Set(x, y, blended)
			}
		}
	}
	
	return dst
}

// Blend blends two colors (simplified for red tint)
func Blend(base color.Color, tint color.RGBA) color.Color {
	r1, g1, b1, a1 := base.RGBA()
	
	// Convert to 8-bit
	r1 >>= 8
	g1 >>= 8
	b1 >>= 8
	a1 >>= 8
	
	// Blend logic: increase red, decrease others based on tint alpha
	alpha := float64(tint.A) / 255.0
	
	r := uint8(float64(r1)*(1-alpha) + float64(tint.R)*alpha)
	g := uint8(float64(g1)*(1-alpha) + float64(tint.G)*alpha)
	b := uint8(float64(b1)*(1-alpha) + float64(tint.B)*alpha)
	
	return color.RGBA{r, g, b, uint8(a1)}
}

// EncodeImageToBuffer returns PNG bytes
func EncodeImageToBuffer(img image.Image) ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := png.Encode(buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// GetAssetPath helper to find assets relative to the binary
func GetAssetPath(parts ...string) string {
	// Assume "assets" folder is in CWD
	base, _ := os.Getwd()
	pathParts := append([]string{base, "assets"}, parts...)
	return filepath.Join(pathParts...)
}