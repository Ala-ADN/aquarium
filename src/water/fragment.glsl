varying vec2 vUv;
#include <water_color>
#include <god_rays>

void main() {
    float aspect = viewport.x / viewport.y;
    float surface = smoothstep(0.5, 1.0, vUv.y);
    vec2 uv = vUv;
    uv.x += sin(vUv.y * 17.0 + waterTime * 0.18) * 0.004 * surface / max(aspect, 1.0);
    uv.y += sin(vUv.x * aspect * 13.0 + waterTime * 0.14) * 0.003 * surface;

    vec3 color = waterColor(uv);
    float rays = godRayIntensity(uv, aspect, waterTime);
    color = mix(color, surfaceColor, min(rays * 0.24, 0.28));
    color += surfaceColor * rays * 0.035;
    vec2 ripple = vec2(uv.x * aspect, uv.y) * vec2(18.0, 24.0);
    float causticA = sin(ripple.x + sin(ripple.y + waterTime * 0.16));
    float causticB = sin(ripple.y * 1.12 - sin(ripple.x * 0.8 - waterTime * 0.12));
    float caustics = pow(1.0 - abs(causticA * causticB), 14.0);
    color = mix(color, surfaceColor, caustics * surface * 0.028);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
