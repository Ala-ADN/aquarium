uniform vec2 viewport;
uniform float waterTime;
uniform vec3 deepColor;
uniform vec3 middleColor;
uniform vec3 surfaceColor;
uniform vec2 godRayPosition;
uniform float godRaySpeed;
uniform float gradientMiddleHeight;
uniform float gradientSurfaceStart;
uniform float gradientSurfaceStrength;

vec2 waterLightSource() {
    return godRayPosition + vec2(sin(waterTime * godRaySpeed * 0.5) * 0.045, 0.0);
}

vec3 waterColor(vec2 uv) {
    float height = smoothstep(0.0, 1.0, clamp(uv.y, 0.0, 1.0));
    vec3 water = mix(deepColor, middleColor, smoothstep(0.0, gradientMiddleHeight, height));
    water = mix(water, surfaceColor, smoothstep(gradientSurfaceStart, 1.0, height) * gradientSurfaceStrength);
    vec2 lightOffset = (uv - waterLightSource()) * vec2(viewport.x / viewport.y, 1.0);
    float glow = exp(-dot(lightOffset, lightOffset) * 3.5);
    return mix(water, surfaceColor, glow * 0.3);
}
