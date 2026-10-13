// Soft shafts from the same point as the water's surface glow.
float godRayIntensity(vec2 uv, float aspect, float time) {
    vec2 source = waterLightSource();
    vec2 fromLight = (uv - source) * vec2(aspect, 1.0);
    float angle = atan(fromLight.x, -fromLight.y);
    float distanceFromLight = length(fromLight);

    // Two broad sets of shafts drift at different rates, with a little bend
    // from the moving surface. Keep the gaps soft enough for text to stand out.
    angle += sin(time * 0.75 + uv.y * 5.0) * 0.025;
    angle += sin(time * 1.1 + uv.x * 7.0) * 0.012;
    float broad = pow(0.5 + 0.5 * sin(angle * 22.0 + time * 0.85), 6.0);
    float fine = pow(0.5 + 0.5 * sin(angle * 37.0 - time * 0.65 + 1.6), 9.0);
    float shimmer = 0.8 + 0.2 * sin(time * 1.1 + angle * 6.0);
    float depthFade = exp(-distanceFromLight * 0.85);
    float surfaceFade = smoothstep(0.02, 0.7, uv.y);
    return (broad + fine * 0.45) * shimmer * depthFade * surfaceFade;
}
