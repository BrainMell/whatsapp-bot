package ludo

import (
	"fmt"
	"image"
	"image/color"
	"math"
	"net/http"

	"image-service/pkg/utils"

	"github.com/disintegration/imaging"
	"github.com/fogleman/gg"
	"github.com/gin-gonic/gin"
)

const (
	BOARD_SIZE = 900
	CELL_SIZE  = 60
)

type LudoRequest struct {
	Players []struct {
		JID    string `json:"jid"`
		Color  string `json:"color"`
		PfpURL string `json:"pfpUrl"` // NEW: Profile picture URL or path
		Pieces []struct {
			ID            int  `json:"id"`
			Position      int  `json:"position"`
			InBase        bool `json:"inBase"`
			InHome        bool `json:"inHome"`
			OnHomePath    bool `json:"onHomePath"`
			HomePathIndex int  `json:"homePathIndex"`
		} `json:"pieces"`
	} `json:"players"`
	LastRoll int `json:"lastRoll"`
}

var (
	Red       = color.RGBA{255, 77, 77, 255}
	Green     = color.RGBA{46, 204, 113, 255}
	Yellow    = color.RGBA{241, 196, 15, 255}
	Blue      = color.RGBA{52, 152, 219, 255}
	White     = color.RGBA{255, 255, 255, 255}
	Black     = color.RGBA{0, 0, 0, 255}
	Gray      = color.RGBA{204, 204, 204, 255}
	LightGray = color.RGBA{240, 242, 245, 255}
	DarkGray  = color.RGBA{51, 51, 51, 255}
)

var MainTrack = [][2]int{
	{6, 1}, {6, 2}, {6, 3}, {6, 4}, {6, 5},
	{5, 6}, {4, 6}, {3, 6}, {2, 6}, {1, 6}, {0, 6},
	{0, 7}, {0, 8},
	{1, 8}, {2, 8}, {3, 8}, {4, 8}, {5, 8},
	{6, 9}, {6, 10}, {6, 11}, {6, 12}, {6, 13}, {6, 14},
	{7, 14}, {8, 14},
	{8, 13}, {8, 12}, {8, 11}, {8, 10}, {8, 9},
	{9, 8}, {10, 8}, {11, 8}, {12, 8}, {13, 8}, {14, 8},
	{14, 7}, {14, 6},
	{13, 6}, {12, 6}, {11, 6}, {10, 6}, {9, 6},
	{8, 5}, {8, 4}, {8, 3}, {8, 2}, {8, 1}, {8, 0},
	{7, 0}, {6, 0},
}

var HomePaths = map[string][][2]int{
	"red":    {{7, 1}, {7, 2}, {7, 3}, {7, 4}, {7, 5}, {7, 6}},
	"green":  {{1, 7}, {2, 7}, {3, 7}, {4, 7}, {5, 7}, {6, 7}},
	"yellow": {{7, 13}, {7, 12}, {7, 11}, {7, 10}, {7, 9}, {7, 8}},
	"blue":   {{13, 7}, {12, 7}, {11, 7}, {10, 7}, {9, 7}, {8, 7}},
}

var Bases = map[string][][2]int{
	"red":    {{2, 2}, {2, 4}, {4, 2}, {4, 4}},
	"green":  {{2, 10}, {2, 12}, {4, 10}, {4, 12}},
	"yellow": {{10, 10}, {10, 12}, {12, 10}, {12, 12}},
	"blue":   {{10, 2}, {10, 4}, {12, 2}, {12, 4}},
}

var SafeSquares = []int{0, 13, 26, 39}

// PFP corner positions
var PfpPositions = map[string]struct{ X, Y float64 }{
	"red":    {X: 90, Y: 90},      // Top-left
	"green":  {X: 810, Y: 90},     // Top-right
	"yellow": {X: 810, Y: 810},    // Bottom-right
	"blue":   {X: 90, Y: 810},     // Bottom-left
}

func RenderBoard(c *gin.Context) {
	var req LudoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	dc := gg.NewContext(BOARD_SIZE, BOARD_SIZE)
	dc.SetColor(LightGray)
	dc.Clear()

	// 1. Background areas
	cornerSize := 6.0 * CELL_SIZE
	drawArea(dc, 0, 0, cornerSize, cornerSize, Red, 0.35)
	drawArea(dc, BOARD_SIZE-cornerSize, 0, cornerSize, cornerSize, Green, 0.15)
	drawArea(dc, BOARD_SIZE-cornerSize, BOARD_SIZE-cornerSize, cornerSize, cornerSize, Yellow, 0.15)
	drawArea(dc, 0, BOARD_SIZE-cornerSize, cornerSize, cornerSize, Blue, 0.15)

	innerSize := cornerSize * 0.7
	off := (cornerSize - innerSize) / 2
	dc.SetColor(White)
	dc.DrawRectangle(off, off, innerSize, innerSize)
	dc.DrawRectangle(BOARD_SIZE-cornerSize+off, off, innerSize, innerSize)
	dc.DrawRectangle(BOARD_SIZE-cornerSize+off, BOARD_SIZE-cornerSize+off, innerSize, innerSize)
	dc.DrawRectangle(off, BOARD_SIZE-cornerSize+off, innerSize, innerSize)
	dc.Fill()

	// 2. Home paths
	for colorName, path := range HomePaths {
		pathColor := getColor(colorName)
		dc.SetColor(alphaColor(pathColor, 0.4))
		for _, pos := range path {
			dc.DrawRectangle(float64(pos[1]*CELL_SIZE)+2, float64(pos[0]*CELL_SIZE)+2, CELL_SIZE-4, CELL_SIZE-4)
			dc.Fill()
		}
	}

	// 3. Grid
	dc.SetColor(DarkGray)
	dc.SetLineWidth(5)
	for i := 0; i <= 15; i++ {
		x := float64(i * CELL_SIZE)
		dc.DrawLine(x, 0, x, BOARD_SIZE)
		dc.DrawLine(0, x, BOARD_SIZE, x)
	}
	dc.Stroke()

	// 4. Safe squares
	for _, idx := range SafeSquares {
		pos := MainTrack[idx]
		drawStar(dc, float64(pos[1]*CELL_SIZE)+CELL_SIZE/2, float64(pos[0]*CELL_SIZE)+CELL_SIZE/2, 15, Yellow)
	}

	// 5. Center finish
	center := 7.5 * CELL_SIZE
	triSize := CELL_SIZE * 1.5
	drawTriangle(dc, center, center, center-triSize, center, center, center-triSize, Red)
	drawTriangle(dc, center, center, center, center-triSize, center+triSize, center, Green)
	drawTriangle(dc, center, center, center+triSize, center, center, center+triSize, Yellow)
	drawTriangle(dc, center, center, center, center+triSize, center-triSize, center, Blue)

	// 6. Base outlines
	for colorName, positions := range Bases {
		baseColor := getColor(colorName)
		dc.SetColor(baseColor)
		dc.SetLineWidth(3)
		for _, pos := range positions {
			dc.DrawCircle(float64(pos[1]*CELL_SIZE)+CELL_SIZE/2, float64(pos[0]*CELL_SIZE)+CELL_SIZE/2, 22)
			dc.Stroke()
		}
	}

	// 7. Pieces
	for _, p := range req.Players {
		pieceColor := getColor(p.Color)
		for _, piece := range p.Pieces {
			if piece.InHome {
				continue
			}

			var coords [2]int
			if piece.InBase {
				coords = Bases[p.Color][piece.ID-1]
			} else if piece.OnHomePath {
				coords = HomePaths[p.Color][piece.HomePathIndex]
			} else {
				coords = MainTrack[piece.Position]
			}

			x := float64(coords[1]*CELL_SIZE) + CELL_SIZE/2
			y := float64(coords[0]*CELL_SIZE) + CELL_SIZE/2

			dc.SetColor(pieceColor)
			dc.DrawCircle(x, y, 18)
			dc.Fill()
			dc.SetColor(White)
			dc.SetLineWidth(2)
			dc.DrawCircle(x, y, 18)
			dc.Stroke()

			dc.SetColor(Black)
			dc.DrawStringAnchored(fmt.Sprintf("%d", piece.ID), x, y, 0.5, 0.5)
		}
	}

	// 8. Profile Pictures - NEW!
	for _, p := range req.Players {
		if p.PfpURL != "" {
			drawProfilePicture(dc, p.Color, p.PfpURL)
		}
	}

	// 9. Dice
	if req.LastRoll > 0 {
		dc.SetColor(White)
		dc.DrawRectangle(center-30, center-30, 60, 60)
		dc.Fill()
		dc.SetColor(Black)
		dc.SetLineWidth(2)
		dc.DrawRectangle(center-30, center-30, 60, 60)
		dc.Stroke()
		drawDiceDots(dc, center, center, req.LastRoll)
	}

	buf, err := utils.EncodeImageToBuffer(dc.Image())
	if err != nil {
		c.JSON(500, gin.H{"error": "Encode failed"})
		return
	}
	c.Data(200, "image/png", buf)
}

// NEW: Draw profile picture
func drawProfilePicture(dc *gg.Context, playerColor string, pfpURL string) {
	pos, ok := PfpPositions[playerColor]
	if !ok {
		return
	}

	// Load image (from URL or local path)
	var pfp image.Image
	var err error

	if len(pfpURL) > 4 && (pfpURL[:4] == "http" || pfpURL[:5] == "https") {
		// Download from URL
		pfp, err = downloadImage(pfpURL)
	} else {
		// Load from local path
		pfp, err = utils.LoadImage(pfpURL)
	}

	if err != nil {
		// Draw placeholder circle if PFP fails
		drawPlaceholder(dc, pos.X, pos.Y, getColor(playerColor))
		return
	}

	// Resize to 120x120
	pfpSize := 120
	pfp = imaging.Resize(pfp, pfpSize, pfpSize, imaging.Lanczos)

	// Make circular
	circular := makeCircular(pfp)

	// Draw colored border
	borderColor := getColor(playerColor)
	borderThickness := 6.0
	radius := float64(pfpSize) / 2

	dc.SetColor(borderColor)
	dc.SetLineWidth(borderThickness)
	dc.DrawCircle(pos.X, pos.Y, radius+borderThickness/2)
	dc.Stroke()

	// Draw the circular PFP
	dc.DrawImageAnchored(circular, int(pos.X), int(pos.Y), 0.5, 0.5)
}

// Make image circular
func makeCircular(img image.Image) image.Image {
	bounds := img.Bounds()
	size := bounds.Dx() // Assume square
	radius := float64(size) / 2
	center := radius

	dst := image.NewRGBA(bounds)
	
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			dx := float64(x) - center
			dy := float64(y) - center
			dist := math.Sqrt(dx*dx + dy*dy)
			
			if dist <= radius {
				dst.Set(x, y, img.At(x, y))
			}
		}
	}
	
	return dst
}

// Download image from URL
func downloadImage(url string) (image.Image, error) {
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

// Draw placeholder circle when PFP not available
func drawPlaceholder(dc *gg.Context, x, y float64, color color.RGBA) {
	radius := 60.0 // Half of 120px
	
	// Filled circle
	dc.SetColor(alphaColor(color, 0.3))
	dc.DrawCircle(x, y, radius)
	dc.Fill()
	
	// Border
	dc.SetColor(color)
	dc.SetLineWidth(6)
	dc.DrawCircle(x, y, radius)
	dc.Stroke()
	
	// Simple icon (person silhouette)
	dc.SetColor(alphaColor(color, 0.6))
	// Head
	dc.DrawCircle(x, y-10, 15)
	dc.Fill()
	// Body
	dc.DrawCircle(x, y+20, 25)
	dc.Fill()
}

// Helpers
func drawArea(dc *gg.Context, x, y, w, h float64, c color.RGBA, alpha float64) {
	dc.SetColor(alphaColor(c, alpha))
	dc.DrawRectangle(x, y, w, h)
	dc.Fill()
}

func alphaColor(c color.RGBA, a float64) color.RGBA {
	return color.RGBA{c.R, c.G, c.B, uint8(a * 255)}
}

func getColor(name string) color.RGBA {
	switch name {
	case "red":
		return Red
	case "green":
		return Green
	case "yellow":
		return Yellow
	case "blue":
		return Blue
	default:
		return Black
	}
}

func drawStar(dc *gg.Context, x, y, size float64, c color.RGBA) {
	dc.SetColor(c)
	for i := 0; i < 5; i++ {
		angle := float64(i)*2*math.Pi/5 - math.Pi/2
		x1 := x + math.Cos(angle)*size
		y1 := y + math.Sin(angle)*size
		if i == 0 {
			dc.MoveTo(x1, y1)
		} else {
			dc.LineTo(x1, y1)
		}
		angle += math.Pi / 5
		dc.LineTo(x+math.Cos(angle)*size/2, y+math.Sin(angle)*size/2)
	}
	dc.ClosePath()
	dc.Stroke()
}

func drawTriangle(dc *gg.Context, x1, y1, x2, y2, x3, y3 float64, c color.RGBA) {
	dc.SetColor(c)
	dc.MoveTo(x1, y1)
	dc.LineTo(x2, y2)
	dc.LineTo(x3, y3)
	dc.ClosePath()
	dc.Fill()
}

func drawDiceDots(dc *gg.Context, x, y float64, val int) {
	spacing := 14.0
	dots := map[int][][2]float64{
		1: {{0, 0}},
		2: {{-spacing, -spacing}, {spacing, spacing}},
		3: {{-spacing, -spacing}, {0, 0}, {spacing, spacing}},
		4: {{-spacing, -spacing}, {-spacing, spacing}, {spacing, -spacing}, {spacing, spacing}},
		5: {{-spacing, -spacing}, {-spacing, spacing}, {0, 0}, {spacing, -spacing}, {spacing, spacing}},
		6: {{-spacing, -spacing}, {-spacing, 0}, {-spacing, spacing}, {spacing, -spacing}, {spacing, 0}, {spacing, spacing}},
	}
	dc.SetColor(Black)
	for _, dot := range dots[val] {
		dc.DrawCircle(x+dot[0], y+dot[1], 5)
		dc.Fill()
	}
}
