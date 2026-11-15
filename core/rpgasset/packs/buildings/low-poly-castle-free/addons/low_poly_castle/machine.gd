extends Node3D
## A machine: on a usable prop's scene root, what a use does to it, its state and the animations
## that show it. `kind` says what a use does:
##   switch   switches it on and off, `clip` playing forward to on and back to off; with `motor` (a
##            lift's ride, a hoist) it refuses a use while unpowered
##   button   the same, `clip` playing through at each press
##   turn     `steps` uses open it, `clip` a step each (forward opening, back closing); on while open
##   slot     fitting what it `takes` switches it on, taking it back out off; with `keep` (a card)
##            the item stays with the user, `clip` plays through and each use switches it
##   keypad   its keys (parts named `*_key_<key>`, each with a clip of its name) pressed: on when they
##            spell `code`, or at any key without one; "C" clears, "on" and "off" switch it
##   panel    its keys are switches, each up or down; on while they read `code`, "1" up, "0" down
##   item     picked up: `item` into the user's items, and gone
##   powered  on while its needs are live, `clip` playing forward as it comes on; with no needs a
##            use switches it (a door)
##   gauge    reads its first need's output, `level` held at it (a needle, a gate a crank winds up)
## Anything else it `takes` is fitted by its first use. It is powered while every machine in `needs`
## is live, and live while on and powered. Its `lit` parts show while it is live, its `idle` parts
## while powered and off, a panel's `*_lamp_<key>` while powered and that key is up, its `fitted`
## parts once what it takes is in (with `keep`, while it plays); `run` loops while it is live. Its
## output, what a gauge reads: a turn's share of its steps while powered, else 1 when live.
##     $Lever.switched.connect(func(on): print("lever ", on))
##     $Door.needs = [$Door.get_path_to($Lever)]  # or in the inspector, before it enters the tree

signal used(part: String)  ## a use did something; `part` is the one used
signal switched(on: bool)
signal live_changed(live: bool)
signal refused(why: String)  ## "power", "code", or the item it wants
signal keyed(key: String)
signal picked(item: String)
signal changed  ## its state or output moved: what a machine that needs it listens for

@export_enum("switch", "button", "turn", "slot", "keypad", "panel", "item", "powered", "gauge") var kind := "switch"
@export var on := false
@export var needs: Array[NodePath] = []
@export var clip := ""
@export var run := ""
@export var level := ""
@export var steps := 1
@export var takes := ""
@export var keep := false
@export var motor := false
@export var item := ""
@export var code := ""
@export var lit := PackedStringArray()
@export var idle := PackedStringArray()
@export var fitted := PackedStringArray()

var live := false
var powered := true
var count := 0  # a turn's steps open
var entry := ""  # a keypad's keys so far
var state := ""  # a panel's keys, "1" up
var has_item := false
var shown := 0.0  # a gauge's reading
var keys: Array[String] = []
var _needs: Array = []
var _parts := {}  # name -> MeshInstance3D
var _player: AnimationPlayer
var _root: Node
var _at := {}  # each clip's time
var _moves := {}  # clip -> [time it is going to (INF: looping), Callable when it gets there, or null]
var _opening := true


func _ready() -> void:
	_player = find_child("AnimationPlayer", true, false) as AnimationPlayer
	if _player:
		_root = _player.get_node(_player.root_node)
	for p in find_children("*", "MeshInstance3D", true, false):
		_parts[String(p.name)] = p
		var at := String(p.name).rfind("_key_")
		if at >= 0:
			keys.append(String(p.name).substr(at + 5))
	count = steps if on else 0
	_opening = not on
	has_item = on and kind == "slot" and not keep
	state = code if on and kind == "panel" else "0".repeat(keys.size())
	if _has(clip) and kind in ["switch", "slot", "powered"] and not keep:
		_pose(clip, _len(clip) if on else 0.0)
	var glow: BaseMaterial3D
	for n in Array(lit) + Array(idle):
		if _parts.has(n):
			if not glow:  # lamps light up
				glow = (_parts[n].mesh.surface_get_material(0) as BaseMaterial3D).duplicate()
				glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			_parts[n].material_override = glow
	_show(fitted, has_item)
	var linked: Array = []
	for n in needs:
		linked.append(get_node(n))
	wire(linked)


## Uses it, carrying `items` (what it takes comes from there, what is picked up goes there), on
## `part` where it has keys. Whether it did anything.
func use(items: Array = [], part := "") -> bool:
	if kind == "item":
		items.append(item)
		picked.emit(item)
		used.emit(part)
		hide()
		process_mode = Node.PROCESS_MODE_DISABLED  # out of the physics as well
		return true
	if kind == "gauge" or _moves.has(clip) and kind in ["switch", "turn", "slot", "powered"]:
		return false
	if takes and kind != "slot" and not has_item:
		if takes not in items:
			refused.emit(takes)
			return false
		items.erase(takes)
		has_item = true
		_show(fitted, true)
		used.emit(part)
		return true
	match kind:
		"switch", "button":
			if motor and not powered:
				refused.emit("power")
				return false
			_switch(not on)
		"powered":
			if not _needs.is_empty():
				refused.emit("power")
				return false
			_switch(not on)
		"turn":
			if not powered:
				refused.emit("power")
				return false
			if _opening:
				count += 1
				_play(clip, _len(clip), _pose.bind(clip, 0.0))
			else:
				count -= 1
				_pose(clip, _len(clip))
				_play(clip, 0.0)
			if count == steps or count == 0:
				_opening = count == 0
			_flip(count == steps)
		"slot":
			if keep:
				if takes not in items:
					refused.emit(takes)
					return false
				_show(fitted, true)
				_play(clip, _len(clip), func() -> void:
					_pose(clip, 0.0)
					_show(fitted, false))
				_flip(not on)
			elif has_item:
				items.append(takes)
				has_item = false
				_play(clip, 0.0, _show.bind(fitted, false))
				_flip(false)
			elif takes in items:
				items.erase(takes)
				has_item = true
				_show(fitted, true)
				_play(clip, _len(clip))
				_flip(true)
			else:
				refused.emit(takes)
				return false
		"keypad":
			var key := _key(part)
			if key.is_empty():
				return false
			_play(part, _len(part), _pose.bind(part, 0.0))
			keyed.emit(key)
			if not powered:
				refused.emit("power")
			elif key == "C":
				entry = ""
			elif key in ["on", "off"]:
				_flip(key == "on")
			elif code.is_empty():
				_flip(true)
			else:
				entry += key
				if entry.length() >= code.length():
					if entry == code:
						_flip(true)
					else:
						refused.emit("code")
					entry = ""
		"panel":
			var k := keys.find(_key(part))
			if k < 0:
				return false
			var up := state[k] == "0"
			state = state.substr(0, k) + ("1" if up else "0") + state.substr(k + 1)
			_play(part, _len(part) if up else 0.0)
			if not powered:
				refused.emit("power")
			_flip(state == code)
	used.emit(part)
	return true


## Sets it on or off without a use: a turn all its steps, a keypad's code in, a panel's keys to it,
## a slot's item conjured in or out, an item picked up by nobody.
func set_on(value: bool) -> void:
	match kind:
		"turn":
			count = steps if value else 0
			_opening = not value
		"panel":
			state = code if value else "0".repeat(keys.size())
			for k in keys.size():
				var part := _control(keys[k])
				_play(part, _len(part) if state[k] == "1" else 0.0)
		"slot":
			has_item = value and not keep
			_show(fitted, has_item)
		"item":
			visible = not value
			return
	if kind in ["switch", "slot", "powered"] and not keep:
		_play(clip, _len(clip) if value else 0.0)
	_flip(value)


## Every clip where it is going, at once (a loop keeps running): for a capture.
func settle() -> void:
	for c in _moves.keys():
		var move: Array = _moves[c]
		if move[0] == INF:
			continue
		_moves.erase(c)
		_pose(c, move[0])
		if move[1]:
			move[1].call()


## Its needs as nodes, the machines it reads, in place of `needs`' paths.
func wire(machines: Array) -> void:
	for m in _needs:
		m.changed.disconnect(_refresh)
	_needs = machines
	for m in _needs:
		m.changed.connect(_refresh)
	_refresh()


func output() -> float:
	if kind == "turn":
		return float(count) / steps if powered else 0.0
	if kind == "gauge":
		return shown
	return 1.0 if live else 0.0


func _flip(value: bool) -> void:
	if value != on:
		on = value
		switched.emit(on)
		if on and not powered and kind != "powered":
			refused.emit("power")
	_refresh()


func _switch(value: bool) -> void:
	if kind == "button":
		_play(clip, _len(clip), _pose.bind(clip, 0.0))
	else:
		_play(clip, _len(clip) if value else 0.0)
	_flip(value)


func _refresh() -> void:
	var was := live
	powered = _needs.all(func(m): return m.live)
	if kind == "powered" and not _needs.is_empty() and powered != on:
		on = powered
		_play(clip, _len(clip) if on else 0.0)
		switched.emit(on)
	if kind == "gauge":
		shown = _needs[0].output() if not _needs.is_empty() else 0.0
		on = shown > 0.0
	live = on and powered
	_show(lit, live)
	_show(idle, powered and not on)
	for k in keys.size():
		_show(_parts.keys().filter(func(n): return n.ends_with("_lamp_" + keys[k])), powered and state.substr(k, 1) == "1")
	if _has(run) and live != _moves.has(run):
		if live:
			_moves[run] = [INF, null]
		else:
			_moves.erase(run)
	if _has(level):
		_play(level, output() * _len(level))
	if live != was:
		live_changed.emit(live)
	changed.emit()


func _process(delta: float) -> void:
	for c in _moves.keys():
		var move: Array = _moves[c]
		var t: float = _at.get(c, 0.0)
		if move[0] == INF:
			_pose(c, fmod(t + delta, _len(c)))
			continue
		t = move_toward(t, move[0], delta)
		_pose(c, t)
		if t == move[0]:
			_moves.erase(c)
			if move[1]:
				move[1].call()


func _play(c: String, to: float, then = null) -> void:
	if _has(c):
		_moves[c] = [to, then]
	elif then:
		then.call()


## The clip `c`'s tracks at `t` seconds, set on its parts: each clip keeps its own time, so a lever
## stays thrown while an engine runs.
func _pose(c: String, t: float) -> void:
	_at[c] = t
	var a := _player.get_animation(c)
	for i in a.get_track_count():
		var node := _root.get_node_or_null(NodePath(String(a.track_get_path(i)).get_slice(":", 0))) as Node3D
		if not node:
			continue
		match a.track_get_type(i):
			Animation.TYPE_POSITION_3D:
				node.position = a.position_track_interpolate(i, t)
			Animation.TYPE_ROTATION_3D:
				node.quaternion = a.rotation_track_interpolate(i, t)
			Animation.TYPE_SCALE_3D:
				node.scale = a.scale_track_interpolate(i, t)


func _has(c: String) -> bool:
	return not c.is_empty() and _player != null and _player.has_animation(c)


func _len(c: String) -> float:
	return _player.get_animation(c).length if _has(c) else 0.0


func _key(part: String) -> String:
	var at := part.rfind("_key_")
	return part.substr(at + 5) if at >= 0 and _parts.has(part) else ""


func _control(key: String) -> String:
	for n in _parts:
		if n.ends_with("_key_" + key):
			return n
	return ""


func _show(names, value: bool) -> void:
	for n in names:
		if _parts.has(n):
			_parts[n].visible = value
