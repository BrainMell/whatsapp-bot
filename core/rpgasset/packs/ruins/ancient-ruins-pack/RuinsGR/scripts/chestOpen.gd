extends Node3D



var closed_chest
var opened_chest
var pos_chest_close
var pos_chest_open
var opened:bool = false
var is_in_motion:bool = false

@onready var lid = $ChestCover
@onready var ChestSound = $ChestOpen

func _ready() -> void:
	closed_chest = lid.rotation_degrees
	opened_chest = closed_chest + Vector3(0,0,90)
	pos_chest_close = lid.position
func open_chest(duration_rot):
	if is_in_motion:
		return
	is_in_motion = true
	ChestSound.playing = true
	if opened == false:
		var tween = create_tween()
		tween.tween_property(lid,"rotation_degrees",opened_chest,duration_rot)
		tween.connect("finished",moving)
		opened = true
	elif opened:
		var tween = create_tween()
		tween.tween_property(lid,"rotation_degrees",closed_chest,duration_rot)
		tween.connect("finished",moving)
		opened = false

func moving():
	is_in_motion = false
