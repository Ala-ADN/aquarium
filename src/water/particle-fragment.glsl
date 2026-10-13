varying float vFog;
varying float vOpacity;
varying float vDetail;
uniform float bubbleBlur;
#include <water_color>

void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float distanceSquared = dot(point, point);
    if (distanceSquared > 1.0) discard;

    float radius = sqrt(distanceSquared);
    // Feather only the boundary by a pixel, rather than blurring the sprite.
    float edgeWidth = max(fwidth(radius), 0.002);
    float dotAlpha = 1.0 - smoothstep(0.5 - edgeWidth, 0.5 + edgeWidth, radius);
    float rim = 1.0 - smoothstep(0.04, 0.04 + edgeWidth, abs(radius - 0.76));
    // A curved upper-left reflection, with a quiet blue-green lower rim.
    float reflection = smoothstep(-0.35, 0.7, dot(point, vec2(-0.7, -0.7)));
    float glass = rim * mix(0.12, 0.9, reflection);
    glass += (1.0 - smoothstep(0.7, 0.7 + edgeWidth, radius)) * 0.04;
    float crispAlpha = mix(dotAlpha, glass, vDetail);
    float softAlpha = exp(-distanceSquared * 3.2)
        * (1.0 - smoothstep(0.5, 1.0, distanceSquared));
    float alpha = mix(crispAlpha, softAlpha, clamp(bubbleBlur, 0.0, 1.0)) * vOpacity;
    vec2 screenUv = gl_FragCoord.xy / viewport;
    vec3 tint = mix(middleColor, surfaceColor, 0.65);
    vec3 color = mix(tint, surfaceColor, reflection * vDetail);
    color = mix(color, waterColor(screenUv), vFog * 0.85);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
}
