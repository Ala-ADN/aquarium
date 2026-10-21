# aquarium

Run `pnpm install`, then `pnpm dev`. Use `pnpm build` to make `dist/`.

The `deploy` branch adds optional Firebase shared saves and GitHub Pages hosting.
Follow [the deployment guide](docs/deployment.md) to create the free Firebase
project, enable App Check, and configure Pages. Without Firebase configuration,
the app keeps working with local saves. Run `pnpm test:rules` for the emulator
security tests (Java 21+ required).

The desktop opens a classic VLC-style media player. Its cone and toolbar use the
original VideoLAN artwork; source and license notices live in `src/asset/vlc`
and are published in `public/licenses/vlc`. Its playlist contains the portfolio's
project demos. The **GitHub ↗** button opens the selected project's `sourceUrl`
repository in a new tab; it is disabled when no repository is supplied. The
desktop cone reopens a minimized or closed player. The title bar supports dragging,
double-click to maximize, and the original window tilt. The toolbar's buttons
float at the same 30px depth as the fish creator's Spin and Update buttons.
Volume, the seek slider, and the menus sit on the window surface. Playback
controls are ordered Previous, Play/Pause, Next.
Help → Donate to VLC opens https://www.videolan.org/contribute.html in a new tab.

To publish project demos, place compressed exports and posters in
`public/media/project-name/` and add entries to `src/media/library.ts`:

```ts
{ id: "project-name", title: "Project name", src: "media/project-name/demo.mp4",
  poster: "media/project-name/poster.webp", projectUrl: "https://example.com",
  sourceUrl: "https://github.com/your-name/project-name" }
```

Only the selected poster loads initially; a video's URL is attached on playback.
Other playlist entries do not fetch video data or metadata. Media paths respect
Vite's base URL for GitHub Pages. Keep original recordings outside the repository.
The player remains on its cone screen until demos are added. Playback proceeds
through the projects in order and stops at the end. It pauses when minimized,
closed, scrolled out of view, or the browser tab is hidden.
Space toggles playback while the player is focused; Left/Right seek, M mutes,
and Ctrl+L opens the playlist. N/P select the next/previous
project, +/- adjust speed, and Ctrl+I opens media information. The footer fish
creator remains independently available.

The GitHub Pages workflow publishes the website only. When the saved design
format or database rules change, deploy the matching Firebase rules **before**
publishing the client: `pnpm deploy:database --project YOUR_PROJECT_ID`.

The wide fih window lives in the footer, after the space reserved for experience
and project windows. With the page visible, visitors earn fih according to
`f(x) = 1 + 9 * sqrt(x / 200)`, where x is seconds, capped at 10 after 200 seconds.
Reaching the footer lets them release the whole-number portion of their allowance.

The creator places a **4:3 preview on the left** and three narrow **fin**, **body**,
and **head** slots in one recessed control panel on the right. The full-width
**spin all** button sits below the reels, with wide color swatches in each lane.
The time-spent line, save status, and release button share a compact footer row.
Save messages appear immediately left of the button; release/update also retries
failed sharing, without a separate retry button. Scroll over a
slot to cycle its shape; small trackpad movements accumulate. The window keeps
tilting while hovering or editing the slots. Wheel events take priority over page
scrolling, including when a 3D hit lands on the window behind the slot. Clicks
also prioritize the visible buttons and color pickers and stay attached to the
pressed control if the window moves before release. Window tilt keeps running. The arrow
buttons and Up/Down/Home/End keys offer the same selection. Each part has a custom
color picker and a 60–150% size slider. Part headings, shape names, color/size
labels, percentage readouts, preview captions, and the fish description are
omitted visually; accessible control names remain. There are no shape/color dropdowns, special
effects panel, or undo action. **Spin all** randomizes shapes, sizes across the
full slider range, and colors from the supplied 20-color MS Paint palette. Reels scroll continuously
while the slots rise from the window in 3D at a fixed layout height; colors cycle through the palette
and sliders sweep from minimum to maximum, wrapping back to minimum. Columns
slow down and land in fin/body/head order, half a second apart. Manual editing or
release settles the spin first; clicking spin again restarts it. Release applies
the design to the full earned swarm immediately and plays a swim-out animation
with a ripple at the preview opening. The preview returns ready for editing; edits
or another spin cancel the effect. Unreleased edits are not saved.

The count is shown as “you spent X seconds here, thanks, you get X” followed
by a miniature of the current fish. The earned count includes its full fractional
value without rounding and becomes “max” at 10. The miniature follows shape,
color, and size edits. Visible visit time keeps counting after all 10 fih are earned.

The body slot offers classic, chubby, diamond, and sailfin shapes; the
head slot offers pointed, rounded, and blunt shapes. Saved tiny bodies become
classic bodies, as do saved needle bodies; saved beak heads become pointed heads.

The preview and released swarm use the same connected geometry. The body and head
share two seam points controlled by body size. Head size scales the remaining
head points around the seam center without moving the shared connection. Colors
remain distinct at the join, with no blending or added outline. The canvas
fallback fills a solid body/head silhouette to prevent antialiasing gaps.
The preview is a transparent opening through the window, showing the live
aquarium behind the fish. Only decorative background layers are cut out; the
form and slot depth effects retain their shared 3D context.
The preview uses the aquarium's swimming shader and lighting, without triangle
outlines at the head/body join. Its camera magnification and center stay fixed:
the size sliders change the visible fish size, never a fit-to-frame scale. A
larger transparent drawing area allows oversized fish to extend beyond the 4:3
frame without clipping. Tail motion and gentle swimming follow the tank's pause
state and stop rendering offscreen or in a hidden tab.

The tank starts with 30 background fih and grows with visitor releases, up to
1,000 visible fih. Only active simulation slots participate in flocking.
The first frame uses seeded position/velocity textures before initializing GPU
simulation. The creator and its window styles load after the first tank frame;
its preview creates a WebGL context only when visible. Saved fih restore before
the creator loads. Debug controls download only on **Space** or with `?debug`.
The shared reader downloads in parallel with graphics setup. Public reads finish
before Auth is loaded to restore identity; explicit releases still await Auth.
Initial child events are published as one complete feed, including empty tanks.
See the [fetching benchmark](benchmarks/README.md) for measured p95 and reproduction.

Released designs and earned time are saved as `aquarium.visitor.v4`, with explicit
versions for the visit and design. Older v1/v2/v3 saves migrate without deleting
the original data. Shared saves and the release outbox use the same design codec.
Unsupported future formats are preserved and cannot be overwritten by this client.
See [design compatibility](docs/fih-compatibility.md) before changing stored fields
or retiring styles. Storage errors still permit
release during the current visit. All controls support the keyboard, and the
three part columns remain side by side on mobile, with the 4:3 preview above them.

Window motion follows commit `1ff0969` and remains active over the slot controls.
Customization keeps its form and
layout containers in the shared 3D context. The slots rest at zero depth, with
both spin and submit buttons at 40px depth. Slot spin animations
add lift above the resting depth. Only each reel clips its own contents.
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

Shared persistence and deployment are optional; see the deployment guide above.
Email notifications and texture drawing come later.

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
Pointer movement and slot hover bounds checks run at most once per animation
frame. Motion writes transforms directly on the window and its surface, avoiding
inherited per-frame CSS variables that recalculate styles throughout the editor.

Set `--window-depth` on any element inside a window to choose its height:

```css
.fih-preview canvas {
  --window-depth: 24px;
}
.fih-status {
  --window-depth: 8px;
}
```

Or use `style="--window-depth: 30px"` on an individual element. Depth defaults to
zero and does not inherit. Keep containers at zero for heights relative to the
window; raising a container adds its height to its children. Fih UI depths live
in `src/style.css`. Avoid clipping (`overflow: hidden`) on containers with raised
children, because it flattens their 3D layers.
Disable pointer events on raised decorative layers so they cannot obscure
the controls beneath them.
