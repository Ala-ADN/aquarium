attribute vec4 particleSeed;
uniform vec2 viewport;
uniform float waterTime;
uniform float pixelRatio;
varying float vFog;
varying float vOpacity;
varying float vFocus;

void main() {
    float phase = particleSeed.x * 6.283185;
    float halfHeight = particleSeed.w;
    vec3 center = position;
    float riseSpeed = mix(36.0, 72.0, particleSeed.y);
    float buoyancy = sin(waterTime * 0.8 + phase) * 2.5;
    center.y = mod(center.y + halfHeight + waterTime * riseSpeed + buoyancy,
        halfHeight * 2.0) - halfHeight;
    center.x += sin(waterTime * 0.6 + phase + center.y * 0.003) * 26.0;
    center.x += sin(waterTime * 0.27 + phase + center.z * 0.002) * 12.0;
    center.z += sin(waterTime * 0.42 + phase) * 24.0;

    vec4 viewPosition = modelViewMatrix * vec4(center, 1.0);
    float depth = -viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;

    // Physical radii shrink with perspective; close motes become soft bokeh.
    float radius = mix(1.0, 3.2, particleSeed.z);
    float projectedSize = viewport.y * projectionMatrix[1][1] * radius / max(depth, 1.0);
    gl_PointSize = clamp(projectedSize, pixelRatio, 28.0 * pixelRatio);
    vFog = smoothstep(160.0, 1500.0, depth);
    vFocus = smoothstep(110.0, 420.0, depth);
    float nearFade = smoothstep(35.0, 110.0, depth);
    float lifecycle = smoothstep(-halfHeight, -halfHeight * 0.85, center.y)
        * (1.0 - smoothstep(halfHeight * 0.85, halfHeight, center.y));
    vOpacity = mix(0.3, 0.65, particleSeed.y) * (1.0 - vFog * 0.8) * nearFade * lifecycle;
}
