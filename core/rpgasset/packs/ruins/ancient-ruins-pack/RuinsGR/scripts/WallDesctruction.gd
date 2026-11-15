extends Node3D
var broken:bool = false
@onready var wallSound = $WallSound
func break_wall():
	if broken == false:
		var player = get_tree().get_first_node_in_group("player")  #find player by group "player"
		if not player:
			return  
			
		for piece in get_children():  #get rigid bodies
			if piece is RigidBody3D:
				piece.freeze = false  #unfreeze physics
				#opposite of the player direction
				var direction = (piece.global_transform.origin - player.global_transform.origin).normalized()
				var x_dir = randf_range(-1, 1) 
				piece.apply_impulse(Vector3(direction.x * 7.5 + x_dir * 7.5, 0, 0),Vector3(0,2,0,)) # push
				broken = true #make sure that wall can be pushed only once
		wallSound.playing = true
