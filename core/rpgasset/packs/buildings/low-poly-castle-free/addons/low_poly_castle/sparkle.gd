extends Node3D
## A glint on something to pick up, open or use, as games mark what can be interacted with: a
## four-pointed star over its middle that swells and fades every `every` seconds, facing the camera,
## seen through the thing itself but not through what stands between it and the camera. Put it
## under the prop's root (a pickup makes its own, the gallery's level one on everything E does
## something to); `parts` narrows it to those nodes' meshes (a house's door, not the house).
##     var glint := preload("res://addons/low_poly_castle/sparkle.gd").new()
##     $Lever.add_child(glint)  # glint.shown = false to hide it

@export var shown := true
@export var parts: Array[NodePath] = []  ## nodes under its parent whose meshes it marks; all of them when empty
@export var every := 2.0
@export var reach := 15.0  ## metres from the camera past which it doesn't show

var _star: Sprite3D
var _time := 0.0
var _seen := true


func _ready() -> void:
	var prop := get_parent() as Node3D
	var meshes: Array = []
	for p in parts:
		var n := prop.get_node_or_null(p)
		if n:
			meshes += [n] if n is MeshInstance3D else []
			meshes += n.find_children("*", "MeshInstance3D", true, false)
	if meshes.is_empty():
		meshes = prop.find_children("*", "MeshInstance3D", true, false)
	var box := AABB()
	for k in meshes.size():
		var b: AABB = _local(meshes[k], prop) * meshes[k].get_aabb()
		box = b if k == 0 else box.merge(b)
	position = box.get_center()
	_star = _make(clampf(box.size.length() * 0.08, 0.12, 0.3))
	add_child(_star)
	_time = fposmod(prop.global_position.x * 0.7 + prop.global_position.z * 0.3, every)  # each on its own beat


func _process(delta: float) -> void:
	var was := _time
	_time = fmod(_time + delta, every)
	if _time < was:  # a glint begins: whether the camera sees the thing
		_seen = _in_sight()
	var s := sin(clampf(_time / 0.5, 0.0, 1.0) * PI)
	_star.visible = shown and _seen and s > 0.02
	_star.scale = Vector3.ONE * maxf(0.01, s)
	_star.rotation.z = _time * 1.5


func _in_sight() -> bool:
	var cam := get_viewport().get_camera_3d()
	if not cam or not is_inside_tree():
		return false
	var from := cam.global_position
	var to := global_position
	if from.distance_to(to) > reach:
		return false
	var ray := PhysicsRayQueryParameters3D.create(from, to)
	var hit := get_world_3d().direct_space_state.intersect_ray(ray)
	return hit.is_empty() or get_parent().is_ancestor_of(hit["collider"])


func _local(n: Node3D, top: Node3D) -> Transform3D:
	var t := Transform3D.IDENTITY
	while n and n != top:
		t = n.transform * t
		n = n.get_parent() as Node3D
	return t


## A four-pointed star `size` metres across, drawn here, a sprite drawn over what it marks.
func _make(size: float) -> Sprite3D:
	var img := Image.create(16, 16, false, Image.FORMAT_RGBA8)
	for y in 16:
		for x in 16:
			var d := Vector2(absf(x - 7.5), absf(y - 7.5))
			var v := clampf(1.0 - (d.x * d.y) / 6.0 - d.length() / 9.0, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 0.9, v))
	var star := Sprite3D.new()
	star.name = "Glint"
	star.texture = ImageTexture.create_from_image(img)
	star.pixel_size = size / 16.0
	star.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	star.shaded = false
	star.no_depth_test = true
	star.render_priority = 1
	star.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	star.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return star
