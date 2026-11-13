# Floating Header and Grain City Design

## Goal

Adapt the restrained interaction language observed on the current DeepSeek landing page to MeetPoint's header, remove the "我的活动" landing navigation item, and replace the raster city backdrop with a code-rendered granular Shanghai skyline.

## Header Structure

- Keep the landing header full-width, flat, and visually quiet at the top of the page.
- After 24 px of downward scroll, morph the header contents into a centered floating capsule 10 px below the viewport edge.
- The scrolled capsule uses a translucent warm-white surface, fine neutral border, soft offset shadow, and restrained backdrop blur.
- Keep the outer sticky header's layout height stable so the morph does not move page content.
- On mobile, apply the same floating capsule treatment to the brand and menu trigger without widening the viewport.

## Header Controls

- Remove the "我的活动" item from the landing-page header only. Workspace activity functionality remains unchanged.
- Map the DeepSeek `Get App` interaction language to MeetPoint's authenticated `进入工作台` control: outlined capsule, soft fill expansion on hover, 1 px lift, and a 3 px directional icon shift.
- Use the lighter outlined-capsule hover language for `了解 MeetPoint`, `使用指南`, and `登录`.
- Keep unauthenticated `注册` visually secondary to `进入工作台` while retaining a clear call to action.
- Preserve keyboard focus visibility and disable positional motion under `prefers-reduced-motion`.

## Granular City Backdrop

- Remove `landing-city-v2.png` from the rendered hero and delete the existing large mosaic-block layer.
- Render a stable Shanghai-inspired skyline with code-native SVG shapes, including a simplified Oriental Pearl Tower and surrounding towers.
- Fill the skyline with fine neutral-gray grain rather than a solid shape or photographic texture.
- Animate only a soft left-to-right brightness scan through the grain; the city outline itself does not move or glitch.
- Keep the skyline pale and subordinate to the headline and people illustration.
- Reduce grain density and animation complexity below 700 px.
- Under `prefers-reduced-motion`, show the same granular skyline without the scanning animation.

## Hero Composition

- Move the complete hero foreground group—headline, supporting copy, people illustration, primary action, and assurance text—24 px lower on desktop.
- Move the same group 12 px lower below 700 px.
- Preserve all internal spacing and keep the next-section handoff unchanged.

## Secondary Section Typography

- Apply `STZhongsong` / `华文中宋` to the second and third landing-page sections, with `Songti SC` and a generic serif as fallbacks.
- Reduce both section display headings by 15%–20% from their current maximum sizes.
- Reduce supporting copy and step titles by one type step while preserving readable line height.
- Do not change the first-screen headline, navigation, authentication dialog, or workspace typography.

## Verification

- Confirm the header morph is visible after a 24 px scroll without causing a content jump.
- Confirm all remaining header controls work in authenticated and unauthenticated states.
- Confirm "我的活动" is absent only from the landing header.
- Confirm the hero no longer loads or renders the raster city image or large mosaic blocks.
- Confirm the grain city and scan remain readable but quiet on desktop and mobile.
- Confirm the complete hero foreground group is visibly lower without clipping its primary action or assurance text.
- Confirm the second and third screens use the approved Chinese serif and no heading or body copy overflows at desktop or mobile widths.
- Confirm reduced-motion mode disables the header movement and grain scan.

## Scope

Only the landing-page header and hero backdrop change. Authentication behavior, workspace navigation, page-turn behavior, landing copy, and the people illustration remain unchanged.
