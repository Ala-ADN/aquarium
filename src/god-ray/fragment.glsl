varying vec2 vUv;
varying vec3 vWorldPosition;
uniform sampler2D uniformTexture;
uniform float BOUNDS;
uniform float time;
void main() {
	vec2 newUV = vUv * 2.;
    vec4 tt = texture2D(uniformTexture, newUV);

    vec2 godray = vWorldPosition.xy-vec2(0., BOUNDS);
    float uvDirection = atan(godray.y, godray.x) ;
    float c = texture2D(uniformTexture, vec2(uvDirection,0.) + 0.00002 * time ).x;
    float c1 = texture2D(uniformTexture, vec2(uvDirection,0.) + 0.00002 * time * 1.5).x;

    float alpha = min(c, c1) ;
    float fade = smoothstep(.9,1.8,abs(newUV.y)) ;  
    
    gl_FragColor = vec4(newUV,0.,1. );  
    gl_FragColor = vec4(vWorldPosition, 1.);
    gl_FragColor = vec4(tt.rgb, 1.);  
    gl_FragColor = vec4(vec3(alpha), alpha*0.4*fade);   
}
 
  