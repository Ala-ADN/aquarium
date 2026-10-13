attribute vec2 reference;
attribute float fihVertex;
attribute vec3 fihColor;
uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
varying vec4 vColor;
varying float vViewDepth;
varying float vBodyHeight;
varying float vFin;
uniform float time;
varying float vColorVariation;

void main() {
	vColorVariation = fract(sin(dot(reference, vec2(127.1, 311.7))) * 43758.5453);
	vec4 tmpPos = texture2D( texturePosition, reference );
	vec3 pos = tmpPos.xyz;
	vec3 velocity = normalize(texture2D( textureVelocity, reference ).xyz);
	vec3 newPosition = position;
    vBodyHeight = position.y;
    vFin = fihVertex < 3.0 ? 1.0 : 0.0;
    if (fihVertex == 0.0 || fihVertex == 1.0) {
        // Tail fin
        newPosition.z += sin(tmpPos.w * 0.5) * 1.5;
        newPosition.x += cos(tmpPos.w * 0.5) * 1.0;
    }
	newPosition = mat3( modelMatrix ) * newPosition;
	velocity.z *= -1.;
	float xz = max(length( velocity.xz ), 0.0001);
	float xyz = 1.;
	float x = sqrt( max(0.0, 1. - velocity.y * velocity.y) );
	float cosry = velocity.x / xz;
	float sinry = velocity.z / xz;
	float cosrz = x / xyz;
	float sinrz = velocity.y / xyz;
	mat3 maty =  mat3(
		cosry, 0, -sinry,
		0    , 1, 0     ,
		sinry, 0, cosry
	);
	mat3 matz =  mat3(
		cosrz , sinrz, 0,
		-sinrz, cosrz, 0,
		0     , 0    , 1
	);
	newPosition =  maty * matz * newPosition;
	newPosition += pos;
	vColor = vec4( fihColor, 1.0 );
	vec4 viewPosition = viewMatrix * vec4(newPosition, 1.0);
	vViewDepth = -viewPosition.z;
	gl_Position = projectionMatrix * viewPosition;
}
