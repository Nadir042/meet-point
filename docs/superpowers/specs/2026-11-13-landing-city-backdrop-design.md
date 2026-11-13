# Landing City Backdrop Design

## Goal

Replace the hero's abstract route map with an original Shanghai-inspired miniature city backdrop that supports, rather than competes with, the MeetPoint headline and people illustration. Also restore clear separation between the sticky navigation and the hero title.

## Approved Direction

- Use an original, text-free image inspired by the supplied miniature-city reference; do not reuse its lettering or watermark.
- Compose the image horizontally, with the city and landmark mass weighted toward the right and lower portions of the frame.
- Keep the upper-left area quiet enough for the headline.
- Render the asset in pale neutral gray with low saturation and restrained contrast.
- Preserve the source aspect ratio at every breakpoint; crop responsively instead of stretching.

## Hero Layout

- Move the hero's visible content down by 56 px on desktop so the sticky header no longer overlaps the headline.
- Use a 28 px offset on mobile to protect limited vertical space.
- Keep the headline above both the city backdrop and the people illustration.
- Strengthen the headline's floating effect with a close highlight, a short contact shadow, and a softer distant shadow. Add a slow 6 px vertical float, with a reduced-motion fallback.

## Responsive Behavior

- Desktop: show the broad city composition with the architectural focus to the right.
- Mobile: crop around the landmark cluster while retaining enough pale negative space behind the title.
- The backdrop must never distort, obstruct navigation, or reduce text contrast.

## Verification

- Inspect the rendered landing page at desktop and mobile widths.
- Confirm the title is fully visible below the header.
- Confirm the backdrop is pale gray, proportionally cropped, and visually subordinate.
- Confirm existing landing actions, page-turn behavior, and responsive navigation remain unchanged.

## Scope

This change only covers the generated hero backdrop asset and the minimum hero/title CSS needed to place it. It does not redesign later landing sections or application screens.
