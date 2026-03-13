package combat

import (
	"path/filepath"
	// REMOVED: "fmt" and "math/rand" - not used in this file
)

var CharacterSprites = map[string][]string{
	"FIGHTER":      {"Fighter1.png", "fighter2.png", "fighter3.png"},
	"SCOUT":        {"scout1.png", "scout2.png", "scout3.png", "sout4.png"},
	"APPRENTICE":   {"apprentice1.png", "apprentice2.png", "apprentice3.png", "apprentice4.png"},
	"ACOLYTE":      {"acolyte.png"},
	"WARRIOR":      {"warrior1.png", "warrior2.png", "warrior3.png", "warrior4.png"},
	"WARLORD":      {"Warlord1.png", "warlord2.png", "warlord3.png"},
	"BERSERKER":    {"Berserker1.png", "Berserker2.png", "Berserker3.png"},
	"DOOMSLAYER":   {"DoomSlayer1.png", "DoomSlayer2.png"},
	"PALADIN":      {"Paladin (1).png", "Paladin (2).png", "Paladin (3).png", "Paladin (4).png", "Paladin (5).png", "Paladin (6).png", "Paladin (7).png", "Paladin (8).png"},
	"TEMPLAR":      {"Templar (1).png", "Templar (2).png", "Templar (3).png", "Templar (4).png", "Templar (5).png", "Templar (6).png", "Templar (7).png", "Templar (8).png", "Templar (9).png"},
	"ROGUE":        {"Rogue (1).png", "Rogue (2).png", "Rogue (3).png", "Rogue (4).png"},
	"NIGHTBLADE":   {"Nightblade (1).png", "Nightblade (2).png", "Nightblade (3).png", "Nightblade (4).png", "Nightblade (5).png", "Nightblade (6).png"},
	"MONK":         {"Monk.png"},
	"ZENMASTER":    {"zenmaster.png"},
	"NINJA":        {"ninja (1).png", "ninja (2).png", "ninja (3).png", "ninja (4).png", "ninja (5).png"},
	"MAGE":         {"archmage (1).png", "archmage (2).png", "archmage (3).png", "archmage (4).png", "archmage (5).png"},
	"ARCHMAGE":     {"archmage (6).png", "archmage (7).png", "archmage (8).png", "archmage (9).png", "archmage (10).png", "archmage (11).png", "archmage (12).png"},
	"WARLOCK":      {"voidwalker (1).png", "voidwalker (2).png", "voidwalker (3).png", "voidwalker (4).png"},
	"VOIDWALKER":   {"voidwalker (5).png", "voidwalker (6).png", "voidwalker (7).png", "voidwalker (8).png", "voidwalker (9).png"},
	"ELEMENTALIST": {"elementalist (1).png", "elementalist (2).png", "elementalist (3).png", "elementalist (4).png"},
	"CLERIC":       {"cleric (1).png", "cleric (2).png", "cleric (3).png", "cleric (4).png", "cleric (5).png", "cleric (6).png"},
	"SAINT":        {"saint (1).png", "saint (2).png", "saint (3).png", "saint (4).png"},
	"DRUID":        {"druid (1).png", "druid (2).png", "druid (3).png", "druid (4).png", "druid (5).png", "druid (6).png"},
	"ARCHDRUID":    {"archdruid (1).png", "archdruid (2).png", "archdruid (3).png", "archdruid (4).png", "archdruid (5).png", "archdruid (6).png", "archdruid (7).png", "archdruid (8).png", "archdruid (9).png"},
	"NECROMANCER":  {"necromancer.png"},
	"LICH":         {"lich.png"},
	"MERCHANT":     {"merchant.png"},
	"TYCOON":       {"tycoon.png"},
	"CHRONOMANCER": {"timelord (1).png", "timelord (2).png", "timelord (3).png", "timelord (4).png", "timelord (5).png"},
	"TIMELORD":     {"timelord (1).png", "timelord (2).png", "timelord (3).png", "timelord (4).png", "timelord (5).png"},
	"SAMURAI":      {"samuri (1).png", "samuri (2).png", "samuri (3).png", "samuri (4).png", "samuri (5).png", "samuri (6).png", "samuri (7).png", "samuri (8).png", "samuri (9).png", "samuri (10).png", "samuri (11).png"},
	"GOD_HAND":     {"God_hand (1).png", "God_hand (2).png"},
	"DRAGONSLAYER": {"warrior1.png", "warrior2.png", "warrior3.png", "warrior4.png"},
	"REAPER":       {"necromancer.png"},
	"BARD":         {"acolyte.png"},
	"ARTIFICER":    {"apprentice1.png", "apprentice2.png", "apprentice3.png", "apprentice4.png"},
	"AVATAR":       {"elementalist (1).png", "elementalist (2).png", "elementalist (3).png", "elementalist (4).png"},
}

var EnemySprites = map[string][]string{
	"FIRE_LOW":    {"fire (5).png", "fire (6).png"},
	"WATER_LOW":   {"water (4).png", "water (6).png"},
	"EARTH_MID":   {"earth (1).png", "earth (2).png", "earth (3).png"},
	"ICE_MID":     {"ice (1).png", "ice (2).png", "ice (3).png"},
	"FIRE_HIGH":   {"fire (7).png", "fire (8).png"},
	"WATER_HIGH":  {"water (7).png"},
	"EARTH_HIGH":  {"earth (4).png", "earth (5).png"},
	"MUTATED":     {"mutated (1).png", "mutated (2).png", "mutated (3).png", "mutated (4).png", "mutated (5).png", "mutated (6).png", "mutated (7).png"},
	"HYBRID":      {"hybrides (1).png", "hybrides (2).png", "hybrides (3).png", "hybrides (4).png", "hybrides (5).png", "hybrides (6).png", "hybrides (7).png"},
	"FIRE_ELITE":  {"fire (11).png"},
}

var BossSprites = map[string][]string{
	"MID_BOSSES":  {"midlevelbosses (1).png", "midlevelbosses (2).png", "midlevelbosses (3).png", "midlevelbosses (4).png", "midlevelbosses (5).png", "midlevelbosses (6).png", "midlevelbosses (7).png"},
	"HIGH_BOSSES": {"highlevelbosses (7).png", "highlevelbosses (8).png", "highlevelbosses (9).png", "highlevelbosses (10).png", "highlevelbosses (11).png", "highlevelbosses (12).png", "highlevelbosses (13).png"},
	"CALAMITY":    {"calamaties (1).png", "calamaties (2).png", "calamaties (3).png", "calamaties (4).png", "calamaties (5).png", "calamaties (6).png"},
}

func GetCharacterSpritePath(class string, index int, assetsPath string) string {
	list, ok := CharacterSprites[class]
	if !ok {
		list = CharacterSprites["FIGHTER"]
	}
	filename := list[index%len(list)]
	return filepath.Join(assetsPath, "rpgasset", "characters", filename)
}

func GetEnemySpritePath(level int, index int, isBoss bool, assetsPath string) string {
	var filename string
	if isBoss {
		var list []string
		if level <= 60 {
			list = BossSprites["MID_BOSSES"]
		} else if level <= 90 {
			list = BossSprites["HIGH_BOSSES"]
		} else {
			list = BossSprites["CALAMITY"]
		}
		filename = list[index%len(list)]
	} else {
		var list []string
		if level <= 10 {
			list = EnemySprites["FIRE_LOW"]
		} else if level <= 20 {
			list = EnemySprites["WATER_LOW"]
		} else if level <= 30 {
			list = EnemySprites["EARTH_MID"]
		} else if level <= 40 {
			list = EnemySprites["ICE_MID"]
		} else if level <= 50 {
			list = EnemySprites["FIRE_HIGH"]
		} else if level <= 60 {
			list = EnemySprites["WATER_HIGH"]
		} else if level <= 70 {
			list = EnemySprites["EARTH_HIGH"]
		} else if level <= 80 {
			list = EnemySprites["MUTATED"]
		} else if level <= 90 {
			list = EnemySprites["HYBRID"]
		} else {
			list = EnemySprites["FIRE_ELITE"]
		}
		filename = list[index%len(list)]
	}
	
	if filename == "" {
		filename = "fire (5).png"
	}

	return filepath.Join(assetsPath, "rpgasset", "enemies", filename)
}

func GetEnvironmentPath(bgName string, assetsPath string) string {
	if bgName == "" {
		bgName = "forest1.png" 
	}
	return filepath.Join(assetsPath, "rpgasset", "environment", bgName)
}
