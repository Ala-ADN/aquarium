uniform float activeCount;
uniform sampler2D activeSlots;
uniform sampler2D activeReferences;
uniform bool contiguousActiveSlots;
#if USE_SPATIAL_GRID
uniform bool useSpatialGrid;
uniform sampler2D spatialGrid;
uniform float gridCellSize;
uniform float gridWordCount;
uniform float densityProbeWord;
uniform highp uvec4 densityProbeMask;
#endif
uniform float delta; // about 0.016
uniform float separationDistance; // 20
uniform float alignmentDistance; // 40
uniform float cohesionDistance; // 60
uniform vec3 predator;
const float width = resolution.x;
const float height = resolution.y;
const float PI = 3.141592653589793;
const float PI_2 = PI * 2.0;
float zoneRadius = 40.0;
float zoneRadiusSquared = 1600.0;
float separationThresh = 0.45;
float alignmentThresh = 0.65;
const float UPPER_BOUNDS = BOUNDS;
uniform float speedLimit;
const float PREY_RADIUS = 150.0;
const float PREDATOR_FLEE_STRENGTH = 100.0;
const float PREDATOR_SPEED_BOOST = 5.0;
const float CENTRAL_ATTRACTION_STRENGTH = 5.0;
const float CENTRAL_VERTICAL_MULTIPLIER = 2.5;
const float MIN_DISTANCE = 0.0001;

void interact(vec2 ref, vec3 selfPosition, inout vec3 velocity) {
    vec3 dir = texture2D(texturePosition, ref).xyz - selfPosition;
    float distSquared = dot(dir, dir);
    if (distSquared < MIN_DISTANCE * MIN_DISTANCE || distSquared > zoneRadiusSquared) return;
    vec3 direction = dir * inversesqrt(distSquared);
    float percent = distSquared / zoneRadiusSquared;
    if (percent < separationThresh) {
        float f = (separationThresh / percent - 1.) * delta;
        velocity -= direction * f;
    } else if (percent < alignmentThresh) {
        float adjusted = (percent - separationThresh) / (alignmentThresh - separationThresh);
        float f = (1. - cos(adjusted * PI_2) * .5) * delta;
        velocity += normalize(texture2D(textureVelocity, ref).xyz) * f;
    } else {
        float adjusted = (1. - alignmentThresh) == 0. ? 1. : (percent - alignmentThresh) / (1. - alignmentThresh);
        float f = .5 * cos(adjusted * PI_2) * delta;
        velocity += direction * f;
    }
}

void directNeighbors(vec3 selfPosition, inout vec3 velocity) {
    for (float y = 0.; y < height; y++) {
        if (y * width >= activeCount) break;
        for (float x = 0.; x < width; x++) {
            if (y * width + x >= activeCount) break;
            vec2 ref = vec2(x + .5, y + .5) / resolution.xy;
            if (!contiguousActiveSlots) ref = texture2D(activeReferences, ref).rg;
            interact(ref, selfPosition, velocity);
        }
    }
}

#if USE_SPATIAL_GRID
uvec4 localMembers(float word, vec3 minCell, vec3 maxCell) {
    uvec4 members = uvec4(0u);
    for (int z = 0; z < 2; z++) {
        for (int y = 0; y < 2; y++) {
            for (int x = 0; x < 2; x++) {
                vec3 cell = minCell + vec3(float(x), float(y), float(z));
                if (any(greaterThan(cell, maxCell))) continue;
                vec2 pixel = vec2(cell.x * GRID_WORDS + word, cell.y + cell.z * GRID_SIDE);
                members |= uvec4(texture2D(spatialGrid, (pixel + .5) / vec2(GRID_SIDE * GRID_WORDS, GRID_SIDE * GRID_SIDE)));
            }
        }
    }
    return members;
}

void spatialNeighbors(vec3 selfPosition, inout vec3 velocity) {
    vec3 minCell = clamp(floor((selfPosition - zoneRadius) / gridCellSize + GRID_SIDE * .5), vec3(0.), vec3(GRID_SIDE - 1.));
    vec3 maxCell = clamp(floor((selfPosition + zoneRadius) / gridCellSize + GRID_SIDE * .5), vec3(0.), vec3(GRID_SIDE - 1.));
    uvec4 probe = localMembers(densityProbeWord, minCell, maxCell);
    // A concentrated school favors the simpler loop. Sampling only selects an
    // equivalent exact kernel; it never removes neighbors from the simulation.
    if (all(equal(probe & densityProbeMask, densityProbeMask))) {
        directNeighbors(selfPosition, velocity);
        return;
    }
    for (float word = 0.; word < GRID_WORDS; word++) {
        if (word >= gridWordCount) break;
        uvec4 members = word == densityProbeWord ? probe : localMembers(word, minCell, maxCell);
        for (int lane = 0; lane < 4; lane++) {
            uint bits = members[lane];
            for (int count = 0; count < 24; count++) {
                if (bits == 0u) break;
                uint bit = bits & (~bits + 1u);
                // A single bit is a power of two; its float32 exponent gives
                // its index exactly, without a logarithm or a search loop.
                float bitIndex = float(int(floatBitsToUint(float(bit)) >> 23u) - 127);
                float slot = word * 96. + float(lane) * 24. + bitIndex;
                bits ^= bit;
                vec2 ref = vec2(mod(slot, width) + .5, floor(slot / width) + .5) / resolution.xy;
                interact(ref, selfPosition, velocity);
            }
        }
    }
}
#endif

void main() {
	zoneRadius = separationDistance + alignmentDistance + cohesionDistance;
	separationThresh = separationDistance / zoneRadius;
	alignmentThresh = ( separationDistance + alignmentDistance ) / zoneRadius;
	zoneRadiusSquared = zoneRadius * zoneRadius;

	vec2 uv = gl_FragCoord.xy / resolution.xy;
	// Inactive slots remain ready for later releases, but never affect the school.
	bool isActive = contiguousActiveSlots
		? floor(gl_FragCoord.y) * width + floor(gl_FragCoord.x) < activeCount
		: texture2D(activeSlots, uv).r >= 0.5;
	if (!isActive) {
		gl_FragColor = texture2D(textureVelocity, uv);
		return;
	}
	vec3 selfPosition = texture2D( texturePosition, uv ).xyz;
	vec3 selfVelocity = texture2D( textureVelocity, uv ).xyz;
	float dist;
	vec3 dir; // direction
	float distSquared;
	float f;
	vec3 velocity = selfVelocity;
	float limit = speedLimit;
	
	dir = predator * UPPER_BOUNDS - selfPosition;
	dir.z = 0.;
	dist = length( dir );
	distSquared = dist * dist;
	float preyRadiusSq = PREY_RADIUS * PREY_RADIUS;
	// move fihs away from predator
	if ( dist < PREY_RADIUS ) {
		f = ( distSquared / preyRadiusSq - 1.0 ) * delta * PREDATOR_FLEE_STRENGTH;
		velocity += normalize( dir ) * f;
		limit += PREDATOR_SPEED_BOOST;
	}
	// Attract flocks to the center
	vec3 central = vec3( 0., 0., 0. );
	dir = selfPosition - central;
	dir.y *= CENTRAL_VERTICAL_MULTIPLIER;
	velocity -= normalize( dir ) * delta * CENTRAL_ATTRACTION_STRENGTH;
#if USE_SPATIAL_GRID
    if (useSpatialGrid) spatialNeighbors(selfPosition, velocity);
    else directNeighbors(selfPosition, velocity);
#else
    directNeighbors(selfPosition, velocity);
#endif
	// Speed Limits
	if ( length( velocity ) > limit ) {
		velocity = normalize( velocity ) * limit;
	}
	gl_FragColor = vec4( velocity, 1.0 );
}
