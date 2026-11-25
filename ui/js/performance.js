// Always-on cleanup, lazy artwork and alert/timer behavior do not depend on profiles.
import { setting } from './core.js';

const PROFILES = {
  lightweight: { batch: 'small', motion: 'conservative' },
  balanced: { batch: 'normal', motion: 'standard' },
  quality: { batch: 'large', motion: 'enhanced' },
};
export function performancePrefs() {
  const profile = setting('performance.profile') || 'balanced';
  if (profile === 'custom') return {
    batch: setting('performance.item_batch') || 'normal',
    motion: setting('performance.default_motion') || 'standard',
  };
  return PROFILES[profile] || PROFILES.balanced;
}
export function itemBatchSize(popout = false) {
  const batch = performancePrefs().batch;
  const sizes = { small: [120, 60], normal: [240, 120], large: [480, 240] };
  return (sizes[batch] || sizes.normal)[popout ? 1 : 0];
}
export function profileMotionDefault(ctx, original) {
  const motion = performancePrefs().motion;
  if (motion === 'conservative') return 'static';
  if (motion === 'enhanced' && ctx === 'dex_grid') return 'animated';
  return original;
}
