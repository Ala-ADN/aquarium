uniform sampler2D texturePosition;
uniform float cellSize;
varying vec4 membership;
void main() {
  vec3 worldPosition = texture2D(texturePosition, position.xy).xyz;
  vec3 cell = clamp(floor(worldPosition / cellSize + GRID_SIDE * .5), vec3(0.), vec3(GRID_SIDE - 1.));
  float word = floor(position.z / 96.);
  float lane = floor(mod(position.z, 96.) / 24.);
  float bit = exp2(mod(position.z, 24.));
  membership = vec4(0.);
  if (lane < .5) membership.r = bit;
  else if (lane < 1.5) membership.g = bit;
  else if (lane < 2.5) membership.b = bit;
  else membership.a = bit;
  vec2 pixel = vec2(cell.x * GRID_WORDS + word, cell.y + cell.z * GRID_SIDE);
  gl_Position = vec4((pixel + .5) / vec2(GRID_SIDE * GRID_WORDS, GRID_SIDE * GRID_SIDE) * 2. - 1., 0., 1.);
  gl_PointSize = 1.;
}
