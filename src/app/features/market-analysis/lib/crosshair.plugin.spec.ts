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
