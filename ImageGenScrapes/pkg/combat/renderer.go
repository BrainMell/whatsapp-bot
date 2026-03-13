package combat

import (
	"fmt"
	"image"
	"image/color"
	"math"
	"os"
	"path/filepath"
	"sort"

	"image-service/pkg/utils"

	"github.com/disintegration/imaging"
	"github.com/fogleman/gg"
	"github.com/gin-gonic/gin"
)

const (
	CANVAS_W = 1024
	CANVAS_H = 687
	OFF_X    = 694
	OFF_Y    = 356
)

func GenerateCombatImage(c *gin.Context) {
	var req CombatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Create Canvas
	dc := gg.NewContext(CANVAS_W, CANVAS_H)
	
	// 1. Background - FIXED
	assetsPath := "assets"
	
	// Try to load background
	var bgPath string
	if req.Background != "" {
		// Check if it's a full path or just filename
		if filepath.IsAbs(req.Background) || fileExists(req.Background) {
			bgPath = req.Background
		} else {
			bgPath = filepath.Join(assetsPath, "rpgasset", "environment", req.Background)
		}
	}
	
	// If no background specified or doesn't exist, get random one
	if bgPath == "" || !fileExists(bgPath) {
		bgPath = getRandomEnvironment(assetsPath)
	}

	// Load and composite background
	if bgPath != "" && fileExists(bgPath) {
		bgImg, err := utils.LoadImage(bgPath)
		if err == nil {
			bgImg = imaging.Fill(bgImg, CANVAS_W, CANVAS_H, imaging.Center, imaging.Lanczos)
			dc.DrawImage(bgImg, 0, 0)
		} else {
			// Fallback color
			dc.SetHexColor("#1a1a1a")
			dc.Clear()
		}
	} else {
		// Fallback color if no background found
		dc.SetHexColor("#1a1a1a")
		dc.Clear()
	}

	// Dark Overlay (40% black)
	dc.SetColor(color.RGBA{0, 0, 0, 102})
	dc.DrawRectangle(0, 0, CANVAS_W, CANVAS_H)
	dc.Fill()

	// 2. Mobs / Enemies
	enemySpriteSize := 190.0
	startX, startY := 780.0, 160.0
	spX, spY := 130.0, 110.0

	// Determine avg level for sprite selection
	avgLevel := 1
	if len(req.Players) > 0 {
		sum := 0
		for _, p := range req.Players {
			sum += p.Level
		}
		avgLevel = sum / len(req.Players)
	}

	        type RenderItem struct {
	                img image.Image
	                x, y float64
	                hpPercent float64
	        }
	        var mobQueue []RenderItem
	
	        for i, enemy := range req.Enemies {
	                if enemy.CurrentHP <= 0 && !enemy.JustDied {
	                        continue
	                }
	
	                spritePath := GetEnemySpritePath(avgLevel, i, enemy.IsBoss, assetsPath)
	                eSprite, err := utils.LoadImage(spritePath)
	                if err != nil {
	                        continue
	                }
	
	                // Resize
	                eW := enemySpriteSize
	                if enemy.IsBoss {
	                        eW = enemySpriteSize * 1.5
	                }
	                eSprite = imaging.Resize(eSprite, int(eW), 0, imaging.Lanczos)
	
	                // Tint Red if dead
	                if enemy.CurrentHP <= 0 {
	                        eSprite = utils.TintImage(eSprite, color.RGBA{255, 0, 0, 100})
	                }
	
	                // Calculate Position
	                ex, ey := startX, startY
	                sub := i % 4
	                if sub == 1 || sub == 2 {
	                        ex -= spX
	                } else if sub == 3 {
	                        ex -= spX * 2
	                }
	                if sub == 1 || sub == 3 {
	                        ey += spY
	                }
	                ex += float64(i/4) * -250.0
	
	                                        hpPerc := 0.0
	                                        if enemy.MaxHP > 0 {
	                                                hpPerc = float64(enemy.CurrentHP) / float64(enemy.MaxHP)
	                                        }	
	                mobQueue = append(mobQueue, RenderItem{eSprite, ex, ey, hpPerc})
	        }
	// Sort by Y (Painter's Algorithm)
	sort.Slice(mobQueue, func(i, j int) bool {
		return mobQueue[i].y < mobQueue[j].y
	})

	        // Draw Mobs
	        for _, mob := range mobQueue {
	                // Shadow
	                utils.DrawShadow(dc, mob.x + float64(mob.img.Bounds().Dx())/2, mob.y + float64(mob.img.Bounds().Dy()) - 10, float64(mob.img.Bounds().Dx())*0.4, 0.6)
	                // Sprite
	                dc.DrawImage(mob.img, int(mob.x), int(mob.y))
	
	                // ENEMY HP BAR - Stretched hp5.png
	                if mob.hpPercent > 0 {
	                        uiPath := func(f string) string { return filepath.Join(assetsPath, "rpgasset", "ui", f) }
	                        hpBarImg, err := utils.LoadImage(uiPath("hp5.png"))
	                        if err == nil {
	                                barW := 100.0
	                                barH := 12.0
	                                // Stretch hp5.png to current HP width
	                                currentBarW := int(barW * mob.hpPercent)
	                                if currentBarW < 1 {
	                                        currentBarW = 1
	                                }
	                                hpBarImg = imaging.Resize(hpBarImg, currentBarW, int(barH), imaging.NearestNeighbor)
	
	                                // Position above head
	                                bx := mob.x + (float64(mob.img.Bounds().Dx())-barW)/2
	                                by := mob.y - 15
	                                dc.DrawImage(hpBarImg, int(bx), int(by))
	                        }
	                }
	        }
	// 3. UI Base Layer
	uiPath := func(f string) string { return filepath.Join(assetsPath, "rpgasset", "ui", f) }
	
	drawImage := func(path string, x, y, w, h int) {
		img, err := utils.LoadImage(path)
		if err == nil {
			if w > 0 && h > 0 {
				img = imaging.Resize(img, w, h, imaging.Lanczos)
			}
			dc.DrawImage(img, normX(x), normY(y))
		}
	}

	// UI elements
			drawImage(uiPath("player_state.png"), -716, 113, 453, 244)
			drawImage(uiPath("heart.png"), -678, 209, 38, 47)
			drawImage(uiPath("mana.png"), -673, 256, 29, 44)
			drawImage(uiPath("Options_menu.png"), -97, 99, 443, 258)
					drawImage(uiPath("banner.png"), -582, -410, 800, 160)
			
					// 4. UI Bars (Main Player)
					if len(req.Players) > 0 {
						p := req.Players[0]
		
		// Draw HP and Energy Bars
		hpCoords := []int{-640, -550, -459}
		enCoords := []int{-644, -555, -465}
		hpSeg := float64(p.MaxHP) / 3.0
		enSeg := float64(p.MaxEnergy) / 3.0

		for i := 0; i < 3; i++ {
			hCur := math.Max(0, math.Min(hpSeg, float64(p.CurrentHP) - (float64(i)*hpSeg)))
			drawBar(dc, uiPath, normX(hpCoords[i]), normY(209), hCur, hpSeg, "hp", 121, 47)

			eCur := math.Max(0, math.Min(enSeg, float64(p.Energy) - (float64(i)*enSeg)))
			drawBar(dc, uiPath, normX(enCoords[i]), normY(256), eCur, enSeg, "mana", 119, 42)
		}

		// 5. Player Sprite (Main - CROPPED TOP 30%)
		spritePath := GetCharacterSpritePath(p.Class, p.SpriteIndex, assetsPath)
		pSprite, err := utils.LoadImage(spritePath)
		if err == nil {
			if p.CurrentHP <= 0 {
				pSprite = utils.TintImage(pSprite, color.RGBA{255, 0, 0, 100})
			}
			
			// Resize to 314px width
			s1W := 314
			pSprite = imaging.Resize(pSprite, s1W, 0, imaging.Lanczos)
			
			// Crop TOP 30% - CRITICAL FIX
			bounds := pSprite.Bounds()
			cropH := int(float64(bounds.Dy()) * 0.3)
			croppedSprite := imaging.Crop(pSprite, image.Rect(0, 0, bounds.Dx(), cropH))
			
			// Position at normX(-660), normY(220) - cropH
			dc.DrawImage(croppedSprite, normX(-660), normY(220)-cropH)
			
			// 6. Second Sprite (Small full-body on battlefield) - PvE only
			if req.CombatType != "PVP" {
				s2Size := 122
				smallSprite := imaging.Resize(pSprite, s2Size, 0, imaging.Lanczos)
				
				// Position: startX - 500, startY + 30
				s2X := int(startX - 500)
				s2Y := int(startY + 30)
				
				// Shadow
				utils.DrawShadow(dc, float64(s2X)+float64(s2Size)/2, float64(s2Y)+float64(smallSprite.Bounds().Dy()), 150, 0.6)
				
				// Draw sprite
				dc.DrawImage(smallSprite, s2X, s2Y)
			}
		}
	}

	// 7. Banner Text (Overlaid ON the banner) - FIXED
	if req.Rank != "" || len(req.Players) > 0 {
		text := req.Rank
		if text == "" && len(req.Players) > 0 {
			text = req.Players[0].AdventurerRank
		}
		if text == "" {
			text = "F"
		}
		text = text + " RANK"
		
		if req.CombatType == "PVP" {
			text = "PVP MATCH"
		}
		
				fontPath := filepath.Join(assetsPath, "rpgasset", "ui", "fantesy.ttf")
				face, err := utils.LoadFont(fontPath, 40) // 40pt (smaller as requested)
				if err == nil {
					dc.SetFontFace(face)
					dc.SetColor(color.RGBA{0, 0, 0, 255}) // Black
		
					// Center text in banner at normX(-582), normY(-410)
					bx, by := float64(normX(-582)), float64(normY(-410))
					bw, bh := 800.0, 160.0
		
					// Draw centered in the new 800x160 banner
					dc.DrawStringAnchored(text, bx+bw/2, by+bh/2, 0.5, 0.5)
				}			        }

	// Encode
	buf, err := utils.EncodeImageToBuffer(dc.Image())
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to encode image"})
		return
	}

	c.Data(200, "image/png", buf)
}

func GenerateEndScreen(c *gin.Context) {
	var req struct {
		Text string `json:"text"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	dc := gg.NewContext(CANVAS_W, CANVAS_H)
	dc.SetRGB(1, 1, 1) // Pure White
	dc.Clear()

	fontPath := utils.GetAssetPath("rpgasset", "ui", "fantesy.ttf")
	face, err := utils.LoadFont(fontPath, 120) // 80pt approx 106px, let's go big
	if err == nil {
		dc.SetFontFace(face)
		dc.SetColor(color.Black)
		dc.DrawStringAnchored(req.Text, CANVAS_W/2, CANVAS_H/2, 0.5, 0.5)
	}

	buf, err := utils.EncodeImageToBuffer(dc.Image())
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to encode image"})
		return
	}

	c.Data(200, "image/png", buf)
}

func normX(x int) int { return x + OFF_X }
func normY(y int) int { return y + OFF_Y }

func drawBar(dc *gg.Context, uiPath func(string)string, x, y int, current, max float64, typePrefix string, w, h int) {
	if max <= 0 { max = 1 }
	percent := current / max
	spriteNum := int(math.Min(5, math.Max(1, math.Round(percent*4)+1)))
	
	filename := fmt.Sprintf("%s%d.png", typePrefix, spriteNum)
	img, err := utils.LoadImage(uiPath(filename))
	if err == nil {
		img = imaging.Resize(img, w, h, imaging.NearestNeighbor)
		dc.DrawImage(img, x, y)
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func getRandomEnvironment(assetsPath string) string {
	envPath := filepath.Join(assetsPath, "rpgasset", "environment")
	
	entries, err := os.ReadDir(envPath)
	if err != nil {
		return ""
	}
	
	var files []string
	for _, entry := range entries {
		if !entry.IsDir() {
			name := entry.Name()
			ext := filepath.Ext(name)
			if ext == ".png" || ext == ".jpg" || ext == ".jpeg" {
				files = append(files, filepath.Join(envPath, name))
			}
		}
	}
	
	if len(files) == 0 {
		return ""
	}
	
	// Return first one (or could randomize)
	return files[0]
}
