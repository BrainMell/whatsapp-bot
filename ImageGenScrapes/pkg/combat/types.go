package combat

// Player represents a player in the combat scene
type Player struct {
	Name           string `json:"name"`
	Class          string `json:"class"` // e.g. "FIGHTER"
	Level          int    `json:"level"`
	HP             int    `json:"hp"`        // Current HP
	MaxHP          int    `json:"maxHp"`
	CurrentHP      int    `json:"currentHP"` // Redundant but often sent
	Energy         int    `json:"energy"`
	MaxEnergy      int    `json:"maxEnergy"`
	AdventurerRank string `json:"adventurerRank"`
	SpriteIndex    int    `json:"spriteIndex"`
}

// Enemy represents an enemy in the combat scene
type Enemy struct {
	Name        string `json:"name"`
	CurrentHP   int    `json:"currentHP"`
	MaxHP       int    `json:"maxHp"`
	IsBoss      bool   `json:"isBoss"`
	JustDied    bool   `json:"justDied"`
	SpriteIndex int    `json:"spriteIndex"`
}

// CombatRequest is the payload sent from Node.js
type CombatRequest struct {
	Players    []Player `json:"players"`
	Enemies    []Enemy  `json:"enemies"`
	CombatType string   `json:"combatType"` // "PVE" or "PVP"
	Rank       string   `json:"rank"`
	Background string   `json:"background"` // Filename only
}
