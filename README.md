# aquarium

Run `pnpm install`, then `pnpm dev`. Use `pnpm build` to make `dist/`.

The wide fih window lives in the footer, after the space reserved for experience
and project windows. Visitors earn one fih every 10 seconds with the page visible,
capped at 10. Reaching the footer lets them release their full earned swarm.

The creator places a **4:3 preview on the left** and three narrow **fin**, **body**,
and **head** slots on the right. Scroll over a slot to cycle its shape; small
trackpad movements accumulate. Hovering any part of a slot holds the window's
current tilt steady; wheel events take priority over page scrolling, including
when a 3D hit lands on the window behind the slot. Leaving resumes tilt. The arrow
buttons and Up/Down/Home/End keys offer the same selection. Each part has a custom
color picker and a 60–150% size slider. Part headings, shape names, color/size
labels, percentage readouts, preview captions, and the fish description are
omitted visually; accessible control names remain. There are no shape/color dropdowns, special
effects panel, or undo action. **Spin all** randomizes shapes, sizes across the
full slider range, and colors from the built-in palette. Reels scroll continuously
while the slots rise from the window in 3D at a fixed layout height; colors cycle through the palette
and sliders sweep from minimum to maximum, wrapping back to minimum. Columns
slow down and land in fin/body/head order, half a second apart. Manual editing or
release settles the spin first; clicking spin again restarts it. Release applies
the design to the full earned swarm; unreleased edits are not saved.

The count is shown as a 7.css progress bar. Hovering it shows “you spent X
seconds here, thanks”. Visible visit time keeps counting after all 10 fih are
earned, while the bar stays full.

The body slot offers classic, chubby, diamond, and sailfin shapes; the
head slot offers pointed, rounded, and blunt shapes. Saved tiny bodies become
classic bodies, as do saved needle bodies; saved beak heads become pointed heads.

The preview and released swarm use the same connected geometry. The body and head
share two seam points controlled by body size. Head size scales the remaining
head points around the seam center without moving the shared connection. Colors
remain distinct at the join, with no blending or added outline. The canvas
fallback fills a solid body/head silhouette to prevent antialiasing gaps.
The preview uses the aquarium's swimming shader and lighting, without triangle
outlines at the head/body join. Its camera magnification and center stay fixed:
the size sliders change the visible fish size, never a fit-to-frame scale. A
larger transparent drawing area allows oversized fish to extend beyond the 4:3
frame without clipping. Tail motion and gentle swimming follow the tank's pause
state and stop rendering offscreen or in a hidden tab.

Released designs and earned time are saved as `aquarium.visitor.v3`. Older v1/v2
saves migrate without deleting the original data. Storage errors still permit
release during the current visit. All controls support the keyboard, and the
three part columns remain side by side on mobile, with the 4:3 preview above them.

Window motion follows commit `1ff0969`, with a hold-at-current-angle interaction
for hovered slots. Customization keeps its form and
layout containers in the shared 3D context. Read-only artwork and text use depth;
native controls stay at zero depth. Only each reel clips its own contents.
The fish preview floats at 40px depth, above the frame; read-only window text
uses independent depths. Window width and reel height
adapt to viewport height, and the preview retains its 4:3 frame.
Slot spins, reel changes, button transitions, and release feedback always animate.
Run `pnpm test` and `pnpm build` to check customization, persistence, and
window-motion regressions.

Press **Space** outside form controls to toggle camera debug mode without scrolling.
Add `?debug` to keep the simulation controls visible.
The debug menu includes live water colors, surface light, god rays, bubbles,
flocking, and camera controls. Density, size, rise speed, and opacity multipliers
start at 1× the values in `src/constants.ts`. Reset experiments restores those
defaults; experiments last until reload and do not change the constants file.

Shared persistence, email notifications, texture drawing, and deployment come later.

The open-water backdrop uses a procedural cyan-to-blue gradient, soft refracted
sunlight, depth haze, and a world-space particle cloud. Suspended motes drift
through a 3D volume with perspective size, glass highlights, and distance fog;
they move with the debug camera and are occluded by fish. The main scene renders
with antialiasing at viewport resolution. Tune camera FOV/distance, rendering
density, fish flocking/default color, water gradient/light/fog, bubbles, reward
timing, and window motion in `src/constants.ts`. CSS layout and window depths
remain in the stylesheets.
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
tilting ease toward their targets with a spring. Adjust `WINDOW_MOTION` in
`src/constants.ts` for spring speed, drag speed, tilt, parallax, and keyboard steps.

Set `--window-depth` on any element inside a window to choose its height:

```css
.fih-preview canvas { --window-depth: 24px; }
.fih-status { --window-depth: 8px; }
```

Or use `style="--window-depth: 40px"` on an individual element. Depth defaults to
zero and does not inherit. Keep containers at zero for heights relative to the
window; raising a container adds its height to its children. Fih UI depths live
in `src/style.css`. Avoid clipping (`overflow: hidden`) on containers with raised
children, because it flattens their 3D layers.
Keep interactive controls at zero depth and disable pointer events on raised
decorative layers so they cannot obscure the controls beneath them.
