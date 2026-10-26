
## Feature 1 Refinements — Before GitHub Push

### 1. Post Editor Modal Scrolling

Improve the existing editor modal without changing its visual design.

Requirements:
- The editor modal must have its own vertical scrolling area.
- The scrollbar must appear along the modal's right edge.
- The background dashboard must not scroll while the modal is open.
- Modal header and footer action buttons remain visible.
- The form content scrolls independently.
- Support mouse wheel, trackpad, touch and keyboard scrolling.
- Restore normal page scrolling when the modal closes.
- Work correctly on desktop and mobile.
- Preserve unsaved-changes warnings and existing modal functionality.

### 2. Separate Social Media Caption and Creative Wording

The editor must have three clearly labelled sections:

A. Social Media Caption
- Text appearing below the published post.
- Supports multiline content, hashtags and calls to action.

B. Creative Wording / On-Design Text
- Exact text to appear within the visual creative.
- Supports multiline text.
- For carousels, supports slide-by-slide wording.
- For stories, supports headline, supporting text and CTA.
- Drafts can be saved with this field empty.

C. Design Brief / Visual Instructions
- Existing design brief field.
- Visual layout, photography, colours, branding and instructions.
- Keep this separate from the actual creative wording.

### 3. Content Formats

Supported formats:
- Static Photo
- Carousel
- Story
- Reel

Do not provide a separate Video format at this stage.

If existing saved posts use Video, migrate them safely to Reel without deleting post data.

For Reel:
- Display an additional optional Reel Script / Scene Instructions field.
- Allow scenes, voiceover and on-screen text instructions.

For Carousel:
- Allow slide-by-slide content inside Creative Wording.
- A structured slide builder is not required yet.

### 4. Data Compatibility

- Preserve all existing posts and localStorage data.
- Existing posts should remain editable.
- New fields should use safe empty defaults.
- Do not reset saved statuses or seeded content.
- Keep storage architecture ready for future Supabase integration.

### 5. Acceptance Criteria

- Modal scrolls independently from dashboard.
- Modal header and footer remain visible.
- Background scrolling is disabled while modal is open.
- Caption, Creative Wording and Design Brief are separate.
- Reel-specific script field appears for Reel posts.
- Static Photo, Carousel, Story and Reel formats work.
- Existing posts and their data remain intact.
- All new fields persist after refresh.
- npm run lint passes.
- npm run build passes.
