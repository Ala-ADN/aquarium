varying float vFog;
varying float vOpacity;
varying float vFocus;
#include <water_color>

void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float distanceSquared = dot(point, point);
    if (distanceSquared > 1.0) discard;

    float softness = exp(-distanceSquared * mix(3.2, 7.0, vFocus));
    softness *= 1.0 - smoothstep(0.5, 1.0, distanceSquared);
    vec2 screenUv = gl_FragCoord.xy / viewport;
    vec3 color = mix(surfaceColor, waterColor(screenUv), vFog * 0.85);
    gl_FragColor = vec4(color, softness * vOpacity);
    #include <colorspace_fragment>
}
