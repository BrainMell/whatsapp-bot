extends RigidBody3D
@onready var PillarSound = $PillarSound
var fallen:bool = false
var starting_transform
func _ready() -> void:
	starting_transform = global_transform
	
func pillar_fall(power):
	var player = get_tree().get_first_node_in_group("player")  #find player by group "player"
	if not player:
		return  
	if fallen:
		print("The pillar has already fallen")
		return
	
	freeze = false
	var direction = player.global_position - global_position
	direction = direction.normalized() * power
	apply_impulse(-direction,Vector3(0,2,0))
	fallen = true

func pillar_up():
	var player = get_tree().get_first_node_in_group("player")  #find player by group "player"
	if not player:
		return  
	if not fallen:
		print("The pillar hasnt fallen")
		return
		
	
	var tween = create_tween()
	tween.tween_property(self, "global_transform",starting_transform, 1)
	fallen = false
	tween.connect("finished", on_píllar_picked)
	
func on_píllar_picked():
	freeze = true


func _on_body_entered(body: Node) -> void:
	if not PillarSound.playing:
		PillarSound.playing = true
