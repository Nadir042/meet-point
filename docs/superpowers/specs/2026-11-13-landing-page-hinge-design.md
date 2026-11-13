# Landing Page Hinge and Pixel Texture Design

## Goal

Remove the visible blank gap between landing-page sections while preserving the deliberate page-turn effect, then add a restrained large-pixel texture to the city backdrop.

## Page-Turn Behavior

- Keep the existing perspective rotation, scale, opacity, and scroll response.
- Remove vertical translation from the section transform because it separates the rendered page from its layout position.
- When a section is above the viewport center, hinge it from its bottom edge.
- When a section is below the viewport center, hinge it from its top edge.
- Keep the shared boundary between consecutive sections visually anchored so no blank strip appears during scrolling.
- Preserve the existing reduced-motion fallback.

## Pixel Texture

- Add a static mosaic-interference layer inside the hero backdrop only.
- Use grouped neutral-gray squares between 24 px and 72 px.
- Each square must visibly alter the city image beneath it with local blur, reduced contrast, and higher brightness; it must not read as a flat color decoration.
- Vary block size and strength to create a restrained large-pixel discontinuity rather than a regular grid.
- Concentrate blocks across the city midground and outer field while avoiding the headline, people illustration, and primary action.
- Do not animate the squares; the headline float and page turn remain the authored motion.
- Reduce block count and maximum size on screens below 700 px.
- Keep the texture non-interactive and hidden from assistive technology.

## Verification

- At desktop and mobile sizes, scroll from the hero into the next section and confirm no blank gap appears.
- Confirm the page-turn effect still reads as one sheet handing off to the next.
- Confirm the blocks visibly distort the city details beneath them while remaining subordinate to the title and people illustration.
- Confirm the hero, navigation, login entry, and primary action remain functional.

## Scope

Only the landing page section-turn transform and hero backdrop decoration change. Content, routes, authentication, and workspace screens remain unchanged.
