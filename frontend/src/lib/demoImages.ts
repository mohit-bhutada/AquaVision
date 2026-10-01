// Demo images for the Home page (workspace preview + gallery).
//
// `original` is a real public-domain underwater photo (credits: public/images/CREDITS.md).
// `enhanced` is currently a SIMULATED preview made by scripts/make-previews.py
// (simple classical color correction, NOT the AquaVision model), so `simulated: true`
// and the UI labels it "Simulated preview".
//
// When real AquaVision outputs exist: put them in public/images/, point `enhanced` at them
// and set `simulated: false`. The labels switch to "AquaVision Enhanced" automatically.

export type DemoImage = { original: string; enhanced: string; simulated: boolean };

const sim = (name: string): DemoImage => ({ original: `/images/${name}.webp`, enhanced: `/images/${name}-sim.webp`, simulated: true });

export const WORKSPACE_DEMO: DemoImage & { fileName: string } = { ...sim('gallery-marine-life'), fileName: 'grays-reef.jpg' };

export const GALLERY_IMAGES: Record<string, DemoImage> = {
  Coral: sim('gallery-coral'),
  'Marine life': sim('gallery-marine-life'),
  'Underwater structures': sim('gallery-structures'),
  Divers: sim('gallery-divers'),
  'ROV view': sim('gallery-rov'),
  'Low-light scene': sim('gallery-low-light'),
};

export const enhancedLabel = (d: DemoImage) => (d.simulated ? 'Simulated preview' : 'AquaVision Enhanced');
