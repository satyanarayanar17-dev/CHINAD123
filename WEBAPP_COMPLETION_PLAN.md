# Web App Completion Plan

## The Split Architectural Decision
Instead of rebuilding the entire authentication root, we will introduce a `PublicLayout` containing a unified top-navigation and footer, wrapping a suite of brand new public pages (`Home`, `About`, `Specialties`, `Contact`). 

The `RootRedirect` at `/` will be completely replaced by the `Home` component.

## Execution Sequence

### Phase 3: Public Web Completion
1. **Public Layout Module:** Design a sticky Header with the `ShieldCheck` icon, brand name, and a sophisticated primary CTA "Portal Login". Build a clean Footer with organizational metadata.
2. **Landing Page (`Home.tsx`):** Hero section, 3 quick-action cards, trusted provider statistics, and a secondary CTA towards specialties.
3. **About Page (`About.tsx`):** Honest placeholder copy referencing Chettinad Care's mandate. 
4. **Specialties Page (`Specialties.tsx`):** Grid layout of mocked departmental surfaces (General Medicine, Pediatrics, Orthopedics, Cardiology).
5. **Contact/Emergency Page (`Contact.tsx`):** Static geo/contact mapping and emergency hotline highlighting.

### Phase 4 & 5: Integration
- Modify `App.tsx` selectively overriding the `<Route path="/" />` node. Add the 4 new public routes nested beneath `<PublicLayout>`.
- The existing `/login` will be decoupled from the layout intentionally to preserve its isolated double-panel immersive design.

### Phase 6: QA and Execution
- Using the terminal, I will dynamically verify `vite` compilation syntax. 
- I will execute manual checks bridging the public pages into the secure portal bounds.
