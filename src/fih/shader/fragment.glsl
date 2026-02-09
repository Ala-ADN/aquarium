varying float z;
uniform vec3 color;
uniform sampler2D textureVelocity;
varying vec2 vReference;
void main() {
    // Sample velocity and calculate speed
    vec3 velocity = texture2D( textureVelocity, vReference ).xyz;
    float speed = length( velocity );
    
    // Normalize speed (SPEED_LIMIT is 9.0, can go up to 14.0 with boost)
    float normalizedSpeed = clamp( speed / 14.0, 0.1, 0.8 );
    
    // Mix color based on speed (slow = blue, fast = red)
    vec3 speedColor = mix( vec3(0.0, 0.3, 1.0), vec3(1.0, 0.2, 0.0), normalizedSpeed );
    
    // Combine with depth-based color
    vec3 z2 = 0.2 + ( 1000. - z ) / 1000. * color;
    // vec3 finalColor = mix( z2, speedColor, 0.5 ); // Blend 50/50
 
    gl_FragColor = vec4( speedColor, 1.0 ); 
}  