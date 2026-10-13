# aquarium

Run `pnpm install`, then `pnpm dev`. Use `pnpm build` to make `dist/`.

The wide fih window lives in the footer, after the space reserved for experience
and project windows. Visitors earn one fih every 10 seconds with the page visible,
capped at 10. Reaching the footer lets them release their full earned swarm. Shape,
color, time, and the released swarm are saved in this browser for the local preview.

Press **Space** outside form controls to toggle camera debug mode without scrolling.
Add `?debug` to keep the simulation controls visible.

Shared persistence, email notifications, texture drawing, and deployment come later.

The open-water backdrop uses a procedural cyan-to-blue gradient, soft refracted
sunlight, depth haze, and a world-space particle cloud. Suspended motes drift
through a 3D volume with perspective size, near-field softness, and distance fog;
they move with the debug camera and are occluded by fish. The main scene renders
with antialiasing at viewport resolution, with device pixel ratio capped at 1.5.
By default, the cloud draws 1,200 particles on desktop and 600 at widths of
560px or less.
Adjust the gradient colors, particle counts, and ray origin in
`src/constants.ts`.
Space freezes the water and particles together with the fish. Water effects stay on the background canvas,
below the portfolio windows.

God rays fan out from the upper-left surface glow, slowly sway and shimmer, and
fade into deeper water. Particles rise at varied speeds and drift sideways and
through depth with the current, fading as they recycle through the volume.

Reusable windows live in `src/ui/window.ts` and use 7.css for Windows 7 styling.
Pass a title and a content element:

```ts
const projects = createWindow("projects", content);
container.append(projects.element);
// projects.destroy() removes the element and its listeners.
```

Drag the title bar, or focus it and use arrow keys. Enter/Home resets its position.
Mouse movement across the page tilts and shifts visible windows. Dragging and
tilting ease toward their targets with a spring; dragging uses 10× the speed.
Adjust `MOTION_SPEED` in
`src/ui/window.ts` to change how quickly they follow.

Set `--window-depth` on any element inside a window to choose its height:

```css
#fih-shape-round + label { --window-depth: 40px; }
.fih-release { --window-depth: 36px; }
```

Or use `style="--window-depth: 40px"` on an individual element. Depth defaults to
zero and does not inherit. Keep containers at zero for heights relative to the
window; raising a container adds its height to its children. Fih UI depths live
in `src/style.css`. Avoid clipping (`overflow: hidden`) on containers with raised
children, because it flattens their 3D layers.
