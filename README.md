# aquarium

Run `pnpm install`, then `pnpm dev`. Use `pnpm build` to make `dist/`.

The wide fih window lives in the footer, after the space reserved for experience
and project windows. Visitors earn one fih every 10 seconds with the page visible,
capped at 10. Reaching the footer lets them release their full earned swarm. Shape,
color, time, and the released swarm are saved in this browser for the local preview.

Press **Space** outside form controls to toggle camera debug mode without scrolling.
Add `?debug` to keep the simulation controls visible.

Shared persistence, email notifications, texture drawing, and deployment come later.

Reusable windows live in `src/ui/window.ts` and use 7.css for Windows 7 styling.
Pass a title and a content element:

```ts
const projects = createWindow("projects", content);
container.append(projects.element);
// projects.destroy() removes the element and its listeners.
```

Drag the title bar, or focus it and use arrow keys. Enter/Home resets its position.
Mouse movement tilts the glass; reduced-motion preferences disable the tilt.
