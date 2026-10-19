varying vec4 vColor;
varying float vFade;
varying float vViewDepth;
varying float vBodyHeight;
varying float vFin;
varying float vColorVariation;
varying vec2 vBodyUv;
uniform sampler2D patternMask;
uniform vec3 patternColor;
uniform float releaseGlow;
uniform bool useTemplateColor;
uniform float finShade;
uniform vec2 fishFog;
uniform float waterSurfaceStrength;
uniform float waterSurfaceSpeed;
#include <water_color>

void main() {
    // Linear colors; both the default school and visitor colors use sRGB output.
    vec3 schoolColor = mix(vec3(0.012, 0.26, 0.38), vec3(0.025, 0.48, 0.42), vColorVariation);
    schoolColor *= mix(1.0, finShade, vFin);
    vec3 color = useTemplateColor ? vColor.rgb : schoolColor;
    if (useTemplateColor && vFin < 0.5) {
        color = mix(color, patternColor, texture2D(patternMask, vBodyUv).r);
    }
    color = mix(color, vec3(1.0), releaseGlow * 0.25);

    float topLight = smoothstep(-3.0, 4.0, vBodyHeight);
    color *= mix(0.86, 1.05, topLight);
    float highlight = exp(-pow((vBodyHeight - 1.15) / 0.85, 2.0));
    color = mix(color, surfaceColor, highlight * 0.1 * (1.0 - vFin));

    vec2 screenUv = gl_FragCoord.xy / viewport;
    float caustic = pow(0.5 + 0.5 * sin(screenUv.x * 38.0 + screenUv.y * 22.0 + waterTime * waterSurfaceSpeed * 0.18), 10.0);
    color = mix(color, surfaceColor, caustic * 0.025 * waterSurfaceStrength);
    float fog = smoothstep(fishFog.x, fishFog.y, vViewDepth);
    color = mix(color, waterColor(screenUv), fog);

    gl_FragColor = vec4(color, vFade);
    #include <colorspace_fragment>
}
