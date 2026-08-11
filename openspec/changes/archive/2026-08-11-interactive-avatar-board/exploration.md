## Exploration: Interactive Avatar Board

### Current State
Empty repository. Starting from scratch.

### Affected Areas
- [NEW] index.html - Core HTML structure
- [NEW] style.css - Curated dark mode design, rich styling, animations
- [NEW] app.js - Application state, drag-and-drop logic, ranking, timing
- [NEW] openspec/changes/interactive-avatar-board/exploration.md - Exploration results

### Approaches
1. **Approach 1: Single-Page Local Simulation (Recommended)**
   - Description: A rich interactive dashboard where the teacher can run a question, and we simulate multiple student avatars (controlled by the teacher or multiple users taking turns on the same screen) with realistic drag-and-drop, timing tracking, and real-time ranking.
   - Pros: Works immediately, no setup or api keys required, perfect demo, 0 external runtime dependencies.
   - Cons: Not true remote multi-device out of the box (requires local interaction).
   - Effort: Low-Medium

2. **Approach 2: Remote Real-time Sync via Supabase/Firebase**
   - Description: Full remote multi-device web app with a real-time database backend.
   - Pros: True remote multiplayer where students use their own phones/devices.
   - Cons: Needs database setup, API keys, complex state sync, potential network latency issues.
   - Effort: High

### Recommendation
Approach 1 (Single-Page Local Simulation) as the foundation. We can build it as a dual-mode screen: a "Host/Teacher View" and a "Student Simulator Panel" where the teacher or students can add avatars, drag them to answer quadrants, and see the scoreboard update in real-time. This provides an excellent interactive experience without setup friction.

### Risks
- Browser support for advanced HTML5 Drag and Drop or Touch events.
- Timer precision for speed-based ranking.

### Ready for Proposal
Yes.
