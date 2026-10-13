uniform vec2 viewport;
uniform float waterTime;
uniform vec3 deepColor;
uniform vec3 middleColor;
uniform vec3 surfaceColor;
uniform vec2 godRayPosition;

vec2 waterLightSource() {
    return godRayPosition + vec2(sin(waterTime * 0.5) * 0.045, 0.0);
}

vec3 waterColor(vec2 uv) {
    float height = smoothstep(0.0, 1.0, clamp(uv.y, 0.0, 1.0));
    vec3 water = mix(deepColor, middleColor, smoothstep(0.0, 0.7, height));
    water = mix(water, surfaceColor, smoothstep(0.8, 1.0, height) * 0.7);
    vec2 lightOffset = (uv - waterLightSource()) * vec2(viewport.x / viewport.y, 1.0);
    float glow = exp(-dot(lightOffset, lightOffset) * 3.5);
    return mix(water, surfaceColor, glow * 0.3);
}
