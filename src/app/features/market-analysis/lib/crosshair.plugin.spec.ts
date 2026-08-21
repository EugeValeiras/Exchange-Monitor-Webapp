import { axisDecimals, formatAxisValue } from '../../../shared/charts/chart-theme';
import { labelLeft } from './crosshair.plugin';

describe('crosshair · price label', () => {
  it('sits in the axis gutter when it fits', () => {
    expect(labelLeft(900, 1000, 46)).toBe(902);
  });

  it('is pulled back inside when the gutter is too narrow for it', () => {
    // the regression: a 60px label in a 40px gutter ran off the canvas
    const left = labelLeft(960, 1000, 60);
    expect(left + 60).toBeLessThanOrEqual(1000);
    expect(left).toBeLessThan(962);
  });

  it('never lets the label cross the right edge, whatever its width', () => {
    for (const width of [30, 46, 60, 90, 140]) {
      const left = labelLeft(960, 1000, width);
      expect(left + width).toBeLessThanOrEqual(1000);
    }
  });
});

describe('crosshair · precision', () => {
  const shapeOf = (s: string) => s.split(',')[1]?.length ?? 0;

  it('reads at the same precision as the axis it sits on', () => {
    // a pill reading 1,06 against an axis reading 1,000 looks like two scales
    for (const values of [[0.573, 0.8, 1.0], [0.952, 0.953, 0.954], [20000, 40000, 60000]]) {
      const ticks = values.map((value) => ({ value }));
      const decimals = axisDecimals(ticks);

      const pill = formatAxisValue(values[0] * 1.0007, decimals);
      const tick = formatAxisValue(values[0], decimals);
      expect(shapeOf(pill)).toBe(shapeOf(tick));
    }
  });
});
