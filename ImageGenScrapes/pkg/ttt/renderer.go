package ttt

import (
	"fmt"
	"image/color"
	"strings"

	"image-service/pkg/utils"

	"github.com/disintegration/imaging"
	"github.com/fogleman/gg"
	"github.com/gin-gonic/gin"
)

type TTTRequest struct {
	Board         []string `json:"board"`
	GridSize      int      `json:"gridSize"`
	LastMoveIndex int      `json:"lastMoveIndex"`
	WinPattern    []int    `json:"winPattern"`
}

var (
	BgColor   = utils.ParseHexColor("#ECF0F1")
	GridColor = utils.ParseHexColor("#34495E")
	XColor    = utils.ParseHexColor("#E74C3C")
	OColor    = utils.ParseHexColor("#3498DB")
	Highlight = utils.ParseHexColor("#F39C12")
)

func RenderBoard(c *gin.Context) {
	var req TTTRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	size := 600.0
	grid := float64(req.GridSize)
	cellSize := size / grid

	dc := gg.NewContext(int(size), int(size))
	dc.SetColor(BgColor)
	dc.Clear()

	// 1. Highlight Cells
	for i, cell := range req.Board {
		row, col := i/req.GridSize, i%req.GridSize
		x, y := float64(col)*cellSize, float64(row)*cellSize

		// Win Pattern Highlight
		isWinCell := false
		for _, w := range req.WinPattern {
			if w == i {
				isWinCell = true
				break
			}
		}

		if isWinCell {
			dc.SetColor(color.RGBA{Highlight.R, Highlight.G, Highlight.B, 50}) // 20% alpha
			dc.DrawRectangle(x+2, y+2, cellSize-4, cellSize-4)
			dc.Fill()
		} else if i == req.LastMoveIndex {
			// Last Move Highlight (Outline)
			dc.SetColor(Highlight)
			dc.SetLineWidth(3)
			dc.DrawRectangle(x+10, y+10, cellSize-20, cellSize-20)
			dc.Stroke()
		}

		// Symbols
		cx, cy := x+cellSize/2, y+cellSize/2
		radius := cellSize * 0.35
		dc.SetLineWidth(gridLineWidth(req.GridSize))

		if cell == "X" {
			dc.SetColor(XColor)
			dc.DrawLine(cx-radius, cy-radius, cx+radius, cy+radius)
			dc.DrawLine(cx+radius, cy-radius, cx-radius, cy+radius)
			dc.Stroke()
		} else if cell == "O" {
			dc.SetColor(OColor)
			dc.DrawCircle(cx, cy, radius)
			dc.Stroke()
		}

		// Numbers for empty cells
		if cell == "" {
			fontPath := utils.GetAssetPath("rpgasset", "ui", "fantesy.ttf")
			fontSize := fontSize(req.GridSize)
			face, err := utils.LoadFont(fontPath, fontSize)
			if err == nil {
				dc.SetFontFace(face)
				dc.SetColor(color.RGBA{0, 0, 0, 100})
				dc.DrawStringAnchored(fmt.Sprintf("%d", i), cx, cy, 0.5, 0.5)
			}
		}
	}

	// 2. Grid Lines
	dc.SetColor(GridColor)
	dc.SetLineWidth(4)
	for i := 1; i < req.GridSize; i++ {
		pos := float64(i) * cellSize
		dc.DrawLine(pos, 0, pos, size)
		dc.DrawLine(0, pos, size, pos)
	}
	dc.Stroke()

	buf, err := utils.EncodeImageToBuffer(dc.Image())
	if err != nil {
		c.JSON(500, gin.H{"error": "Encode failed"})
		return
	}
	c.Data(200, "image/png", buf)
}

func RenderLeaderboard(c *gin.Context) {
	var req struct {
		Scores []struct {
			Name  string `json:"name"`
			Score int    `json:"score"`
			JID   string `json:"jid"`
		} `json:"scores"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	width, height := 800, 1000
	dc := gg.NewContext(width, height)

	// Background
	bgPath := utils.GetAssetPath("Ldatabase", "scores.png")
	bgImg, err := utils.LoadImage(bgPath)
	if err == nil {
		bgImg = imaging.Fill(bgImg, width, height, imaging.Center, imaging.Lanczos)
		dc.DrawImage(bgImg, 0, 0)
	} else {
		dc.SetHexColor("#1a1a2e")
		dc.Clear()
	}

	fontPath := utils.GetAssetPath("rpgasset", "ui", "fantesy.ttf")
	
	// Title
	titleFace, err := utils.LoadFont(fontPath, 60)
	if err == nil {
		dc.SetFontFace(titleFace)
		dc.SetColor(color.White)
		dc.DrawStringAnchored("LEADERBOARD", float64(width)/2, 100, 0.5, 0.5)
	}

	// Scores
	scoreFace, err := utils.LoadFont(fontPath, 40)
	if err == nil {
		dc.SetFontFace(scoreFace)
		startY := 250.0
		for i, entry := range req.Scores {
			if i >= 10 {
				break
			}
			y := startY + float64(i)*70
			
			// Medal/Rank
			rankStr := fmt.Sprintf("%d.", i+1)
			if i == 0 { rankStr = "🥇" }
			if i == 1 { rankStr = "🥈" }
			if i == 2 { rankStr = "🥉" }
			
			dc.SetColor(color.White)
			dc.DrawString(rankStr, 100, y)
			
			// Name (clean JID)
			name := entry.Name
			if name == "" || name == "User" || name == "Player" {
				name = entry.JID
				if idx := strings.Index(name, "@"); idx != -1 {
					name = "@" + name[:idx]
				}
			}
			dc.DrawString(name, 200, y)
			
			// Score
			scoreStr := fmt.Sprintf("%d pts", entry.Score)
			dc.DrawStringAnchored(scoreStr, 700, y, 1, 0)
		}
	}

	buf, err := utils.EncodeImageToBuffer(dc.Image())
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to encode image"})
		return
	}

	c.Data(200, "image/png", buf)
}

func gridLineWidth(grid int) float64 {
	if grid <= 3 { return 10 }
	if grid <= 8 { return 5 }
	return 3
}

func fontSize(grid int) float64 {
	if grid <= 3 { return 40 }
	if grid <= 8 { return 20 }
	return 12
}