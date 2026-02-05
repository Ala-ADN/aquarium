attribute vec2 reference;
attribute float fihVertex;
attribute vec3 fihColor;
uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
varying vec4 vColor;
varying float z;
uniform float time;

void main() {
	vec4 tmpPos = texture2D( texturePosition, reference );
	vec3 pos = tmpPos.xyz;
	vec3 velocity = normalize(texture2D( textureVelocity, reference ).xyz);
	vec3 newPosition = position;
    if (fihVertex == 8.0 || fihVertex == 9.0) {
        // Tail fin
        newPosition.y += sin(tmpPos.w * 2.0) * 8.0;
        newPosition.x += cos(tmpPos.w * 2.0) * 8.0;
    }
	newPosition = mat3( modelMatrix ) * newPosition;
	velocity.z *= -1.;
	float xz = length( velocity.xz );
	float xyz = 1.;
	float x = sqrt( 1. - velocity.y * velocity.y );
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
	z = newPosition.z;
	vColor = vec4( fihColor, 1.0 );
	gl_Position = projectionMatrix *  viewMatrix  * vec4( newPosition, 1.0 );
}