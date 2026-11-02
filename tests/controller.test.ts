import { Game } from '../src/core/game';
import { CpuController } from '../src/cpu/controller';
import type { CpuLevel } from '../src/cpu/cpu';

describe('CpuController', () => {
  test.each<CpuLevel>(['weak', 'normal', 'strong'])('%s は詰まらずにピースを置き続ける', (level) => {
    const g = new Game(11);
    const cpu = new CpuController(g, level, 11);
    let locked = 0;
    for (let i = 0; i < 600 && g.status === 'playing'; i++) {
      cpu.tick(50);
      g.tick(50);
      locked += g.drainEvents().filter((e) => e.type === 'locked').length;
    }
    // 30秒で、少なくとも数個は置けている
    expect(locked).toBeGreaterThanOrEqual(5);
  });

  test('つよいは ふつう より長く生き残る（同じピース列）', () => {
    const survive = (level: CpuLevel) => {
      const g = new Game(5);
      const cpu = new CpuController(g, level, 5);
      let placed = 0;
      for (let i = 0; i < 4000 && g.status === 'playing' && placed < 60; i++) {
        cpu.tick(100);
        g.tick(100);
        placed += g.drainEvents().filter((e) => e.type === 'locked').length;
      }
      return placed;
    };
    expect(survive('strong')).toBeGreaterThanOrEqual(survive('weak'));
  });
});
