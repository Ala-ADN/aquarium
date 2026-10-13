attribute vec4 particleSeed;
uniform vec2 viewport;
uniform float waterTime;
uniform float pixelRatio;
uniform vec2 bubbleRiseSpeed;
uniform float bubbleSpeedVariation;
uniform vec2 bubbleSize;
uniform float bubbleMaxPixels;
uniform vec2 bubbleOpacity;
uniform float bubbleDrift;
uniform vec2 bubbleFog;
varying float vFog;
varying float vOpacity;
varying float vDetail;

void main() {
    float phase = particleSeed.x * 6.283185;
    float halfHeight = particleSeed.w;
    vec3 center = position;
    float riseSpeed = mix(bubbleRiseSpeed.x, bubbleRiseSpeed.y, particleSeed.z)
        * mix(1.0 - bubbleSpeedVariation, 1.0 + bubbleSpeedVariation, particleSeed.y);
    float buoyancy = sin(waterTime * 0.8 + phase) * 2.5 * bubbleDrift;
    center.y = mod(center.y + halfHeight + waterTime * riseSpeed + buoyancy,
        halfHeight * 2.0) - halfHeight;
    center.x += sin(waterTime * 0.45 + phase + center.y * 0.003) * 22.0 * bubbleDrift;
    center.x += sin(waterTime * 0.2 + phase + center.z * 0.002) * 10.0 * bubbleDrift;
    center.z += sin(waterTime * 0.32 + phase) * 20.0 * bubbleDrift;

    vec4 viewPosition = modelViewMatrix * vec4(center, 1.0);
    float depth = -viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;

    // Physical radii shrink with perspective; proximity does not blur them.
    float radius = mix(bubbleSize.x, bubbleSize.y, particleSeed.z * particleSeed.z);
    float projectedSize = viewport.y * projectionMatrix[1][1] * radius / max(depth, 1.0);
    gl_PointSize = clamp(projectedSize, pixelRatio, max(1.0, bubbleMaxPixels) * pixelRatio);
    vFog = smoothstep(bubbleFog.x, bubbleFog.y, depth);
    // Resolve glass whenever the bubble has enough pixels for a clear rim.
    vDetail = smoothstep(3.0, 7.0, gl_PointSize / pixelRatio);
    float nearFade = smoothstep(35.0, 110.0, depth);
    float lifecycle = smoothstep(-halfHeight, -halfHeight * 0.85, center.y)
        * (1.0 - smoothstep(halfHeight * 0.85, halfHeight, center.y));
    vOpacity = mix(bubbleOpacity.x, bubbleOpacity.y, particleSeed.x) * (1.0 - vFog * 0.8) * nearFade * lifecycle;
}
