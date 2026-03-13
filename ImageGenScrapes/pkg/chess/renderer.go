package chess

import (
	"fmt"
	"image/color"
	"path/filepath"
	"strings"

	"image-service/pkg/utils"

	"github.com/fogleman/gg"
	"github.com/gin-gonic/gin"
)

type ChessRequest struct {
	FEN      string `json:"fen"`
	LastMove string `json:"lastMove"`
}

var (
	LightSquare = utils.ParseHexColor("#EBECD0")
	DarkSquare  = utils.ParseHexColor("#779556")
	MoveHigh    = utils.ParseHexColor("#F7F769") // Yellow-ish highlight
)

func RenderBoard(c *gin.Context) {
	var req ChessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	size := 800.0
	cellSize := size / 8.0
	dc := gg.NewContext(int(size), int(size))

	// 1. Draw Board Squares
	lastMoveSquares := parseLastMove(req.LastMove)

	for row := 0; row < 8; row++ {
		for col := 0; col < 8; col++ {
			x, y := float64(col)*cellSize, float64(row)*cellSize
			
			// Base Square Color
			if (row+col)%2 == 0 {
				dc.SetColor(LightSquare)
			} else {
				dc.SetColor(DarkSquare)
			}
			dc.DrawRectangle(x, y, cellSize, cellSize)
			dc.Fill()

			// Highlight Last Move
			squareName := fmt.Sprintf("%c%d", 'a'+col, 8-row)
			for _, lms := range lastMoveSquares {
				if lms == squareName {
					dc.SetColor(color.RGBA{MoveHigh.R, MoveHigh.G, MoveHigh.B, 180})
					dc.DrawRectangle(x, y, cellSize, cellSize)
					dc.Fill()
				}
			}
		}
	}

	// 2. Parse FEN and Draw Pieces
	parts := strings.Split(req.FEN, " ")
	boardPart := parts[0]
	rows := strings.Split(boardPart, "/")

	for r, rowStr := range rows {
		cIdx := 0
		for _, char := range rowStr {
			if char >= '1' && char <= '8' {
				cIdx += int(char - '0')
			} else {
				pieceName := getPieceFileName(char)
				if pieceName != "" {
					drawPiece(dc, pieceName, cIdx, r, cellSize)
				}
				cIdx++
			}
		}
	}

	// 3. Draw Coordinates (All 4 sides)
	dc.SetColor(color.RGBA{0, 0, 0, 200})
	fontPath := utils.GetAssetPath("rpgasset", "ui", "fantesy.ttf")
	face, err := utils.LoadFont(fontPath, 22)
	if err == nil {
		dc.SetFontFace(face)
		for i := 0; i < 8; i++ {
			rank := fmt.Sprintf("%d", 8-i)
			file := string('a' + rune(i))
			
			// Left & Right (Numbers)
			dc.DrawStringAnchored(rank, 8, float64(i)*cellSize+cellSize/2, 0, 0.5)
			dc.DrawStringAnchored(rank, size-8, float64(i)*cellSize+cellSize/2, 1, 0.5)
			
			// Top & Bottom (Letters)
			dc.DrawStringAnchored(file, float64(i)*cellSize+cellSize/2, 15, 0.5, 0)
			dc.DrawStringAnchored(file, float64(i)*cellSize+cellSize/2, size-10, 0.5, 1)
		}
	}

	buf, err := utils.EncodeImageToBuffer(dc.Image())
	if err != nil {
		c.JSON(500, gin.H{"error": "Encode failed"})
		return
	}
	c.Data(200, "image/png", buf)
}

func getPieceFileName(char rune) string {
	switch char {
	case 'P': return "white-pawn.png"
	case 'R': return "white-rook.png"
	case 'N': return "white-knight.png"
	case 'B': return "white-bishop.png"
	case 'Q': return "white-queen.png"
	case 'K': return "white-king.png"
	case 'p': return "black-pawn.png"
	case 'r': return "black-rook.png"
	case 'n': return "black-knight.png"
	case 'b': return "black-bishop.png"
	case 'q': return "black-queen.png"
	case 'k': return "black-king.png"
	}
	return ""
}

func drawPiece(dc *gg.Context, fileName string, col, row int, cellSize float64) {
	path := utils.GetAssetPath("chess", fileName)
	absPath, _ := filepath.Abs(path)
	img, err := utils.LoadImage(path)
	if err != nil {
		fmt.Printf("[Chess] Failed to load piece %s at %s: %v\n", fileName, absPath, err)
		return
	}

	padding := 5.0
	targetSize := int(cellSize - padding*2)
	sw := float64(targetSize) / float64(img.Bounds().Dx())
	sh := float64(targetSize) / float64(img.Bounds().Dy())
	
	x := float64(col)*cellSize + padding
	y := float64(row)*cellSize + padding
	
	dc.Push()
	dc.Translate(x, y)
	dc.Scale(sw, sh)
	dc.DrawImage(img, 0, 0)
	dc.Pop()
}

func parseLastMove(move string) []string {
	if len(move) < 4 {
		return nil
	}
	return []string{move[0:2], move[2:4]}
}
