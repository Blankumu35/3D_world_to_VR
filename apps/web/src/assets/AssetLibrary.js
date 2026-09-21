// Sample asset manifest for the drag-and-drop library panel.
//
// Each entry needs: id, name, icon (emoji shown on the card as a lightweight
// thumbnail — swap for a real image later by adding a `thumbnail` field and
// rendering it in AssetLibraryPanel), url (path to the .glb, typically under
// apps/web/public/assets/), and type ('object' | 'environment').
//
// Only `car.glb` exists in public/assets today — the rest are placeholders
// so you can see the two-tab layout; drop real .glb files into
// public/assets/objects/ and public/assets/environments/ and update the
// urls below (or fetch this list from the server instead of hardcoding it).

export const OBJECTS = [
  { id: 'car', name: 'Car', icon: '🚗', url: '/apps/web/src/assets/objects/old_rusty_car.glb', type: 'object' },
  //{ id: 'tree', name: 'Tree', icon: '🌳', url: '/assets/objects/tree.glb', type: 'object' },
  //{ id: 'house', name: 'House', icon: '🏠', url: '/assets/objects/house.glb', type: 'object' },
  //{ id: 'rock', name: 'Rock', icon: '🪨', url: '/assets/objects/rock.glb', type: 'object' },
  //{ id: 'lamp', name: 'Lamp', icon: '💡', url: '/assets/objects/lamp.glb', type: 'object' },
  //{ id: 'bench', name: 'Bench', icon: '🪑', url: '/assets/objects/bench.glb', type: 'object' },
];

export const ENVIRONMENTS = [
      { id: 'school', name: 'School', icon: '🌱', url: '/apps/web/src/assets/environments/american_school_classroom_interior_high-poly.glb', type: 'environment' },

 // { id: 'grass-field', name: 'Grass Field', icon: '🌱', url: '/assets/environments/grass-field.glb', type: 'environment' },
 // { id: 'desert', name: 'Desert', icon: '🏜️', url: '/assets/environments/desert.glb', type: 'environment' },
 // { id: 'space', name: 'Space', icon: '🌌', url: '/assets/environments/space.glb', type: 'environment' },
 // { id: 'snow', name: 'Snow', icon: '❄️', url: '/assets/environments/snow.glb', type: 'environment' },
];

export function getLibraryFor(tab) {
  return tab === 'environments' ? ENVIRONMENTS : OBJECTS;
}