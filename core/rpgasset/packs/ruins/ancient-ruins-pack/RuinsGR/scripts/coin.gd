extends RigidBody3D

@onready var CoinSound= $CoinSound

func pick_up() -> void:
	gravity_scale = 0.1
	apply_central_force(Vector3(0,10,0))
	CoinSound.playing = true
	await get_tree().create_timer(1.5).timeout
	visible = false
	
	
	
