varying vec4 vColor;
varying float vViewDepth;
varying float vBodyHeight;
varying float vFin;
varying float vColorVariation;
uniform bool useTemplateColor;
#include <water_color>

void main() {
    // Linear colors; both the default school and visitor colors use sRGB output.
    vec3 schoolColor = mix(vec3(0.012, 0.26, 0.38), vec3(0.025, 0.48, 0.42), vColorVariation);
    schoolColor *= mix(1.0, 0.65, vFin);
    vec3 color = useTemplateColor ? vColor.rgb : schoolColor;

    float topLight = smoothstep(-3.0, 4.0, vBodyHeight);
    color *= mix(0.86, 1.05, topLight);
    float highlight = exp(-pow((vBodyHeight - 1.15) / 0.85, 2.0));
    color = mix(color, surfaceColor, highlight * 0.1 * (1.0 - vFin));

    vec2 screenUv = gl_FragCoord.xy / viewport;
    float caustic = pow(0.5 + 0.5 * sin(screenUv.x * 38.0 + screenUv.y * 22.0 + waterTime * 0.18), 10.0);
    color = mix(color, surfaceColor, caustic * 0.025);
    float fog = smoothstep(160.0, 1000.0, vViewDepth);
    color = mix(color, waterColor(screenUv), fog);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
