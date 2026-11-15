extends CharacterBody3D

@onready var anim = $AnimationPlayer
@onready var audio = $AudioStreamPlayer3D


func _ready() -> void:
	pass
	
	
	



func _process(delta: float) -> void:
	pass

func attack():
	anim.play("Attack")
	audio.stream = load("res://Sounds/SkelyAttack.mp3")
	audio.play()
func die():
	anim.play("Death")
	audio.stream =load("res://Sounds/SkelyDeath.mp3")
	audio.play()
func run():
	anim.play("Run")
	audio.stream = load("res://Sounds/SkelyBase.mp3")
	audio.play()
func hit():
	anim.play("Hit")
func idle():
	anim.play("Idle")
func scream():
	anim.play("Scream")
	audio.stream = load("res://Sounds/SkelyAttack.mp3")
	audio.play()
