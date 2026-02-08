uniform float time;
uniform float testing;
uniform float delta; // about 0.016
uniform float separationDistance; // 20
uniform float alignmentDistance; // 40
uniform float cohesionDistance; // 60
uniform float freedomFactor;
uniform vec3 predator;
const float width = resolution.x;
const float height = resolution.y;
const float PI = 3.141592653589793;
const float PI_2 = PI * 2.0;
// const float VISION = PI * 0.55;
float zoneRadius = 40.0;
float zoneRadiusSquared = 1600.0;
float separationThresh = 0.45;
float alignmentThresh = 0.65;
const float UPPER_BOUNDS = BOUNDS;
const float LOWER_BOUNDS = -UPPER_BOUNDS;
const float SPEED_LIMIT = 9.0;
const float PREY_RADIUS = 150.0;
const float PREDATOR_FLEE_STRENGTH = 100.0;
const float PREDATOR_SPEED_BOOST = 5.0;
const float CENTRAL_ATTRACTION_STRENGTH = 5.0;
const float CENTRAL_VERTICAL_MULTIPLIER = 2.5;
const float MIN_DISTANCE = 0.0001;
float rand( vec2 co ){
	return fract( sin( dot( co.xy, vec2(12.9898,78.233) ) ) * 43758.5453 );
}

void main() {
	zoneRadius = separationDistance + alignmentDistance + cohesionDistance;
	separationThresh = separationDistance / zoneRadius;
	alignmentThresh = ( separationDistance + alignmentDistance ) / zoneRadius;
	zoneRadiusSquared = zoneRadius * zoneRadius;

	vec2 uv = gl_FragCoord.xy / resolution.xy;
	vec3 fihPosition, fihVelocity;
	vec3 selfPosition = texture2D( texturePosition, uv ).xyz;
	vec3 selfVelocity = texture2D( textureVelocity, uv ).xyz;
	float dist;
	vec3 dir; // direction
	float distSquared;
	float separationSquared = separationDistance * separationDistance;
	float cohesionSquared = cohesionDistance * cohesionDistance;
	float f;
	float percent;
	vec3 velocity = selfVelocity;
	float limit = SPEED_LIMIT;
	
	dir = predator * UPPER_BOUNDS - selfPosition;
	dir.z = 0.;
	// dir.z *= 0.6;
	dist = length( dir );
	distSquared = dist * dist;
	float preyRadiusSq = PREY_RADIUS * PREY_RADIUS;
	// move fihs away from predator
	if ( dist < PREY_RADIUS ) {
		f = ( distSquared / preyRadiusSq - 1.0 ) * delta * PREDATOR_FLEE_STRENGTH;
		velocity += normalize( dir ) * f;
		limit += PREDATOR_SPEED_BOOST;
	}
	// if (testing == 0.0) {}
	// if ( rand( uv + time ) < freedomFactor ) {}
	// Attract flocks to the center
	vec3 central = vec3( 0., 0., 0. );
	dir = selfPosition - central;
	dist = length( dir );
	dir.y *= CENTRAL_VERTICAL_MULTIPLIER;
	velocity -= normalize( dir ) * delta * CENTRAL_ATTRACTION_STRENGTH;
	for ( float y = 0.0; y < height; y++ ) {
		for ( float x = 0.0; x < width; x++ ) {
			vec2 ref = vec2( x + 0.5, y + 0.5 ) / resolution.xy;
			fihPosition = texture2D( texturePosition, ref ).xyz;
			dir = fihPosition - selfPosition;
			dist = length( dir );
			if ( dist < MIN_DISTANCE ) continue;
			distSquared = dist * dist;
			if ( distSquared > zoneRadiusSquared ) continue;
			percent = distSquared / zoneRadiusSquared;
			if ( percent < separationThresh ) { // low
				// Separation - Move apart for comfort
				f = ( separationThresh / percent - 1.0 ) * delta;
				velocity -= normalize( dir ) * f;
			} else if ( percent < alignmentThresh ) { // high
				// Alignment - fly the same direction
				float threshDelta = alignmentThresh - separationThresh;
				float adjustedPercent = ( percent - separationThresh ) / threshDelta;
				fihVelocity = texture2D( textureVelocity, ref ).xyz;
				f = ( 0.5 - cos( adjustedPercent * PI_2 ) * 0.5 + 0.5 ) * delta;
				velocity += normalize( fihVelocity ) * f;
			} else {
				// Attraction / Cohesion - move closer
				float threshDelta = 1.0 - alignmentThresh;
				float adjustedPercent;
				if( threshDelta == 0. ) adjustedPercent = 1.;
				else adjustedPercent = ( percent - alignmentThresh ) / threshDelta;
				f = ( 0.5 - ( cos( adjustedPercent * PI_2 ) * -0.5 + 0.5 ) ) * delta;
				velocity += normalize( dir ) * f;
			}
		}
	}
	// this make tends to fly around than down or up
	// if (velocity.y > 0.) velocity.y *= (1. - 0.2 * delta);
	// Speed Limits
	if ( length( velocity ) > limit ) {
		velocity = normalize( velocity ) * limit;
	}
	gl_FragColor = vec4( velocity, 1.0 );
}