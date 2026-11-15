extends CharacterBody3D

var SPEED = 4.5
const JUMP_VELOCITY = 4.5
@export var sensitivity: float = 0.05
@onready var camera = $Camera3D
@onready var ray =$Camera3D/RayCast3D
@onready var PlayerSound = $PlayerSound
var look_x := 0.0 
var look_y := 0.0 
var root
func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED  #hide cursor

func _physics_process(delta: float) -> void:
	#get collider and its root
	
	if ray.is_colliding():
		var collider = ray.get_collider()
		if collider.get_script():
			pass
		else:
			collider = collider.get_owner()
		
		if collider.is_in_group("wallDes") and Input.is_action_just_pressed("Mouse1") :
			collider.break_wall() 
		if collider.is_in_group("PillarFall") and Input.is_action_just_pressed("Mouse1") :
			collider.pillar_fall(4000) 
		if collider.is_in_group("PillarFall") and Input.is_action_just_pressed("Mouse2") :
			collider.pillar_up() 
		if collider.is_in_group("chest") and Input.is_action_just_pressed("Mouse1") :
			collider.open_chest(1.5)
		if collider.is_in_group("coin") and Input.is_action_just_pressed("Mouse1") :
			collider.pick_up()
			
			
	#gravity
	if not is_on_floor():
		velocity += get_gravity() * delta
	#jump
	if Input.is_action_just_pressed("ui_accept") and is_on_floor():
		velocity.y = JUMP_VELOCITY
	#wasd
	var input_dir := Input.get_vector("Left", "Right", "Forward", "Back")
	var direction := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()
	if direction:
		velocity.x = direction.x * SPEED
		velocity.z = direction.z * SPEED
		if not PlayerSound.playing:
			PlayerSound.playing = true
	else:
		velocity.x = move_toward(velocity.x, 0, SPEED)
		velocity.z = move_toward(velocity.z, 0, SPEED)
		PlayerSound.playing = false
		

	move_and_slide()
	
func _input(event):
	#mouse movement
	if event is InputEventMouseMotion:
		look_y -= event.relative.x * sensitivity
		look_x -= event.relative.y * sensitivity
		look_x = clamp(look_x, -80, 80) 
		rotation_degrees.y = look_y 
		camera.rotation_degrees.x = look_x  
		
	if Input.is_action_pressed("Walk"):
		SPEED = 3.0
	if Input.is_action_just_released("Walk"):
		SPEED = 4.5
